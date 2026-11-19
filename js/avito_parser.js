(() => {
  if (window.__avitoParserRunning) {
    alert('Avito Parser уже запущен');
    return;
  }

  window.__avitoParserRunning = true;

  const cards = [...document.querySelectorAll('[data-marker^="item-"]')];
  const panel = document.createElement('div');
  Object.assign(panel.style, {
    position: 'fixed',
    top: '8px',
    left: '8px',
    right: '8px',
    zIndex: 999999,
    background: '#202124',
    color: '#fff',
    padding: '14px',
    font: '14px/1.45 sans-serif',
    borderRadius: '8px',
    whiteSpace: 'pre-wrap',
    maxHeight: '75vh',
    overflowY: 'auto'
  });
  document.body.append(panel);

  const say = value => { panel.textContent = value; };

  try {
    if (!cards.length) {
      say('Карточки Avito не найдены.\nОткрой страницу поиска или Избранное с объявлениями.\n\nЗакрыть');
      panel.onclick = () => panel.remove();
      return;
    }

    const clean = value => (value || '').replace(/\s+/g, ' ').trim();
    const datePattern = /сегодня|вчера|\d{1,2}\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)|\d{1,2}\.\d{1,2}\.\d{2,4}/i;

    const rows = cards.map(card => {
      const marker = card.getAttribute('data-marker') || '';
      const id = marker.replace(/^item-/, '');
      const link = [...card.querySelectorAll('a[href]')]
        .find(a => a.href.includes(id) && /\/\d{6,}/.test(a.href));

      const title = clean(card.querySelector('strong')?.innerText);
      const price = clean([...card.querySelectorAll('h4, [data-marker*="price"]')]
        .map(el => el.innerText)
        .find(text => /₽/.test(text)));

      const address = clean(card.querySelector('[class*="addressLine"]')?.innerText);
      const date = clean([...card.querySelectorAll('p, span, time')]
        .map(el => el.innerText || el.getAttribute('datetime'))
        .find(text => text && datePattern.test(text)));

      const imageEl = card.querySelector('img');
      const image = imageEl?.currentSrc || imageEl?.src || '';
      const url = link ? new URL(link.href, location.href).origin + new URL(link.href, location.href).pathname : '';

      return { id, title, price, address, date, url, image };
    }).filter(row => row.id && row.title && row.url);

    const unique = [...new Map(rows.map(row => [row.id, row])).values()];
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

    const missing = cards.length - unique.length;
    say(
      'Avito Parser — готово\n' +
      'DOM-карточек найдено: ' + cards.length + '\n' +
      'Записей в CSV: ' + unique.length + '\n' +
      'Пропущено/дубликатов: ' + missing + '\n\n' +
      'CSV должен скачаться автоматически.\n' +
      'Нажми на это окно, чтобы закрыть.'
    );
    panel.onclick = () => panel.remove();
  } catch (error) {
    say('Ошибка Avito Parser:\n' + (error.stack || error.message) + '\n\nНажми, чтобы закрыть.');
    panel.onclick = () => panel.remove();
  } finally {
    window.__avitoParserRunning = false;
  }
})();