// 最小限のDOMヘルパー（フレームワーク非依存）

/**
 * @typedef {string | number | Node | null | undefined | false} Child
 */

/**
 * 要素生成。props: class, text, on{Event}, data-*, aria-*, その他属性。
 * @param {string} tag
 * @param {Record<string, any>} [props]
 * @param {...(Child | Child[])} children
 * @returns {HTMLElement}
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = String(v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el && typeof v !== 'string') /** @type {any} */ (el)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** @param {Element} el */
export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/**
 * HP/SPゲージ
 * @param {'hp'|'sp'} kind @param {number} cur @param {number} max @param {boolean} [showNumbers]
 */
export function gauge(kind, cur, max, showNumbers = true) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0;
  const low = kind === 'hp' && pct <= 25;
  return h('div', { class: `gauge gauge-${kind}${low ? ' is-low' : ''}`, role: 'meter', 'aria-valuenow': cur, 'aria-valuemax': max, 'aria-label': kind.toUpperCase() },
    h('span', { class: 'gauge-label', text: kind.toUpperCase() }),
    h('span', { class: 'gauge-track' }, h('span', { class: 'gauge-fill', style: { width: `${pct}%` } })),
    showNumbers ? h('span', { class: 'gauge-num', text: `${cur}/${max}` }) : null,
  );
}

/** 属性チップ @param {string|null} attr */
export function attrChip(attr) {
  if (!attr) return h('span', { class: 'attr attr-none', text: '無' });
  return h('span', { class: 'attr', 'data-attr': attr, text: attr });
}

/** @param {number} ms */
export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

