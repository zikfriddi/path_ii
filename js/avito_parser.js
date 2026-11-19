(() => {
  if (window.__avitoParserRunning) {
    alert('Avito Parser уже запущен');
    return;
  }

  window.__avitoParserRunning = true;
  const cards = [...document.querySelectorAll('[data-marker^="item-"]')];
  const panel = document.createElement('div');
  Object.assign(panel.style, {
    position: 'fixed', top: '8px', left: '8px', right: '8px',
    zIndex: 999999, background: '#202124', color: '#fff',
    padding: '14px', font: '13px/1.45 monospace',
    borderRadius: '8px', whiteSpace: 'pre-wrap',
    maxHeight: '80vh', overflowY: 'auto', overflowWrap: 'anywhere'
  });
  document.body.append(panel);

  const clean = value => (value || '').replace(/\s+/g, ' ').trim();
  const datePattern = /сегодня|вчера|\d{1,2}\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)|\d{1,2}\.\d{1,2}\.\d{2,4}/i;

  try {
    if (!cards.length) {
      panel.textContent = 'Карточки Avito не найдены.\nОткрой страницу поиска или Избранное с объявлениями.\n\nНажми, чтобы закрыть.';
      panel.onclick = () => panel.remove();
      return;
    }

    const diagnostics = cards.map((card, index) => {
      const marker = card.getAttribute('data-marker') || '';
      const id = marker.replace(/^item-/, '');
      const anchors = [...card.querySelectorAll('a[href]')];
      const anchorInfo = anchors.map(a => ({
        raw: a.getAttribute('href') || '',
        absolute: a.href || '',
        text: clean(a.innerText),
        containsIdRaw: (a.getAttribute('href') || '').includes(id),
        containsIdAbsolute: (a.href || '').includes(id)
      }));
      const link = anchors.find(a => {
        const href = a.getAttribute('href') || '';
        return href.includes(id) || a.href.includes(id);
      });
      const title = clean(card.querySelector('strong')?.innerText);
      const price = clean([...card.querySelectorAll('h4, [data-marker*="price"]')]
        .map(el => el.innerText).find(value => /₽/.test(value)));
      const address = clean(card.querySelector('[class*="addressLine"]')?.innerText);
      const date = clean([...card.querySelectorAll('p, span, time')]
        .map(el => el.innerText || el.getAttribute('datetime'))
        .find(value => value && datePattern.test(value)));
      const imageEl = card.querySelector('img');
      const image = imageEl?.currentSrc || imageEl?.src || '';
      const parsedUrl = link ? new URL(link.getAttribute('href') || link.href, location.href) : null;
      const url = parsedUrl ? parsedUrl.origin + parsedUrl.pathname : '';
      const reasons = [];
      if (!id || !/^\d{6,}$/.test(id)) reasons.push('ID не распознан');
      if (!title) reasons.push('нет strong/title');
      if (!url) reasons.push('ссылка не содержит ID в href');

      return {
        index: index + 1, id, title, price, address, date, url, image,
        linkCount: anchors.length, anchorInfo,
        cardText: clean(card.innerText).slice(0, 220),
        reasons
      };
    });

    const valid = diagnostics.filter(row => !row.reasons.length);
    const unique = [...new Map(valid.map(row => [row.id, row])).values()];
    const columns = ['id', 'title', 'price', 'address', 'date', 'url', 'image'];
    const quote = value => '"' + String(value ?? '').replace(/"/g, '""').replace(/[\r\n]+/g, ' ') + '"';
    const csv = '\uFEFF' + [
      columns.join(';'),
      ...unique.map(row => columns.map(key => quote(row[key])).join(';'))
    ].join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const download = document.createElement('a');
    download.href = objectUrl;
    download.download = 'avito_items_' + unique.length + '.csv';
    document.body.append(download);
    download.click();
    download.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);

    const report = diagnostics.map(row => {
      const links = row.index <= 3
        ? '\nHREF:\n' + row.anchorInfo.map((a, i) =>
            '  [' + (i + 1) + '] raw: ' + (a.raw || '—') + '\n' +
            '      abs: ' + (a.absolute || '—') + '\n' +
            '      text: ' + (a.text || '—') +
            ' | ID raw/abs: ' + a.containsIdRaw + '/' + a.containsIdAbsolute
          ).join('\n')
        : '';
      return '#' + row.index + ' [' + (row.id || 'NO ID') + '] ' +
        (row.reasons.length ? 'SKIP: ' + row.reasons.join(', ') : 'OK') + '\n' +
        'title: ' + (row.title || '—') + '\n' +
        'price: ' + (row.price || '—') + ' | links: ' + row.linkCount + '\n' +
        'url: ' + (row.url || '—') + '\n' +
        'text: ' + (row.cardText || '—') + links;
    }).join('\n\n');

    panel.textContent =
      'AVITO PARSER — ДИАГНОСТИКА HREF\n' +
      'URL: ' + location.href + '\n' +
      'Карточек: ' + cards.length + '\n' +
      'Валидных: ' + valid.length + ' | уникальных в CSV: ' + unique.length + '\n' +
      'Пропущено: ' + (cards.length - valid.length) + '\n' +
      'CSV: avito_items_' + unique.length + '.csv\n\n' +
      'ПОКАРТОЧНЫЙ РАЗБОР (HREF показаны для первых 3 карточек)\n\n' + report +
      '\n\nНажми на окно, чтобы закрыть.';
    panel.onclick = () => panel.remove();
  } catch (error) {
    panel.textContent = 'Ошибка Avito Parser:\n' + (error.stack || error.message) + '\n\nНажми, чтобы закрыть.';
    panel.onclick = () => panel.remove();
  } finally {
    window.__avitoParserRunning = false;
  }
})();