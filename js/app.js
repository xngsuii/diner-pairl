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
  const THEMES = [['red', '레드'], ['mint', '민트']];

  /** 헤더 장식 기본값 (x, y: 기본 위치에서 이동한 px / scale: % / rot: 도) */
  const DECO_DEFAULTS = {
    subtitle: { x: 0, y: 0, scale: 100, rot: 0 },
    stamp:    { x: 0, y: 0, scale: 100, rot: 12 },
    sticker:  { x: 0, y: 0, scale: 100, rot: -14 },
  };
  /** 추가 스티커 (SVG) — 켜고 끌 수 있고, 위치/크기/회전은 헤더 장식과 같은 방식으로 조절 */
  const STICKERS = {
    seal:    { label: '고무도장 씰', rot: -8, fields: [['ring', '둘레 문구', 'FRESHLY PAIRED ★ MADE WITH LOVE ★'], ['bottom', '아래 문구', 'EST. 2026']] },
    ticket:  { label: '입장권 티켓', rot: -6, fields: [['top', '위 문구', 'ADMIT'], ['main', '큰 문구', 'TWO'], ['stub', '절취선 옆', 'No.0318']] },
    tag:     { label: '가격표 태그', rot: 8,  fields: [['top', '위 문구', "TODAY'S"], ['main', '큰 문구', 'SPECIAL'], ['bottom', '아래 문구', 'ONLY $3.18']] },
    rosette: { label: '로제트 배지', rot: -5, fields: [['top', '위 문구', 'BEST'], ['main', '큰 문구', 'PAIR'], ['bottom', '아래 문구', '★ No.1 ★']] },
    bubble:  { label: '말풍선',      rot: -6, fields: [['top', '위 문구', "CHEF'S PICK"], ['main', '큰 문구', 'SHIP IT!']] },
  };
  const BASE_DECO = ['subtitle', 'stamp', 'sticker'];
  const STICKER_KEYS = Object.keys(STICKERS);
  for (const [k, v] of Object.entries(STICKERS)) DECO_DEFAULTS[k] = { x: 0, y: 0, scale: 100, rot: v.rot };
  const stickerDefaults = () => Object.fromEntries(STICKER_KEYS.map((k) =>
    [k, { on: false, ...Object.fromEntries(STICKERS[k].fields.map(([f, , d]) => [f, d])) }]));

  const DECO_LABELS = {
    subtitle: '서브타이틀 리본', stamp: '원형 도장', sticker: '별 스티커',
    ...Object.fromEntries(STICKER_KEYS.map((k) => [k, STICKERS[k].label])),
  };
  const decoTransform = (d) => `translate(${d.x}px, ${d.y}px) rotate(${d.rot}deg) scale(${d.scale / 100})`;

  const newCard = (o = {}) => ({
    id: uid(), name: '', desc: '', price: '', keywords: ['', '', ''],
    image: '', posX: 50, posY: 50, zoom: 1, theme: 'red', ...o,
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
        deco: clone(DECO_DEFAULTS),
        stickers: stickerDefaults(),
        colors: { ...DEFAULT_COLORS },
      },
      categories: [
        {
          id: uid(), name: 'Main Pairs', tagline: "Chef's special!",
          cards: [
            newCard({ name: '캐릭터A × 캐릭터B', desc: '여기에 페어 설명을 적어주세요.\n줄바꿈도 가능해요.', price: '3.18', keywords: ['소꿉친구', '쌍방', '혐관'] }),
            newCard({ name: '캐릭터C × 캐릭터D', desc: '카드를 클릭하면 오른쪽에서 편집할 수 있어요.', price: '12.25', keywords: ['선후배', '구원', ''], theme: 'mint' }),
          ],
        },
        {
          id: uid(), name: 'Side Pairs', tagline: '곁들이면 더 맛있는 사이드 메뉴',
          cards: [
            newCard({ name: '캐릭터E × 캐릭터F', desc: '가격(성사일)은 비워 두면 표시되지 않아요.', keywords: ['동거', '', ''] }),
            newCard({ name: '캐릭터G × 캐릭터H', desc: '카드를 끌어서 순서나 카테고리를 바꿔 보세요.', price: '7.7', keywords: ['계약연애', '', ''], theme: 'mint' }),
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
    const sd = stickerDefaults();
    s.stickers = Object.fromEntries(STICKER_KEYS.map((k) => [k, { ...sd[k], ...(raw.settings?.stickers?.[k] || {}) }]));
    s.deco = Object.fromEntries(Object.keys(DECO_DEFAULTS).map((k) =>
      [k, { ...DECO_DEFAULTS[k], ...(raw.settings?.deco?.[k] || {}) }]));
    const categories = (Array.isArray(raw.categories) ? raw.categories : []).map((c) => ({
      id: c.id || uid(),
      name: c.name ?? '',
      tagline: c.tagline ?? '',
      cards: (Array.isArray(c.cards) ? c.cards : []).map((k) => {
        const card = newCard({ ...k, id: k.id || uid() });
        card.theme = k.theme || (k.shadow === 'mint' ? 'mint' : 'red');
        delete card.shadow;
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
    const theme = card.theme === 'mint' ? 'mint' : 'red';
    return `
      <article class="b-card th-${theme}${card.id === selectedId ? ' is-selected' : ''}" data-id="${card.id}">
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

  /** 스티커 SVG. 색·폰트는 board.css의 .f-* / .s-* / .t-* 클래스로 → 색상 설정을 그대로 따름 */
  function stickerHTML(k) {
    const t = state.settings.stickers[k];
    const e = (f) => esc(t[f]);
    const svg = {
      seal: `<svg viewBox="0 0 200 200" width="180" height="180"><g opacity=".93">
        <circle cx="100" cy="100" r="88" fill="none" class="s-red" stroke-width="5"/>
        <circle cx="100" cy="100" r="80" fill="none" class="s-red" stroke-width="1.5"/>
        <circle cx="100" cy="100" r="54" fill="none" class="s-red" stroke-width="2.5"/>
        <path id="sk-seal-ring" d="M100,100 m-67,0 a67,67 0 1,1 134,0 a67,67 0 1,1 -134,0" fill="none"/>
        <text class="t-num f-red" font-size="14.5"><textPath href="#sk-seal-ring" textLength="415" lengthAdjust="spacing">${e('ring')}</textPath></text>
        <path class="f-red" d="M100 118 C74 100 76 78 90 78 C96 78 100 83 100 87 C100 83 104 78 110 78 C124 78 126 100 100 118Z"/>
        <text x="100" y="138" text-anchor="middle" class="t-num f-red" font-size="11" data-max="84">${e('bottom')}</text>
      </g></svg>`,
      ticket: `<svg viewBox="0 40 220 120" width="210" height="115">
        <path class="f-mint" d="M10 45 H210 V88 A12 12 0 0 0 210 112 V155 H10 V112 A12 12 0 0 0 10 88 Z"/>
        <rect x="20" y="55" width="180" height="90" rx="4" fill="none" class="s-cream" stroke-width="2" stroke-dasharray="5 4"/>
        <line x1="158" y1="50" x2="158" y2="150" class="s-cream" stroke-width="2.5" stroke-dasharray="3 5"/>
        <text x="89" y="86" text-anchor="middle" class="t-num f-cream" font-size="15" letter-spacing="3" data-max="118">${e('top')}</text>
        <text x="89" y="130" text-anchor="middle" class="t-disp f-cream" font-size="44" data-max="118">${e('main')}</text>
        <text x="180" y="100" text-anchor="middle" class="t-num f-cream" font-size="11" transform="rotate(90 180 100)" data-max="84">${e('stub')}</text>
      </svg>`,
      tag: `<svg viewBox="-2 26 216 134" width="200" height="124">
        <path class="f-red s-red" stroke-width="4" stroke-linejoin="round" d="M46 44 H210 V156 H46 L8 100 Z"/>
        <path class="f-accent" d="M54 58 H196 V142 H54 L28 100 Z"/>
        <path fill="none" class="s-cream" stroke-width="2" stroke-dasharray="5 4" stroke-linejoin="round" d="M49 51 H203 V149 H49 L18 100 Z"/>
        <circle cx="36" cy="100" r="7" class="f-cream"/>
        <path fill="none" class="s-ink" stroke-width="2" d="M36 100 C28 80 18 60 0 30"/>
        <text x="123" y="80" text-anchor="middle" class="t-num f-red" font-size="13" letter-spacing="1" data-max="130">${e('top')}</text>
        <text x="123" y="115" text-anchor="middle" class="t-disp f-red" font-size="34" data-max="130">${e('main')}</text>
        <text x="123" y="130" text-anchor="middle" class="t-num f-ink" font-size="11" data-max="130">${e('bottom')}</text>
      </svg>`,
      rosette: `<svg viewBox="25 15 150 190" width="150" height="190">
        <polygon class="f-deep" points="72,128 56,198 73,186 86,199 98,138"/>
        <polygon class="f-red" points="128,128 144,198 127,186 114,199 102,138"/>
        <g class="f-red">${[[160, 90], [155.4, 113], [142.4, 132.4], [123, 145.4], [100, 150], [77, 145.4], [57.6, 132.4], [44.6, 113], [40, 90], [44.6, 67], [57.6, 47.6], [77, 34.6], [100, 30], [123, 34.6], [142.4, 47.6], [155.4, 67]]
          .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="13"/>`).join('')}<circle cx="100" cy="90" r="61"/></g>
        <circle cx="100" cy="90" r="49" class="f-cream"/>
        <circle cx="100" cy="90" r="43" fill="none" class="s-red" stroke-width="1.5" stroke-dasharray="4 3"/>
        <text x="100" y="76" text-anchor="middle" class="t-num f-red" font-size="13" data-max="74">${e('top')}</text>
        <text x="100" y="108" text-anchor="middle" class="t-disp f-red" font-size="32" data-max="80">${e('main')}</text>
        <text x="100" y="124" text-anchor="middle" class="t-num f-mint" font-size="10" data-max="70">${e('bottom')}</text>
      </svg>`,
      bubble: `<svg viewBox="10 15 205 142" width="210" height="145">
        <defs><pattern id="sk-bubble-dots" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="4.5" cy="4.5" r="1.6" class="f-red" opacity=".22"/></pattern></defs>
        <path transform="translate(7 7)" class="f-mint" d="${BUBBLE_PATH}"/>
        <path class="f-paper s-red" stroke-width="4" stroke-linejoin="round" d="${BUBBLE_PATH}"/>
        <path fill="url(#sk-bubble-dots)" d="${BUBBLE_PATH}"/>
        <text x="110" y="52" text-anchor="middle" class="t-num f-mint" font-size="12" letter-spacing="2" data-max="165">${e('top')}</text>
        <text x="110" y="97" text-anchor="middle" class="t-disp f-red" font-size="44" data-max="170">${e('main')}</text>
      </svg>`,
    }[k];
    return `<div class="b-sk b-sk-${k}" data-deco="${k}" style="transform:${decoTransform(state.settings.deco[k])}">${svg}</div>`;
  }
  const BUBBLE_PATH = 'M30 20 H190 Q205 20 205 35 V100 Q205 115 190 115 H92 L58 150 L68 115 H30 Q15 115 15 100 V35 Q15 20 30 20 Z';

  /** 스티커 문구가 자리보다 길면 SVG textLength로 가로를 눌러서 맞춤 */
  function fitSvgText() {
    $$('.b-sk text[data-max]', board).forEach((el) => {
      el.removeAttribute('textLength');
      const max = +el.dataset.max;
      if (el.getComputedTextLength() > max) {
        el.setAttribute('textLength', max);
        el.setAttribute('lengthAdjust', 'spacingAndGlyphs');
      }
    });
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
          ${s.sticker ? `<div class="b-burst" data-deco="sticker" style="transform:${decoTransform(s.deco.sticker)}"><span>${nl(s.sticker)}</span></div>` : ''}
          ${s.stamp ? `<div class="b-stamp" data-deco="stamp" style="transform:${decoTransform(s.deco.stamp)}"><span>${nl(s.stamp)}</span></div>` : ''}
          ${STICKER_KEYS.filter((k) => s.stickers[k].on).map((k) => stickerHTML(k)).join('')}
          <div class="b-plate"><h1 class="b-title">${nl(s.title) || '&nbsp;'}</h1></div>
          ${s.subtitle ? `<div><div class="b-ribbon" data-deco="subtitle" style="transform:${decoTransform(s.deco.subtitle)}"><span>${esc(s.subtitle)}</span></div></div>` : ''}
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

    fitSvgText();
    bindBoardSortable();
    syncOrientButtons();
    fit();
  }

  /* 브라우저 기본 드래그 이미지(반투명) 대신 Sortable이 만든 복제본을 불투명하게 띄움 */
  const DRAG_OPTS = { animation: 160, forceFallback: true, fallbackTolerance: 4, dragClass: 'is-drag-clone' };

  /* 프리뷰는 scale()로 축소돼 있어서 복제본 이동량도 같이 줄어듦 → 보기 배율만큼 보정 */
  const dragStart = { x: 0, y: 0 };
  board.addEventListener('pointerdown', (e) => { dragStart.x = e.clientX; dragStart.y = e.clientY; }, true);
  function fixCloneOffset(e) {
    const g = $('.is-drag-clone', board);
    if (!g || viewScale === 1) return;
    const p = e.touches ? e.touches[0] : e;
    const dx = (p.clientX - dragStart.x) / viewScale;
    const dy = (p.clientY - dragStart.y) / viewScale;
    g.style.transform = `matrix(1,0,0,1,${dx},${dy})`;
  }
  const MOVE_EVENTS = ['pointermove', 'mousemove', 'touchmove'];
  const boardDragHooks = {
    onStart() { MOVE_EVENTS.forEach((t) => document.addEventListener(t, fixCloneOffset)); },
    onUnchoose() { MOVE_EVENTS.forEach((t) => document.removeEventListener(t, fixCloneOffset)); },
  };

  function bindBoardSortable() {
    const opts = { ...DRAG_OPTS, ...boardDragHooks, ghostClass: 'b-ghost', onEnd: syncFromBoard };
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

  let viewScale = 1;
  function fit() {
    const bw = board.offsetWidth;
    const bh = board.offsetHeight;
    const z = $('#zoomSel').value;
    const pad = parseFloat(getComputedStyle(stageScroll).paddingLeft) * 2;
    const availW = stageScroll.clientWidth - pad;
    const availH = stageScroll.clientHeight - pad;
    const s = z === 'fit' ? Math.min(1, availW / bw, availH / bh) : +z;
    viewScale = s;
    scaler.style.transform = `scale(${s})`;
    scaleBox.style.width = `${bw * s}px`;
    scaleBox.style.height = `${bh * s}px`;
    $('#stageInfo').textContent = `${Math.round(s * 100)}% · ${bw}×${bh}px`;
  }
  new ResizeObserver(fit).observe(stageScroll);
  new ResizeObserver(fit).observe(board);
  $('#zoomSel').addEventListener('change', fit);

  /* 헤더 장식(리본·도장·스티커)을 프리뷰에서 직접 끌어서 이동 */
  board.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('[data-deco]');
    if (!el || e.button !== 0) return;
    e.preventDefault();
    const k = el.dataset.deco;
    const d = state.settings.deco[k];
    const start = { x: e.clientX, y: e.clientY, ox: d.x, oy: d.y };
    el.classList.add('is-moving');
    const move = (ev) => {
      d.x = Math.round(start.ox + (ev.clientX - start.x) / viewScale);
      d.y = Math.round(start.oy + (ev.clientY - start.y) / viewScale);
      el.style.transform = decoTransform(d);
      syncDecoInputs(k);
    };
    const end = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', end);
      document.removeEventListener('pointercancel', end);
      el.classList.remove('is-moving');
      save();
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
  });

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

    const opts = { ...DRAG_OPTS, ghostClass: 'ed-ghost', delayOnTouchOnly: true, delay: 150, onEnd: syncFromEditor };
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
        <span class="label">카드 테마색 <span class="muted">외곽선·그림자·이름·키워드</span></span>
        <div class="swatches">
          ${THEMES.map(([k, l]) => `
            <label class="swatch">
              <input type="radio" name="fTheme" data-f="theme" value="${k}"${(card.theme || 'red') === k ? ' checked' : ''}>
              <span class="chip" style="background:${state.settings.colors[k]}"></span>${l}
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

  /* 꾸미기 탭 섹션 접기/펼치기 — 열린 섹션은 이 브라우저에만 기억 */
  const FOLD_KEY = 'pair-diner:open-folds';
  const openFolds = (() => {
    try {
      const v = JSON.parse(localStorage.getItem(FOLD_KEY));
      if (Array.isArray(v)) return new Set(v);
    } catch { /* 저장소 없음 */ }
    return new Set(['text']);
  })();
  const fold = (id, title, body, cls = 'box fold') => `
    <details class="${cls}" data-fold="${id}"${openFolds.has(id) ? ' open' : ''}>
      <summary><h3>${title}</h3></summary>
      <div class="fold-body">${body}</div>
    </details>`;
  styleView.addEventListener('toggle', (e) => {
    const id = e.target.dataset?.fold;
    if (!id) return;
    if (e.target.open) openFolds.add(id); else openFolds.delete(id);
    try { localStorage.setItem(FOLD_KEY, JSON.stringify([...openFolds])); } catch { /* 무시 */ }
  }, true);

  function renderStyle() {
    const s = state.settings;
    const lay = s.layout[s.orientation];
    const opt = (vals, cur) => vals.map(([v, l]) => `<option value="${v}"${String(v) === String(cur) ? ' selected' : ''}>${l}</option>`).join('');
    styleView.innerHTML = `
      <div class="fold-tools">
        <button type="button" class="btn btn-ghost btn-sm" data-act="fold-all" data-open="1">모두 펼치기</button>
        <button type="button" class="btn btn-ghost btn-sm" data-act="fold-all" data-open="">모두 접기</button>
      </div>
      ${fold('text', '타이틀 & 문구', `
        <div class="field"><label for="sTitle">타이틀 <span class="muted">줄바꿈 가능</span></label><textarea id="sTitle" data-s="title" rows="2">${esc(s.title)}</textarea></div>
        <div class="field"><label>타이틀 크기 <span>${s.titleSize}px</span></label><input type="range" min="50" max="200" data-s="titleSize" value="${s.titleSize}"></div>
        <div class="field"><label for="sFooter">푸터 <span class="muted">비우면 숨김</span></label><textarea id="sFooter" data-s="footer" rows="2">${esc(s.footer)}</textarea></div>`)}

      ${fold('deco', '헤더 장식', `
        <div class="box-head">
          <p class="muted" style="margin:0">프리뷰에서 장식을 직접 끌어서 옮길 수도 있어요. 리본·도장·별 스티커는 문구를 비우면 숨겨지고, 나머지는 '메뉴판에 표시'를 켜야 나와요.</p>
          <button type="button" class="btn btn-ghost btn-sm" data-act="deco-reset-all" data-keys="${[...BASE_DECO, ...STICKER_KEYS]}">전체 기본값</button>
        </div>
        ${[...BASE_DECO, ...STICKER_KEYS].map((k) => decoFields(k)).join('')}`)}

      ${fold('layout', '레이아웃', `
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
        <label class="check"><input type="checkbox" data-s="showNumbers" ${s.showNumbers ? 'checked' : ''}> 카드 번호 도장 표시</label>`)}

      ${fold('texture', '질감', `
        <label class="check"><input type="checkbox" data-s="grain" ${s.grain ? 'checked' : ''}> 필름 그레인</label>
        <div class="field" style="margin:10px 0 0"><label>그레인 강도 <span>${s.grainAmount}%</span></label><input type="range" min="5" max="100" data-s="grainAmount" value="${s.grainAmount}"${s.grain ? '' : ' disabled'}></div>`)}

      ${fold('colors', '색상', `
        <div class="colors">
          ${Object.keys(DEFAULT_COLORS).map((k) => `<label><input type="color" data-color="${k}" value="${s.colors[k]}">${COLOR_LABELS[k]}</label>`).join('')}
        </div>
        <div class="row" style="margin-top:10px"><button type="button" class="btn btn-ghost" data-act="colors-reset">기본 색상으로</button></div>`)}`;
  }

  const DECO_RANGES = {
    scale: ['크기', 40, 250, 1, '%'],
    rot:   ['회전', -180, 180, 1, '°'],
    x:     ['가로 위치', -900, 900, 1, 'px'],
    y:     ['세로 위치', -400, 800, 1, 'px'],
  };
  function decoFields(k) {
    const s = state.settings;
    const d = s.deco[k];
    const sk = STICKERS[k];
    const text = sk
      ? `<label class="check" style="margin-bottom:8px"><input type="checkbox" data-sk="${k}" data-skf="on"${s.stickers[k].on ? ' checked' : ''}> 메뉴판에 표시</label>
         ${sk.fields.map(([f, label]) => `
           <div class="field"><label>${label}</label><input data-sk="${k}" data-skf="${f}" value="${esc(s.stickers[k][f])}"></div>`).join('')}`
      : k === 'subtitle'
        ? `<input data-s="subtitle" value="${esc(s.subtitle)}" aria-label="${DECO_LABELS[k]} 문구">`
        : `<textarea data-s="${k}" rows="2" aria-label="${DECO_LABELS[k]} 문구">${esc(s[k])}</textarea>`;
    return fold(`deco-${k}`, DECO_LABELS[k], `
        <div class="deco-tools">
          <button type="button" class="btn btn-ghost btn-sm" data-act="deco-reset" data-k="${k}">기본값</button>
        </div>
        ${text}
        <div class="deco-grid">
          ${Object.entries(DECO_RANGES).map(([dk, [label, min, max, step, unit]]) => `
            <div class="field">
              <label>${label} <span data-out="${k}-${dk}">${d[dk]}${unit}</span></label>
              <input type="range" min="${min}" max="${max}" step="${step}" data-deco="${k}" data-dk="${dk}" value="${d[dk]}">
            </div>`).join('')}
        </div>`, 'deco fold');
  }
  /** 프리뷰에서 끌어 옮길 때 슬라이더 값도 따라 움직이게 */
  function syncDecoInputs(k) {
    const d = state.settings.deco[k];
    for (const dk of ['x', 'y']) {
      const inp = $(`input[data-deco="${k}"][data-dk="${dk}"]`, styleView);
      if (inp) inp.value = d[dk];
      const out = $(`[data-out="${k}-${dk}"]`, styleView);
      if (out) out.textContent = `${d[dk]}px`;
    }
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
    } else if (t.dataset.sk) {
      const st = s.stickers[t.dataset.sk];
      if (t.dataset.skf === 'on') st.on = t.checked; else st[t.dataset.skf] = t.value;
    } else if (t.dataset.dk) {
      s.deco[t.dataset.deco][t.dataset.dk] = +t.value;
      $(`[data-out="${t.dataset.deco}-${t.dataset.dk}"]`, styleView).textContent = `${t.value}${DECO_RANGES[t.dataset.dk][4]}`;
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
    const foldAll = e.target.closest('[data-act="fold-all"]');
    if (foldAll) {
      $$('details[data-fold]', styleView).forEach((d) => { d.open = !!foldAll.dataset.open; });
      return;
    }
    const reset = e.target.closest('[data-act="deco-reset"], [data-act="deco-reset-all"]');
    if (reset) {
      const keys = reset.dataset.k ? [reset.dataset.k] : reset.dataset.keys.split(',');
      keys.forEach((k) => { state.settings.deco[k] = { ...DECO_DEFAULTS[k] }; });
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
    document.fonts.ready.then(() => { fitSvgText(); fit(); });
  })();
})();
