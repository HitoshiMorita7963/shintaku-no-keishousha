// 戦闘の組み立て（参加キャラ決定・敵配置）と、戦闘結果の永続状態への反映。
import { assert, clone } from '../core/util.js';
import { LEVEL_MAX, LEVEL_MIN, COMBAT_STAT_KEYS } from '../core/constants.js';
import { BattleEngine } from './engine.js';
import { createPartyUnit, createEnemyUnit, createCharacterUnit } from './unit.js';
import { gainExp, maxResources, newProgress, awakenUpper } from '../model/gameState.js';

const SUFFIX = ['A', 'B', 'C', 'D', 'E', 'F'];

/** @param {number} lv */
const clampLv = (lv) => Math.min(LEVEL_MAX, Math.max(LEVEL_MIN, Math.round(lv)));

/**
 * 同種の敵が複数いるとき A/B/C を付けた表示名にする
 * @param {string[]} names
 */
function suffixNames(names) {
  /** @type {Record<string, number>} */ const totals = {};
  for (const n of names) totals[n] = (totals[n] ?? 0) + 1;
  /** @type {Record<string, number>} */ const seen = {};
  return names.map((n) => {
    if (totals[n] < 2) return n;
    seen[n] = (seen[n] ?? 0) + 1;
    return `${n}${SUFFIX[seen[n] - 1] ?? seen[n]}`;
  });
}

/**
 * 訓練戦（data/provisional/encounters.json）
 * @param {import('../data/gameData.js').GameData} data
 * @param {import('../types.js').GameState} state
 * @param {string} encounterId
 * @param {import('../core/rng.js').Rng} rng
 */
export function createBattle(data, state, encounterId, rng) {
  const enc = data.encounter(encounterId);
  const party = state.party.map((id) => {
    const p = state.progress[id];
    assert(p, `パーティメンバー ${id} の成長データがありません`);
    return createPartyUnit(data, p);
  });
  const avg = Math.round(party.reduce((s, u) => s + u.level, 0) / party.length);
  const names = suffixNames(enc.enemies.map((/** @type {any} */ e) => data.enemy(e.enemy_id).name));
  const enemies = enc.enemies.map((/** @type {any} */ e, /** @type {number} */ i) => {
    const level = e.level === 'party_average' ? avg + (e.offset ?? 0) : Number(e.level);
    return createEnemyUnit(data, e.enemy_id, clampLv(level), `E${i + 1}`, names[i]);
  });
  return new BattleEngine(data, { party, enemies, inventory: state.inventory, rng });
}

/**
 * ストーリー戦闘（data/scenario/ch2_battles.json）
 * @param {import('../data/gameData.js').GameData} data
 * @param {import('../types.js').GameState} state
 * @param {string} battleId
 * @param {import('../core/rng.js').Rng} rng
 * @param {string[]} [chosen] party:"select" のときに出撃メンバー選択画面で選んだID
 */
export function createStoryBattle(data, state, battleId, rng, chosen) {
  const def = data.storyBattle(battleId);
  const ids = storyPartyIds(data, state, def, chosen);
  assert(ids.length > 0, `${battleId}: 参加キャラクターがいません`);
  for (const id of ids) ensureProgress(data, state, id);
  const party = ids.map((/** @type {string} */ id) => {
    const p = state.progress[id];
    assert(p, `${battleId}: ${id} の成長データがありません`);
    if (def.restore_before) { const m = maxResources(data, p); p.hp = m.hp; p.sp = m.sp; }
    const u = createPartyUnit(data, p);
    const r = def.party_hp_ratio?.[id];
    if (typeof r === 'number') u.hp = Math.max(1, Math.round(u.maxHp * r));
    const lim = def.command_limits?.[id];
    if (lim) u.allowedCommands = [...lim];
    return u;
  });
  const avg = Math.round(party.reduce((s, u) => s + u.level, 0) / party.length);

  const names = suffixNames(def.opponents.map((/** @type {any} */ o) => (o.enemy ? data.enemy(o.enemy).name : data.character(o.character).name)));
  const enemies = def.opponents.map((/** @type {any} */ o, /** @type {number} */ i) => {
    const uid = `E${i + 1}`;
    let u;
    if (o.enemy) {
      u = createEnemyUnit(data, o.enemy, clampLv(avg), uid, names[i]);
    } else {
      const own = state.progress[o.character];
      /** @type {import('../types.js').CharacterProgress} */
      const prog = own ? clone(own) : newProgress(data, o.character);
      // 模擬戦・対抗戦は公平に：相手は味方（操作キャラ）の平均Lvで戦う（仮ルール）。台本で対戦カードが固定のため、Lv差で勝てない戦闘を作らない。
      const lv = def.opponent_level === 'party_average' ? avg : prog.level;
      if (lv !== prog.level) prog.level = clampLv(lv);
      const m = maxResources(data, prog);
      prog.hp = m.hp;
      prog.sp = m.sp;
      u = createCharacterUnit(data, prog, 'enemy', uid);
    }
    if (o.scale) { // 台本の1対1ボス戦用の補正（仮値）：パーティ向けの敵ステータスを1人用に縮小
      if (typeof o.scale.hp === 'number') { u.maxHp = Math.max(1, Math.round(u.maxHp * o.scale.hp)); u.hp = u.maxHp; }
      if (typeof o.scale.stats === 'number') for (const k of COMBAT_STAT_KEYS) u.base[k] = Math.max(1, Math.round(u.base[k] * o.scale.stats));
    }
    if (typeof o.hp_ratio === 'number') u.hp = Math.max(1, Math.round(u.maxHp * o.hp_ratio));
    if (typeof o.min_hp_ratio === 'number') u.minHp = Math.max(1, Math.ceil(u.maxHp * o.min_hp_ratio));
    return u;
  });

  /** @param {string} ref */
  const uidOf = (ref) => {
    const u = [...party, ...enemies].find((x) => x.refId === ref);
    assert(u, `${battleId}: lose_if_down の ${ref} が戦闘に参加していません`);
    return u.uid;
  };
  const engine = new BattleEngine(data, {
    party, enemies, inventory: state.inventory, rng,
    story: {
      loseIfDown: (def.lose_if_down ?? []).map(uidOf),
      endAfterTurns: def.end_after_turns,
      triggers: def.triggers ?? [],
    },
  });
  return { engine, def };
}

/**
 * ストーリー戦闘の参加者ID
 * @param {import('../data/gameData.js').GameData} data
 * @param {import('../types.js').GameState} state
 * @param {any} def
 * @param {string[]} [chosen]
 * @returns {string[]}
 */
export function storyPartyIds(data, state, def, chosen) {
  if (def.party === 'current') return [...state.party];
  if (def.party === 'joined') return [...state.joined];
  if (def.party === 'select') {
    assert(chosen && chosen.length, `${def.id}: 出撃メンバーが選ばれていません`);
    const cands = sortieCandidates(data, state, def);
    for (const id of chosen) assert(cands.includes(id), `${def.id}: ${id} はこの戦闘に出撃できません`);
    assert(chosen.length <= (def.party_size ?? data.progression.party_max), `${def.id}: 出撃人数が多すぎます`);
    return [...chosen];
  }
  return [...def.party];
}

/**
 * 出撃メンバー候補（party:"select"）。B組は 04_B組操作可能ルール の話数のみ（validate.js で検査）
 * @param {import('../data/gameData.js').GameData} data
 * @param {import('../types.js').GameState} state
 * @param {any} def
 */
export function sortieCandidates(data, state, def) {
  const a = [...state.joined].sort();
  if (def.candidates !== 'A+B') return a;
  return [...a, ...data.charactersOfClass('B').map((c) => c.id)];
}

/**
 * 成長データがなければ作る（B組は指定戦闘で初めて操作するとき）。Lvは戦闘加入済みメンバーの平均（仮）。
 * @param {import('../data/gameData.js').GameData} data
 * @param {import('../types.js').GameState} state
 * @param {string} id
 */
export function ensureProgress(data, state, id) {
  if (state.progress[id]) return state.progress[id];
  const avg = state.joined.length ? Math.round(state.joined.reduce((s, j) => s + state.progress[j].level, 0) / state.joined.length) : 1;
  state.progress[id] = newProgress(data, id, clampLv(avg));
  return state.progress[id];
}

/**
 * 戦闘後：HP/SPを永続状態へ書き戻し、経験値・ドロップ・台本トリガーによる変化を反映する
 * @param {import('../data/gameData.js').GameData} data
 * @param {import('../types.js').GameState} state
 * @param {BattleEngine} engine
 */
export function applyBattleResult(data, state, engine) {
  for (const u of engine.party) {
    const p = state.progress[u.refId];
    if (!p) continue;
    p.hp = Math.max(u.hp, 0);
    p.sp = u.sp;
  }
  for (const [ref, attrs] of Object.entries(engine.persist.awaken)) if (state.progress[ref]) awakenUpper(state.progress[ref], attrs);
  for (const [ref, n] of Object.entries(engine.persist.affinity)) {
    const p = state.progress[ref];
    if (p) p.guardianAffinity = Math.min(100, p.guardianAffinity + n);
  }
  if (engine.result !== 'win') return { exp: 0, levelUps: [], drops: {} };
  const r = engine.computeRewards();
  /** @type {{id:string, name:string, ups:ReturnType<typeof gainExp>}[]} */ const levelUps = [];
  for (const id of r.receivers) {
    const p = state.progress[id];
    if (!p) continue;
    const ups = gainExp(data, p, r.expEach);
    if (ups.length) levelUps.push({ id, name: data.character(id).name, ups });
  }
  for (const [iid, n] of Object.entries(r.drops)) state.inventory[iid] = (state.inventory[iid] ?? 0) + n;
  return { exp: r.expEach, levelUps, drops: r.drops };
}

/**
 * ストーリー戦闘の結果判定。
 * must_win で敗北 → proceed=false（再戦）。scripted → 台本の story_result。any → 実際の勝敗のまま進行。
 * @param {any} def
 * @param {BattleEngine} engine
 */
export function storyOutcome(def, engine) {
  const r = engine.result;
  if (def.result_mode === 'scripted') return { proceed: true, storyResult: def.story_result };
  if (def.result_mode === 'any') return { proceed: true, storyResult: r };
  return { proceed: r === 'win', storyResult: r };
}

/**
 * 全滅時の扱い（仮：学園で全快して復帰）
 * @param {import('../data/gameData.js').GameData} data
 * @param {import('../types.js').GameState} state
 */
export function recoverAfterDefeat(data, state) {
  for (const id of state.party) {
    const p = state.progress[id];
    const m = maxResources(data, p);
    p.hp = m.hp;
    p.sp = m.sp;
  }
}
