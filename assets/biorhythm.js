(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduceMotion.matches) return;
  if (window.__atheneBiorhythm) return;

  const endpointFromQuery = new URLSearchParams(location.search).get('biorhythmEndpoint');
  const endpoint = endpointFromQuery || window.ATHENE_BIORHYTHM_ENDPOINT;
  const canvas = document.createElement('canvas');
  canvas.id = 'athene-biorhythm';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  const mobile = window.matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency;
  const memory = navigator.deviceMemory;
  const lowPower = mobile && ((cores > 0 && cores <= 4) || (memory > 0 && memory <= 4));
  const frameInterval = lowPower ? 1000 / 30 : 0;
  const target = { session: .5, weekly: .5, freshness: 0, synced: false };
  const state = { ...target };
  let width = 1, height = 1, dpr = 1, frame = 0, drawTimer = 0, resizeFrame = 0, hasRendered = false, lastFetch = 0, lastGood = 0;
  let paused = document.hidden;
  // Transport cadence and display health are intentionally separate:
  // Pages polls more often than publication, while a sample remains usable
  // through one delayed publisher cycle plus a ten-minute grace window.
  const pollIntervalMs = 5 * 60 * 1000;
  const publishIntervalMs = 15 * 60 * 1000;
  const staleAfterMs = 25 * 60 * 1000;

  function clamp(v, lo = 0, hi = 1) { return Math.max(lo, Math.min(hi, v)); }
  function finite(v) { return typeof v === 'number' && Number.isFinite(v); }
  function parse(data) {
    if (!data || data.schema !== 'athene-codex-biorhythm/v1') throw new Error('bad schema');
    const five = Number(data.windows?.five_hour?.remaining_percent);
    const week = Number(data.windows?.weekly?.remaining_percent);
    const measured = Date.parse(data.measured_at || '');
    if (!finite(five) || !finite(week) || !Number.isFinite(measured)) throw new Error('incomplete sample');
    const age = Date.now() - measured;
    const freshnessWindowMs = staleAfterMs - publishIntervalMs;
    target.session = clamp(five / 100);
    target.weekly = clamp(week / 100);
    target.freshness = clamp(1 - Math.max(0, age - publishIntervalMs) / freshnessWindowMs);
    target.synced = age <= staleAfterMs;
    lastGood = Date.now();
  }

  async function fetchData() {
    if (!endpoint) { target.synced = false; target.freshness = 0; return; }
    try {
      const response = await fetch(`${endpoint}${endpoint.includes('?') ? '&' : '?'}_=${Date.now()}`, {
        mode: 'cors', cache: 'no-store', headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      parse(await response.json());
    } catch (_) {
      target.synced = false;
      target.freshness = 0;
    }
  }

  function resize() {
    const nextWidth = window.innerWidth;
    const nextHeight = window.innerHeight;
    const nextDpr = Math.min(window.devicePixelRatio || 1, lowPower ? 1 : mobile ? 1.2 : 1.5);
    if (nextWidth === width && nextHeight === height && nextDpr === dpr) return;
    width = nextWidth;
    height = nextHeight;
    dpr = nextDpr;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function requestResize() {
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => { resizeFrame = 0; resize(); });
  }

  function requestDraw() {
    if (paused || frame || drawTimer) return;
    if (frameInterval && hasRendered) {
      drawTimer = setTimeout(() => {
        drawTimer = 0;
        frame = requestAnimationFrame(draw);
      }, frameInterval);
      return;
    }
    frame = requestAnimationFrame(draw);
  }

  // Non-linear deterministic mapping: the two quotas are phase inputs to a small
  // oscillator field, not hidden progress bars. Session shapes motion; week shapes
  // harmonic count, spatial density and palette spread.
  function draw(now) {
    frame = 0;
    if (paused) return;
    hasRendered = true;
    const dt = Math.min(.08, (now - (draw.previous || now)) / 1000);
    draw.previous = now;
    const glide = 1 - Math.exp(-dt * 1.65);
    state.session += (target.session - state.session) * glide;
    state.weekly += (target.weekly - state.weekly) * glide;
    state.freshness += (target.freshness - state.freshness) * glide;
    state.synced = target.synced;

    ctx.clearRect(0, 0, width, height);
    const session = state.session;
    const week = state.weekly;
    const degraded = 1 - state.freshness;
    const seed = session * 7.13 + week * 13.71;
    const bands = mobile ? 14 : 22;
    const spacing = width / (bands + 1);
    const originY = height * .56;
    const period = now * .001;
    const density = 2 + Math.floor(week * 5);
    const energy = .2 + Math.pow(session, .65) * .8;
    const hueA = 314 + week * 22;
    const hueB = 184 + session * 32;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < bands; i++) {
      const x = spacing * (i + 1);
      const phase = i * .73 + seed * 4.1;
      const carrier = Math.sin(period * (.55 + session * 1.5) + phase);
      const modulation = Math.cos(period * (.23 + week * .62) - phase * .61);
      const envelope = .2 + .8 * Math.pow(Math.abs(carrier * .68 + modulation * .32), .7);
      const levels = Math.max(2, Math.round(density * (.72 + envelope * .68)));
      const groupDrift = Math.sin(period * .37 + i * .37) * 5 * energy;
      for (let level = 0; level < levels; level++) {
        const local = Math.sin(phase + level * 1.91 + period * (1.1 + session));
        const y = originY + (level - (levels - 1) / 2) * (10 + week * 8) + local * 7 + groupDrift;
        const segmentH = 3.5 + envelope * 6;
        const segmentW = Math.max(3, spacing * (.25 + .3 * (1 - degraded)));
        const glow = (1 - level / (levels + 1)) * energy * (1 - degraded * .52);
        const hue = (i + level) % 2 ? hueA : hueB;
        ctx.shadowBlur = 8 + glow * 22;
        ctx.shadowColor = `hsla(${hue}, 88%, 68%, ${glow * .72})`;
        ctx.fillStyle = `hsla(${hue}, 92%, ${59 + envelope * 18}%, ${.12 + glow * .55})`;
        ctx.fillRect(x - segmentW / 2, y - segmentH / 2, segmentW, segmentH);
      }
      if (i % Math.max(2, 7 - Math.floor(week * 4)) === 0) {
        const radius = 1.2 + energy * 2.8;
        ctx.beginPath();
        ctx.arc(x, originY + Math.sin(phase + period) * (13 + session * 18), radius, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${hueB}, 100%, 80%, ${.14 + energy * .34})`;
        ctx.fill();
      }
    }

    // A loss-of-sync signature: restrained amber phase ticks drifting out of grid.
    if (!state.synced || degraded > .45) {
      const ticks = mobile ? 7 : 11;
      ctx.shadowBlur = 12;
      ctx.shadowColor = 'rgba(255, 180, 92, .55)';
      for (let i = 0; i < ticks; i++) {
        const x = width * (.18 + i * .064) + Math.sin(period * .7 + i) * 8;
        const y = height * (.78 + Math.sin(period * .9 + i * 1.7) * .025);
        ctx.fillStyle = `rgba(255, 181, 96, ${.10 + .18 * (i % 2)})`;
        ctx.fillRect(x, y, mobile ? 10 : 15, 2);
      }
    }
    ctx.restore();

    if (now - lastFetch > pollIntervalMs || (!lastGood && now - lastFetch > 4000)) {
      lastFetch = now;
      fetchData();
    }
    requestDraw();
  }

  document.addEventListener('visibilitychange', () => {
    paused = document.hidden;
    if (paused) {
      if (frame) cancelAnimationFrame(frame);
      if (drawTimer) clearTimeout(drawTimer);
      frame = 0;
      drawTimer = 0;
      return;
    }
    lastFetch = -pollIntervalMs;
    requestDraw();
  });
  window.addEventListener('resize', requestResize, { passive: true });
  window.addEventListener('orientationchange', requestResize, { passive: true });
  window.__atheneBiorhythm = { canvas };
  resize();
  fetchData();
  requestDraw();
})();
