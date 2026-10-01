// 戦闘の組み立て（参加キャラ決定・敵配置）と、戦闘結果の永続状態への反映。
import { assert } from '../core/util.js';
import { LEVEL_MAX, LEVEL_MIN } from '../core/constants.js';
import { BattleEngine } from './engine.js';
import { createPartyUnit, createEnemyUnit } from './unit.js';
import { gainExp, maxResources } from '../model/gameState.js';

const SUFFIX = ['A', 'B', 'C', 'D', 'E', 'F'];

/**
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

  /** @type {Record<string, number>} */ const totals = {};
  for (const e of enc.enemies) totals[e.enemy_id] = (totals[e.enemy_id] ?? 0) + 1;
  /** @type {Record<string, number>} */ const seen = {};
  const enemies = enc.enemies.map((/** @type {any} */ e, /** @type {number} */ i) => {
    const level = e.level === 'party_average' ? avg + (e.offset ?? 0) : Number(e.level);
    const lv = Math.min(LEVEL_MAX, Math.max(LEVEL_MIN, level));
    const def = data.enemy(e.enemy_id);
    const n = (seen[e.enemy_id] = (seen[e.enemy_id] ?? 0) + 1);
    const name = totals[e.enemy_id] > 1 ? `${def.name}${SUFFIX[n - 1] ?? n}` : def.name;
    return createEnemyUnit(data, e.enemy_id, lv, `E${i + 1}`, name);
  });
  return new BattleEngine(data, { party, enemies, inventory: state.inventory, rng });
}

/**
 * 戦闘後：HP/SPを永続状態へ書き戻し、経験値・ドロップを反映する
 * @param {import('../data/gameData.js').GameData} data
 * @param {import('../types.js').GameState} state
 * @param {BattleEngine} engine
 */
export function applyBattleResult(data, state, engine) {
  for (const u of engine.party) {
    const p = state.progress[u.refId];
    p.hp = u.hp;
    p.sp = u.sp;
  }
  if (engine.result !== 'win') return { exp: 0, levelUps: [], drops: {} };
  const r = engine.computeRewards();
  /** @type {{id:string, name:string, ups:ReturnType<typeof gainExp>}[]} */ const levelUps = [];
  for (const id of r.receivers) {
    const ups = gainExp(data, state.progress[id], r.expEach);
    if (ups.length) levelUps.push({ id, name: data.character(id).name, ups });
  }
  for (const [iid, n] of Object.entries(r.drops)) state.inventory[iid] = (state.inventory[iid] ?? 0) + n;
  return { exp: r.expEach, levelUps, drops: r.drops };
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
