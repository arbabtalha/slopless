// Slopless: small, local interactions. No analytics, cookies, or remote API calls.
(() => {
  const announce = (message) => {
    const live = document.querySelector('[data-announcement]');
    if (live) live.textContent = message;
  };
  document.querySelectorAll('[data-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      const source = button.closest('.command-row')?.querySelector('[data-command]');
      if (!source) return;
      let copied = false;
      try { await navigator.clipboard.writeText(source.textContent.trim()); copied = true; } catch {
        // Select the actual command if the browser or embedding policy blocks clipboard access.
        const selection = getSelection();
        const range = document.createRange();
        range.selectNodeContents(source);
        selection?.removeAllRanges(); selection?.addRange(range);
        try { copied = document.execCommand('copy'); } catch { /* Keep the text selected. */ }
      }
      button.textContent = copied ? 'Copied' : 'Selected';
      button.classList.toggle('is-copied', copied);
      announce(copied ? 'Command copied to clipboard.' : 'Clipboard access unavailable. The command is selected; copy it manually.');
      setTimeout(() => { button.textContent = 'Copy'; button.classList.remove('is-copied'); }, 2200);
    });
  });

  const hero = {
    studio: { name: 'Studio', index: '01', alt: 'Studio material: a minimal identity studio with expressive typography', colors: ['#f5f4f0', '#1e1e1c', '#e95531'] },
    cobalt: { name: 'Cobalt', index: '02', alt: 'Cobalt material: a precise developer product page with a blue accent', colors: ['#fafbfc', '#182a43', '#2760d8'] },
    ribbon: { name: 'Ribbon', index: '03', alt: 'Ribbon material: an atmospheric dark audio application with soft colours', colors: ['#1a1a23', '#b9a8e0', '#e9d8af'] },
  };
  document.querySelectorAll('[data-hero]').forEach((button) => {
    button.addEventListener('click', () => {
      const slug = button.dataset.hero;
      const material = hero[slug];
      if (!material) return;
      document.querySelectorAll('[data-hero]').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
      const image = document.querySelector('[data-hero-image]');
      image.src = `assets/desk/${slug}.webp`; image.alt = material.alt;
      document.querySelector('[data-hero-link]').href = `themes/${slug}/`;
      document.querySelector('[data-hero-name]').textContent = material.name;
      document.querySelector('[data-hero-number]').textContent = `${material.index} / 03`;
      const swatches = document.querySelector('[data-hero-swatches]');
      swatches.setAttribute('aria-label', `${material.name} palette`);
      [...swatches.children].forEach((span, i) => span.style.setProperty('--swatch', material.colors[i]));
      announce(`${material.name} material selected.`);
    });
  });

  const grid = document.querySelector('[data-theme-grid]');
  if (!grid) return;
  const cards = [...grid.querySelectorAll('[data-material]')];
  const filters = [...document.querySelectorAll('[data-filter]')];
  const search = document.querySelector('[data-search]');
  const showAll = document.querySelector('[data-show-all]');
  const status = document.querySelector('[data-catalog-status]');
  let filter = 'all';
  let expanded = false;
  function update() {
    const query = search.value.trim().toLowerCase();
    let matches = 0, shown = 0;
    for (const card of cards) {
      const match = (filter === 'all' || card.dataset.genre === filter) && card.dataset.search.includes(query);
      if (match) matches++;
      const display = match && (expanded || filter !== 'all' || query || shown < 6);
      card.hidden = !display;
      if (display) shown++;
    }
    showAll.hidden = expanded || filter !== 'all' || !!query || matches <= 6;
    showAll.textContent = `Explore all ${cards.length} ↓`;
    document.querySelector('[data-empty]').hidden = matches !== 0;
    status.textContent = matches === 0 ? 'No materials found.' : `Showing ${shown} of ${matches} material${matches === 1 ? '' : 's'}${query ? ` matching “${search.value.trim()}”` : ''}.`;
  }
  filters.forEach((button) => button.addEventListener('click', () => {
    filter = button.dataset.filter;
    filters.forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    update();
  }));
  search.addEventListener('input', update);
  showAll.addEventListener('click', () => {
    expanded = true; update();
    const next = cards[6]?.querySelector('a');
    if (next) next.focus({ preventScroll: true });
  });
  document.querySelector('[data-reset]').addEventListener('click', () => {
    filter = 'all'; search.value = ''; expanded = false;
    filters.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === 'all')));
    update(); search.focus();
  });
  update();

  const dialog = document.querySelector('[data-dialog]');
  if (!dialog?.showModal) return;
  const frame = dialog.querySelector('[data-dialog-iframe]');
  const holder = dialog.querySelector('[data-dialog-frame]');
  let opener;
  const resize = () => {
    if (!dialog.open) return;
    frame.style.transform = `scale(${holder.clientWidth / 1440})`;
  };
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(holder);
  else window.addEventListener('resize', resize);
  grid.querySelectorAll('[data-preview]').forEach((button) => {
    button.hidden = false;
    button.addEventListener('click', () => {
      const card = button.closest('[data-material]');
      opener = button;
      const href = `themes/${card.dataset.material}/`;
      dialog.querySelector('#dialog-title').textContent = card.dataset.name;
      dialog.querySelector('[data-dialog-caption]').textContent = card.dataset.description;
      dialog.querySelector('[data-dialog-link]').href = href;
      frame.title = `${card.dataset.name} material live example`;
      frame.src = href;
      dialog.showModal(); resize();
    });
  });
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => { frame.removeAttribute('src'); opener?.focus(); });
})();
