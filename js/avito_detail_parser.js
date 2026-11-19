(() => {
  if (window.__avitoDetailParserRunning) {
    alert('Avito Detail Parser уже запущен');
    return;
  }
  window.__avitoDetailParserRunning = true;

  const clean = value => (value || '').replace(/\s+/g, ' ').trim();
  const unique = values => [...new Set(values.map(clean).filter(Boolean))];
  const allText = selectors => unique(selectors.flatMap(selector =>
    [...document.querySelectorAll(selector)].map(el => el.innerText || el.textContent)
  ));
  const meta = name =>
    document.querySelector('meta[property="' + name + '"],meta[name="' + name + '"]')?.content || '';
  const canonical = document.querySelector('link[rel="canonical"]')?.href || location.href;
  const idMatch = canonical.match(/_(\d{6,})(?:[/?#]|$)/) || location.pathname.match(/(\d{6,})(?:\/?$)/);
  const id = idMatch ? idMatch[1] : '';
  const marker = name => document.querySelector('[data-marker="' + name + '"]');

  const description = clean(marker('item-view/item-description')?.innerText || meta('og:description'));
  const paramsNode = marker('item-view/item-params');
  const paramsText = clean(paramsNode?.innerText);
  const paramNodes = paramsNode ? [...paramsNode.querySelectorAll('li, tr, [class*="param"]')] : [];
  const parameters = unique(paramNodes.map(el => el.innerText))
    .filter(t => t.includes(':') && t.length < 300 && !/разместить похожее/i.test(t));
  if (!parameters.length && paramsText) {
    parameters.push(...(paramsText.match(/[^\n]+/g) || []).map(clean)
      .filter(t => t.includes(':') && !/разместить похожее|^характеристики$/i.test(t)));
  }

  const attributes = {};
  const attributePattern = /([^:]{2,45}):\s*(.*?)(?=\s+[^:]{2,45}:\s|$)/g;
  let attributeMatch;
  while ((attributeMatch = attributePattern.exec(paramsText)) !== null) {
    const key = clean(attributeMatch[1]).replace(/^.*характеристики\s*/i, '');
    const value = clean(attributeMatch[2]).replace(/\s*Разместить похожее объявление.*$/i, '');
    if (key && value && !/разместить похожее/i.test(key)) attributes[key] = value;
  }

  const price = clean(marker('item-view/item-price')?.innerText ||
    meta('product:price:amount') || meta('og:price:amount'));
  const title = clean(document.querySelector('h1')?.innerText || meta('og:title'));

  const sellerNode = marker('item-view/seller-info') || marker('sellerInfo') ||
    document.querySelector('[data-marker*="seller-info"]');
  const sellerText = clean(sellerNode?.innerText);
  const sellerName = clean(marker('seller-info/name')?.innerText);
  const ratingMatch = sellerText.match(/([0-5][,.]\d)\s*(?=\d+\s+отзыв|отзыв)/i);
  const reviewsMatch = sellerText.match(/(\d+)\s+отзыв/i);
  const accountAgeMatch = sellerText.match(/На Авито\s*(?:c|с)\s*(\d{4})/i);
  const adsCountMatch = sellerText.match(/(\d+)\s+объявлен/i);
  const sellerTypeMatch = sellerText.match(/Частное лицо|Компания/i);
  const profileUrls = unique(
    [...(sellerNode || document).querySelectorAll('a[href]')]
      .filter(a => /\/user\//i.test(a.href))
      .map(a => {
        const u = new URL(a.href, location.href);
        return u.origin + u.pathname;
      })
  );
  const bodyText = clean(document.body.innerText);
  const listingMetaMatch = id
    ? bodyText.match(new RegExp('№\s*' + id + '\s*·\s*([^·]+)·\s*(\d+)\s+просмотр', 'i'))
    : null;
  const responseMatch = bodyText.match(/Отвечает\s+[^.]+/i);
  const seller = {
    name: sellerName,
    rating: ratingMatch ? ratingMatch[1].replace(',', '.') : '',
    reviews_count: reviewsMatch ? Number(reviewsMatch[1]) : null,
    account_since: accountAgeMatch ? clean(accountAgeMatch[1]) : '',
    type: sellerTypeMatch ? sellerTypeMatch[0] : '',
    active_ads_count: adsCountMatch ? Number(adsCountMatch[1]) : null,
    profile_urls: profileUrls,
    response_time: responseMatch ? clean(responseMatch[0]) : '',
    visible_info: sellerText
  };

  const gallery = marker('item-view/main-gallery');
  const galleryImages = gallery ? [...gallery.querySelectorAll('img')] : [];
  const imageCandidates = [];
  for (const img of galleryImages) {
    imageCandidates.push(img.currentSrc, img.src, img.getAttribute('src'), img.getAttribute('data-src'));
    const srcset = img.getAttribute('srcset') || img.getAttribute('data-srcset') || '';
    srcset.split(',').forEach(part => imageCandidates.push(part.trim().split(/\s+/)[0]));
  }
  if (gallery) {
    [...gallery.querySelectorAll('source[srcset]')].forEach(source =>
      (source.getAttribute('srcset') || '').split(',').forEach(part =>
        imageCandidates.push(part.trim().split(/\s+/)[0])
      )
    );
  }
  const images = unique(imageCandidates)
    .filter(src => /^https?:\/\//i.test(src))
    .filter(src => /\.avito\.(?:st|ru)\//i.test(src))
    .filter(src => !/\.svg(?:[?#]|$)|\/img\/share\/|adriver|event\.cgi/i.test(src));

  const deliveryText = unique([
    ...allText(['[data-marker*="delivery"]', '[data-marker*="shipping"]']),
    ...(description.match(/[^.!?\n]*(?:авито доставка|доставка|самовывоз)[^.!?\n]*[.!]?/gi) || [])
  ]);
  const pickupOnly = /только самовывоз/i.test(description);
  const locationText = allText(['[data-marker*="item-location"]', '[data-marker*="address"]'])[0] || '';

  const data = {
    source: 'avito',
    captured_at: new Date().toISOString(),
    id,
    url: canonical,
    title,
    price,
    location: locationText,
    parameters,
    attributes,
    parameters_raw: paramsText,
    listing_stats: {
      published_label: listingMetaMatch ? clean(listingMetaMatch[1]) : '',
      views_count: listingMetaMatch ? Number(listingMetaMatch[2]) : null
    },
    description,
    seller,
    delivery_and_pickup: { pickup_only: pickupOnly, visible_text: deliveryText },
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
      gallery_found: Boolean(gallery),
      gallery_img_count: galleryImages.length,
      gallery_image_count: images.length,
      seller_block_found: Boolean(sellerNode),
      seller_text_length: sellerText.length,
      parameter_node_found: Boolean(paramsNode),
      data_markers: [...document.querySelectorAll('[data-marker]')]
        .map(el => el.getAttribute('data-marker'))
        .filter(v => /description|params|seller|price|gallery|delivery|location|address/i.test(v))
        .slice(0, 100)
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
  panel.textContent = [
    'AVITO DETAIL PARSER — V2',
    'URL: ' + canonical,
    'ID: ' + (id || 'не найден'),
    'Заголовок: ' + (title || 'не найден'),
    'Цена: ' + (price || 'не найдена'),
    'Описание: ' + (description ? description.length + ' символов' : 'не найдено'),
    'Характеристики: ' + parameters.length + ' строк | атрибутов: ' + Object.keys(attributes).length,
    'Продавец: ' + (seller.name || 'не определён'),
    'Рейтинг: ' + (seller.rating || '—') + ' | отзывов: ' + (seller.reviews_count ?? '—'),
    'Тип: ' + (seller.type || '—') + ' | на Авито: ' + (seller.account_since || '—'),
    'Объявлений продавца: ' + (seller.active_ads_count ?? '—'),
    'Ссылок профиля: ' + profileUrls.length,
    'Просмотров: ' + (data.listing_stats.views_count ?? '—'),
    'Только самовывоз: ' + (pickupOnly ? 'да' : 'не подтверждено'),
    'Фотографий галереи: ' + images.length + ' (img: ' + galleryImages.length + ')',
    '',
    'DOM-маркеры:',
    ...(data.diagnostics.data_markers.length ? data.diagnostics.data_markers : ['не обнаружены']),
    '',
    'JSON должен скачаться автоматически.',
    'Пришли его сюда для проверки V2.',
    'Нажми на окно, чтобы закрыть.'
  ].join('\n');

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