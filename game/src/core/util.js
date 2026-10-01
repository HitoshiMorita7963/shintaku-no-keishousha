// 汎用ユーティリティ（ゲーム固有の知識を持たない）

/** データ不整合・プログラム誤用を示す例外。メッセージにIDや参照元を含めること。 */
export class GameDataError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'GameDataError';
  }
}

/**
 * @param {unknown} cond
 * @param {string} message
 * @returns {asserts cond}
 */
export function assert(cond, message) {
  if (!cond) throw new GameDataError(message);
}

/** @param {number} v @param {number} lo @param {number} hi */
export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Lv1→Lv100 の線形補間（07_戦闘システム/02_成長仕様.md）。
 * @param {number} a Lv1の値
 * @param {number} b Lv100の値
 * @param {number} level 1～100
 */
export function lerpLevel(a, b, level) {
  return a + ((b - a) * (level - 1)) / 99;
}

/**
 * @template T
 * @param {T} obj
 * @returns {T}
 */
export function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const v of Object.values(obj)) deepFreeze(v);
  }
  return obj;
}

/**
 * @template T
 * @param {T} v
 * @returns {T}
 */
export function clone(v) {
  return JSON.parse(JSON.stringify(v));
}
