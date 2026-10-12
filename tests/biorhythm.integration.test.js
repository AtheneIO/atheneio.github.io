const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync('assets/biorhythm.js', 'utf8');
const testableSource = source.replace(
  /\}\)\(\);\s*$/,
  'window.__atheneBiorhythmTest = { target, parse };\n})();',
);

function sample(now, five, weekly) {
  return {
    schema: 'athene-codex-biorhythm/v1',
    measured_at: new Date(now).toISOString(),
    windows: {
      five_hour: { remaining_percent: five },
      weekly: { remaining_percent: weekly },
    },
  };
}

async function harness({ coarse = false, width = 1280, dpr = 2, samples }) {
  let clock = 1_790_000_000_000;
  const fetches = [];
  const frames = [];
  const ctx = {
    fillRects: 0, arcs: 0, transforms: [],
    clearRect() {}, save() {}, restore() {}, beginPath() {}, fill() {},
    fillRect() { this.fillRects += 1; },
    arc() { this.arcs += 1; },
    setTransform(...args) { this.transforms.push(args); },
  };
  const canvas = { id: '', style: {}, setAttribute() {}, getContext: () => ctx };
  const listeners = {};
  const document = {
    hidden: false,
    body: { prepend(node) { assert.equal(node, canvas); } },
    createElement(tag) { assert.equal(tag, 'canvas'); return canvas; },
    addEventListener(event, handler) { listeners[event] = handler; },
  };
  const FakeDate = class extends Date {
    static now() { return clock; }
    static parse(value) { return Date.parse(value); }
  };
  const window = {
    innerWidth: width, innerHeight: 800, devicePixelRatio: dpr,
    matchMedia(query) {
      return { matches: query.includes('pointer: coarse') ? coarse : false };
    },
    addEventListener(event, handler) { listeners[event] = handler; },
  };
  const sandbox = {
    window, document, location: { search: '' }, URLSearchParams,
    Date: FakeDate, Math, Number, Error, Promise, console,
    requestAnimationFrame(callback) { frames.push(callback); return frames.length; },
    fetch: async (url, options) => {
      fetches.push({ url, options });
      const body = samples.shift();
      assert.ok(body, 'each fetch must have a supplied payload');
      return { ok: true, json: async () => body };
    },
  };
  window.ATHENE_BIORHYTHM_ENDPOINT = 'https://gist.githubusercontent.com/example/id/raw/codex-biorhythm.json';
  vm.runInNewContext(testableSource, sandbox, { filename: 'assets/biorhythm.js' });
  await new Promise(setImmediate); // fetch() then response.json() are separate async turns

  function draw(now) {
    const callbacks = frames.splice(0);
    assert.equal(callbacks.length, 1, 'exactly one animation frame should be pending');
    callbacks[0](now);
  }
  function settle(start) {
    for (let i = 0; i < 80; i += 1) draw(start + i * 80);
  }
  return {
    ctx, fetches, draw, settle,
    target: window.__atheneBiorhythmTest.target,
    parse: window.__atheneBiorhythmTest.parse,
    setClock(value) { clock = value; },
  };
}

test('exhaustion → reset changes the oscillator field after a fresh JSON revision', async () => {
  const start = 1_790_000_000_000;
  const h = await harness({
    samples: [sample(start, 0, 0), sample(start + 300_001, 100, 100)],
  });
  h.settle(0);
  const exhaustedRects = h.ctx.fillRects;

  h.ctx.fillRects = 0;
  h.setClock(start + 300_001);
  h.draw(300_001); // five-minute polling boundary; reads the next revision
  await new Promise(setImmediate);
  h.settle(300_081);
  const resetRects = h.ctx.fillRects;

  assert.ok(resetRects > exhaustedRects * 2, `reset field (${resetRects}) must be denser than exhausted (${exhaustedRects})`);
  assert.equal(h.fetches.length, 2);
  for (const request of h.fetches) {
    assert.equal(request.options.mode, 'cors');
    assert.equal(request.options.cache, 'no-store');
    assert.equal(request.options.headers.Accept, 'application/json');
    assert.match(request.url, /\?_=/, 'each read must carry a cache-busting query');
  }
  assert.notEqual(h.fetches[0].url, h.fetches[1].url, 'successive reads must not reuse a cached URL');
});

test('freshness remains synced through the publication interval and turns stale after 25 minutes', async () => {
  const now = 1_790_000_000_000;
  const h = await harness({ samples: [sample(now, 50, 50)] });
  h.setClock(now);

  const cases = [
    [10, 1, true],
    [15, 1, true],
    [20, 0.5, true],
    [30, 0, false],
  ];
  for (const [minutes, freshness, synced] of cases) {
    h.parse(sample(now - minutes * 60 * 1000, 50, 50));
    assert.equal(h.target.freshness, freshness, `${minutes}-minute sample freshness`);
    assert.equal(h.target.synced, synced, `${minutes}-minute sample sync status`);
  }
});

test('Node simulation: mobile rendering limits DPR and reduces field density', async () => {
  const now = 1_790_000_000_000;
  const mobile = await harness({ coarse: true, width: 390, dpr: 3, samples: [sample(now, 100, 100)] });
  mobile.settle(0);
  mobile.ctx.arcs = 0;
  mobile.draw(6_400);

  assert.deepEqual(mobile.ctx.transforms.at(-1), [1.2, 0, 0, 1.2, 0, 0]);
  assert.equal(mobile.ctx.arcs, 4, 'coarse-pointer mode must use 14 bands (four phase dots/frame after interpolation)');
});
