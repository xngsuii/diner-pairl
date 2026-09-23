(() => {
  'use strict';

  /* ================= 유틸 ================= */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const uid = () => Math.random().toString(36).slice(2, 10);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const nl = (s) => esc(s).replace(/\n/g, '<br>');
  const clone = (o) => JSON.parse(JSON.stringify(o));

  /** 성사일 → "$3.18" 형식. 3.18 / 3/18 / 2024-03-18 모두 허용 */
  function fmtPrice(raw) {
    raw = String(raw ?? '').trim();
    if (!raw) return '';
    let m = raw.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
    if (m) return `$${+m[2]}.${m[3].padStart(2, '0')}`;
    m = raw.replace(/^\$/, '').match(/^(\d{1,2})\s*[-./]\s*(\d{1,2})$/);
    if (m) return `$${+m[1]}.${m[2].padStart(2, '0')}`;
    return raw.startsWith('$') ? raw : `$${raw}`;
  }

  /** 별 스티커용 clip-path 폴리곤 */
  function burstPolygon(points = 18, inner = 0.8) {
    const pts = [];
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 ? inner : 1;
      const a = (Math.PI * i) / points - Math.PI / 2;
      pts.push(`${(50 + 50 * r * Math.cos(a)).toFixed(2)}% ${(50 + 50 * r * Math.sin(a)).toFixed(2)}%`);
    }
    return `polygon(${pts.join(',')})`;
  }
  document.documentElement.style.setProperty('--burst', burstPolygon());

  /** 필름 그레인용 노이즈 텍스처 (캔버스로 한 번 생성해 dataURL로 사용 → 내보내기에도 그대로 찍힘) */
  function grainTexture(size = 180) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 46;
    }
    ctx.putImageData(img, 0, 0);
    return `url(${c.toDataURL('image/png')})`;
  }
  document.documentElement.style.setProperty('--grain', grainTexture());

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('is-on'), 2200);
  }

  /* ================= 상태 ================= */
  const DEFAULT_COLORS = { red: '#BA2B31', cream: '#F6F2E6', mint: '#0E857F', ink: '#2A1A17', accent: '#E9A23B' };
  const COLOR_LABELS = { red: '레드', cream: '배경', mint: '민트', ink: '잉크', accent: '포인트' };
  const SHADOWS = [['red', '레드'], ['mint', '민트'], ['accent', '포인트'], ['none', '없음']];

  const newCard = (o = {}) => ({
    id: uid(), name: '', desc: '', price: '', keywords: ['', '', ''],
    image: '', posX: 50, posY: 50, zoom: 1, shadow: 'red', ...o,
  });

  function defaultState() {
    return {
      version: 1,
      settings: {
        title: 'Pair Diner',
        titleSize: 120,
        subtitle: 'FRESH PAIRS · SERVED DAILY',
        stamp: 'OPEN\n24/7',
        sticker: 'NEW!',
        footer: 'THANK YOU! COME AGAIN ♥',
        orientation: 'portrait',
        layout: {
          portrait: { catCols: 1, cardCols: 2 },
          landscape: { catCols: 2, cardCols: 2 },
        },
        imgRatio: '4 / 3',
        showNumbers: true,
        grain: true,
        grainAmount: 35,
        colors: { ...DEFAULT_COLORS },
      },
      categories: [
        {
          id: uid(), name: 'Main Pairs', tagline: "Chef's special!",
          cards: [
            newCard({ name: '캐릭터A × 캐릭터B', desc: '여기에 페어 설명을 적어주세요.\n줄바꿈도 가능해요.', price: '3.18', keywords: ['소꿉친구', '쌍방', '혐관'] }),
            newCard({ name: '캐릭터C × 캐릭터D', desc: '카드를 클릭하면 오른쪽에서 편집할 수 있어요.', price: '12.25', keywords: ['선후배', '구원', ''], shadow: 'mint' }),
          ],
        },
        {
          id: uid(), name: 'Side Pairs', tagline: '곁들이면 더 맛있는 사이드 메뉴',
          cards: [
            newCard({ name: '캐릭터E × 캐릭터F', desc: '가격(성사일)은 비워 두면 표시되지 않아요.', keywords: ['동거', '', ''] }),
            newCard({ name: '캐릭터G × 캐릭터H', desc: '카드를 끌어서 순서나 카테고리를 바꿔 보세요.', price: '7.7', keywords: ['계약연애', '', ''], shadow: 'mint' }),
          ],
        },
      ],
    };
  }

  /** 불러온 데이터에 빠진 필드를 기본값으로 채움 */
  function normalize(raw) {
    const d = defaultState();
    const s = { ...d.settings, ...(raw.settings || {}) };
    s.layout = {
      portrait: { ...d.settings.layout.portrait, ...(raw.settings?.layout?.portrait || {}) },
      landscape: { ...d.settings.layout.landscape, ...(raw.settings?.layout?.landscape || {}) },
    };
    s.colors = { ...DEFAULT_COLORS, ...(raw.settings?.colors || {}) };
    const categories = (Array.isArray(raw.categories) ? raw.categories : []).map((c) => ({
      id: c.id || uid(),
      name: c.name ?? '',
      tagline: c.tagline ?? '',
      cards: (Array.isArray(c.cards) ? c.cards : []).map((k) => {
        const card = newCard({ ...k, id: k.id || uid() });
        card.keywords = [0, 1, 2].map((i) => (k.keywords || [])[i] || '');
        return card;
      }),
    }));
    return { version: 1, settings: s, categories };
  }

  let state = defaultState();
  let selectedId = null;

  function findCard(id) {
    for (const cat of state.categories) {
      const index = cat.cards.findIndex((c) => c.id === id);
      if (index > -1) return { card: cat.cards[index], cat, index };
    }
    return null;
  }
  const findCat = (id) => state.categories.find((c) => c.id === id);

  /* ================= 저장 (IndexedDB) ================= */
  const store = {
    db: null,
    open() {
      if (this.db) return Promise.resolve(this.db);
      return new Promise((res, rej) => {
        const r = indexedDB.open('pair-diner', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => res((this.db = r.result));
        r.onerror = () => rej(r.error);
      });
    },
    async get(k) {
      const db = await this.open();
      return new Promise((res, rej) => {
        const q = db.transaction('kv').objectStore('kv').get(k);
        q.onsuccess = () => res(q.result);
        q.onerror = () => rej(q.error);
      });
    },
    async set(k, v) {
      const db = await this.open();
      return new Promise((res, rej) => {
        const t = db.transaction('kv', 'readwrite');
        t.objectStore('kv').put(v, k);
        t.oncomplete = () => res();
        t.onerror = () => rej(t.error);
      });
    },
  };

  let saveTimer;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        await store.set('state', state);
        $('#saveState').textContent = `마지막 저장: ${new Date().toLocaleTimeString()}`;
      } catch (e) {
        console.warn(e);
        toast('자동 저장 실패 — .json으로 백업해 주세요');
      }
    }, 400);
  }

  /** 상태가 바뀐 뒤 호출 */
  function changed({ board = true, editor = false, style = false } = {}) {
    if (board) renderBoard();
    if (editor) renderMenu();
    if (style) renderStyle();
    save();
  }

  /* ================= 메뉴판 렌더 ================= */
  const board = $('#board');
  const scaler = $('#scaler');
  const scaleBox = $('#scaleBox');
  const stageScroll = $('#stageScroll');

  function cardHTML(card, n) {
    const s = state.settings;
    const price = fmtPrice(card.price);
    const kws = (card.keywords || []).map((k) => k.trim()).filter(Boolean).slice(0, 3);
    const imgStyle = `object-position:${card.posX}% ${card.posY}%;` +
      (card.zoom > 1 ? `transform:scale(${card.zoom});transform-origin:${card.posX}% ${card.posY}%;` : '');
    const sh = SHADOWS.some(([k]) => k === card.shadow) ? card.shadow : 'red';
    const shClass = sh === 'none' ? ' no-shadow' : ` cs-${sh}`;
    const shStyle = sh === 'none' ? '' : ` style="--cs:var(--${sh})"`;
    return `
      <article class="b-card${shClass}${card.id === selectedId ? ' is-selected' : ''}" data-id="${card.id}"${shStyle}>
        ${s.showNumbers ? `<div class="b-no"><span>No.<br>${String(n).padStart(2, '0')}</span></div>` : ''}
        <div class="b-card-img">
          ${card.image ? `<img src="${card.image}" alt="" draggable="false" style="${imgStyle}">` : '<div class="b-noimg">NO IMAGE</div>'}
        </div>
        <div class="b-card-body">
          <div class="b-card-line">
            <h3 class="b-card-name">${esc(card.name) || 'UNTITLED'}</h3>
            ${price ? `<span class="b-dots"></span><span class="b-price">${esc(price)}</span>` : ''}
          </div>
          ${card.desc ? `<p class="b-card-desc">${esc(card.desc)}</p>` : ''}
          ${kws.length ? `<ul class="b-tags">${kws.map((k) => `<li>#${esc(k)}</li>`).join('')}</ul>` : ''}
        </div>
      </article>`;
  }

  function renderBoard() {
    const s = state.settings;
    const lay = s.layout[s.orientation];
    board.className = `board ${s.orientation}`;
    board.dataset.cardcols = lay.cardCols;
    for (const [k, v] of Object.entries(s.colors)) board.style.setProperty(`--${k}`, v);
    board.style.setProperty('--cat-cols', lay.catCols);
    board.style.setProperty('--card-cols', lay.cardCols);
    board.style.setProperty('--img-ratio', s.imgRatio);
    board.style.setProperty('--title-size', `${s.titleSize}px`);
    board.style.setProperty('--grain-opacity', s.grainAmount / 100);

    let n = 0;
    board.innerHTML = `
      <div class="b-inner">
        <header class="b-header">
          ${s.sticker ? `<div class="b-burst"><span>${nl(s.sticker)}</span></div>` : ''}
          ${s.stamp ? `<div class="b-stamp"><span>${nl(s.stamp)}</span></div>` : ''}
          <div class="b-plate"><h1 class="b-title">${nl(s.title) || '&nbsp;'}</h1></div>
          ${s.subtitle ? `<div><div class="b-ribbon"><span>${esc(s.subtitle)}</span></div></div>` : ''}
        </header>
        <div class="b-strip"></div>
        <main class="b-cats">
          ${state.categories.map((cat) => `
            <section class="b-cat" data-id="${cat.id}">
              <div class="b-cat-head">
                <h2 class="b-cat-banner"><span>${esc(cat.name) || 'MENU'}</span></h2>
                ${cat.tagline ? `<p class="b-cat-tagline">${esc(cat.tagline)}</p>` : ''}
              </div>
              <div class="b-grid" data-cat="${cat.id}">
                ${cat.cards.length ? cat.cards.map((c) => cardHTML(c, ++n)).join('') : '<div class="b-empty">COMING SOON</div>'}
              </div>
            </section>`).join('')}
        </main>
        ${s.footer ? `<div class="b-strip"></div><footer class="b-footer">${nl(s.footer)}</footer>` : ''}
      </div>
      ${s.grain ? '<div class="b-grain"></div>' : ''}`;

    bindBoardSortable();
    syncOrientButtons();
    fit();
  }

  function bindBoardSortable() {
    const opts = { animation: 160, ghostClass: 'b-ghost', onEnd: syncFromBoard };
    $$('.b-grid', board).forEach((g) =>
      Sortable.create(g, { ...opts, group: 'board-cards', draggable: '.b-card' }));
    const cats = $('.b-cats', board);
    if (cats) Sortable.create(cats, { ...opts, draggable: '.b-cat', handle: '.b-cat-head' });
  }

  function syncFromBoard() {
    const cards = new Map();
    state.categories.forEach((c) => c.cards.forEach((k) => cards.set(k.id, k)));
    state.categories = $$('.b-cat', board).map((sec) => {
      const cat = findCat(sec.dataset.id);
      cat.cards = $$('.b-card', sec).map((el) => cards.get(el.dataset.id)).filter(Boolean);
      return cat;
    });
    changed({ editor: true });
  }

  function fit() {
    const bw = board.offsetWidth;
    const bh = board.offsetHeight;
    const z = $('#zoomSel').value;
    const avail = stageScroll.clientWidth - parseFloat(getComputedStyle(stageScroll).paddingLeft) * 2;
    const s = z === 'fit' ? Math.min(1, avail / bw) : +z;
    scaler.style.transform = `scale(${s})`;
    scaleBox.style.width = `${bw * s}px`;
    scaleBox.style.height = `${bh * s}px`;
    $('#stageInfo').textContent = `${Math.round(s * 100)}% · ${bw}×${bh}px`;
  }
  new ResizeObserver(fit).observe(stageScroll);
  new ResizeObserver(fit).observe(board);
  $('#zoomSel').addEventListener('change', fit);

  function highlightSelected() {
    $$('.b-card', board).forEach((el) => el.classList.toggle('is-selected', el.dataset.id === selectedId));
  }

  board.addEventListener('click', (e) => {
    const card = e.target.closest('.b-card');
    if (card) { openCard(card.dataset.id, false); return; }
    const head = e.target.closest('.b-cat');
    if (head && e.target.closest('.b-cat-head')) {
      closeCard();
      switchTab('menu');
      const el = $(`.ed-cat[data-id="${head.dataset.id}"]`);
      if (el) { el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); $('.ed-cat-head input', el).focus({ preventScroll: true }); }
      return;
    }
    if (e.target.closest('.b-header, .b-footer')) switchTab('style');
  });

  /* ================= 방향 전환 ================= */
  function syncOrientButtons() {
    $$('#orientSeg button').forEach((b) =>
      b.classList.toggle('is-active', b.dataset.orient === state.settings.orientation));
  }
  $('#orientSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-orient]');
    if (!b || b.dataset.orient === state.settings.orientation) return;
    state.settings.orientation = b.dataset.orient;
    changed({ style: true });
  });

  /* ================= 탭 ================= */
  function switchTab(name) {
    $$('.tabs button').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === name));
    $$('.tab-pane').forEach((p) => p.classList.toggle('is-active', p.dataset.pane === name));
  }
  $('.tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (b) switchTab(b.dataset.tab);
  });

  /* ================= 메뉴 탭 ================= */
  const menuView = $('#menuView');

  function renderMenu() {
    if (selectedId && findCard(selectedId)) renderCardForm();
    else { selectedId = null; renderMenuList(); }
  }

  function renderMenuList() {
    menuView.innerHTML = `
      ${state.categories.length ? '' : '<p class="ed-empty">카테고리가 없어요. 아래 버튼으로 추가해 보세요.</p>'}
      <div class="ed-cats">
        ${state.categories.map((cat) => `
          <div class="ed-cat" data-id="${cat.id}">
            <div class="ed-cat-head">
              <span class="handle cat-handle" title="끌어서 순서 변경">⠿</span>
              <input data-cf="name" value="${esc(cat.name)}" placeholder="카테고리 이름" aria-label="카테고리 이름">
              <button type="button" class="icon-btn" data-act="cat-del" title="카테고리 삭제">✕</button>
            </div>
            <input class="ed-cat-tagline" data-cf="tagline" value="${esc(cat.tagline)}" placeholder="한 줄 문구 (선택)" aria-label="한 줄 문구">
            <ul class="ed-cards" data-cat="${cat.id}">${cat.cards.map((card) => `
              <li class="ed-card" data-id="${card.id}">
                <span class="handle">⠿</span>
                <span class="ed-thumb">${card.image ? `<img src="${card.image}" alt="">` : ''}</span>
                <span class="ed-card-name">${esc(card.name) || '이름 없음'}</span>
                <span class="ed-card-price">${esc(fmtPrice(card.price))}</span>
              </li>`).join('')}</ul>
            <button type="button" class="btn btn-ghost wide" data-act="card-add">+ 카드 추가</button>
          </div>`).join('')}
      </div>
      <button type="button" class="btn btn-red wide" data-act="cat-add">+ 카테고리 추가</button>`;

    const opts = { animation: 150, ghostClass: 'ed-ghost', delayOnTouchOnly: true, delay: 150, onEnd: syncFromEditor };
    Sortable.create($('.ed-cats', menuView), { ...opts, handle: '.cat-handle', draggable: '.ed-cat' });
    $$('.ed-cards', menuView).forEach((ul) => Sortable.create(ul, { ...opts, group: 'ed-cards', draggable: '.ed-card' }));
  }

  function syncFromEditor() {
    const cards = new Map();
    state.categories.forEach((c) => c.cards.forEach((k) => cards.set(k.id, k)));
    state.categories = $$('.ed-cat', menuView).map((box) => {
      const cat = findCat(box.dataset.id);
      cat.cards = $$('.ed-card', box).map((el) => cards.get(el.dataset.id)).filter(Boolean);
      return cat;
    });
    changed();
  }

  function renderCardForm() {
    const { card, cat } = findCard(selectedId);
    menuView.innerHTML = `
      <div class="form-top">
        <button type="button" class="btn btn-ghost" data-act="back">← 목록</button>
        <span class="form-title">카드 편집</span>
      </div>

      <label class="drop" id="drop">
        ${card.image ? `<img src="${card.image}" alt="">` : '<span>이미지를 클릭하거나 끌어다 놓기<br><small>PNG · JPG · WEBP · 붙여넣기(Ctrl+V)도 가능</small></span>'}
        <input type="file" accept="image/*" id="fileIn" hidden>
      </label>
      ${card.image ? `
        <div class="img-tools">
          <div class="field"><label>가로 위치 <span>${card.posX}%</span></label><input type="range" min="0" max="100" data-f="posX" value="${card.posX}"></div>
          <div class="field"><label>세로 위치 <span>${card.posY}%</span></label><input type="range" min="0" max="100" data-f="posY" value="${card.posY}"></div>
          <div class="field"><label>확대 <span>${Math.round(card.zoom * 100)}%</span></label><input type="range" min="1" max="3" step="0.05" data-f="zoom" value="${card.zoom}"></div>
          <button type="button" class="btn btn-ghost" data-act="img-del">이미지 제거</button>
        </div>` : ''}

      <div class="field">
        <label for="fName">페어 이름</label>
        <input id="fName" data-f="name" value="${esc(card.name)}" placeholder="캐릭터A × 캐릭터B">
      </div>
      <div class="field">
        <label for="fDesc">페어 설명</label>
        <textarea id="fDesc" data-f="desc" rows="4" placeholder="페어 소개를 적어주세요">${esc(card.desc)}</textarea>
      </div>
      <div class="field">
        <label for="fPrice">가격 · 성사일 <span class="muted">선택</span></label>
        <input id="fPrice" data-f="price" value="${esc(card.price)}" placeholder="3.18">
        <small>3.18 · 3/18 · 2024-03-18 → <b>$3.18</b> 로 표시돼요. 비우면 숨김.</small>
      </div>
      <div class="field">
        <span class="label">키워드 <span class="muted">최대 3개</span></span>
        <div class="kw-row">
          ${[0, 1, 2].map((i) => `<input data-kw="${i}" value="${esc(card.keywords[i])}" placeholder="키워드${i + 1}" maxlength="20" aria-label="키워드 ${i + 1}">`).join('')}
        </div>
      </div>
      <div class="field">
        <span class="label">카드 그림자 색</span>
        <div class="swatches">
          ${SHADOWS.map(([k, l]) => `
            <label class="swatch">
              <input type="radio" name="fShadow" data-f="shadow" value="${k}"${(card.shadow || 'red') === k ? ' checked' : ''}>
              <span class="chip chip-${k}"${k === 'none' ? '' : ` style="background:${state.settings.colors[k]}"`}></span>${l}
            </label>`).join('')}
        </div>
      </div>
      <div class="field">
        <label for="fCat">카테고리</label>
        <select id="fCat" data-act-change="move">
          ${state.categories.map((c) => `<option value="${c.id}"${c.id === cat.id ? ' selected' : ''}>${esc(c.name) || '(이름 없음)'}</option>`).join('')}
        </select>
      </div>
      <div class="form-actions">
        <button type="button" class="btn" data-act="dup">복제</button>
        <button type="button" class="btn danger" data-act="card-del">삭제</button>
      </div>`;
  }

  function openCard(id, scroll = true) {
    selectedId = id;
    switchTab('menu');
    renderCardForm();
    highlightSelected();
    $('.tab-body').scrollTop = 0;
    if (scroll) $(`.b-card[data-id="${id}"]`, board)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function closeCard() {
    if (!selectedId) return;
    selectedId = null;
    renderMenuList();
    highlightSelected();
  }

  // 입력
  menuView.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.cf) {
      const cat = findCat(t.closest('.ed-cat').dataset.id);
      cat[t.dataset.cf] = t.value;
      return changed();
    }
    const hit = selectedId && findCard(selectedId);
    if (!hit) return;
    const { card } = hit;
    if (t.dataset.kw) {
      card.keywords[+t.dataset.kw] = t.value;
    } else if (t.dataset.f) {
      const f = t.dataset.f;
      card[f] = t.type === 'range' ? +t.value : t.value;
      if (t.type === 'range') {
        const lbl = t.previousElementSibling.querySelector('span');
        lbl.textContent = f === 'zoom' ? `${Math.round(card.zoom * 100)}%` : `${card[f]}%`;
      }
    }
    changed();
  });

  menuView.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'fileIn' && t.files[0]) return setImage(t.files[0]);
    if (t.dataset.actChange === 'move') {
      const { card, cat } = findCard(selectedId);
      const to = findCat(t.value);
      if (!to || to === cat) return;
      cat.cards.splice(cat.cards.indexOf(card), 1);
      to.cards.push(card);
      changed();
    }
  });

  menuView.addEventListener('click', (e) => {
    const actEl = e.target.closest('[data-act]');
    const act = actEl?.dataset.act;
    if (!act) {
      const li = e.target.closest('.ed-card');
      if (li) openCard(li.dataset.id);
      return;
    }
    const catBox = actEl.closest('.ed-cat');
    switch (act) {
      case 'cat-add': {
        const cat = { id: uid(), name: '', tagline: '', cards: [] };
        state.categories.push(cat);
        changed({ editor: true });
        const inp = $(`.ed-cat[data-id="${cat.id}"] input`, menuView);
        inp.scrollIntoView({ block: 'center', behavior: 'smooth' });
        inp.focus({ preventScroll: true });
        break;
      }
      case 'cat-del': {
        const cat = findCat(catBox.dataset.id);
        if (cat.cards.length && !confirm(`"${cat.name || '이름 없음'}" 카테고리와 카드 ${cat.cards.length}개를 삭제할까요?`)) return;
        state.categories.splice(state.categories.indexOf(cat), 1);
        changed({ editor: true });
        break;
      }
      case 'card-add': {
        const card = newCard();
        findCat(catBox.dataset.id).cards.push(card);
        changed();
        openCard(card.id);
        $('#fName').focus();
        break;
      }
      case 'back': closeCard(); break;
      case 'img-del': {
        const { card } = findCard(selectedId);
        Object.assign(card, { image: '', posX: 50, posY: 50, zoom: 1 });
        changed({ editor: true });
        break;
      }
      case 'dup': {
        const { card, cat, index } = findCard(selectedId);
        const copy = { ...clone(card), id: uid() };
        cat.cards.splice(index + 1, 0, copy);
        changed();
        openCard(copy.id);
        toast('카드를 복제했어요');
        break;
      }
      case 'card-del': {
        const { card, cat } = findCard(selectedId);
        if (!confirm(`"${card.name || '이름 없음'}" 카드를 삭제할까요?`)) return;
        cat.cards.splice(cat.cards.indexOf(card), 1);
        selectedId = null;
        changed({ editor: true });
        break;
      }
    }
  });

  // 이미지 드래그&드롭 / 붙여넣기
  menuView.addEventListener('dragover', (e) => {
    const drop = e.target.closest('#drop');
    if (!drop || !e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    drop.classList.add('is-over');
  });
  menuView.addEventListener('dragleave', (e) => e.target.closest('#drop')?.classList.remove('is-over'));
  menuView.addEventListener('drop', (e) => {
    const drop = e.target.closest('#drop');
    if (!drop) return;
    e.preventDefault();
    const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('image/'));
    if (f) setImage(f);
  });
  document.addEventListener('paste', (e) => {
    if (!selectedId || !$('#drop')) return;
    const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/'));
    if (f) { e.preventDefault(); setImage(f); }
  });

  /** 업로드 이미지를 최대 1400px로 줄여 dataURL로 저장 */
  function readImage(file, max = 1400) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * k);
        c.height = Math.round(img.naturalHeight * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        let data = c.toDataURL('image/webp', 0.92);
        if (!data.startsWith('data:image/webp')) data = c.toDataURL('image/png');
        res(data);
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('이미지를 읽을 수 없어요')); };
      img.src = url;
    });
  }
  async function setImage(file) {
    const id = selectedId;
    try {
      const data = await readImage(file);
      const hit = findCard(id);
      if (!hit) return;
      Object.assign(hit.card, { image: data, posX: 50, posY: 50, zoom: 1 });
      changed({ editor: true });
    } catch (err) {
      toast(err.message);
    }
  }

  /* ================= 꾸미기 탭 ================= */
  const styleView = $('#styleView');

  function renderStyle() {
    const s = state.settings;
    const lay = s.layout[s.orientation];
    const opt = (vals, cur) => vals.map(([v, l]) => `<option value="${v}"${String(v) === String(cur) ? ' selected' : ''}>${l}</option>`).join('');
    styleView.innerHTML = `
      <section class="box">
        <h3>타이틀 & 문구</h3>
        <div class="field"><label for="sTitle">타이틀 <span class="muted">줄바꿈 가능</span></label><textarea id="sTitle" data-s="title" rows="2">${esc(s.title)}</textarea></div>
        <div class="field"><label>타이틀 크기 <span>${s.titleSize}px</span></label><input type="range" min="50" max="200" data-s="titleSize" value="${s.titleSize}"></div>
        <div class="field"><label for="sSub">서브타이틀 (리본)</label><input id="sSub" data-s="subtitle" value="${esc(s.subtitle)}"></div>
        <div class="field-2">
          <div class="field"><label for="sStamp">원형 도장</label><textarea id="sStamp" data-s="stamp" rows="2">${esc(s.stamp)}</textarea></div>
          <div class="field"><label for="sSticker">별 스티커</label><textarea id="sSticker" data-s="sticker" rows="2">${esc(s.sticker)}</textarea></div>
        </div>
        <div class="field"><label for="sFooter">푸터</label><textarea id="sFooter" data-s="footer" rows="2">${esc(s.footer)}</textarea></div>
        <p class="muted">비워 두면 해당 장식은 숨겨져요.</p>
      </section>

      <section class="box">
        <h3>레이아웃</h3>
        <div class="field">
          <span class="label">방향</span>
          <div class="seg" data-seg="orientation">
            <button type="button" data-v="portrait" class="${s.orientation === 'portrait' ? 'is-active' : ''}">세로 (1080px)</button>
            <button type="button" data-v="landscape" class="${s.orientation === 'landscape' ? 'is-active' : ''}">가로 (1920px)</button>
          </div>
        </div>
        <div class="field-2">
          <div class="field"><label for="sCatCols">카테고리 열</label><select id="sCatCols" data-lay="catCols">${opt([[1, '1열'], [2, '2열'], [3, '3열']], lay.catCols)}</select></div>
          <div class="field"><label for="sCardCols">카드 열</label><select id="sCardCols" data-lay="cardCols">${opt([[1, '1열 (가로형)'], [2, '2열'], [3, '3열'], [4, '4열']], lay.cardCols)}</select></div>
        </div>
        <p class="muted">열 설정은 세로/가로 버전에 각각 따로 저장돼요.</p>
        <div class="field"><label for="sRatio">이미지 비율</label><select id="sRatio" data-s="imgRatio">${opt([['1 / 1', '1:1 정사각'], ['4 / 3', '4:3'], ['3 / 4', '3:4 세로'], ['16 / 9', '16:9 와이드']], s.imgRatio)}</select></div>
        <label class="check"><input type="checkbox" data-s="showNumbers" ${s.showNumbers ? 'checked' : ''}> 카드 번호 도장 표시</label>
      </section>

      <section class="box">
        <h3>질감</h3>
        <label class="check"><input type="checkbox" data-s="grain" ${s.grain ? 'checked' : ''}> 필름 그레인</label>
        <div class="field" style="margin:10px 0 0"><label>그레인 강도 <span>${s.grainAmount}%</span></label><input type="range" min="5" max="100" data-s="grainAmount" value="${s.grainAmount}"${s.grain ? '' : ' disabled'}></div>
      </section>

      <section class="box">
        <h3>색상</h3>
        <div class="colors">
          ${Object.keys(DEFAULT_COLORS).map((k) => `<label><input type="color" data-color="${k}" value="${s.colors[k]}">${COLOR_LABELS[k]}</label>`).join('')}
        </div>
        <div class="row" style="margin-top:10px"><button type="button" class="btn btn-ghost" data-act="colors-reset">기본 색상으로</button></div>
      </section>`;
  }

  styleView.addEventListener('input', (e) => {
    const t = e.target;
    const s = state.settings;
    if (t.dataset.s) {
      const k = t.dataset.s;
      if (t.type === 'checkbox') {
        s[k] = t.checked;
        if (k === 'grain') $('[data-s="grainAmount"]', styleView).disabled = !t.checked;
      }
      else if (t.type === 'range') {
        s[k] = +t.value;
        t.previousElementSibling.querySelector('span').textContent = k === 'grainAmount' ? `${t.value}%` : `${t.value}px`;
      } else s[k] = t.value;
    } else if (t.dataset.lay) {
      s.layout[s.orientation][t.dataset.lay] = +t.value;
    } else if (t.dataset.color) {
      s.colors[t.dataset.color] = t.value;
    } else return;
    changed();
  });
  styleView.addEventListener('change', (e) => {
    if (e.target.tagName === 'SELECT' || e.target.type === 'checkbox') e.target.dispatchEvent(new Event('input', { bubbles: true }));
  });
  styleView.addEventListener('click', (e) => {
    const segBtn = e.target.closest('[data-seg] button');
    if (segBtn) {
      state.settings.orientation = segBtn.dataset.v;
      return changed({ style: true });
    }
    if (e.target.closest('[data-act="colors-reset"]')) {
      state.settings.colors = { ...DEFAULT_COLORS };
      changed({ style: true });
    }
  });

  /* ================= 저장 탭 ================= */
  function downloadBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }
  const fileBase = () =>
    (state.settings.title || 'pair-menu').replace(/\s+/g, '_').replace(/[\\/:*?"<>|]/g, '').slice(0, 40) || 'pair-menu';

  $('#jsonSave').addEventListener('click', () => {
    downloadBlob(new Blob([JSON.stringify(state)], { type: 'application/json' }), `${fileBase()}.json`);
  });
  $('#jsonLoad').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const raw = JSON.parse(await f.text());
      if (!raw || !Array.isArray(raw.categories)) throw new Error();
      state = normalize(raw);
      selectedId = null;
      changed({ editor: true, style: true });
      toast('프로젝트를 불러왔어요');
    } catch {
      toast('올바른 프로젝트 파일이 아니에요');
    }
  });
  $('#resetAll').addEventListener('click', () => {
    if (!confirm('모든 내용을 지우고 새로 시작할까요? (되돌릴 수 없어요)')) return;
    state = defaultState();
    selectedId = null;
    changed({ editor: true, style: true });
  });

  /* ================= 이미지 내보내기 ================= */
  const fontCache = new Map();

  function toDataURL(url) {
    if (!fontCache.has(url)) {
      fontCache.set(url, fetch(url).then((r) => r.blob()).then((b) => new Promise((res) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.readAsDataURL(b);
      })));
    }
    return fontCache.get(url);
  }

  /** 구글 폰트 CSS 중 메뉴판에 실제 쓰인 글자 범위만 골라 임베드 (한글 폰트 전체를 받지 않도록) */
  async function buildFontCSS(node) {
    const text = `${node.innerText}${node.textContent}No.$#0123456789★♥`;
    const cps = new Set([...text].map((c) => c.codePointAt(0)));
    const css = await (await fetch($('#gfonts').href)).text();
    const blocks = css.match(/@font-face\s*{[^}]*}/g) || [];
    const inRange = (range) => range.split(',').some((part) => {
      let [a, b] = part.trim().replace(/^U\+/i, '').split('-');
      if (a.includes('?')) { b = a.replace(/\?/g, 'F'); a = a.replace(/\?/g, '0'); }
      const lo = parseInt(a, 16);
      const hi = parseInt(b ?? a, 16);
      for (const cp of cps) if (cp >= lo && cp <= hi) return true;
      return false;
    });
    const used = blocks.filter((b) => {
      const m = b.match(/unicode-range:\s*([^;]+);/);
      return !m || inRange(m[1]);
    });
    const out = await Promise.all(used.map(async (b) => {
      const m = b.match(/url\((['"]?)([^'")]+)\1\)/);
      if (!m) return b;
      return b.replace(m[0], `url(${await toDataURL(m[2])})`);
    }));
    return out.join('\n');
  }

  $('#exBtn').addEventListener('click', async () => {
    const btn = $('#exBtn');
    const fmt = $('#exFmt').value;
    const ratio = +$('#exScale').value;
    btn.disabled = true;
    btn.textContent = '굽는 중…';
    board.classList.add('is-exporting');
    try {
      await document.fonts.ready;
      let fontEmbedCSS;
      try { fontEmbedCSS = await buildFontCSS(board); } catch (err) { console.warn('font embed fallback', err); }
      const opts = { pixelRatio: ratio, backgroundColor: state.settings.colors.cream, fontEmbedCSS };
      let blob;
      if (fmt === 'png') {
        blob = await htmlToImage.toBlob(board, opts);
      } else {
        const canvas = await htmlToImage.toCanvas(board, opts);
        blob = await new Promise((res) => canvas.toBlob(res, `image/${fmt}`, 0.95));
      }
      if (!blob) throw new Error('empty');
      const ext = fmt === 'jpeg' ? 'jpg' : fmt;
      downloadBlob(blob, `${fileBase()}_${state.settings.orientation}.${ext}`);
      toast('이미지를 저장했어요!');
    } catch (err) {
      console.error(err);
      toast('이미지 생성에 실패했어요 (콘솔 확인)');
    } finally {
      board.classList.remove('is-exporting');
      btn.disabled = false;
      btn.textContent = '다운로드';
    }
  });

  /* ================= 시작 ================= */
  (async () => {
    try {
      const saved = await store.get('state');
      if (saved && Array.isArray(saved.categories)) state = normalize(saved);
    } catch (e) {
      console.warn('저장소를 열 수 없어요', e);
      $('#saveState').textContent = '이 브라우저에선 자동 저장을 쓸 수 없어요. .json으로 저장해 주세요.';
    }
    renderBoard();
    renderMenu();
    renderStyle();
    document.fonts.ready.then(fit);
  })();
})();
