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
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 0, 9);

    const mobile = coarsePointer.matches;
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;

    const geometry = new THREE.IcosahedronGeometry(mobile ? 2.15 : 2.55, mobile ? 2 : 3);
    const material = new THREE.MeshPhysicalMaterial({
      color: 0x9e6ca2,
      emissive: 0x180f27,
      emissiveIntensity: 0.42,
      roughness: 0.34,
      metalness: 0.06,
      clearcoat: 0.58,
      clearcoatRoughness: 0.3,
      iridescence: 0.38,
      iridescenceIOR: 1.22,
      transparent: true,
      opacity: 0.66,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const form = new THREE.Mesh(geometry, material);
    form.position.set(mobile ? 0.55 : 1.65, mobile ? 0.05 : -0.15, 0);
    form.rotation.set(-0.22, 0.3, 0.12);
    scene.add(form);

    const key = new THREE.PointLight(0xf4a9d8, 18, 18, 2);
    key.position.set(-3.6, 3.8, 5.5);
    scene.add(key);

    const fill = new THREE.PointLight(0x5fb7c4, 12, 16, 2);
    fill.position.set(4, -2.6, 3.2);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xd9b0ff, 1.2);
    rim.position.set(0, -3, -2);
    scene.add(rim);

    const target = new THREE.Vector2();
    const desiredPointer = new THREE.Vector2();
    const pointer = new THREE.Vector2();
    const rotation = new THREE.Vector2();
    let pointerActive = false;
    let lastPointerMove = 0;
    let lastFrame = 0;
    let frameId;

    const resize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.5);
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
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

    const animate = (time) => {
      frameId = requestAnimationFrame(animate);
      if (time - lastFrame < 33) return;
      lastFrame = time;

      const idle = !pointerActive || time - lastPointerMove > 1100;
      const autonomousX = Math.sin(time * 0.00019) * 0.16;
      const autonomousY = Math.cos(time * 0.00015) * 0.11;
      const desiredX = idle ? autonomousX : target.x * 0.28;
      const desiredY = idle ? autonomousY : target.y * 0.2;

      desiredPointer.set(desiredX, desiredY);
      pointer.lerp(desiredPointer, 0.045);
      rotation.lerp(pointer, 0.052);

      form.rotation.y += (0.28 + rotation.x * 0.62 - form.rotation.y) * 0.025;
      form.rotation.x += (-0.22 - rotation.y * 0.46 - form.rotation.x) * 0.025;
      form.rotation.z = Math.sin(time * 0.00017) * 0.1 + rotation.x * 0.08;
      form.position.y = (mobile ? 0.05 : -0.15) + Math.sin(time * 0.00026) * 0.2 + rotation.y * 0.24;
      form.position.x = (mobile ? 0.55 : 1.65) + Math.cos(time * 0.00021) * 0.18 + rotation.x * 0.2;

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
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('pointermove', movePointer, { passive: true });
    document.addEventListener('visibilitychange', visibility);
    frameId = requestAnimationFrame(animate);
  }
}
