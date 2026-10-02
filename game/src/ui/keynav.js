// 十字キー＋Enterだけで遊べるようにする：画面上のボタンを矢印キーで選ぶ（位置関係で上下左右の隣へ移動）。
// 決定は Enter（フォーカス中のボタンを押す＝ブラウザ標準）。
// 歩けるマップ・会話中は矢印キーをそちらに任せる。

const DIR = /** @type {Record<string, [number, number]>} */ ({ ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] });
const FOCUSABLE = 'button:not([disabled]), [role="button"][tabindex="0"]';
const LAYERS = '.story-overlay:not([hidden]), .overlay:not([hidden]), [role="dialog"]';

/** @param {Element} el */
const visible = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';

/** 一番手前の層（モーダル等）。なければ画面全体 @param {HTMLElement} root */
function topLayer(root) {
  const layers = [...root.querySelectorAll(LAYERS)].filter(visible);
  return /** @type {HTMLElement | null} */ (layers[layers.length - 1] ?? null);
}

/**
 * 方向に最も近い候補
 * @param {Element} from @param {Element[]} cands @param {[number, number]} d
 */
function nearest(from, cands, [dx, dy]) {
  const a = from.getBoundingClientRect();
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  let best = null;
  let bestScore = Infinity;
  for (const c of cands) {
    if (c === from) continue;
    const r = c.getBoundingClientRect();
    const vx = r.left + r.width / 2 - ax;
    const vy = r.top + r.height / 2 - ay;
    const primary = vx * dx + vy * dy;
    if (primary <= 4) continue;
    const score = primary + Math.abs(vx * dy + vy * dx) * 2;
    if (score < bestScore) { bestScore = score; best = c; }
  }
  return /** @type {HTMLElement | null} */ (best);
}

/**
 * 画面の描き直しで選択中のボタンが消えたとき、同じ位置・同じ名前のボタンを選び直す
 * @param {HTMLElement} root
 */
function keepFocusOnRerender(root) {
  /** @type {{x:number, y:number, text:string} | null} */ let last = null;
  root.addEventListener('focusin', (e) => {
    const t = /** @type {Element} */ (e.target);
    if (!t.matches(FOCUSABLE)) return;
    const r = t.getBoundingClientRect();
    last = { x: r.left + r.width / 2, y: r.top + r.height / 2, text: t.textContent ?? '' };
  });
  root.addEventListener('focusout', (e) => {
    const t = /** @type {Element} */ (e.target);
    if (e.relatedTarget || !last) return;
    const mem = last;
    setTimeout(() => {
      if (t.isConnected || (document.activeElement && document.activeElement !== document.body)) return;
      const layer = topLayer(root);
      if (!layer && root.querySelector('.field, .story')) return; // 歩行中・会話中は戻さない
      const cands = [...(layer ?? root).querySelectorAll(FOCUSABLE)].filter(visible);
      const dist = (/** @type {Element} */ c) => { const r = c.getBoundingClientRect(); return Math.hypot(r.left + r.width / 2 - mem.x, r.top + r.height / 2 - mem.y); };
      // ほぼ同じ位置のボタン（「編成」→「外す」のように名前が変わっても同じ場所）、なければ同じ名前のボタン。どちらもなければ何もしない
      const near = cands.filter((c) => dist(c) < 24);
      const pick = (near.length ? near : cands.filter((c) => c.textContent === mem.text)).sort((a, b) => dist(a) - dist(b))[0];
      /** @type {HTMLElement | undefined} */ (pick)?.focus({ preventScroll: true });
    }, 0);
  });
}

/** @param {HTMLElement} root アプリの描画先 */
export function installKeyNav(root) {
  keepFocusOnRerender(root);
  window.addEventListener('keydown', (e) => {
    const d = DIR[e.key];
    if (!d || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const layer = topLayer(root);
    const scope = layer ?? root;
    const cands = [...scope.querySelectorAll(FOCUSABLE)].filter(visible);
    if (!cands.length) return;
    const active = document.activeElement;
    const focused = active && cands.includes(active) ? active : null;
    const walking = !layer && root.querySelector('.field');
    const talking = !layer && root.querySelector('.story');

    if (!focused) {
      // 何も選ばれていない：歩行中・会話中は矢印キーをそちらへ。それ以外は最初のボタンを選ぶ
      if (walking || talking) return;
      const first = /** @type {HTMLElement} */ (cands.find((c) => c.matches('.btn-primary')) ?? cands[0]);
      first.focus();
    } else {
      // 歩行中に残ったフォーカス（選択肢以外）は無視してキャラを動かす
      if (walking && !focused.closest('.choice-area')) return;
      // 会話の文章欄：↓は「次へ」、↑で上のボタン（ログ・オート・スキップ）へ
      if (focused.matches('.dialog') && e.key !== 'ArrowUp') return;
      const next = nearest(focused, cands, d);
      if (!next) { if (focused.matches('.dialog')) return; }
      else next.focus();
    }
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
}
