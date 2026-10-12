(() => {
  'use strict';

  const shell = document.getElementById('site-shell');
  const content = document.getElementById('page-content');
  if (!shell || !content || !history.pushState || !window.fetch) return;

  let pending;

  function sameDocumentLink(anchor, event) {
    if (!anchor || anchor.target || anchor.hasAttribute('download') || event.defaultPrevented) return false;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
    const url = new URL(anchor.href, location.href);
    return url.origin === location.origin && /(?:\/|\.html)$/.test(url.pathname);
  }

  function applyDocument(doc, url) {
    const nextContent = doc.getElementById('page-content');
    const nextShell = doc.getElementById('site-shell');
    if (!nextContent || !nextShell) throw new Error('Missing site shell in fetched page');

    content.replaceChildren(...Array.from(nextContent.childNodes, (node) => document.importNode(node, true)));
    shell.className = nextShell.className;
    document.title = doc.title;
    document.documentElement.lang = doc.documentElement.lang || document.documentElement.lang;
    if (url.hash) {
      document.getElementById(url.hash.slice(1))?.scrollIntoView();
    } else {
      window.scrollTo(0, 0);
    }
  }

  async function navigate(url, { push = false } = {}) {
    if (pending) pending.abort();
    const controller = new AbortController();
    pending = controller;

    try {
      const response = await fetch(url.href, { signal: controller.signal, headers: { Accept: 'text/html' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
      applyDocument(doc, url);
      if (push) history.pushState({ atheneNavigation: true }, '', url.href);
    } catch (error) {
      if (error.name === 'AbortError') return;
      location.assign(url.href);
    } finally {
      if (pending === controller) pending = null;
    }
  }

  document.addEventListener('click', (event) => {
    const anchor = event.target.closest('a[href]');
    if (!sameDocumentLink(anchor, event)) return;
    const url = new URL(anchor.href, location.href);
    if (url.href === location.href) return;
    event.preventDefault();
    navigate(url, { push: true });
  });

  window.addEventListener('popstate', () => navigate(new URL(location.href)));
})();
