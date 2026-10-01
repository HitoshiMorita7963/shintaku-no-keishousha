// 成長計算。三つの成長軸（キャラLv・神器Lv・守護獣親和度）はそれぞれ独立した関数で扱う。
import { STAT_KEYS, COMBAT_STAT_KEYS, LEVEL_MIN, LEVEL_MAX, ARTIFACT_LEVEL_MIN, ARTIFACT_LEVEL_MAX, AFFINITY_MIN, AFFINITY_MAX } from '../core/constants.js';
import { assert, clamp, lerpLevel } from '../core/util.js';

/** @typedef {import('../types.js').StatBlock} StatBlock */

/**
 * キャラクターの基礎ステータス（キャラLvのみに依存）。
 * 正式データの Lv1～100 表（stats.levels）を使用。表は Lv1→Lv100 の線形補間
 * （四捨五入）と全30,000値で一致することを validate.js が検査済み。
 * 表がない場合も同じ式で算出するため結果は変わらない。
 * @param {import('../types.js').Character} c
 * @param {number} level
 * @returns {StatBlock}
 */
export function characterBaseStats(c, level) {
  assert(Number.isInteger(level) && level >= LEVEL_MIN && level <= LEVEL_MAX, `${c.id}: キャラLv ${level} は範囲外 (1～100)`);
  const row = c.stats.levels?.[String(level)];
  if (row) return { ...row };
  /** @type {any} */ const out = {};
  for (const k of STAT_KEYS) out[k] = Math.round(lerpLevel(c.stats.lv1[k], c.stats.lv100[k], level));
  return out;
}

/**
 * 神器のステータス補正（神器Lvのみに依存・毎Lv成長）。HP/SPは対象外。
 * @param {import('../types.js').Artifact} a
 * @param {number} artifactLevel
 * @returns {Record<string, number>}
 */
export function artifactStatBonus(a, artifactLevel) {
  assert(Number.isInteger(artifactLevel) && artifactLevel >= ARTIFACT_LEVEL_MIN && artifactLevel <= ARTIFACT_LEVEL_MAX, `${a.id}: 神器Lv ${artifactLevel} は範囲外`);
  /** @type {Record<string, number>} */ const out = {};
  for (const k of COMBAT_STAT_KEYS) {
    const lo = a.stat_bonuses_lv1[k];
    const hi = a.stat_bonuses_lv100[k];
    if (lo === undefined && hi === undefined) continue;
    out[k] = Math.round(lerpLevel(lo ?? 0, hi ?? 0, artifactLevel));
  }
  return out;
}

/**
 * 到達済みの神器節目（属性ダメージ倍率・会心補正）。Lv10未満は倍率1.0・補正0。
 * @param {import('../types.js').Artifact} a
 * @param {number} artifactLevel
 */
export function artifactMilestone(a, artifactLevel) {
  let attributeMultiplier = 1.0;
  let critBonus = 0;
  for (const m of a.milestones ?? []) {
    if (m.level <= artifactLevel) {
      attributeMultiplier = m.attribute_damage_multiplier;
      critBonus = m.critical_rate_bonus;
    }
  }
  return { attributeMultiplier, critBonus };
}

/**
 * 守護獣解放時の倍率（親和度のみに依存）。
 * @param {import('../types.js').Guardian} g
 * @param {number} affinity 0～100
 * @param {'step'|'linear'} [interpolation]
 */
export function guardianMultipliers(g, affinity, interpolation = 'step') {
  const aff = clamp(affinity, AFFINITY_MIN, AFFINITY_MAX);
  const curve = [...g.affinity_multiplier_curve].sort((x, y) => x.affinity - y.affinity);
  let lo = curve[0];
  let hi = curve[0];
  for (const p of curve) {
    if (p.affinity <= aff) lo = p;
    if (p.affinity >= aff) { hi = p; break; }
  }
  if (interpolation === 'linear' && hi.affinity !== lo.affinity) {
    const t = (aff - lo.affinity) / (hi.affinity - lo.affinity);
    return {
      statMultiplier: lo.stat_multiplier + (hi.stat_multiplier - lo.stat_multiplier) * t,
      attributeMultiplier: lo.attribute_damage_multiplier + (hi.attribute_damage_multiplier - lo.attribute_damage_multiplier) * t,
    };
  }
  return { statMultiplier: lo.stat_multiplier, attributeMultiplier: lo.attribute_damage_multiplier };
}

/**
 * 次のLvに必要な経験値（仮：data/provisional/progression.json exp_curve）
 * @param {{base:number, exponent:number}} curve
 * @param {number} level
 */
export function expToNext(curve, level) {
  if (level >= LEVEL_MAX) return Infinity;
  return Math.max(1, Math.round(curve.base * Math.pow(level, curve.exponent)));
}

/**
 * 敵ステータス（仮データの lv1/lv100 を線形補間）
 * @param {{lv1: StatBlock, lv100: StatBlock}} stats
 * @param {number} level
 * @returns {StatBlock}
 */
export function enemyStatsAt(stats, level) {
  const lv = clamp(Math.round(level), LEVEL_MIN, LEVEL_MAX);
  /** @type {any} */ const out = {};
  for (const k of STAT_KEYS) out[k] = Math.round(lerpLevel(stats.lv1[k], stats.lv100[k], lv));
  return out;
}
