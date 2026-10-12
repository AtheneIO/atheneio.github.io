const { test, expect } = require('playwright/test');

test.setTimeout(90_000);

const pages = [
  { path: 'index.html', name: 'home' },
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

function maxCoordinateDifference(reference, current) {
  return Math.max(Math.abs(reference.x - current.x), Math.abs(reference.y - current.y));
}

async function measure(page) {
  return page.evaluate(() => {
    const header = document.querySelector('.intro, .page-heading');
    const navigation = document.querySelector('.site-nav');
    if (!header || !navigation) throw new Error('Missing shared header or navigation');
    const pick = ({ x, y, width, height }) => ({ x, y, width, height });
    return { header: pick(header.getBoundingClientRect()), navigation: pick(navigation.getBoundingClientRect()) };
  });
}

test.describe('shared shell layout', () => {
  for (const viewport of viewports) {
    test(`keeps header and navigation stable during SPA navigation at ${viewport.width}x${viewport.height}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      await page.goto(`${baseURL}/index.html`);
      const baseline = await measure(page);
      const results = [];

      for (const target of pages.slice(1)) {
        await page.locator(`.site-nav a[href="${target.path}"]`).dispatchEvent('click', { button: 0 });
        await expect(page).toHaveURL(new RegExp(`${target.path.replace(/[().]/g, '\\$&')}$`));
        await expect(page.locator('#page-content h1')).toContainText(target.heading);
        const current = await measure(page);
        results.push({ target: target.name, ...current });
      }

      const maxDifference = Math.max(...results.flatMap(({ header, navigation }) => [
        maxCoordinateDifference(baseline.header, header),
        maxCoordinateDifference(baseline.navigation, navigation),
      ]));
      console.log(JSON.stringify({ kind: 'spa', viewport, baseline, results, maxDifference }));
      expect(maxDifference).toBeLessThanOrEqual(2);
    });

    test(`keeps direct entries aligned and allows normal document scrolling at ${viewport.width}x${viewport.height}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      await page.goto(`${baseURL}/index.html`);
      const baseline = await measure(page);
      const results = [];

      for (const target of pages) {
        await page.goto(`${baseURL}/${target.path}`);
        const current = await measure(page);
        const scroll = await page.evaluate(() => ({
          scrollHeight: document.documentElement.scrollHeight,
          viewportHeight: window.innerHeight,
          overflowY: getComputedStyle(document.documentElement).overflowY,
        }));
        results.push({ target: target.name, ...current, scroll });
      }

      await page.goto(`${baseURL}/blokg-w-dol-lub-w-bok.html`);
      const scrollProof = await page.evaluate(() => {
        const spacer = document.createElement('div');
        spacer.style.height = '200vh';
        spacer.setAttribute('aria-hidden', 'true');
        document.body.append(spacer);
        const before = window.scrollY;
        window.scrollTo(0, 10000);
        return { before, after: window.scrollY, scrollHeight: document.documentElement.scrollHeight, viewportHeight: window.innerHeight };
      });
      console.log(JSON.stringify({ kind: 'direct', viewport, baseline, results, scrollProof }));
      expect(scrollProof.scrollHeight).toBeGreaterThan(scrollProof.viewportHeight);
      expect(scrollProof.after).toBeGreaterThan(scrollProof.before);
      for (const result of results) {
        expect(maxCoordinateDifference(baseline.header, result.header)).toBeLessThanOrEqual(2);
        expect(maxCoordinateDifference(baseline.navigation, result.navigation)).toBeLessThanOrEqual(2);
        expect(result.scroll.overflowY).not.toBe('hidden');
      }
    });
  }
});
