(() => {
  'use strict';

  const shell = document.getElementById('site-shell');
  const content = document.getElementById('page-content');
  if (!shell || !content || !history.pushState || !window.fetch) return;

  let pending;
  let scrollFrame;
  history.scrollRestoration = 'manual';

  function saveScrollPosition() {
    history.replaceState({
      ...(history.state || {}),
      atheneNavigation: true,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    }, '', location.href);
  }

  saveScrollPosition();
  window.addEventListener('scroll', () => {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = null;
      saveScrollPosition();
    });
  }, { passive: true });

  function sameDocumentLink(anchor, event) {
    if (!anchor || anchor.target || anchor.hasAttribute('download') || event.defaultPrevented) return false;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
    const url = new URL(anchor.href, location.href);
    return url.origin === location.origin && /(?:\/|\.html)$/.test(url.pathname);
  }

  function applyDocument(doc, url, scrollPosition) {
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
      window.scrollTo(scrollPosition?.x || 0, scrollPosition?.y || 0);
    }
  }

  async function navigate(url, { push = false, scrollPosition = null } = {}) {
    if (pending) pending.abort();
    const controller = new AbortController();
    pending = controller;

    try {
      const response = await fetch(url.href, { signal: controller.signal, headers: { Accept: 'text/html' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
      if (push) {
        saveScrollPosition();
        history.pushState({ atheneNavigation: true, scrollX: 0, scrollY: 0 }, '', url.href);
      }
      applyDocument(doc, url, push ? { x: 0, y: 0 } : scrollPosition);
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

  window.addEventListener('popstate', (event) => {
    const state = event.state || {};
    navigate(new URL(location.href), {
      scrollPosition: state.atheneNavigation ? { x: state.scrollX || 0, y: state.scrollY || 0 } : null,
    });
  });
})();
