// 戦闘計算式。すべて純関数で、数値パラメータは rules（data/provisional/battle_rules.json）から受け取る。
// 式そのものを差し替えたい場合もこのファイルだけを変更すればよい。
import { BASE_ATTRIBUTE_OF } from '../core/constants.js';
import { clamp } from '../core/util.js';

/** @typedef {import('./unit.js').BattleUnit} BattleUnit */
/** @typedef {import('../types.js').Skill} Skill */

/** スキル区分 → 属性倍率の適用区分名（battle_rules.attribute.*_applies_to で使う） */
const CATEGORY_KIND = Object.freeze({
  basic: 'attack', common: 'shingi', tengeki: 'tengeki',
  artifact_unique: 'artifact_unique', guardian_unique: 'guardian_unique', enemy: 'enemy',
});

/** @param {Skill} skill */
export function skillKind(skill) {
  return CATEGORY_KIND[skill.category];
}

/**
 * 属性が一致するか（上位属性は設定により基本属性一致も同族扱い）
 * @param {any} rules @param {string|null} skillAttr @param {string|null} ownAttr
 */
export function attributeMatches(rules, skillAttr, ownAttr) {
  if (!skillAttr || !ownAttr) return false;
  if (skillAttr === ownAttr) return true;
  if (rules.attribute.upper_attribute_matches_base) {
    const base = /** @type {Record<string,string>} */ (BASE_ATTRIBUTE_OF)[skillAttr];
    return base === ownAttr;
  }
  return false;
}

/**
 * 攻撃側の参照値
 * @param {any} rules @param {BattleUnit} u @param {Skill} skill
 */
export function attackValue(rules, u, skill) {
  const weights = rules.damage.attack_stat_by_scaling[skill.scaling] ?? { [skill.scaling]: 1 };
  let v = 0;
  for (const [k, w] of Object.entries(weights)) v += u.stat(/** @type {any} */ (k)) * /** @type {number} */ (w);
  for (const [k, r] of Object.entries(skill.effects.stat_add ?? {})) v += u.stat(/** @type {any} */ (k)) * /** @type {number} */ (r);
  return v;
}

/** @param {any} rules @param {BattleUnit} target @param {Skill} skill */
export function defenseValue(rules, target, skill) {
  const k = rules.damage.defense_stat_by_scaling[skill.scaling] ?? 'def';
  return target.stat(k);
}

/**
 * 命中率
 * @param {any} rules @param {BattleUnit} att @param {BattleUnit} def @param {Skill} skill
 */
export function hitChance(rules, att, def, skill) {
  const h = rules.hit;
  if (h.always_hit_categories.includes(skill.category)) return 1;
  const acc = att.stat('acc');
  const eva = def.stat('eva');
  const p = h.base + ((acc - eva) / (acc + eva)) * h.acc_eva_weight + (skill.effects.acc_bonus ?? 0);
  return clamp(p, h.min, h.max);
}

/**
 * 会心率
 * @param {any} rules @param {BattleUnit} att @param {BattleUnit} def @param {Skill} skill
 */
export function critChance(rules, att, def, skill) {
  const c = rules.critical;
  if (c.categories_excluded.includes(skill.category)) return 0;
  const la = att.stat('luk');
  const ld = def.stat('luk');
  const p = c.base + c.luk_weight * (la / (la + ld)) + (att.artifact?.critBonus ?? 0) + (skill.effects.crit_bonus ?? 0) + att.buffSum('crit');
  return clamp(p, 0, c.max);
}

/**
 * 属性倍率の内訳（＋キャラ固有の天撃補正 proficiency。例：染川咲×1.2・ユーザー確定）
 * @param {any} rules @param {BattleUnit} att @param {BattleUnit} def @param {Skill} skill
 */
export function attributeMultiplier(rules, att, def, skill) {
  const A = rules.attribute;
  const kind = skillKind(skill);
  const attr = skill.attribute;
  const parts = { sameKind: 1, artifact: 1, guardian: 1, buff: 1, proficiency: 1, resist: 1 };
  if (!attr) return { total: 1, parts, immune: false };

  const sk = A.confirmed_same_kind_bonus;
  if (sk.applies_to_categories.includes(skill.category)) {
    if (att.artifact && attributeMatches(rules, attr, att.artifact.def.attribute)) parts.sameKind *= sk.artifact_match;
    if (att.guardian && (!sk.guardian_match_requires_release || att.guardian.released) && attributeMatches(rules, attr, att.guardian.def.attribute)) {
      parts.sameKind *= sk.guardian_match;
    }
  }
  // キャラ固有の天撃補正（染川咲：属性不一致のときだけ×1.2・ユーザー確定）
  if (skill.category === 'tengeki' && (att.tengekiMultiplierScope !== 'non_matching' || parts.sameKind === 1)) {
    parts.proficiency = att.tengekiMultiplier ?? 1;
  }
  if (att.artifact && A.artifact_attribute_multiplier_applies_to.includes(kind) && attributeMatches(rules, attr, att.artifact.def.attribute)) {
    parts.artifact = att.artifact.attributeMultiplier;
  }
  if (att.guardian?.released && A.guardian_attribute_multiplier_applies_to.includes(kind) && attributeMatches(rules, attr, att.guardian.def.attribute)) {
    parts.guardian = att.guardian.attributeMultiplier;
  }
  const buff = att.attrBuffSum(attr) + (BASE_ATTRIBUTE_OF[/** @type {keyof typeof BASE_ATTRIBUTE_OF} */ (attr)] ? att.attrBuffSum(BASE_ATTRIBUTE_OF[/** @type {keyof typeof BASE_ATTRIBUTE_OF} */ (attr)]) : 0);
  parts.buff = 1 + buff;

  const immune = def.immuneAttributes.includes(attr);
  if (immune) parts.resist = 0;

  let total = parts.sameKind * parts.artifact * parts.guardian * parts.buff * parts.proficiency;
  if (typeof A.max_total_multiplier === 'number') total = Math.min(total, A.max_total_multiplier);
  return { total: total * parts.resist, parts, immune };
}

/**
 * 1回分のダメージ判定
 * @param {any} rules
 * @param {import('../core/rng.js').Rng} rng
 * @param {BattleUnit} att
 * @param {BattleUnit} def
 * @param {Skill} skill
 * @param {number} hitIndex 0始まり
 * @param {number} hitCount
 * @returns {{hit: boolean, crit: boolean, immune: boolean, damage: number, attrTotal: number}}
 */
export function rollDamage(rules, rng, att, def, skill, hitIndex, hitCount) {
  void hitIndex;
  const D = rules.damage;
  if (!rng.chance(hitChance(rules, att, def, skill))) return { hit: false, crit: false, immune: false, damage: 0, attrTotal: 1 };
  const attr = attributeMultiplier(rules, att, def, skill);
  if (attr.immune) return { hit: true, crit: false, immune: true, damage: 0, attrTotal: 0 };

  const A = attackValue(rules, att, skill);
  const Dv = defenseValue(rules, def, skill) * (1 - (skill.effects.def_ignore ?? 0));
  const powerRatio = hitCount > 1 ? D.multi_hit_power_ratio : 1;
  let dmg = (skill.power * powerRatio * A * A) / Math.max(1, A + Dv) * D.coefficient;
  dmg *= rng.range(D.variance_min, D.variance_max);
  const crit = rng.chance(critChance(rules, att, def, skill));
  if (crit) dmg *= rules.critical.multiplier;
  dmg *= attr.total;
  dmg *= 1 + (skill.effects.extra_damage_ratio ?? 0);
  if (def.guarding !== null) dmg *= def.guarding;
  return { hit: true, crit, immune: false, damage: Math.max(D.minimum, Math.round(dmg)), attrTotal: attr.total };
}

/**
 * 守護獣解放の消費SP
 * @param {any} rules @param {BattleUnit} u
 */
export function guardianReleaseCost(rules, u) {
  const g = rules.guardian;
  return Math.max(g.release_sp_cost_min, Math.ceil(u.maxSp * g.release_sp_cost_ratio));
}

/**
 * 行動順の素早さ値（乱数込み）
 * @param {any} rules @param {import('../core/rng.js').Rng} rng @param {BattleUnit} u
 */
export function initiative(rules, rng, u) {
  return u.stat('spd') * rng.range(rules.turn_order.speed_random_min, rules.turn_order.speed_random_max);
}
