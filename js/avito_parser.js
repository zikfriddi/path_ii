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
      const link = anchors.find(a => a.href.includes(id) && /\/\d{6,}/.test(a.href));
      const title = clean(card.querySelector('strong')?.innerText);
      const price = clean([...card.querySelectorAll('h4, [data-marker*="price"]')]
        .map(el => el.innerText).find(value => /₽/.test(value)));
      const address = clean(card.querySelector('[class*="addressLine"]')?.innerText);
      const date = clean([...card.querySelectorAll('p, span, time')]
        .map(el => el.innerText || el.getAttribute('datetime'))
        .find(value => value && datePattern.test(value)));
      const imageEl = card.querySelector('img');
      const image = imageEl?.currentSrc || imageEl?.src || '';
      const parsedUrl = link ? new URL(link.href, location.href) : null;
      const url = parsedUrl ? parsedUrl.origin + parsedUrl.pathname : '';
      const reasons = [];
      if (!id || !/^\d{6,}$/.test(id)) reasons.push('ID не распознан');
      if (!title) reasons.push('нет strong/title');
      if (!url) reasons.push('ссылка с ID не найдена');

      return {
        index: index + 1, id, title, price, address, date, url, image,
        linkCount: anchors.length,
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

    const report = diagnostics.map(row =>
      '#' + row.index + ' [' + (row.id || 'NO ID') + '] ' +
      (row.reasons.length ? 'SKIP: ' + row.reasons.join(', ') : 'OK') + '\n' +
      'title: ' + (row.title || '—') + '\n' +
      'price: ' + (row.price || '—') + ' | links: ' + row.linkCount + '\n' +
      'url: ' + (row.url || '—') + '\n' +
      'text: ' + (row.cardText || '—')
    ).join('\n\n');

    panel.textContent =
      'AVITO PARSER — ДИАГНОСТИКА\n' +
      'URL: ' + location.href + '\n' +
      'Карточек по селектору: ' + cards.length + '\n' +
      'Валидных: ' + valid.length + ' | уникальных в CSV: ' + unique.length + '\n' +
      'Пропущено: ' + (cards.length - valid.length) + '\n' +
      'CSV: avito_items_' + unique.length + '.csv\n\n' +
      'ПОКАРТОЧНЫЙ РАЗБОР\n\n' + report +
      '\n\nНажми на окно, чтобы закрыть.';
    panel.onclick = () => panel.remove();
  } catch (error) {
    panel.textContent = 'Ошибка Avito Parser:\n' + (error.stack || error.message) + '\n\nНажми, чтобы закрыть.';
    panel.onclick = () => panel.remove();
  } finally {
    window.__avitoParserRunning = false;
  }
})();