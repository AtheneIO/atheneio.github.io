const { test, expect } = require('playwright/test');

test.setTimeout(90_000);

const pages = [
  { path: 'index.html', name: 'home', heading: 'Hej.' },
  { path: 'about.html', name: 'about', heading: 'O mnie' },
  { path: 'medytacja.html', name: 'meditation', heading: 'Medytacja' },
  { path: 'ja-rpg.html', name: 'rpg', heading: 'Ja RPG' },
  { path: 'pomysly.html', name: 'ideas', heading: 'Pomysły' },
  { path: 'blokg-w-dol-lub-w-bok.html', name: 'blog', heading: 'Blok(g) w dół,' },
];
const viewports = [
  { width: 390, height: 844 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
];
const baseURL = process.env.BASE_URL || 'http://127.0.0.1:4173';

function coordinateDifference(reference, current, coordinates) {
  return Math.max(...coordinates.map((coordinate) => Math.abs(reference[coordinate] - current[coordinate])));
}

async function measure(page) {
  return page.evaluate(() => {
    const rect = (element) => {
      const { x, y, right, bottom, width, height } = element.getBoundingClientRect();
      return { x, y, right, bottom, width, height };
    };
    const h1 = document.querySelector('h1');
    const spark = document.querySelector('.spark');
    const navigation = document.querySelector('.site-nav');
    const body = document.querySelector('.page-body');
    if (!h1 || !spark || !navigation || !body) throw new Error('Missing shared shell element');
    return {
      h1: rect(h1),
      spark: rect(spark),
      navigation: rect(navigation),
      body: rect(body),
      headingToNavigationGap: navigation.getBoundingClientRect().top - h1.getBoundingClientRect().bottom,
      sparkToHeadingGap: h1.getBoundingClientRect().top - spark.getBoundingClientRect().bottom,
      scroll: {
        scrollHeight: document.documentElement.scrollHeight,
        viewportHeight: window.innerHeight,
        overflowY: getComputedStyle(document.documentElement).overflowY,
      },
    };
  });
}

function verifyGeometry(measurements) {
  const reference = measurements[0].measurement;
  for (const { name, measurement } of measurements) {
    expect(coordinateDifference(reference.navigation, measurement.navigation, ['x', 'y'])).toBeLessThanOrEqual(2);
    expect(Math.abs(reference.h1.bottom - measurement.h1.bottom)).toBeLessThanOrEqual(2);
    expect(measurement.headingToNavigationGap, `${name}: h1 → nav gap`).toBeGreaterThanOrEqual(24);
    expect(measurement.headingToNavigationGap, `${name}: h1 → nav gap`).toBeLessThanOrEqual(32);
    expect(Math.abs(reference.sparkToHeadingGap - measurement.sparkToHeadingGap), `${name}: spark → h1 gap`).toBeLessThanOrEqual(2);
    expect(measurement.spark.bottom).toBeLessThanOrEqual(measurement.h1.y);
    expect(measurement.h1.bottom).toBeLessThanOrEqual(measurement.navigation.y);
    expect(measurement.body.y).toBeGreaterThanOrEqual(measurement.navigation.bottom);
    expect(measurement.scroll.overflowY).not.toBe('hidden');
  }
}

test.describe('shared shell geometry', () => {
  for (const viewport of viewports) {
    test(`uses a common h1 baseline and menu position at ${viewport.width}x${viewport.height}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      const measurements = [];

      for (const target of pages) {
        await page.goto(`${baseURL}/${target.path}`);
        await expect(page.locator('h1')).toContainText(target.heading);
        measurements.push({ name: target.name, measurement: await measure(page) });
      }

      console.log(JSON.stringify({ kind: 'direct-geometry', viewport, measurements }));
      verifyGeometry(measurements);
      await context.close();
    });

    test(`switches SPA content without replacing canvases at ${viewport.width}x${viewport.height}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      await page.goto(`${baseURL}/index.html`);
      const canvasPresent = await page.evaluate(() => {
        window.__layoutCanvas = document.querySelector('#ambient-3d-canvas');
        return Boolean(window.__layoutCanvas);
      });
      expect(canvasPresent).toBeTruthy();
      const measurements = [{ name: 'home', measurement: await measure(page) }];

      for (const target of pages.slice(1)) {
        await page.locator(`.site-nav a[href="${target.path}"]`).dispatchEvent('click', { button: 0 });
        await expect(page).toHaveURL(new RegExp(`${target.path.replace(/[().]/g, '\\$&')}$`));
        await expect(page.locator('#page-content h1')).toContainText(target.heading);
        expect(await page.evaluate(() => window.__layoutCanvas === document.querySelector('#ambient-3d-canvas') && window.__layoutCanvas?.isConnected)).toBeTruthy();
        measurements.push({ name: target.name, measurement: await measure(page) });
      }

      console.log(JSON.stringify({ kind: 'spa-geometry', viewport, measurements }));
      verifyGeometry(measurements);
      await context.close();
    });
  }
});
