// 永続するゲーム状態（パーティ・各キャラの成長・所持品・フラグ）。
// 戦闘中の一時状態（バフ・守護獣解放など）はここに置かない（battle/unit.js）。
import { LEVEL_MAX, ARTIFACT_LEVEL_MAX, AFFINITY_MAX, AFFINITY_MIN, ARTIFACT_LEVEL_MIN, LEVEL_MIN } from '../core/constants.js';
import { assert, clamp } from '../core/util.js';
import { characterBaseStats, expToNext } from './growth.js';

export const SAVE_VERSION = 1;

/**
 * @param {import('../data/gameData.js').GameData} data
 * @param {string} id
 * @returns {import('../types.js').CharacterProgress}
 */
export function newProgress(data, id) {
  const d = data.progression.new_game_defaults;
  const c = data.character(id);
  const base = characterBaseStats(c, d.level);
  return {
    id,
    level: d.level,
    exp: 0,
    artifactLevel: d.artifact_level,
    guardianAffinity: data.guardianOf(id).starting_affinity ?? d.guardian_affinity,
    upperAwakened: d.upper_attribute_awakened,
    hp: base.hp,
    sp: base.sp,
  };
}

/**
 * ニューゲーム。A組15人全員の成長状態を用意し、選んだメンバーをパーティにする。
 * @param {import('../data/gameData.js').GameData} data
 * @param {string[]} partyIds
 * @returns {import('../types.js').GameState}
 */
export function newGame(data, partyIds) {
  const max = data.progression.party_max;
  assert(partyIds.length >= 1 && partyIds.length <= max, `パーティは1～${max}人です`);
  for (const id of partyIds) assert(data.character(id).class === 'A', `${id} はA組ではありません（Phase 1 はA組のみ）`);
  /** @type {Record<string, import('../types.js').CharacterProgress>} */
  const progress = {};
  for (const c of data.charactersOfClass('A')) progress[c.id] = newProgress(data, c.id);
  return {
    version: SAVE_VERSION,
    party: [...partyIds],
    progress,
    inventory: { ...data.progression.starting_inventory },
    flags: {},
  };
}

/**
 * 最大HP/SP（キャラLvのみに依存。神器・守護獣はHP/SPを補正しない）
 * @param {import('../data/gameData.js').GameData} data
 * @param {import('../types.js').CharacterProgress} p
 */
export function maxResources(data, p) {
  const b = characterBaseStats(data.character(p.id), p.level);
  return { hp: b.hp, sp: b.sp };
}

/**
 * 経験値を加算し、必要ならLvアップ。Lvアップ時は最大HP/SPの増分だけ現在値も増やす。
 * @param {import('../data/gameData.js').GameData} data
 * @param {import('../types.js').CharacterProgress} p
 * @param {number} amount
 * @returns {{from:number, to:number, gains: Record<string, number>}[]} Lvアップ履歴
 */
export function gainExp(data, p, amount) {
  const curve = data.progression.exp_curve;
  const c = data.character(p.id);
  const ups = [];
  if (p.level >= LEVEL_MAX) return ups;
  p.exp += Math.max(0, Math.floor(amount));
  while (p.level < LEVEL_MAX && p.exp >= expToNext(curve, p.level)) {
    p.exp -= expToNext(curve, p.level);
    const before = characterBaseStats(c, p.level);
    p.level += 1;
    const after = characterBaseStats(c, p.level);
    /** @type {Record<string, number>} */ const gains = {};
    for (const k of Object.keys(after)) gains[k] = after[/** @type {keyof typeof after} */ (k)] - before[/** @type {keyof typeof before} */ (k)];
    if (p.hp > 0) p.hp += gains.hp;
    p.sp += gains.sp;
    ups.push({ from: p.level - 1, to: p.level, gains });
  }
  if (p.level >= LEVEL_MAX) p.exp = 0;
  return ups;
}

/**
 * 開発者設定用：成長値を直接設定（範囲外は丸める）。HP/SPは新しい最大値で全快。
 * @param {import('../data/gameData.js').GameData} data
 * @param {import('../types.js').CharacterProgress} p
 * @param {{level?:number, artifactLevel?:number, guardianAffinity?:number, upperAwakened?:boolean}} patch
 */
export function setGrowth(data, p, patch) {
  if (patch.level !== undefined) { p.level = clamp(Math.round(patch.level), LEVEL_MIN, LEVEL_MAX); p.exp = 0; }
  if (patch.artifactLevel !== undefined) p.artifactLevel = clamp(Math.round(patch.artifactLevel), ARTIFACT_LEVEL_MIN, ARTIFACT_LEVEL_MAX);
  if (patch.guardianAffinity !== undefined) p.guardianAffinity = clamp(Math.round(patch.guardianAffinity), AFFINITY_MIN, AFFINITY_MAX);
  if (patch.upperAwakened !== undefined) p.upperAwakened = patch.upperAwakened;
  const m = maxResources(data, p);
  p.hp = m.hp;
  p.sp = m.sp;
}

/** 全員全快（休息） @param {import('../data/gameData.js').GameData} data @param {import('../types.js').GameState} state */
export function restAll(data, state) {
  for (const p of Object.values(state.progress)) {
    const m = maxResources(data, p);
    p.hp = m.hp;
    p.sp = m.sp;
  }
}
