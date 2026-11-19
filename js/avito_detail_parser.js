(() => {
  if (window.__avitoDetailParserRunning) {
    alert('Avito Detail Parser уже запущен');
    return;
  }
  window.__avitoDetailParserRunning = true;

  const clean = value => (value || '').replace(/\s+/g, ' ').trim();
  const unique = values => [...new Set(values.map(clean).filter(Boolean))];
  const textOf = selectors => unique(selectors.flatMap(selector =>
    [...document.querySelectorAll(selector)].map(el => el.innerText || el.textContent)
  ));
  const meta = name =>
    document.querySelector('meta[property="' + name + '"],meta[name="' + name + '"]')?.content || '';
  const canonical = document.querySelector('link[rel="canonical"]')?.href || location.href;
  const idMatch = canonical.match(/_(\d{6,})(?:[/?#]|$)/) || location.pathname.match(/(\d{6,})(?:\/?$)/);
  const id = idMatch ? idMatch[1] : '';

  const jsonLd = [];
  const walk = value => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) return value.forEach(walk);
    jsonLd.push(value);
    Object.values(value).forEach(child => {
      if (child && typeof child === 'object') walk(child);
    });
  };
  [...document.querySelectorAll('script[type="application/ld+json"]')].forEach(script => {
    try { walk(JSON.parse(script.textContent)); } catch (_) {}
  });
  const product = jsonLd.find(x => /Product|Offer/.test(String(x['@type'] || ''))) || {};
  const offers = Array.isArray(product.offers) ? product.offers[0] : (product.offers || {});
  const imagesFromLd = Array.isArray(product.image) ? product.image : [product.image];

  const title = clean(
    document.querySelector('h1')?.innerText ||
    meta('og:title') ||
    product.name
  );
  const description = unique([
    ...textOf([
      '[data-marker="item-view/item-description"]',
      '[data-marker*="item-description"]',
      '[class*="description"]'
    ]),
    meta('og:description'),
    product.description
  ]).sort((a, b) => b.length - a.length)[0] || '';

  const price = clean(
    meta('product:price:amount') ||
    meta('og:price:amount') ||
    offers.price ||
    document.querySelector('[data-marker="item-view/item-price"],[data-marker*="item-price"]')?.innerText ||
    [...document.querySelectorAll('span,h3,h2')].map(el => el.innerText).find(t => /₽/.test(t))
  );

  const params = textOf([
    '[data-marker="item-view/item-params"]',
    '[data-marker*="item-params"]',
    '[data-marker*="item-parameter"]'
  ]);
  const sellerName = unique(textOf([
    '[data-marker="seller-info/name"]',
    '[data-marker*="seller-info"] a',
    '[data-marker*="seller-name"]'
  ]))[0] || '';
  const sellerBlock = textOf([
    '[data-marker*="seller-info"]',
    '[data-marker*="seller-rating"]',
    '[data-marker*="seller-reviews"]'
  ]);
  const sellerLinks = [...document.querySelectorAll('a[href]')]
    .map(a => a.href)
    .filter(href => /\/(user|users)\//i.test(href));
  const delivery = unique([
    ...textOf(['[data-marker*="delivery"]', '[data-marker*="shipping"]']),
    ...[...document.querySelectorAll('body')].map(el => el.innerText)
      .flatMap(t => t.match(/.{0,45}(Авито Доставка|доставка|самовывоз).{0,80}/gi) || [])
  ]).slice(0, 12);

  const images = unique([
    ...[...document.querySelectorAll('[data-marker*="gallery"] img, [data-marker*="image"] img, img')]
      .map(img => img.currentSrc || img.src || img.getAttribute('data-src') || ''),
    ...imagesFromLd
  ]).filter(src => /^https?:\/\//i.test(src));

  const data = {
    source: 'avito',
    captured_at: new Date().toISOString(),
    id,
    url: canonical,
    title,
    price,
    description,
    parameters: params,
    seller: {
      name: sellerName,
      profile_urls: unique(sellerLinks),
      visible_info: sellerBlock
    },
    delivery_and_pickup: delivery,
    images,
    meta: {
      og_title: meta('og:title'),
      og_description: meta('og:description'),
      og_image: meta('og:image'),
      price_currency: meta('product:price:currency')
    },
    diagnostics: {
      page_title: document.title,
      h1_count: document.querySelectorAll('h1').length,
      jsonld_blocks: document.querySelectorAll('script[type="application/ld+json"]').length,
      data_markers: [...document.querySelectorAll('[data-marker]')]
        .map(el => el.getAttribute('data-marker'))
        .filter(v => /description|params|seller|price|gallery|delivery/i.test(v))
        .slice(0, 80)
    }
  };

  const panel = document.createElement('div');
  Object.assign(panel.style, {
    position: 'fixed', top: '8px', left: '8px', right: '8px',
    zIndex: 999999, background: '#202124', color: '#fff',
    padding: '14px', font: '13px/1.45 monospace',
    borderRadius: '8px', whiteSpace: 'pre-wrap',
    maxHeight: '82vh', overflowY: 'auto', overflowWrap: 'anywhere'
  });
  document.body.append(panel);

  const summary = [
    'AVITO DETAIL PARSER',
    'URL: ' + data.url,
    'ID: ' + (id || 'не найден'),
    'Заголовок: ' + (title || 'не найден'),
    'Цена: ' + (price || 'не найдена'),
    'Описание: ' + (description ? description.length + ' символов' : 'не найдено'),
    'Параметры: ' + params.length + ' блок(ов)',
    'Продавец: ' + (sellerName || 'не определён'),
    'Ссылки профиля: ' + sellerLinks.length,
    'Информация о продавце: ' + sellerBlock.length + ' блок(ов)',
    'Доставка/самовывоз: ' + delivery.length + ' фрагмент(ов)',
    'Изображения: ' + images.length,
    'JSON-LD блоков: ' + data.diagnostics.jsonld_blocks,
    '',
    'МАРКЕРЫ ДЛЯ ДАЛЬНЕЙШЕЙ НАСТРОЙКИ:',
    ...(data.diagnostics.data_markers.length ? data.diagnostics.data_markers : ['не обнаружены']),
    '',
    'JSON-файл должен скачаться автоматически.',
    'Пришли его сюда для настройки точных селекторов.',
    'Нажми на окно, чтобы закрыть.'
  ];
  panel.textContent = summary.join('\n');

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const download = document.createElement('a');
  download.href = objectUrl;
  download.download = 'avito_detail_' + (id || 'unknown') + '.json';
  document.body.append(download);
  download.click();
  download.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);

  panel.onclick = () => panel.remove();
  window.__avitoParserRunning = false;
  window.__avitoDetailParserRunning = false;
})();