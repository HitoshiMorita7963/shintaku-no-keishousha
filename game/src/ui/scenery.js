// ストーリー画面の背景（画像ファイルを使わず SVG と CSS アニメーションで描く）。
// どの背景にするかは data/scenario/backgrounds.json のルールで決める。

/** @typedef {{theme: string, time: string}} Scenery */

/**
 * シーンから背景を決める（一致しなければ直前の背景を引き継ぐ）
 * @param {any} rules backgrounds.json
 * @param {{title: string, location: string}} scene
 * @param {string[]} openingTexts シーン冒頭の地の文（時間帯の判定用）
 * @param {Scenery | null} prev
 * @returns {Scenery}
 */
export function chooseScenery(rules, scene, openingTexts, prev) {
  const base = prev ?? rules?.default ?? { theme: 'academy', time: 'day' };
  const hit = (/** @type {string[]} */ words, /** @type {string} */ text) => words.some((w) => text.includes(w));
  let theme = base.theme;
  if (scene.location) {
    const r = (rules?.location_rules ?? []).find((x) => hit(x.match, scene.location));
    theme = r ? r.theme : rules?.default?.theme ?? 'academy';
  }
  let time = base.time;
  const timeText = [scene.title, ...openingTexts].join(' ');
  const t = (rules?.time_rules ?? []).find((x) => hit(x.match, timeText));
  if (t) time = t.time;
  return { theme, time };
}

const INDOOR = new Set(['room', 'classroom', 'hallway', 'office', 'infirmary', 'auditorium']);

/** 0～1 の擬似乱数（同じ背景は毎回同じ配置にする） */
function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** 窓（室内の背景で時間帯の空を見せる） */
const windowSvg = (x, y, w, h) => `
  <g class="sc-window"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" class="sc-win-sky"/>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="none" stroke="var(--frame)" stroke-width="4"/>
  <line x1="${x + w / 2}" y1="${y}" x2="${x + w / 2}" y2="${y + h}" stroke="var(--frame)" stroke-width="3"/>
  <line x1="${x}" y1="${y + h / 2}" x2="${x + w}" y2="${y + h / 2}" stroke="var(--frame)" stroke-width="3"/></g>`;

/** 各テーマの前景（シルエット）。viewBox 400x240 */
const SILHOUETTES = {
  room: () => `
    <rect width="400" height="240" fill="var(--wall)"/>
    ${windowSvg(250, 40, 100, 80)}
    <polygon class="sc-lightray" points="250,120 350,120 300,240 170,240"/>
    <rect y="190" width="400" height="50" fill="var(--floor)"/>
    <rect x="30" y="150" width="120" height="45" rx="4" fill="var(--sil2)"/><rect x="30" y="140" width="40" height="18" rx="6" fill="var(--sil3)"/>
    <rect x="190" y="150" width="50" height="45" fill="var(--sil)"/><rect x="185" y="145" width="60" height="8" fill="var(--sil2)"/>
    <rect x="375" y="70" width="14" height="40" rx="7" fill="var(--sil3)" class="sc-shine"/>`,
  classroom: () => `
    <rect width="400" height="240" fill="var(--wall)"/>
    <rect x="40" y="40" width="200" height="90" fill="#1f3a2e" stroke="var(--frame)" stroke-width="5"/>
    <g stroke="#e8f0e8" stroke-width="2" opacity=".55" fill="none"><path d="M60,65 h70"/><path d="M60,82 h110"/><path d="M60,99 h55"/><circle cx="200" cy="85" r="14"/></g>
    ${windowSvg(275, 35, 90, 95)}
    <rect y="185" width="400" height="55" fill="var(--floor)"/>
    ${[0, 1, 2, 3].map((i) => `<rect x="${30 + i * 95}" y="170" width="70" height="12" fill="var(--sil2)"/><rect x="${45 + i * 95}" y="182" width="6" height="30" fill="var(--sil)"/><rect x="${80 + i * 95}" y="182" width="6" height="30" fill="var(--sil)"/>`).join('')}`,
  hallway: () => `
    <rect width="400" height="240" fill="var(--wall)"/>
    <polygon points="0,0 400,0 260,90 140,90" fill="var(--sil3)"/>
    <polygon points="0,240 400,240 260,150 140,150" fill="var(--floor)"/>
    <rect x="140" y="90" width="120" height="60" fill="var(--sil)"/>
    ${[0, 1, 2].map((i) => windowSvg(20 + i * 30, 70 + i * 12, 22 - i * 4, 60 - i * 14)).join('')}
    <rect x="300" y="80" width="30" height="90" fill="var(--sil2)"/>`,
  office: () => `
    <rect width="400" height="240" fill="var(--wall)"/>
    ${[0, 1, 2].map((i) => `<rect x="20" y="${40 + i * 45}" width="110" height="38" fill="var(--sil)"/>${[0, 1, 2, 3, 4, 5, 6].map((j) => `<rect x="${26 + j * 15}" y="${46 + i * 45}" width="10" height="30" fill="var(--sil3)"/>`).join('')}`).join('')}
    ${windowSvg(250, 40, 110, 90)}
    <rect y="190" width="400" height="50" fill="var(--floor)"/>
    <rect x="200" y="160" width="160" height="30" fill="var(--sil2)"/>`,
  infirmary: () => `
    <rect width="400" height="240" fill="var(--wall)"/>
    ${windowSvg(160, 35, 90, 80)}
    <path class="sc-curtain" d="M40,20 Q60,120 40,200 L130,200 Q110,120 130,20 Z" fill="var(--curtain)"/>
    <path class="sc-curtain sc-delay" d="M270,20 Q290,120 270,200 L360,200 Q340,120 360,20 Z" fill="var(--curtain)"/>
    <rect y="200" width="400" height="40" fill="var(--floor)"/>
    <rect x="150" y="160" width="110" height="35" rx="4" fill="#e8ecff" opacity=".85"/>`,
  auditorium: () => `
    <rect width="400" height="240" fill="#1a1020"/>
    <path class="sc-curtain" d="M0,0 L120,0 Q90,120 110,240 L0,240 Z" fill="#7a1f2b"/>
    <path class="sc-curtain sc-delay" d="M400,0 L280,0 Q310,120 290,240 L400,240 Z" fill="#7a1f2b"/>
    <polygon class="sc-spot" points="200,0 150,170 250,170"/>
    <rect x="80" y="170" width="240" height="20" fill="var(--sil2)"/>
    ${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<circle cx="${30 + i * 50}" cy="232" r="14" fill="#0b0712"/>`).join('')}`,
  academy: () => `
    <rect x="0" y="200" width="400" height="40" fill="var(--ground)"/>
    <g fill="var(--sil)"><rect x="110" y="90" width="180" height="110"/><polygon points="100,95 200,40 300,95"/>
    <rect x="70" y="120" width="50" height="80"/><rect x="280" y="120" width="50" height="80"/>
    <rect x="190" y="20" width="20" height="40"/></g>
    <polygon class="sc-flag" points="210,20 236,27 210,34" fill="var(--accent-c)"/>
    <g fill="var(--lit)">${[0, 1, 2, 3, 4].map((i) => `<rect x="${125 + i * 33}" y="110" width="14" height="18"/><rect x="${125 + i * 33}" y="145" width="14" height="18"/>`).join('')}</g>
    <rect x="185" y="170" width="30" height="30" fill="var(--sil3)"/>`,
  courtyard: () => `
    <rect x="0" y="185" width="400" height="55" fill="var(--ground)"/>
    <g fill="var(--sil)"><rect x="0" y="95" width="150" height="95"/><rect x="250" y="80" width="150" height="110"/></g>
    <g fill="var(--lit)">${[0, 1, 2, 3].map((i) => `<rect x="${15 + i * 35}" y="115" width="12" height="16"/><rect x="${265 + i * 35}" y="100" width="12" height="16"/>`).join('')}</g>
    <g class="sc-sway"><rect x="187" y="130" width="10" height="60" fill="#3b2a1e"/><circle cx="192" cy="118" r="34" fill="var(--leaf)"/></g>
    <ellipse cx="300" cy="210" rx="50" ry="10" fill="var(--sil3)"/><rect x="295" y="185" width="10" height="25" fill="var(--sil3)"/>`,
  training: () => `
    <rect x="0" y="175" width="400" height="65" fill="var(--ground)"/>
    <g fill="var(--sil)">${[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => `<rect x="${i * 50}" y="150" width="4" height="30"/>`).join('')}<rect x="0" y="155" width="400" height="3"/></g>
    ${[0, 1, 2].map((i) => `<g transform="translate(${80 + i * 120},170)"><rect x="-3" y="0" width="6" height="35" fill="#3b2a1e"/><circle cx="0" cy="-8" r="16" fill="#e8e0c8"/><circle cx="0" cy="-8" r="10" fill="#c0392b"/><circle cx="0" cy="-8" r="4" fill="#e8e0c8"/></g>`).join('')}
    <g class="sc-windlines">${[0, 1, 2].map((i) => `<path d="M${-60 + i * 30},${80 + i * 25} q40,-10 80,0" stroke="var(--wind)" stroke-width="2" fill="none"/>`).join('')}</g>`,
  forest: () => `
    <g class="sc-sway-slow" fill="var(--sil3)">${[0, 1, 2, 3, 4, 5, 6].map((i) => `<polygon points="${i * 65 - 10},200 ${i * 65 + 25},70 ${i * 65 + 60},200"/>`).join('')}</g>
    <g class="sc-sway" fill="var(--sil2)">${[0, 1, 2, 3, 4, 5].map((i) => `<polygon points="${i * 80 - 30},215 ${i * 80 + 15},95 ${i * 80 + 60},215"/>`).join('')}</g>
    <rect x="0" y="205" width="400" height="35" fill="var(--sil)"/>
    <g fill="var(--sil)">${[0, 1, 2, 3].map((i) => `<rect x="${20 + i * 110}" y="120" width="16" height="95"/><circle cx="${28 + i * 110}" cy="110" r="38"/>`).join('')}</g>`,
  beach: () => `
    <rect x="0" y="130" width="400" height="70" fill="var(--sea)"/>
    <g class="sc-waves">${[0, 1, 2].map((i) => `<path d="M-40,${150 + i * 18} q25,-8 50,0 t50,0 t50,0 t50,0 t50,0 t50,0 t50,0 t50,0 t50,0" stroke="var(--foam)" stroke-width="2" fill="none" opacity="${0.7 - i * 0.2}"/>`).join('')}</g>
    <path d="M0,200 Q200,180 400,205 L400,240 L0,240 Z" fill="var(--sand)"/>`,
  rocks: () => `
    <rect x="0" y="200" width="400" height="40" fill="var(--sil2)"/>
    <polygon points="0,240 0,120 50,90 100,140 150,100 190,240" fill="var(--sil)"/>
    <polygon points="210,240 250,110 300,80 350,130 400,95 400,240" fill="var(--sil)"/>
    <polygon points="140,240 175,160 230,150 270,240" fill="var(--sil3)"/>
    <g class="sc-windlines">${[0, 1].map((i) => `<path d="M${-60 + i * 50},${70 + i * 30} q40,-10 80,0" stroke="var(--wind)" stroke-width="2" fill="none"/>`).join('')}</g>`,
  festival: () => `
    <rect x="0" y="190" width="400" height="50" fill="var(--ground)"/>
    <path d="M0,40 Q200,90 400,40" stroke="#3b2a1e" stroke-width="2" fill="none"/>
    ${[0, 1, 2, 3, 4, 5, 6].map((i) => `<g class="sc-lantern" style="--d:${i * 0.3}s"><line x1="${30 + i * 57}" y1="${48 + Math.sin(i / 6 * Math.PI) * 22}" x2="${30 + i * 57}" y2="${60 + Math.sin(i / 6 * Math.PI) * 22}" stroke="#3b2a1e"/><ellipse cx="${30 + i * 57}" cy="${70 + Math.sin(i / 6 * Math.PI) * 22}" rx="10" ry="13" fill="${i % 2 ? '#ff6b4a' : '#ffd45c'}"/></g>`).join('')}
    <g fill="var(--sil)">${[0, 1, 2].map((i) => `<rect x="${20 + i * 135}" y="140" width="100" height="55"/><polygon points="${10 + i * 135},145 ${70 + i * 135},115 ${130 + i * 135},145"/>`).join('')}</g>`,
  arena: () => `
    <rect x="0" y="0" width="400" height="120" fill="var(--sil)"/>
    ${[0, 1, 2, 3].map((r) => `<g fill="var(--crowd)">${Array.from({ length: 20 }, (_, i) => `<circle cx="${10 + i * 20 + (r % 2) * 10}" cy="${25 + r * 25}" r="7"/>`).join('')}</g>`).join('')}
    <ellipse cx="200" cy="200" rx="230" ry="60" fill="var(--ground)"/>
    <polygon class="sc-spot" points="60,0 130,200 30,200"/><polygon class="sc-spot sc-delay" points="340,0 370,200 270,200"/>`,
  rooftop: () => `
    <rect x="0" y="190" width="400" height="50" fill="var(--sil2)"/>
    <g stroke="var(--sil)" stroke-width="3">${Array.from({ length: 21 }, (_, i) => `<line x1="${i * 20}" y1="150" x2="${i * 20}" y2="192"/>`).join('')}<line x1="0" y1="150" x2="400" y2="150"/><line x1="0" y1="170" x2="400" y2="170"/></g>
    <g fill="var(--sil3)" opacity=".7"><rect x="20" y="170" width="60" height="20"/><rect x="300" y="160" width="80" height="30"/></g>`,
  shrine: () => `
    <rect x="0" y="195" width="400" height="45" fill="var(--ground)"/>
    <g fill="var(--sil)"><rect x="140" y="90" width="120" height="105"/><polygon points="120,95 200,45 280,95"/></g>
    <g fill="#9c2b2b"><rect x="60" y="100" width="10" height="95"/><rect x="130" y="100" width="10" height="95"/><rect x="50" y="95" width="100" height="10"/><rect x="55" y="112" width="90" height="6"/></g>
    <rect class="sc-pillar" x="185" y="0" width="30" height="195"/>`,
  darkness: () => `
    <rect width="400" height="240" fill="#07040f"/>
    <g class="sc-fog"><ellipse cx="100" cy="200" rx="200" ry="40" fill="#3a1450" opacity=".5"/><ellipse cx="320" cy="210" rx="180" ry="35" fill="#2a0a3a" opacity=".6"/></g>
    <g class="sc-eyes"><ellipse cx="185" cy="100" rx="7" ry="3" fill="#ff3b3b"/><ellipse cx="215" cy="100" rx="7" ry="3" fill="#ff3b3b"/></g>
    <path d="M120,240 Q200,40 280,240 Z" fill="#000" opacity=".8"/>`,
  town: () => `
    <rect x="0" y="195" width="400" height="45" fill="var(--road)"/>
    <g fill="var(--sil)">${[0, 1, 2, 3, 4].map((i) => `<rect x="${i * 85}" y="${120 + (i % 2) * 15}" width="70" height="${80 - (i % 2) * 15}"/><polygon points="${i * 85 - 6},${125 + (i % 2) * 15} ${i * 85 + 35},${95 + (i % 2) * 15} ${i * 85 + 76},${125 + (i % 2) * 15}"/>`).join('')}</g>
    <g fill="var(--lit)">${[0, 1, 2, 3, 4].map((i) => `<rect x="${i * 85 + 15}" y="${145 + (i % 2) * 10}" width="12" height="14"/><rect x="${i * 85 + 42}" y="${145 + (i % 2) * 10}" width="12" height="14"/>`).join('')}</g>
    <g class="sc-sway"><rect x="370" y="150" width="8" height="50" fill="#3b2a1e"/><circle cx="374" cy="140" r="22" fill="var(--leaf)"/></g>`,
  road: () => `
    <polygon points="160,240 240,240 215,140 185,140" fill="var(--road)"/>
    <rect x="0" y="140" width="400" height="100" fill="var(--ground)" opacity=".9"/>
    <polygon points="140,240 260,240 212,140 188,140" fill="var(--road)"/>
    <g fill="var(--sil2)"><polygon points="0,140 80,90 160,140"/><polygon points="250,140 340,80 430,140"/></g>`,
};

/** 粒子（花びら・木の葉・ほこり・ホタル・火の粉…） */
const PARTICLES = {
  room: 'dust', classroom: 'dust', hallway: 'dust', office: 'dust', infirmary: 'dust',
  academy: 'petal', courtyard: 'petal', town: 'petal', road: 'petal', festival: 'confetti',
  forest: 'leaf', training: 'leaf', rocks: 'sand', beach: 'spark', arena: 'confetti',
  rooftop: 'petal', shrine: 'spark', darkness: 'ember', auditorium: 'spark',
};

/**
 * 背景を描画する（同じ背景なら何もしない）
 * @param {HTMLElement} el
 * @param {Scenery} sc
 */
export function renderScenery(el, sc) {
  const key = `${sc.theme}/${sc.time}`;
  if (el.dataset.scenery === key) return;
  el.dataset.scenery = key;
  el.dataset.theme = sc.theme;
  el.dataset.time = sc.time;
  const indoor = INDOOR.has(sc.theme);
  const draw = /** @type {Record<string, () => string>} */ (SILHOUETTES)[sc.theme] ?? SILHOUETTES.academy;
  const rnd = seeded([...key].reduce((s, c) => s * 31 + c.charCodeAt(0), 7));
  let kind = /** @type {Record<string, string>} */ (PARTICLES)[sc.theme] ?? 'dust';
  if (sc.time === 'night' && !indoor && kind !== 'ember') kind = 'firefly';
  const particles = Array.from({ length: kind === 'dust' ? 18 : 24 }, () =>
    `<span class="sc-p sc-p-${kind}" style="--x:${(rnd() * 100).toFixed(1)}%;--y:${(rnd() * 100).toFixed(1)}%;--d:${(rnd() * -12).toFixed(2)}s;--t:${(7 + rnd() * 8).toFixed(1)}s;--s:${(0.6 + rnd() * 0.8).toFixed(2)}"></span>`).join('');
  const stars = sc.time === 'night' && !indoor
    ? Array.from({ length: 40 }, () => `<span class="sc-star" style="--x:${(rnd() * 100).toFixed(1)}%;--y:${(rnd() * 55).toFixed(1)}%;--d:${(rnd() * -4).toFixed(2)}s"></span>`).join('')
    : '';
  el.innerHTML = `
    <div class="sc-layer sc-sky"></div>
    ${indoor || sc.theme === 'darkness' ? '' : `<div class="sc-layer sc-stars">${stars}</div><div class="sc-celestial"></div>
      <div class="sc-cloud" style="--top:12%;--t:70s;--d:-20s"></div><div class="sc-cloud sc-cloud-sm" style="--top:24%;--t:95s;--d:-60s"></div><div class="sc-cloud" style="--top:6%;--t:120s;--d:-90s"></div>`}
    <svg class="sc-layer sc-art" viewBox="0 0 400 240" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${draw()}</svg>
    <div class="sc-layer sc-particles">${particles}</div>
    <div class="sc-layer sc-tint"></div>`;
  el.classList.remove('sc-enter');
  void el.offsetWidth;
  el.classList.add('sc-enter');
}
