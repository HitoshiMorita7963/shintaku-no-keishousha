// 戦闘エンジン（UI非依存）。状態を更新し、UIが再生する BattleEvent の配列を返す。
//
// フロー（ユーザー指定）:
//  1 戦闘開始 → 2 参加キャラ決定 → 3 敵配置   … constructor / start()
//  4 行動順決定                               … beginTurn()
//  5 コマンド選択 → 6 ターゲット選択          … UI（listOptions / targetCandidates）
//  7 命中・回避・ダメージ・追加効果計算 → 8 実行 → 9 SP更新 … perform()
//  10 戦闘終了判定                            … outcome()
//  11 経験値・報酬                            … computeRewards() / rewards.js
import { GameDataError, assert, clamp, lerpLevel } from '../core/util.js';
import { listOptions } from './commands.js';
import { rollDamage, guardianReleaseCost, initiative } from './formulas.js';
import { guardianMultipliers } from '../model/growth.js';

/** @typedef {import('./unit.js').BattleUnit} BattleUnit */
/** @typedef {import('../types.js').BattleEvent} BattleEvent */
/** @typedef {import('../types.js').BattleAction} BattleAction */
/** @typedef {import('../types.js').Skill} Skill */

/**
 * ストーリー戦闘の追加ルール（data/scenario/ch2_battles.json から setup.js が組み立てる）
 * @typedef {Object} StoryRules
 * @property {string[]} [loseIfDown] このユニット（uid）のいずれかが倒れたら敗北
 * @property {number} [endAfterTurns] このターン終了時に戦闘終了（結果は 'scripted'）
 * @property {{id:string, when:any, requires?:string[], block?:string, actions?:any[]}[]} [triggers]
 */

export class BattleEngine {
  /**
   * @param {import('../data/gameData.js').GameData} data
   * @param {{party: BattleUnit[], enemies: BattleUnit[], inventory: Record<string, number>, rng: import('../core/rng.js').Rng, story?: StoryRules}} o
   */
  constructor(data, o) {
    assert(o.party.length > 0, '戦闘に参加する味方がいません');
    assert(o.enemies.length > 0, '敵がいません');
    this.data = data;
    this.rules = data.rules;
    this.party = o.party;
    this.enemies = o.enemies;
    this.inventory = o.inventory;
    this.rng = o.rng;
    this.turn = 0;
    /** @type {BattleUnit[]} 今ターンの残り行動順 */
    this.queue = [];
    /** @type {BattleUnit[]} 今ターンの行動順（表示用） */
    this.order = [];
    /** 'scripted' = 台本で結果が決まる戦闘が規定ターン・トリガーで終了した @type {'win'|'lose'|'draw'|'scripted'|null} */
    this.result = null;
    /** @type {'win'|'lose'|'draw'|'scripted'|null} */
    this.forcedResult = null;
    /** @type {StoryRules} */
    this.story = o.story ?? {};
    /** @type {Set<string>} */
    this.firedTriggers = new Set();
    /** 戦闘後に永続状態へ反映する変化（親和度・覚醒） */
    this.persist = { affinity: /** @type {Record<string, number>} */ ({}), awaken: /** @type {Record<string, string[]>} */ ({}) };
  }

  /** @param {string} refId キャラID/敵ID */
  unitByRef(refId) {
    return this.units.find((x) => x.refId === refId) ?? null;
  }

  get units() { return [...this.party, ...this.enemies]; }

  /** @param {string} uid */
  unit(uid) {
    const u = this.units.find((x) => x.uid === uid);
    if (!u) throw new GameDataError(`戦闘ユニット ${uid} が存在しません`);
    return u;
  }

  /** @param {BattleUnit} u */
  alliesOf(u) { return u.side === 'party' ? this.party : this.enemies; }
  /** @param {BattleUnit} u */
  foesOf(u) { return u.side === 'party' ? this.enemies : this.party; }

  /** @returns {BattleEvent[]} */
  start() {
    const names = this.enemies.map((e) => e.name).join('、');
    return [{ type: 'message', text: `${names}が あらわれた！` }];
  }

  /** 4. 行動順決定 @returns {BattleEvent[]} */
  beginTurn() {
    this.turn += 1;
    const living = this.units.filter((u) => u.alive);
    const scored = living.map((u) => ({ u, s: initiative(this.rules, this.rng, u) }));
    scored.sort((a, b) => b.s - a.s);
    this.order = scored.map((x) => x.u);
    this.queue = [...this.order];
    return [{ type: 'turn_start', turn: this.turn, order: this.order.map((u) => u.uid) }];
  }

  /**
   * 次に行動するユニット。行動不能（拘束）ならイベントを積んでスキップ。
   * 返り値 unit=null はターン終了。
   * @returns {{unit: BattleUnit | null, events: BattleEvent[]}}
   */
  nextActor() {
    /** @type {BattleEvent[]} */ const events = [];
    while (this.queue.length) {
      const u = /** @type {BattleUnit} */ (this.queue.shift());
      if (!u.alive) continue;
      if (u.bindTurns > 0) {
        u.bindTurns -= 1;
        u.guarding = null;
        events.push({ type: 'message', unitId: u.uid, text: `${u.name}は 拘束されていて 動けない！` });
        continue;
      }
      return { unit: u, events };
    }
    return { unit: null, events };
  }

  /**
   * @param {BattleUnit} u
   * @param {string} command
   */
  options(u, command) {
    return listOptions(this.data, u, command, this.inventory);
  }

  /**
   * ターゲット候補
   * @param {BattleUnit} u
   * @param {import('../types.js').TargetType} target
   */
  targetCandidates(u, target) {
    switch (target) {
      case 'single_enemy': case 'all_enemies': return this.foesOf(u).filter((x) => x.alive);
      case 'single_ally': case 'all_allies': return this.alliesOf(u).filter((x) => x.alive);
      case 'single_ally_fainted': return this.alliesOf(u).filter((x) => !x.alive);
      case 'self': return [u];
      default: return [];
    }
  }

  /** @param {import('../types.js').TargetType} target */
  static needsTargetChoice(target) {
    return target === 'single_enemy' || target === 'single_ally' || target === 'single_ally_fainted';
  }

  /**
   * 7～9. 行動を実行する
   * @param {BattleUnit} u
   * @param {BattleAction} action
   * @returns {BattleEvent[]}
   */
  perform(u, action) {
    assert(u.alive, `${u.name} は戦闘不能のため行動できません`);
    if (u.allowedCommands && u.side === 'party') {
      assert(u.allowedCommands.includes(action.command), `${u.name}: コマンド「${action.command}」はまだ使えません`);
    }
    u.guarding = null; // 防御は「次の自分の行動まで」
    /** @type {BattleEvent[]} */ const ev = [];

    if (action.command === 'item') return this.#useItem(u, action, ev);

    const opts = this.options(u, action.command);
    if (action.special === 'release') {
      const o = opts.find((x) => x.kind === 'release');
      assert(o && o.usable, `${u.name}: 守護獣を解放できません（${o?.reason ?? '不明'}）`);
      return this.#releaseGuardian(u, o.spCost, ev);
    }

    const skillId = action.skillId ?? (action.command === 'attack' ? 'SKL_ATK' : action.command === 'guard' ? 'SKL_GUARD' : undefined);
    assert(skillId, `${u.name}: コマンド ${action.command} にスキルが指定されていません`);
    const skill = this.data.skill(skillId);
    if (u.side === 'party') {
      const o = opts.find((x) => x.id === skillId);
      assert(o, `${u.name}: ${skill.name} はコマンド「${action.command}」で使用できません`);
      assert(o.usable, `${u.name}: ${skill.name} は使用できません（${o.reason}）`);
    }
    if (skill.spCost > 0) {
      assert(u.sp >= skill.spCost, `${u.name}: SP不足`);
      u.sp -= skill.spCost;
      ev.push({ type: 'sp', unitId: u.uid, sp: u.sp });
    }
    ev.push({ type: 'action', unitId: u.uid, skillId: skill.id, text: this.#actionText(u, skill) });

    if (skill.effects.guard !== undefined) {
      u.guarding = skill.effects.guard;
      ev.push({ type: 'guard', unitId: u.uid });
      return ev;
    }

    const targets = this.#resolveTargets(u, skill.target, action.targetIds);
    if (!targets.length) {
      ev.push({ type: 'message', text: 'しかし 対象が いなかった。' });
      return ev;
    }
    for (const t of targets) {
      if (skill.power > 0 && skill.scaling !== 'none') this.#applyDamage(u, t, skill, ev);
      if (t.alive || skill.power === 0) this.#applySecondary(u, t, skill, ev);
    }
    // 自分自身へのバフ（対象が敵の技でも self 指定のバフは自分に付く）
    for (const b of skill.effects.buffs ?? []) if (b.to === 'self' && skill.target !== 'self') this.#addBuff(u, u, b, skill, ev);
    return ev;
  }

  /** @param {BattleUnit} u @param {Skill} s */
  #actionText(u, s) {
    switch (s.category) {
      case 'basic': return s.id === 'SKL_GUARD' ? `${u.name}は 身を守っている。` : `${u.name}の 攻撃！`;
      case 'tengeki': return `${u.name}は 天撃「${s.name}」を 唱えた！`;
      case 'common': return `${u.name}の ${s.name}！`;
      case 'artifact_unique': return `${u.name}は 神器の力を解き放った！ ${s.name}！`;
      case 'guardian_unique': return `${u.guardian?.def.name ?? '守護獣'}の ${s.name}！`;
      default: return s.name === '攻撃' ? `${u.name}の 攻撃！` : `${u.name}の ${s.name}！`;
    }
  }

  /**
   * 単体技で対象が倒れていたら、生存している別の対象へ（ドラクエ準拠）
   * @param {BattleUnit} u @param {import('../types.js').TargetType} target @param {string[]} ids
   */
  #resolveTargets(u, target, ids) {
    const cands = this.targetCandidates(u, target);
    if (target === 'all_enemies' || target === 'all_allies') return cands;
    if (target === 'self') return [u];
    const chosen = (ids ?? []).map((id) => this.unit(id)).filter((x) => cands.includes(x));
    if (chosen.length) return chosen.slice(0, 1);
    if (target === 'single_ally_fainted') return [];
    return cands.length ? [this.rng.pick(cands)] : [];
  }

  /** @param {BattleUnit} u @param {BattleUnit} t @param {Skill} skill @param {BattleEvent[]} ev */
  #applyDamage(u, t, skill, ev) {
    const hits = Math.max(1, skill.effects.hits ?? 1);
    for (let i = 0; i < hits && t.alive; i++) {
      const r = rollDamage(this.rules, this.rng, u, t, skill, i, hits);
      if (!r.hit) { ev.push({ type: 'miss', unitId: u.uid, targetId: t.uid, text: `ミス！ ${t.name}は ひらりと かわした！` }); continue; }
      if (r.immune) { ev.push({ type: 'immune', targetId: t.uid, text: `${t.name}には ${skill.attribute}属性が 効かない！` }); continue; }
      t.hp = clamp(t.hp - r.damage, t.minHp, t.maxHp);
      ev.push({
        type: 'damage', unitId: u.uid, targetId: t.uid, amount: r.damage, crit: r.crit, hp: t.hp,
        text: `${r.crit ? '会心の一撃！ ' : ''}${t.name}に ${r.damage}の ダメージ！`,
      });
      if (!t.alive) this.#onFaint(t, ev);
      else this.#checkPhase(t, ev);
    }
  }

  /** 追加効果（バフ・デバフ・拘束） @param {BattleUnit} u @param {BattleUnit} t @param {Skill} skill @param {BattleEvent[]} ev */
  #applySecondary(u, t, skill, ev) {
    for (const b of skill.effects.buffs ?? []) {
      if (b.to === 'target' || skill.target === 'self') this.#addBuff(u, t, b, skill, ev);
    }
    const bind = skill.effects.bind;
    if (bind && t.alive) {
      if (this.rng.chance(bind.chance)) {
        t.bindTurns = Math.max(t.bindTurns, bind.turns);
        ev.push({ type: 'status', targetId: t.uid, text: `${t.name}は 拘束された！` });
      } else ev.push({ type: 'message', text: `${t.name}は 拘束を 振りほどいた！` });
    }
  }

  /**
   * @param {BattleUnit} caster @param {BattleUnit} t
   * @param {import('../types.js').BuffSpec} b @param {Skill} skill @param {BattleEvent[]} ev
   */
  #addBuff(caster, t, b, skill, ev) {
    const kind = b.kind ?? 'stat';
    let attribute = null;
    if (kind === 'attr_mult') {
      attribute = b.attribute_from === 'caster_guardian' ? caster.guardian?.def.attribute ?? null : caster.artifact?.def.attribute ?? null;
      if (!attribute) return;
    }
    // 同じ技・同じ効果は重ねがけせず持続ターンを更新
    const same = t.buffs.find((x) => x.source === skill.name && x.kind === kind && x.stat === b.stat && x.attribute === attribute);
    if (same) same.turns = Math.max(same.turns, b.turns);
    else t.buffs.push({ kind, stat: b.stat, attribute, amount: b.amount, turns: b.turns, source: skill.name });
    const labels = this.data.ui.stat_labels;
    const what = kind === 'crit' ? '会心率' : kind === 'attr_mult' ? `${attribute}属性ダメージ` : labels[/** @type {string} */ (b.stat)];
    ev.push({ type: 'buff', targetId: t.uid, text: `${t.name}の ${what}が ${b.amount >= 0 ? '上がった' : '下がった'}！` });
  }

  /** @param {BattleUnit} u @param {number} cost @param {BattleEvent[]} ev */
  #releaseGuardian(u, cost, ev) {
    const g = /** @type {NonNullable<BattleUnit['guardian']>} */ (u.guardian);
    u.sp -= cost;
    g.released = true;
    g.releasedOnce = true;
    g.releasedTurns = 0;
    ev.push({ type: 'sp', unitId: u.uid, sp: u.sp });
    ev.push({
      type: 'release', unitId: u.uid,
      text: `${u.name}は 守護獣「${g.def.name}」を 解放した！ 能力が ${g.statMultiplier.toFixed(1)}倍に 高まった！`,
    });
    return ev;
  }

  /** @param {BattleUnit} u @param {BattleAction} action @param {BattleEvent[]} ev */
  #useItem(u, action, ev) {
    const id = /** @type {string} */ (action.itemId);
    assert(id && (this.inventory[id] ?? 0) > 0, `アイテム ${id} を持っていません`);
    const it = this.data.item(id);
    const targets = this.#resolveTargets(u, it.target, action.targetIds);
    ev.push({ type: 'action', unitId: u.uid, text: `${u.name}は ${it.name}を 使った！` });
    if (!targets.length) { ev.push({ type: 'message', text: 'しかし 何も 起こらなかった。' }); return ev; }
    this.inventory[id] -= 1;
    for (const t of targets) {
      const use = it.use;
      if (use.kind === 'heal_hp') {
        if (!t.alive) { ev.push({ type: 'message', text: `${t.name}は 戦闘不能だ。` }); continue; }
        const amt = Math.min(t.maxHp - t.hp, Math.max(use.min ?? 0, Math.round(t.maxHp * (use.ratio ?? 0))));
        t.hp += amt;
        ev.push({ type: 'heal', targetId: t.uid, amount: amt, hp: t.hp, text: `${t.name}の HPが ${amt} 回復した！` });
      } else if (use.kind === 'heal_sp') {
        if (!t.alive) { ev.push({ type: 'message', text: `${t.name}は 戦闘不能だ。` }); continue; }
        const amt = Math.min(t.maxSp - t.sp, Math.max(use.min ?? 0, Math.round(t.maxSp * (use.ratio ?? 0))));
        t.sp += amt;
        ev.push({ type: 'sp', unitId: t.uid, sp: t.sp, amount: amt, text: `${t.name}の SPが ${amt} 回復した！` });
      } else if (use.kind === 'cure_status') {
        const had = t.bindTurns > 0 || t.buffs.some((b) => b.amount < 0);
        t.bindTurns = 0;
        t.buffs = t.buffs.filter((b) => b.amount >= 0);
        ev.push({ type: 'status', targetId: t.uid, text: had ? `${t.name}の 状態異常が 治った！` : `${t.name}には 効果がなかった。` });
      } else if (use.kind === 'revive') {
        if (t.alive) { ev.push({ type: 'message', text: `${t.name}には 効果がなかった。` }); continue; }
        t.hp = Math.max(1, Math.round(t.maxHp * (use.ratio ?? 0.25)));
        ev.push({ type: 'revive', targetId: t.uid, hp: t.hp, text: `${t.name}は 生き返った！` });
      }
    }
    return ev;
  }

  /** @param {BattleUnit} t @param {BattleEvent[]} ev */
  #onFaint(t, ev) {
    t.buffs = [];
    t.guarding = null;
    t.bindTurns = 0;
    if (t.guardian) t.guardian.released = false;
    ev.push({ type: 'faint', targetId: t.uid, text: t.side === 'enemy' ? `${t.name}を たおした！` : `${t.name}は 倒れてしまった…` });
  }

  /** 敵のフェーズ移行（偽獣化など） @param {BattleUnit} t @param {BattleEvent[]} ev */
  #checkPhase(t, ev) {
    const phases = t.enemyDef?.phases ?? [];
    for (let i = t.phaseIndex + 1; i < phases.length; i++) {
      const p = phases[i];
      if (t.hp / t.maxHp < p.hp_ratio_below) {
        t.phaseIndex = i;
        t.phaseMultiplier = p.stat_multiplier;
        t.enemySkills = [...t.enemySkills, ...p.add_skills];
        ev.push({ type: 'phase', unitId: t.uid, text: `${t.name}は ${p.name}した！` });
      }
    }
  }

  /** ターン終了処理（バフの持続ターン経過） @returns {BattleEvent[]} */
  endTurn() {
    /** @type {BattleEvent[]} */ const ev = [];
    for (const u of this.units) {
      if (!u.alive) continue;
      const before = u.buffs.length;
      for (const b of u.buffs) b.turns -= 1;
      u.buffs = u.buffs.filter((b) => b.turns > 0);
      if (u.buffs.length < before) ev.push({ type: 'buff_end', targetId: u.uid, text: `${u.name}の 能力変化の 一部が 切れた。` });
      const g = u.guardian;
      if (g?.released) {
        g.releasedTurns += 1;
        const dur = this.rules.guardian.release_duration_turns;
        if (typeof dur === 'number' && g.releasedTurns >= dur) {
          g.released = false;
          ev.push({ type: 'release_end', unitId: u.uid, text: `${g.def.name}の 解放が 解けた。` });
        }
      }
    }
    return ev;
  }

  /** 10. 戦闘終了判定 */
  outcome() {
    if (this.result) return this.result;
    if (this.forcedResult) this.result = this.forcedResult;
    else if (this.enemies.every((e) => !e.alive)) this.result = 'win';
    else if (this.party.every((p) => !p.alive)) this.result = 'lose';
    else if ((this.story.loseIfDown ?? []).some((uid) => !this.unit(uid).alive)) this.result = 'lose';
    return this.result;
  }

  /** 規定ターン経過による終了（台本で結果が決まっている戦闘） */
  checkTurnLimit() {
    const n = this.story.endAfterTurns;
    if (typeof n === 'number' && this.turn >= n && !this.result && !this.forcedResult) this.forcedResult = 'scripted';
  }

  /**
   * 台本トリガーの判定と実行。発火したものを返す（台詞ブロックの再生はUI側）。
   * @returns {{id:string, block?:string, events: BattleEvent[]}[]}
   */
  evaluateTriggers() {
    const fired = [];
    for (const tr of this.story.triggers ?? []) {
      if (this.firedTriggers.has(tr.id)) continue;
      if ((tr.requires ?? []).some((r) => !this.firedTriggers.has(r))) continue;
      if (!this.#cond(tr.when)) continue;
      this.firedTriggers.add(tr.id);
      /** @type {BattleEvent[]} */ const ev = [];
      for (const a of tr.actions ?? []) this.#applyAction(a, ev);
      fired.push({ id: tr.id, block: tr.block, events: ev });
    }
    return fired;
  }

  /** @param {any} w */
  #cond(w) {
    if (!w) return false;
    if (w.any) return w.any.some((/** @type {any} */ x) => this.#cond(x));
    if (w.all) return w.all.every((/** @type {any} */ x) => this.#cond(x));
    if (typeof w.turn_at_least === 'number') return this.turn >= w.turn_at_least;
    if (w.hp_below) {
      const u = this.unitByRef(w.hp_below.unit);
      return !!u && u.hp / u.maxHp < w.hp_below.ratio;
    }
    throw new GameDataError(`未対応のトリガー条件: ${JSON.stringify(w)}`);
  }

  /** @param {any} a @param {BattleEvent[]} ev */
  #applyAction(a, ev) {
    if (a.unlock_commands) {
      for (const ref of a.unlock_commands) { const u = this.unitByRef(ref); if (u) u.allowedCommands = null; }
      ev.push({ type: 'system', text: 'すべてのコマンドが使えるようになった！' });
    } else if (a.awaken) {
      for (const [ref, attrs] of Object.entries(a.awaken)) {
        const u = this.unitByRef(ref);
        if (!u) continue;
        for (const at of /** @type {string[]} */ (attrs)) if (!u.awakenedUpper.includes(at)) u.awakenedUpper.push(at);
        (this.persist.awaken[ref] ??= []).push(.../** @type {string[]} */ (attrs));
        ev.push({ type: 'system', text: `${u.name}は ${/** @type {string[]} */ (attrs).join('・')}属性に 覚醒した！` });
      }
    } else if (a.release_guardian) {
      const u = this.unitByRef(a.release_guardian);
      if (u?.guardian && u.alive && !u.guardian.released) {
        u.guardian.released = true;
        u.guardian.releasedOnce = true;
        ev.push({ type: 'release', unitId: u.uid, text: `${u.name}は 守護獣「${u.guardian.def.name}」を 解放した！` });
      }
    } else if (a.affinity) {
      for (const [ref, n] of Object.entries(a.affinity)) {
        const u = this.unitByRef(ref);
        if (!u?.guardian) continue;
        const g = u.guardian;
        g.affinity = Math.min(100, g.affinity + /** @type {number} */ (n));
        const m = guardianMultipliers(g.def, g.affinity, this.rules.guardian.affinity_curve_interpolation);
        g.statMultiplier = m.statMultiplier;
        g.attributeMultiplier = m.attributeMultiplier;
        this.persist.affinity[ref] = (this.persist.affinity[ref] ?? 0) + /** @type {number} */ (n);
        ev.push({ type: 'system', text: `${g.def.name}との ${this.data.ui.affinity_label}が 上がった！` });
      }
    } else if (a.end_battle) {
      this.forcedResult = a.end_battle === 'continue' ? 'scripted' : a.end_battle;
    } else {
      throw new GameDataError(`未対応のトリガー処理: ${JSON.stringify(a)}`);
    }
  }

  /** 11. 報酬計算（適用は rewards.js の applyRewards） */
  computeRewards() {
    const R = this.rules.rewards;
    let exp = 0;
    /** @type {Record<string, number>} */ const drops = {};
    const living = this.party.filter((p) => p.alive);
    const lukAvg = living.reduce((s, p) => s + p.stat('luk'), 0) / Math.max(1, living.length);
    const charExp = this.data.progression.character_opponent_exp;
    for (const e of this.enemies) {
      const def = e.enemyDef;
      if (!def) { // キャラクター相手（模擬戦）。倒れていなくても勝利なら経験値（仮）
        if (charExp) exp += Math.round(lerpLevel(charExp.lv1, charExp.lv100, e.level));
        continue;
      }
      if (e.alive) continue;
      exp += Math.round(lerpLevel(def.exp.lv1, def.exp.lv100, e.level));
      for (const d of def.drops) {
        const luk = e.stat('luk');
        const rate = d.rate * (1 + R.drop_luk_weight * (lukAvg / (lukAvg + luk)));
        if (this.rng.chance(rate)) drops[d.item_id] = (drops[d.item_id] ?? 0) + 1;
      }
    }
    const receivers = this.party.filter((p) => p.alive || R.exp_to_fainted_members);
    const each = R.exp_split_among_party ? Math.floor(exp / Math.max(1, receivers.length)) : exp;
    return { totalExp: exp, expEach: each, receivers: receivers.map((p) => p.refId), drops };
  }
}
