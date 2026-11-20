(() => {
  if (window.__avitoSearchParserRunning) {
    alert('Avito Search Parser уже запущен');
    return;
  }
  window.__avitoSearchParserRunning = true;

  const clean = value => (value || '').replace(/\s+/g, ' ').trim();
  const cards = [...document.querySelectorAll('[data-marker^="item-"]')];
  const capturedAt = new Date().toISOString();
  const searchUrl = location.href;
  const searchTitle = clean(document.title);

  const panel = document.createElement('div');
  Object.assign(panel.style, {
    position: 'fixed', top: '8px', left: '8px', right: '8px',
    zIndex: 999999, background: '#202124', color: '#fff',
    padding: '14px', font: '13px/1.45 monospace',
    borderRadius: '8px', whiteSpace: 'pre-wrap',
    maxHeight: '80vh', overflowY: 'auto', overflowWrap: 'anywhere'
  });
  document.body.append(panel);

  const datePattern = /сегодня|вчера|\d{1,2}\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)|\d{1,2}\.\d{1,2}\.\d{2,4}/i;

  try {
    if (!cards.length) {
      panel.textContent =
        'Карточки результатов поиска не найдены.\n' +
        'Открой сохранённый поиск Avito с результатами.\n\n' +
        'Нажми на окно, чтобы закрыть.';
      panel.onclick = () => panel.remove();
      return;
    }

    const rows = cards.map((card, index) => {
      const marker = card.getAttribute('data-marker') || '';
      const id = marker.replace(/^item-/, '');
      const anchors = [...card.querySelectorAll('a[href]')];
      const itemLink = anchors.find(a => {
        const href = a.getAttribute('href') || '';
        return href.includes(id) || a.href.includes(id);
      });
      const parsedUrl = itemLink
        ? new URL(itemLink.getAttribute('href') || itemLink.href, location.href)
        : null;
      const url = parsedUrl ? parsedUrl.origin + parsedUrl.pathname : '';

      const titleNode = card.querySelector('h3, strong, [data-marker*="title"]');
      let title = clean(titleNode?.innerText || titleNode?.textContent);
      if (!title && itemLink) title = clean(itemLink.innerText || itemLink.textContent);

      const cardText = clean(card.innerText || card.textContent);
      const priceText = clean(
        [...card.querySelectorAll('h4, [data-marker*="price"]')]
          .map(el => el.innerText || el.textContent)
          .find(value => /₽/.test(value)) ||
        (cardText.match(/[\d\s\u00a0]+₽/) || [])[0]
      );
      const price = priceText ? Number(priceText.replace(/\D/g, '')) || '' : '';

      const address = clean(
        card.querySelector('[class*="addressLine"], [data-marker*="address"]')?.innerText
      );
      const date = clean(
        [...card.querySelectorAll('p, span, time')]
          .map(el => el.innerText || el.getAttribute('datetime') || '')
          .find(value => value && datePattern.test(value))
      );
      const seller = clean(
        card.querySelector('[data-marker*="seller"], [class*="seller"]')?.innerText
      );
      const imageEl = card.querySelector('img');
      const image = imageEl?.currentSrc || imageEl?.src || '';

      const reasons = [];
      if (!/^\d{6,}$/.test(id)) reasons.push('ID не распознан');
      if (!title) reasons.push('нет названия');
      if (!url) reasons.push('нет ссылки');

      return {
        index: index + 1,
        id,
        title,
        price,
        price_text: priceText,
        address,
        date,
        seller,
        url,
        image,
        card_text: cardText,
        reasons
      };
    });

    const valid = rows.filter(row => !row.reasons.length);
    const unique = [...new Map(valid.map(row => [row.id, row])).values()];
    const columns = [
      'id', 'title', 'price', 'price_text', 'address', 'date',
      'seller', 'url', 'image', 'card_text',
      'search_title', 'search_url', 'captured_at'
    ];
    const quote = value =>
      '"' + String(value ?? '').replace(/"/g, '""').replace(/[\r\n]+/g, ' ') + '"';
    const csv = '\uFEFF' + [
      columns.join(';'),
      ...unique.map(row => columns.map(key => quote(
        key === 'search_title' ? searchTitle :
        key === 'search_url' ? searchUrl :
        key === 'captured_at' ? capturedAt : row[key]
      )).join(';'))
    ].join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const download = document.createElement('a');
    download.href = objectUrl;
    download.download = 'avito_search_' + unique.length + '_' +
      new Date().toISOString().slice(0, 10) + '.csv';
    document.body.append(download);
    download.click();
    download.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);

    const skipped = rows.filter(row => row.reasons.length);
    panel.textContent = [
      'AVITO SEARCH PARSER',
      'Страница: ' + searchTitle,
      'URL поиска: ' + searchUrl,
      'Карточек в DOM: ' + cards.length,
      'Валидных: ' + valid.length,
      'Уникальных в CSV: ' + unique.length,
      'Пропущено: ' + skipped.length,
      '',
      'CSV сформирован: avito_search_' + unique.length + '_' +
        new Date().toISOString().slice(0, 10) + '.csv',
      '',
      'Важно: собраны карточки, которые уже присутствуют в DOM страницы.',
      'Чтобы захватить больше результатов, прокрути страницу вниз до подгрузки',
      'нужных объявлений, затем запусти парсер ещё раз.',
      '',
      skipped.length
        ? 'ПРОПУЩЕННЫЕ КАРТОЧКИ:\n' + skipped.map(row =>
            '#' + row.index + ' [' + (row.id || 'нет ID') + '] ' +
            row.reasons.join(', ') + '\n' + row.card_text.slice(0, 160)
          ).join('\n\n')
        : 'Ошибок распознавания карточек нет.',
      '',
      'Нажми на окно, чтобы закрыть.'
    ].join('\n');
    panel.onclick = () => panel.remove();
  } catch (error) {
    panel.textContent = 'Ошибка Avito Search Parser:\n' +
      (error.stack || error.message) + '\n\nНажми, чтобы закрыть.';
    panel.onclick = () => panel.remove();
  } finally {
    window.__avitoSearchParserRunning = false;
  }
})();