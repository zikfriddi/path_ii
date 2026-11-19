(() => {
  const markers = [...document.querySelectorAll('[data-marker]')];
  const cards = [...document.querySelectorAll('[data-marker^="item-"]')];
  const links = [...document.querySelectorAll('a[href]')];
  const panel = document.createElement('div');

  Object.assign(panel.style, {
    position: 'fixed',
    inset: '8px',
    zIndex: 9999999,
    background: '#17191c',
    color: '#fff',
    padding: '14px',
    borderRadius: '8px',
    font: '13px/1.4 monospace',
    whiteSpace: 'pre-wrap',
    overflow: 'auto'
  });

  const samples = cards.slice(0, 8).map((card, index) => {
    const marker = card.getAttribute('data-marker');
    const cardLinks = [...card.querySelectorAll('a[href]')].slice(0, 5).map(a => ({
      href: a.getAttribute('href'),
      text: (a.innerText || '').trim().slice(0, 100)
    }));
    return [
      'CARD ' + (index + 1) + ' | ' + marker,
      'text: ' + (card.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 450),
      'strong: ' + [...card.querySelectorAll('strong')].map(x => x.innerText.trim()).join(' || '),
      'links: ' + JSON.stringify(cardLinks)
    ].join('\n');
  });

  const markerCounts = {};
  markers.forEach(el => {
    const value = el.getAttribute('data-marker') || '';
    const key = value.startsWith('item-') ? 'item-*' : value;
    markerCounts[key] = (markerCounts[key] || 0) + 1;
  });

  const itemLinks = links.filter(a => /\/\d{6,}/.test(a.getAttribute('href') || ''));

  panel.textContent = [
    'AVITO FAVORITES DIAGNOSTICS',
    'URL: ' + location.href,
    'data-marker elements: ' + markers.length,
    'item-* cards: ' + cards.length,
    'all links: ' + links.length,
    'links with numeric listing-like URL: ' + itemLinks.length,
    '',
    'MARKER COUNTS:',
    JSON.stringify(markerCounts, null, 2),
    '',
    'CARD SAMPLES:',
    samples.join('\n\n'),
    '',
    'Нажми на экран, чтобы закрыть.'
  ].join('\n');

  panel.onclick = () => panel.remove();
  document.body.append(panel);
})();