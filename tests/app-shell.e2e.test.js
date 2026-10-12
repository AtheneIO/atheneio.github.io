const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs/promises');
const test = require('node:test');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  test('Chromium SPA navigation regression', { skip: 'run with npm exec --package=playwright -- node --test tests/app-shell.e2e.test.js' }, () => {});
}

const root = path.resolve(__dirname, '..');

async function startServer() {
  const server = http.createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const file = path.resolve(root, relative);
    if (!file.startsWith(`${root}${path.sep}`)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const body = await fs.readFile(file);
      response.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html' });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

if (chromium) test('Chromium: hash history preserves the rendered route, pager and both canvases', async (t) => {
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    window.__atheneRouteFetches = 0;
    window.fetch = (...args) => {
      const url = new URL(args[0] instanceof Request ? args[0].url : args[0], location.href);
      if (url.origin === location.origin && /\.html$/.test(url.pathname)) window.__atheneRouteFetches += 1;
      return nativeFetch(...args);
    };
  });

  try {
    await page.goto(`${server.origin}/about.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelector('#athene-biorhythm') && document.querySelector('#ambient-3d-canvas'));
    await page.locator('[data-page-next]').click();
    await page.waitForFunction(() => document.querySelectorAll('.route-page')[1]?.hidden === false);
    await page.evaluate(() => {
      window.__atheneCanvasReferences = [
        document.querySelector('#athene-biorhythm'),
        document.querySelector('#ambient-3d-canvas'),
      ];
      const target = document.querySelector('#page-title');
      target.id = 'hash';
      location.hash = 'hash';
    });
    await page.waitForURL(/about\.html#hash$/);

    await page.goBack();
    await page.waitForURL(/about\.html$/);
    await page.goForward();
    await page.waitForURL(/about\.html#hash$/);
    await page.waitForTimeout(100);

    const historyState = await page.evaluate(() => ({
      routeFetches: window.__atheneRouteFetches,
      secondPageVisible: document.querySelectorAll('.route-page')[1]?.hidden === false,
      canvasesUnchanged: window.__atheneCanvasReferences.every((canvas) => canvas.isConnected
        && canvas === document.querySelector(`#${canvas.id}`)),
    }));
    assert.deepEqual(historyState, { routeFetches: 0, secondPageVisible: true, canvasesUnchanged: true });

    await page.locator('[data-route][href="ja-rpg.html"]').click();
    await page.waitForFunction(() => document.querySelector('#page-title')?.textContent === 'Ja RPG');
    assert.deepEqual(await page.evaluate(() => ({
      routeFetches: window.__atheneRouteFetches,
      canvasesUnchanged: window.__atheneCanvasReferences.every((canvas) => canvas.isConnected
        && canvas === document.querySelector(`#${canvas.id}`)),
    })), { routeFetches: 1, canvasesUnchanged: true });
  } finally {
    await browser.close();
    await server.close();
  }
});
