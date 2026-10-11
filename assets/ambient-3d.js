import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const coarsePointer = window.matchMedia('(pointer: coarse)');

if (!reducedMotion.matches && typeof WebGLRenderingContext !== 'undefined') {
  let renderer;

  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch {
    // The page's CSS background remains the visual fallback when WebGL is unavailable.
  }

  if (renderer) {
    const canvas = renderer.domElement;
    canvas.id = 'ambient-3d-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.prepend(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.set(0, 0, 9);

    const mobile = coarsePointer.matches;
    const fiberCount = mobile ? 52 : 104;
    const segments = mobile ? 15 : 22;
    const verticesPerFiber = segments * 2;
    const vertexCount = fiberCount * verticesPerFiber;
    const positions = new Float32Array(vertexCount * 3);
    const colors = new Float32Array(vertexCount * 3);
    const base = Array.from({ length: fiberCount }, (_, index) => ({
      angle: (index / fiberCount) * Math.PI * 2,
      phase: (index * 1.61803398875) % (Math.PI * 2),
      drift: 0.45 + ((index * 0.37) % 0.9),
      radius: 1.15 + ((index * 0.73) % 1.3),
    }));

    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.2 : 1.45));

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: mobile ? 0.14 : 0.18,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    const fibers = new THREE.LineSegments(geometry, material);
    const verticalSpan = mobile ? 4.6 : 5.8;
    let baseX = mobile ? 0.35 : 2.2;
    const baseY = mobile ? -0.15 : -0.1;
    fibers.position.set(baseX, baseY, 0);
    fibers.rotation.set(-0.18, 0.34, 0.08);
    scene.add(fibers);

    const pink = new THREE.Color(0xf4a9d8);
    const violet = new THREE.Color(0xa985c5);
    const cyan = new THREE.Color(0x6fb9c7);
    const color = new THREE.Color();
    const target = new THREE.Vector2();
    const pointer = new THREE.Vector2();
    const rotation = new THREE.Vector2();
    let pointerActive = false;
    let lastPointerMove = 0;
    let lastFrame = 0;
    let frameId;

    const resize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      baseX = mobile ? 0.35 : Math.min(3.05, 1.72 + camera.aspect * 0.53);
    };

    const movePointer = (event) => {
      if (coarsePointer.matches) return;
      target.set(
        (event.clientX / window.innerWidth) * 2 - 1,
        -((event.clientY / window.innerHeight) * 2 - 1),
      );
      pointerActive = true;
      lastPointerMove = performance.now();
    };

    const writeVertex = (offset, x, y, z, mix) => {
      positions[offset] = x;
      positions[offset + 1] = y;
      positions[offset + 2] = z;
      color.copy(pink).lerp(violet, mix * 0.55).lerp(cyan, Math.max(0, mix - 0.58) * 1.55);
      colors[offset] = color.r;
      colors[offset + 1] = color.g;
      colors[offset + 2] = color.b;
    };

    const pointOnFiber = (fiber, progress, time, influenceX, influenceY) => {
      const wave = time * 0.000055 * fiber.drift;
      const longitudinal = progress * 2 - 1;
      const taper = 0.78 + 0.22 * Math.cos(longitudinal * Math.PI * 0.62);
      const angle = fiber.angle + longitudinal * 0.72 + Math.sin(wave + fiber.phase) * 0.12;
      const asymmetry = Math.sin(angle * 3.0 + fiber.phase) * 0.3
        + Math.cos(angle * 5.0 - wave * 1.8) * 0.16;
      const radius = (fiber.radius + asymmetry + Math.sin(longitudinal * 4.6 + wave * 1.7) * 0.07) * taper;
      const pulse = Math.sin(time * 0.00007 + fiber.phase + progress * 5.0) * 0.035;

      return {
        x: radius * Math.cos(angle) * 0.92 + pulse + influenceX * (0.12 + taper * 0.08),
        y: longitudinal * verticalSpan + Math.sin(angle * 2.2 + wave) * 0.18 + influenceY * 0.12,
        z: radius * Math.sin(angle) * 0.82 + Math.cos(longitudinal * 3.8 + wave) * 0.12,
      };
    };

    const updateFibers = (time) => {
      const influenceX = pointer.x * 0.14;
      const influenceY = pointer.y * 0.11;
      let offset = 0;

      for (let index = 0; index < fiberCount; index += 1) {
        const fiber = base[index];
        const mix = index / Math.max(1, fiberCount - 1);

        for (let segment = 0; segment < segments; segment += 1) {
          const start = pointOnFiber(fiber, segment / segments, time, influenceX, influenceY);
          const end = pointOnFiber(fiber, (segment + 1) / segments, time, influenceX, influenceY);
          writeVertex(offset, start.x, start.y, start.z, mix);
          offset += 3;
          writeVertex(offset, end.x, end.y, end.z, mix);
          offset += 3;
        }
      }

      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;
    };

    const animate = (time) => {
      frameId = requestAnimationFrame(animate);
      if (time - lastFrame < 33) return;
      lastFrame = time;

      const idle = !pointerActive || time - lastPointerMove > 1100;
      const autonomousX = Math.sin(time * 0.00004) * 0.07;
      const autonomousY = Math.cos(time * 0.000035) * 0.05;
      pointer.lerp(idle ? new THREE.Vector2(autonomousX, autonomousY) : target, 0.018);
      rotation.lerp(pointer, 0.022);

      fibers.rotation.y += (0.34 + rotation.x * 0.14 - fibers.rotation.y) * 0.013;
      fibers.rotation.x += (-0.18 - rotation.y * 0.1 - fibers.rotation.x) * 0.013;
      fibers.rotation.z = Math.sin(time * 0.000035) * 0.03 + rotation.x * 0.025;
      fibers.position.y = baseY + Math.sin(time * 0.00005) * 0.06 + rotation.y * 0.05;
      fibers.position.x = baseX + Math.cos(time * 0.00004) * 0.045 + rotation.x * 0.05;

      updateFibers(time);
      renderer.render(scene, camera);
    };

    const visibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(frameId);
      } else {
        lastFrame = 0;
        frameId = requestAnimationFrame(animate);
      }
    };

    resize();
    updateFibers(0);
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('pointermove', movePointer, { passive: true });
    document.addEventListener('visibilitychange', visibility);
    frameId = requestAnimationFrame(animate);
  }
}
