// フィールド（歩けるマップ）の描画と操作。画像ファイルを使わず、16×16ドットのタイルと人物をコードで描く。
// 操作：矢印キー/WASD/画面の十字ボタンで移動、Enter/Space/Z/画面のAボタンで「調べる・話す」。
import { h } from './dom.js';
import { DIRS } from '../field/fieldMap.js';

/** @typedef {import('../field/fieldMap.js').FieldMap} FieldMap */
/** @typedef {import('../field/fieldMap.js').FieldObject} FieldObject */
/** @typedef {import('../field/fieldMap.js').Dir} Dir */

const T = 16; // 1マスのドット数
const STEP_MS = 150;

/** 属性ごとの服の色（キャラクターの見分け用） */
const ATTR_COLOR = /** @type {Record<string, string>} */ ({
  火: '#d9482b', 水: '#2f7fd8', 雷: '#d8b52a', 風: '#3aa860', 土: '#9a6a3a', 光: '#e8e0b0', 闇: '#6a4aa8',
});
const HAIR = ['#2a2420', '#5a3820', '#8a5a2a', '#c8a050', '#30304a', '#7a2a2a', '#e8e0d0', '#4a3a6a'];

/**
 * @param {import('../data/gameData.js').GameData} data
 * @param {string} id
 */
function personColors(data, id) {
  const c = data.characters.get(id);
  if (!c) return { hair: '#3a3a3a', cloth: '#8090c0' };
  const n = [...id].reduce((s, ch) => s + ch.charCodeAt(0), 0);
  const hair = id === 'A01' ? '#141418' : id === 'B01' ? '#eeeef4' : HAIR[n % HAIR.length];
  return { hair, cloth: ATTR_COLOR[data.artifacts.get(c.artifact_id)?.attribute ?? ''] ?? '#8090c0' };
}

/**
 * 1マス描画（座標はドット単位）
 * @param {CanvasRenderingContext2D} g @param {string} ch @param {number} x @param {number} y
 * @param {number} tx @param {number} ty @param {number} t @param {FieldMap} map
 */
function drawTile(g, ch, x, y, tx, ty, t, map) {
  const r = (/** @type {string} */ c, /** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ w, /** @type {number} */ hh) => { g.fillStyle = c; g.fillRect(x + a, y + b, w, hh); };
  const speck = (tx * 7 + ty * 13) % 5;
  const grass = () => { r('#5aa64a', 0, 0, T, T); r('#4e9440', (speck * 3) % 13, (speck * 5) % 13, 2, 2); r('#69b856', (speck * 7) % 13, (speck * 2 + 6) % 13, 2, 1); };
  const floor = () => { r('#b98a58', 0, 0, T, T); r('#a77a4a', 0, 7, T, 1); r('#a77a4a', (ty % 2) * 8, 0, 1, 7); r('#a77a4a', ((ty + 1) % 2) * 8, 8, 1, 8); };
  const below = (/** @type {number} */ dx, /** @type {number} */ dy) => map.rows[ty + dy]?.[tx + dx];
  switch (ch) {
    case '.': grass(); break;
    case ',': r('#cdb07a', 0, 0, T, T); r('#bb9c64', speck * 3, speck * 2 + 2, 2, 2); r('#dcc290', (speck * 5) % 14, (speck * 3 + 9) % 14, 2, 1); break;
    case ':': r('#d9c48c', 0, 0, T, T); r('#c8b07a', (speck * 4) % 14, (speck * 3) % 14, 2, 1); break;
    case '~': { r('#3b7fd0', 0, 0, T, T); const o = Math.floor(t / 300 + tx) % 4; r('#7fb4ee', o * 3, 5, 5, 1); r('#7fb4ee', (o * 3 + 8) % 14, 11, 4, 1); break; }
    case 'T': grass(); r('#5a3a1e', 7, 10, 3, 6); g.fillStyle = '#2f7a3a'; g.beginPath(); g.arc(x + 8, y + 7, 7, 0, Math.PI * 2); g.fill(); r('#3f9a4a', 4, 3, 4, 3); break;
    case 'f': { grass(); const b = Math.floor(t / 500 + tx) % 2; r('#ff7aa8', 3, 4 + b, 3, 3); r('#ffe066', 10, 9 - b, 3, 3); r('#fff', 4, 5 + b, 1, 1); break; }
    case '=': grass(); r('#7a5432', 0, 5, T, 2); r('#7a5432', 0, 10, T, 2); r('#5e3e22', 2, 3, 3, 12); r('#5e3e22', 11, 3, 3, 12); break;
    case '#': r('#d8c8a0', 0, 0, T, T); r('#bfae86', 0, 5, T, 1); r('#bfae86', 0, 11, T, 1); r('#bfae86', (ty % 2) * 6 + 4, 0, 1, 5); r('#bfae86', (ty % 2) * 6 + 10, 6, 1, 5); break;
    case '^': r(below(0, 1) === '^' ? '#b0453a' : '#9a3a30', 0, 0, T, T); r('#c8584a', 0, 3, T, 2); r('#c8584a', 0, 9, T, 2); r('#7a2a22', 0, 15, T, 1); break;
    case 'D': r('#d8c8a0', 0, 0, T, T); r('#6a4426', 3, 2, 10, 14); r('#7e5432', 4, 3, 8, 13); r('#ffd45c', 10, 9, 2, 2); break;
    case 'S':
      if (map.signStyle === 'target') { r('#d9c48c', 0, 0, T, T); r('#5e3e22', 7, 10, 2, 6); g.fillStyle = '#efe6cc'; g.beginPath(); g.arc(x + 8, y + 7, 6, 0, Math.PI * 2); g.fill(); g.fillStyle = '#c0392b'; g.beginPath(); g.arc(x + 8, y + 7, 4, 0, Math.PI * 2); g.fill(); r('#efe6cc', 7, 6, 2, 2); }
      else { grass(); r('#5e3e22', 7, 8, 2, 8); r('#a0703e', 2, 2, 12, 7); r('#7a5432', 3, 4, 10, 1); r('#7a5432', 3, 6, 8, 1); }
      break;
    case 'O': { r('#cdb07a', 0, 0, T, T); g.fillStyle = '#9aa4b8'; g.beginPath(); g.arc(x + 8, y + 9, 7, 0, Math.PI * 2); g.fill(); g.fillStyle = '#4a90e0'; g.beginPath(); g.arc(x + 8, y + 9, 5, 0, Math.PI * 2); g.fill(); const j = Math.floor(t / 200) % 3; r('#cfe8ff', 7, 1 + j, 2, 6 - j); r('#cfe8ff', 5 + j, 8, 1, 1); r('#cfe8ff', 10 - j, 8, 1, 1); break; }
    case 'I': grass(); r('#b83030', 2, 3, 2, 13); r('#b83030', 12, 3, 2, 13); r('#b83030', 0, 2, T, 3); break;
    case '_': floor(); break;
    case 'w': r('#cbb894', 0, 0, T, T); r('#b8a37c', 0, 12, T, 4); r('#9a8662', 0, 12, T, 1); break;
    case 'B': { floor(); const top = below(0, -1) !== 'B'; const left = below(-1, 0) !== 'B'; r('#7a5432', left ? 1 : 0, top ? 1 : 0, left ? 15 : 16, top ? 15 : 16); r(top ? '#f2f2f8' : '#4a78c8', left ? 2 : 0, top ? 2 : 0, left ? 14 : 16, top ? 12 : 14); if (!top) r('#3a62a8', 0, 6, T, 1); break; }
    case 'K': floor(); r('#8a5a32', 0, 3, T, 9); r('#a06a3a', 0, 3, T, 2); r('#5e3e22', 1, 12, 2, 4); r('#5e3e22', 13, 12, 2, 4); r('#f0ead8', 4, 4, 6, 1); break;
    case 'N': { r('#cbb894', 0, 0, T, T); r('#8fd0ff', 2, 3, 12, 10); const s = Math.floor(t / 900 + tx) % 2; r('#d8f0ff', 3 + s * 5, 4, 3, 2); r('#6a5236', 2, 7, 12, 1); r('#6a5236', 7, 3, 1, 10); break; }
    case 'M': { floor(); r('#6a5236', 3, 0, 10, 15); g.fillStyle = '#cfd8e8'; g.beginPath(); g.ellipse(x + 8, y + 7, 4, 6, 0, 0, Math.PI * 2); g.fill(); const s = Math.floor(t / 700) % 3; r('#ffffff', 6, 3 + s * 2, 2, 2); break; }
    case 'R': r('#a0303a', 0, 0, T, T); r('#d8b860', 1, 1, 14, 1); r('#d8b860', 1, 14, 14, 1); r('#b84050', 4, 6, 8, 4); break;
    case 'L': r('#6a4426', 0, 0, T, T); ['#c0392b', '#2f7fd8', '#d8b52a', '#3aa860', '#8a5aa8', '#e8e0b0'].forEach((c, i) => { r(c, 1 + i * 2 + (i > 2 ? 1 : 0), 2, 2, 5); r(c, 2 + i * 2, 9, 2, 5); }); r('#4a2e18', 0, 7, T, 2); break;
    case 'P': floor(); r('#8a5a32', 5, 10, 6, 6); g.fillStyle = '#3a9a4a'; g.beginPath(); g.arc(x + 8, y + 7, 5, 0, Math.PI * 2); g.fill(); r('#5aba5a', 5, 4, 3, 3); break;
    case 'X': floor(); r('#7a4a3a', 2, 4, 12, 10); r('#8a5a48', 3, 5, 10, 8); break;
    default: r('#000', 0, 0, T, T);
  }
}

/**
 * 人物（16×16）
 * @param {CanvasRenderingContext2D} g @param {number} x @param {number} y @param {Dir} dir
 * @param {number} frame 0/1（歩き） @param {{hair:string, cloth:string}} col
 */
function drawPerson(g, x, y, dir, frame, col) {
  const r = (/** @type {string} */ c, /** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ w, /** @type {number} */ hh) => { g.fillStyle = c; g.fillRect(x + a, y + b, w, hh); };
  r('rgba(0,0,0,.25)', 3, 14, 10, 2); // 影
  const bob = frame ? 1 : 0;
  // 足
  if (dir === 'left' || dir === 'right') { r('#2a2a3a', 6 - (frame ? 2 : 0), 12, 2, 3); r('#2a2a3a', 8 + (frame ? 2 : 0), 12, 2, 3); }
  else { r('#2a2a3a', 5, 12, 2, frame ? 2 : 3); r('#2a2a3a', 9, 12, 2, frame ? 3 : 2); }
  // 体
  r(col.cloth, 4, 7 + bob, 8, 6); r('rgba(0,0,0,.18)', 4, 11 + bob, 8, 1);
  r('#f2cfa8', dir === 'left' ? 3 : dir === 'right' ? 11 : 3, 8 + bob, 2, 3);
  if (dir === 'up' || dir === 'down') r('#f2cfa8', 11, 8 + bob, 2, 3);
  // 頭
  r('#f2cfa8', 4, 2 + bob, 8, 6);
  r(col.hair, 3, 1 + bob, 10, 3);
  if (dir === 'up') r(col.hair, 3, 3 + bob, 10, 4);
  else if (dir === 'left') { r(col.hair, 8, 3 + bob, 5, 3); r('#202028', 5, 5 + bob, 1, 1); }
  else if (dir === 'right') { r(col.hair, 3, 3 + bob, 5, 3); r('#202028', 10, 5 + bob, 1, 1); }
  else { r(col.hair, 3, 3 + bob, 2, 3); r(col.hair, 11, 3 + bob, 2, 3); r('#202028', 6, 5 + bob, 1, 1); r('#202028', 9, 5 + bob, 1, 1); }
}

/**
 * フィールドを表示する
 * @param {HTMLElement} container
 * @param {Object} o
 * @param {import('../data/gameData.js').GameData} o.data
 * @param {FieldMap} o.map
 * @param {string} o.playerId 操作するキャラクター（見た目）
 * @param {(obj: FieldObject, how: 'action'|'step') => (Promise<void> | void)} o.onInteract
 * @param {{x:number, y:number, dir: Dir}} [o.start]
 */
export function createFieldView(container, o) {
  const { data, map } = o;
  const canvas = /** @type {HTMLCanvasElement} */ (h('canvas', { class: 'field-canvas', 'aria-label': `${map.name}のマップ` }));
  const banner = h('div', { class: 'field-banner', text: map.name });
  const hint = h('div', { class: 'field-hint', text: '' });
  const pad = h('div', { class: 'field-pad', 'aria-hidden': 'true' },
    ...(/** @type {Dir[]} */ (['up', 'left', 'right', 'down'])).map((d) => h('button', { class: `pad-btn pad-${d}`, 'data-dir': d, tabindex: '-1', text: { up: '▲', down: '▼', left: '◀', right: '▶' }[d] })));
  const aBtn = h('button', { class: 'field-a', tabindex: '-1', 'aria-label': '調べる', text: 'A' });
  const help = h('div', { class: 'field-help', text: '移動：矢印キー／WASD　調べる・話す：Enter／Space' });
  const wrap = h('div', { class: 'field' }, canvas, banner, hint, pad, aBtn, help);
  container.append(wrap);
  const g = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));

  const start = o.start ?? map.spawn;
  const st = { x: start.x, y: start.y, dir: /** @type {Dir} */ (start.dir), fromX: start.x, fromY: start.y, moveAt: 0, moving: false, frame: 0 };
  let paused = false;
  let destroyed = false;
  /** @type {Dir[]} 押されている方向（後から押したものを優先） */
  const held = [];
  const playerCol = personColors(data, o.playerId);
  /** @type {Map<string, {hair:string, cloth:string}>} */
  const npcCols = new Map(map.objects.filter((x) => x.npc).map((x) => [/** @type {string} */ (x.npc), personColors(data, /** @type {string} */ (x.npc))]));

  setTimeout(() => banner.classList.add('fade'), 1600);

  const interact = async (/** @type {FieldObject} */ obj, /** @type {'action'|'step'} */ how) => {
    paused = true;
    held.length = 0;
    // 会話を閉じた同じキー入力で再び「調べる」が起きないよう、再開は次のタスクで行う
    try { await o.onInteract(obj, how); } finally { setTimeout(() => { paused = false; }, 0); }
  };

  const tryMove = (/** @type {Dir} */ dir) => {
    st.dir = dir;
    const r = map.step(st.x, st.y, dir);
    if (r.moved) {
      st.fromX = st.x; st.fromY = st.y; st.x = r.x; st.y = r.y;
      st.moveAt = performance.now(); st.moving = true; st.frame ^= 1;
      if (r.stepOn) { const so = r.stepOn; setTimeout(() => { if (!destroyed) interact(so, 'step'); }, STEP_MS); }
    } else if (r.bump && !r.bump.npc && map.tile(st.x + DIRS[dir][0], st.y + DIRS[dir][1])?.name === 'door') {
      interact(r.bump, 'action'); // 扉にぶつかったら入る
    }
  };

  const action = () => {
    if (paused || st.moving) return;
    const obj = map.facing(st.x, st.y, st.dir);
    if (obj) interact(obj, 'action');
  };

  // ---- 入力 ----
  const KEY = /** @type {Record<string, Dir>} */ ({ ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right' });
  // 押した瞬間に1歩目を出す（短いタップでも動く）。押し続けると描画ループで連続移動
  const press = (/** @type {Dir} */ d) => { const i = held.indexOf(d); if (i >= 0) held.splice(i, 1); held.push(d); if (!st.moving && !paused) tryMove(d); };
  const release = (/** @type {Dir} */ d) => { const i = held.indexOf(d); if (i >= 0) held.splice(i, 1); };
  const onKeyDown = (/** @type {KeyboardEvent} */ e) => {
    if (paused) return;
    const d = KEY[e.key];
    if (d) { press(d); e.preventDefault(); return; }
    if (['Enter', ' ', 'z', 'Z'].includes(e.key) && !e.repeat) { e.preventDefault(); action(); }
  };
  const onKeyUp = (/** @type {KeyboardEvent} */ e) => { const d = KEY[e.key]; if (d) release(d); };
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  for (const b of pad.querySelectorAll('.pad-btn')) {
    const d = /** @type {Dir} */ (/** @type {HTMLElement} */ (b).dataset.dir);
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); /** @type {HTMLElement} */ (b).setPointerCapture?.(/** @type {PointerEvent} */ (e).pointerId); press(d); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => release(d));
  }
  aBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); action(); });

  // ---- 描画ループ ----
  let raf = 0;
  const frame = (/** @type {number} */ now) => {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.clientWidth;
    const chh = canvas.clientHeight;
    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(chh * dpr)) { canvas.width = Math.round(cw * dpr); canvas.height = Math.round(chh * dpr); }
    // 移動の進行
    let p = 1;
    if (st.moving) {
      p = Math.min(1, (now - st.moveAt) / STEP_MS);
      if (p >= 1) { st.moving = false; }
    }
    if (!st.moving && !paused && held.length) tryMove(held[held.length - 1]);
    const px = (st.moving ? st.fromX + (st.x - st.fromX) * p : st.x) * T;
    const py = (st.moving ? st.fromY + (st.y - st.fromY) * p : st.y) * T;
    // 表示倍率（スマホでも横に約11マス見える）
    const scale = Math.max(2, Math.floor(Math.min(cw / (11 * T), chh / (8 * T)))) * dpr;
    const vw = canvas.width / scale;
    const vh = canvas.height / scale;
    const mw = map.width * T;
    const mh = map.height * T;
    const camX = mw <= vw ? (mw - vw) / 2 : Math.max(0, Math.min(mw - vw, px + T / 2 - vw / 2));
    const camY = mh <= vh ? (mh - vh) / 2 : Math.max(0, Math.min(mh - vh, py + T / 2 - vh / 2));
    g.setTransform(scale, 0, 0, scale, 0, 0);
    g.imageSmoothingEnabled = false;
    g.fillStyle = map.kind === 'indoor' ? '#0a0a12' : '#1a3020';
    g.fillRect(0, 0, vw, vh);
    g.translate(-Math.round(camX), -Math.round(camY));
    const x0 = Math.max(0, Math.floor(camX / T));
    const y0 = Math.max(0, Math.floor(camY / T));
    for (let ty = y0; ty < Math.min(map.height, y0 + Math.ceil(vh / T) + 2); ty++) {
      for (let tx = x0; tx < Math.min(map.width, x0 + Math.ceil(vw / T) + 2); tx++) drawTile(g, map.rows[ty][tx], tx * T, ty * T, tx, ty, now, map);
    }
    // 扉の上に施設名の札
    g.font = 'bold 6px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const ob of map.objects) {
      const [ox, oy] = ob.tiles[0];
      if (map.rows[oy]?.[ox] !== 'D') continue;
      const tw = g.measureText(ob.label).width + 6;
      const cx = ox * T + T / 2;
      g.fillStyle = 'rgba(40,24,10,.85)';
      g.fillRect(cx - tw / 2, oy * T - 9, tw, 9);
      g.fillStyle = '#ffe9a8';
      g.fillText(ob.label, cx, oy * T - 4.5);
    }
    // 人物（上にいるものから描く）
    /** @type {{y:number, draw:() => void}[]} */ const people = [];
    for (const ob of map.objects) {
      if (!ob.npc) continue;
      const [ox, oy] = ob.tiles[0];
      const col = /** @type {{hair:string, cloth:string}} */ (npcCols.get(ob.npc));
      people.push({ y: oy * T, draw: () => drawPerson(g, ox * T, oy * T, ob.dir ?? 'down', Math.floor(now / 600) % 2 === 0 ? 0 : 0, col) });
    }
    people.push({ y: py, draw: () => drawPerson(g, Math.round(px), Math.round(py) - 1, st.dir, st.moving ? st.frame : 0, playerCol) });
    people.sort((a, b) => a.y - b.y).forEach((q) => q.draw());
    // 目の前に調べられるものがあれば表示
    const target = !st.moving ? map.facing(st.x, st.y, st.dir) : null;
    const text = target && !paused ? `${target.npc ? '話す' : '調べる'}：${target.label}` : '';
    if (hint.textContent !== text) hint.textContent = text;
    hint.classList.toggle('show', !!text);
    aBtn.classList.toggle('ready', !!target);
  };
  raf = requestAnimationFrame(frame);

  return {
    /** 一時停止（会話中など） @param {boolean} v */
    setPaused(v) { paused = v; if (v) held.length = 0; },
    /** 現在位置 */
    position() { return { x: st.x, y: st.y, dir: st.dir }; },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      wrap.remove();
    },
  };
}
