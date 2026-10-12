const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const pages = [
  'index.html',
  'about.html',
  'medytacja.html',
  'ja-rpg.html',
  'pomysly.html',
  'blokg-w-dol-lub-w-bok.html',
];

test('every direct HTML entry uses the shared shell and keeps its route content', () => {
  for (const page of pages) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.match(html, /<main id="app-shell"/, `${page} exposes the persistent app shell`);
    assert.match(html, /id="app-content"/, `${page} exposes replaceable route content`);
    assert.match(html, /assets\/site\.css/, `${page} uses common styling`);
    assert.match(html, /assets\/app-shell\.js/, `${page} loads SPA navigation`);
    assert.match(html, /assets\/biorhythm\.js/, `${page} starts the biorhythm on direct entry`);
    assert.match(html, /assets\/ambient-3d\.js/, `${page} starts ambient 3D on direct entry`);
  }
});

test('the router uses fetch, DOMParser and History API without replacing body', () => {
  const source = fs.readFileSync(path.join(root, 'assets', 'app-shell.js'), 'utf8');
  assert.match(source, /fetch\(/);
  assert.match(source, /DOMParser/);
  assert.match(source, /history\.pushState/);
  assert.match(source, /popstate/);
  assert.match(source, /app-content/);
  assert.doesNotMatch(source, /document\.body\.innerHTML/);
});

test('same-document hash links bypass SPA routing and failed route loads replace stale content', () => {
  const source = fs.readFileSync(path.join(root, 'assets', 'app-shell.js'), 'utf8');
  assert.match(source, /isSameDocumentHash/);
  assert.match(source, /isSameDocumentHash\(anchor\)\s*\|\|/);
  assert.match(source, /if \(documentPath\(url\) === renderedDocumentPath\) return;/,
    'popstate skips navigation whenever the rendered document is unchanged, including a URL without a hash');
  assert.match(source, /Nie udało się wczytać zakładki/);
  assert.match(source, /content\.innerHTML = `/);
});

test('shared CSS reserves a readable upper/lower content region around the biorhythm band', () => {
  const css = fs.readFileSync(path.join(root, 'assets', 'site.css'), 'utf8');
  assert.match(css, /grid-template-rows/);
  assert.match(css, /\.route-top/);
  assert.match(css, /\.route-bottom/);
  assert.match(css, /\.route-reader/);
  assert.match(css, /overflow: auto/);
});
