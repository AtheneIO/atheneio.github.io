(() => {
  'use strict';

  const shell = document.querySelector('#app-shell');
  const content = document.querySelector('#app-content');
  if (!shell || !content || !window.fetch || !window.DOMParser || !window.history) return;

  let request = null;
  let navigationId = 0;

  const isLocalPage = (anchor) => {
    const url = new URL(anchor.href, location.href);
    return url.origin === location.origin && /(^|\/)index\.html$|\.html$/.test(url.pathname);
  };

  const routePath = (url) => `${url.pathname}${url.search}${url.hash}`;

  function setActiveLink() {
    const current = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('[data-route]').forEach((link) => {
      const target = new URL(link.href, location.href).pathname.split('/').pop() || 'index.html';
      if (target === current) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  function setupPager() {
    const pages = [...content.querySelectorAll('.route-page')];
    const controls = content.querySelector('.page-controls');
    if (pages.length < 2 || !controls) return;
    let active = Math.max(0, pages.findIndex((page) => !page.hidden));
    if (active < 0) active = 0;

    const render = () => {
      pages.forEach((page, index) => { page.hidden = index !== active; });
      controls.hidden = false;
      const previous = controls.querySelector('[data-page-previous]');
      const next = controls.querySelector('[data-page-next]');
      previous.hidden = active === 0;
      next.hidden = active === pages.length - 1;
      const reader = content.querySelector('.route-reader');
      if (reader) reader.scrollTop = 0;
    };

    controls.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.hasAttribute('data-page-previous')) active -= 1;
      if (button.hasAttribute('data-page-next')) active += 1;
      active = Math.max(0, Math.min(pages.length - 1, active));
      render();
      const heading = content.querySelector('.route-page:not([hidden]) h2, .route-page:not([hidden]) h1');
      if (heading) heading.focus({ preventScroll: true });
    });
    render();
  }

  function activateContent() {
    setupPager();
    setActiveLink();
  }

  function focusRoute() {
    const heading = content.querySelector('h1');
    if (!heading) return;
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }

  function showLoadError() {
    let error = content.querySelector('.route-error');
    if (!error) {
      error = document.createElement('p');
      error.className = 'route-error';
      error.setAttribute('role', 'alert');
      const reader = content.querySelector('.route-reader') || content;
      reader.append(error);
    }
    error.textContent = 'Nie udało się wczytać tej zakładki. Spróbuj ponownie.';
  }

  async function navigate(rawUrl, { push = false } = {}) {
    const url = new URL(rawUrl, location.href);
    if (!isLocalPage({ href: url.href })) return;
    const id = ++navigationId;
    if (request) request.abort();
    request = new AbortController();

    try {
      const response = await fetch(url.href, { signal: request.signal, headers: { Accept: 'text/html' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
      const nextContent = parsed.querySelector('#app-content');
      if (!nextContent) throw new Error('missing app content');
      if (id !== navigationId) return;

      content.innerHTML = nextContent.innerHTML;
      document.title = parsed.title || document.title;
      const description = parsed.querySelector('meta[name="description"]')?.content;
      const descriptionNode = document.querySelector('meta[name="description"]');
      if (description && descriptionNode) descriptionNode.content = description;
      if (push) history.pushState({ route: routePath(url) }, '', routePath(url));
      activateContent();
      focusRoute();
    } catch (error) {
      if (error.name !== 'AbortError' && id === navigationId) showLoadError();
    } finally {
      if (id === navigationId) request = null;
    }
  }

  document.addEventListener('click', (event) => {
    const anchor = event.target.closest('a[href]');
    if (!anchor || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (anchor.target || anchor.hasAttribute('download') || !isLocalPage(anchor)) return;
    event.preventDefault();
    navigate(anchor.href, { push: true });
  });

  window.addEventListener('popstate', () => navigate(location.href));
  activateContent();
})();
