// 戦闘ユニット（味方・敵共通）。戦闘中だけの状態（バフ・守護獣解放・防御姿勢）を持つ。
import { COMBAT_STAT_KEYS } from '../core/constants.js';
import { clamp } from '../core/util.js';
import { characterBaseStats, artifactStatBonus, artifactMilestone, guardianMultipliers, enemyStatsAt } from '../model/growth.js';

/** @typedef {import('../types.js').StatKey} StatKey */

/**
 * @typedef {Object} Buff
 * @property {'stat'|'crit'|'attr_mult'} kind
 * @property {StatKey} [stat]
 * @property {string|null} [attribute]
 * @property {number} amount
 * @property {number} turns 残りターン
 * @property {string} source 付与した技の名前
 */

export class BattleUnit {
  /**
   * @param {Object} o
   * @param {string} o.uid 戦闘内で一意
   * @param {'party'|'enemy'} o.side
   * @param {string} o.refId キャラID or 敵ID
   * @param {string} o.name
   * @param {number} o.level
   * @param {import('../types.js').StatBlock} o.base
   * @param {number} o.hp
   * @param {number} o.sp
   */
  constructor(o) {
    this.uid = o.uid;
    this.side = o.side;
    this.refId = o.refId;
    this.name = o.name;
    this.level = o.level;
    this.base = o.base;
    this.maxHp = o.base.hp;
    this.maxSp = o.base.sp;
    this.hp = clamp(o.hp, 0, this.maxHp);
    this.sp = clamp(o.sp, 0, this.maxSp);
    /** @type {Buff[]} */
    this.buffs = [];
    /** このターンの被ダメージ倍率（防御中のみ） @type {number|null} */
    this.guarding = null;
    /** 行動不能ターン数（拘束など） */
    this.bindTurns = 0;

    // --- 味方専用 ---
    /** @type {{def: import('../types.js').Artifact, level: number, bonus: Record<string, number>, attributeMultiplier: number, critBonus: number} | null} */
    this.artifact = null;
    /** @type {{def: import('../types.js').Guardian, affinity: number, statMultiplier: number, attributeMultiplier: number, released: boolean, releasedOnce: boolean, releasedTurns: number} | null} */
    this.guardian = null;
    this.upperAwakened = false;
    /** 天撃ダメージ補正（キャラ固有・data/confirmed/character_traits.json） */
    this.tengekiMultiplier = 1;
    /** 補正の適用範囲：non_matching=神器・守護獣と属性不一致の天撃のみ / all */
    this.tengekiMultiplierScope = 'all';

    // --- 敵専用 ---
    /** @type {import('../types.js').EnemyDef | null} */
    this.enemyDef = null;
    this.phaseIndex = -1;
    this.phaseMultiplier = 1;
    /** @type {{id:string, weight:number}[]} */
    this.enemySkills = [];
    /** @type {string[]} */
    this.immuneAttributes = [];
  }

  get alive() { return this.hp > 0; }

  /**
   * 実効ステータス（HP/SPは最大値をそのまま返す）
   * 順序：キャラ基礎 →（守護獣解放時）基礎×倍率 → ＋神器補正 → ×敵フェーズ倍率 → ×(1+バフ)
   * @param {StatKey} k
   * @param {{min:number, max:number}} [buffClamp]
   */
  stat(k, buffClamp = { min: -0.5, max: 0.5 }) {
    if (k === 'hp') return this.maxHp;
    if (k === 'sp') return this.maxSp;
    let v = this.base[k];
    if (this.guardian?.released && !this.guardian.def.release_excludes_stats.includes(k)) {
      v = Math.floor(v * this.guardian.statMultiplier);
    }
    if (this.artifact) v += this.artifact.bonus[k] ?? 0;
    v *= this.phaseMultiplier;
    const b = this.buffs.filter((x) => x.kind === 'stat' && x.stat === k).reduce((s, x) => s + x.amount, 0);
    v *= 1 + clamp(b, buffClamp.min, buffClamp.max);
    return Math.max(1, Math.round(v));
  }

  /** 全10ステータスの実効値 */
  allStats() {
    /** @type {Record<string, number>} */ const out = { hp: this.maxHp, sp: this.maxSp };
    for (const k of COMBAT_STAT_KEYS) out[k] = this.stat(k);
    return out;
  }

  /** @param {'crit'} kind */
  buffSum(kind) {
    return this.buffs.filter((x) => x.kind === kind).reduce((s, x) => s + x.amount, 0);
  }

  /** @param {string|null} attribute */
  attrBuffSum(attribute) {
    if (!attribute) return 0;
    return this.buffs.filter((x) => x.kind === 'attr_mult' && x.attribute === attribute).reduce((s, x) => s + x.amount, 0);
  }
}

/**
 * 味方ユニットを生成（キャラLv・神器Lv・親和度はそれぞれ独立に参照）
 * @param {import('../data/gameData.js').GameData} data
 * @param {import('../types.js').CharacterProgress} p
 */
export function createPartyUnit(data, p) {
  const c = data.character(p.id);
  const base = characterBaseStats(c, p.level);
  const u = new BattleUnit({ uid: `P_${c.id}`, side: 'party', refId: c.id, name: c.name, level: p.level, base, hp: p.hp, sp: p.sp });
  const a = data.artifact(c.artifact_id);
  const ms = artifactMilestone(a, p.artifactLevel);
  u.artifact = { def: a, level: p.artifactLevel, bonus: artifactStatBonus(a, p.artifactLevel), attributeMultiplier: ms.attributeMultiplier, critBonus: ms.critBonus };
  const g = data.guardian(c.guardian_id);
  const gm = guardianMultipliers(g, p.guardianAffinity, data.rules.guardian.affinity_curve_interpolation);
  u.guardian = { def: g, affinity: p.guardianAffinity, statMultiplier: gm.statMultiplier, attributeMultiplier: gm.attributeMultiplier, released: false, releasedOnce: false, releasedTurns: 0 };
  u.upperAwakened = p.upperAwakened;
  u.tengekiMultiplier = data.characterTraits[c.id]?.tengeki_damage_multiplier ?? 1;
  u.tengekiMultiplierScope = data.characterTraits[c.id]?.tengeki_damage_multiplier_scope ?? 'all';
  return u;
}

/**
 * 敵ユニットを生成
 * @param {import('../data/gameData.js').GameData} data
 * @param {string} enemyId
 * @param {number} level
 * @param {string} uid
 * @param {string} name 表示名（同種複数なら A/B/C を付ける）
 */
export function createEnemyUnit(data, enemyId, level, uid, name) {
  const e = data.enemy(enemyId);
  const base = enemyStatsAt(e.stats, level);
  const u = new BattleUnit({ uid, side: 'enemy', refId: e.id, name, level, base, hp: base.hp, sp: base.sp });
  u.enemyDef = e;
  u.enemySkills = [...e.skills];
  u.immuneAttributes = [...e.immuneAttributes];
  return u;
}
