// 永続するゲーム状態（パーティ・各キャラの成長・所持品・フラグ・ストーリー進行）。
// 戦闘中の一時状態（バフ・守護獣解放など）はここに置かない（battle/unit.js）。
import { LEVEL_MAX, ARTIFACT_LEVEL_MAX, AFFINITY_MAX, AFFINITY_MIN, ARTIFACT_LEVEL_MIN, LEVEL_MIN, UPPER_ATTRIBUTE_OF } from '../core/constants.js';
import { assert, clamp } from '../core/util.js';
import { characterBaseStats, expToNext } from './growth.js';

export const SAVE_VERSION = 2;

/**
 * キャラクターが覚醒し得る上位属性（神器・守護獣の属性に対応するもの。全属性マスターなら7種すべて）
 * @param {import('../data/gameData.js').GameData} data
 * @param {string} id
 * @returns {string[]}
 */
export function upperAttributesFor(data, id) {
  /** @type {Record<string,string>} */ const U = UPPER_ATTRIBUTE_OF;
  if (data.characterTraits[id]?.tengeki_all_attributes_mastered) return Object.values(U);
  const own = [data.artifactOf(id).attribute, data.guardianOf(id).attribute];
  return [...new Set(own.map((a) => U[a]).filter(Boolean))];
}

/**
 * @param {import('../data/gameData.js').GameData} data
 * @param {string} id
 * @param {number} [level]
 * @returns {import('../types.js').CharacterProgress}
 */
export function newProgress(data, id, level) {
  const d = data.progression.new_game_defaults;
  const c = data.character(id);
  const lv = level ?? d.level;
  const base = characterBaseStats(c, lv);
  return {
    id,
    level: lv,
    exp: 0,
    artifactLevel: d.artifact_level,
    guardianAffinity: data.guardianOf(id).starting_affinity ?? d.guardian_affinity,
    awakenedUpper: [],
    hp: base.hp,
    sp: base.sp,
  };
}

/** @param {import('../data/gameData.js').GameData} data */
function allAProgress(data) {
  /** @type {Record<string, import('../types.js').CharacterProgress>} */
  const progress = {};
  for (const c of data.charactersOfClass('A')) progress[c.id] = newProgress(data, c.id);
  return progress;
}

/**
 * 訓練モード（Phase 1）のニューゲーム。A組15人全員が使用可能。
 * @param {import('../data/gameData.js').GameData} data
 * @param {string[]} partyIds
 * @returns {import('../types.js').GameState}
 */
export function newGame(data, partyIds) {
  const max = data.progression.party_max;
  assert(partyIds.length >= 1 && partyIds.length <= max, `パーティは1～${max}人です`);
  for (const id of partyIds) assert(data.character(id).class === 'A', `${id} はA組ではありません`);
  const progress = allAProgress(data);
  return {
    version: SAVE_VERSION,
    mode: 'training',
    party: [...partyIds],
    joined: Object.keys(progress),
    progress,
    inventory: { ...data.progression.starting_inventory },
    flags: {},
    classNumbers: {},
    story: { chapter: 2, episode: 1 },
  };
}

/**
 * ストーリーモードのニューゲーム。第2章第1話から。最初の戦闘メンバーは主人公のみ。
 * @param {import('../data/gameData.js').GameData} data
 * @returns {import('../types.js').GameState}
 */
export function newStoryGame(data) {
  const start = data.progression.story_start;
  return {
    version: SAVE_VERSION,
    mode: 'story',
    party: [...start.joined],
    joined: [...start.joined],
    progress: allAProgress(data),
    inventory: { ...data.progression.starting_inventory },
    flags: {},
    classNumbers: {},
    story: { chapter: start.chapter, episode: start.episode },
  };
}

/**
 * 戦闘加入（台本の【加入処理】）。加入時のLvは仮ルール（progression.join_level_rule）。
 * @param {import('../data/gameData.js').GameData} data
 * @param {import('../types.js').GameState} state
 * @param {string} id
 * @returns {boolean} 新規加入なら true
 */
export function joinCharacter(data, state, id) {
  assert(data.character(id).class === 'A', `${id}: 第2章で戦闘加入できるのはA組のみ（B組は指定戦闘でのみ操作）`);
  if (state.joined.includes(id)) return false;
  const p = state.progress[id];
  if (data.progression.join_level_rule === 'joined_average' && state.joined.length) {
    const avg = Math.round(state.joined.reduce((s, j) => s + state.progress[j].level, 0) / state.joined.length);
    if (avg > p.level) setGrowth(data, p, { level: avg });
  }
  state.joined.push(id);
  if (state.party.length < data.progression.party_max) state.party.push(id);
  return true;
}

/**
 * 上位属性の覚醒（台本の覚醒イベント）
 * @param {import('../types.js').CharacterProgress} p
 * @param {string[]} attrs
 */
export function awakenUpper(p, attrs) {
  for (const a of attrs) if (!p.awakenedUpper.includes(a)) p.awakenedUpper.push(a);
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
 * 成長値を直接設定（開発者設定・ストーリー処理用。範囲外は丸める）。HP/SPは新しい最大値で全快。
 * upperAwakened は互換用：true=覚醒可能な上位属性をすべて覚醒 / false=すべて未覚醒
 * @param {import('../data/gameData.js').GameData} data
 * @param {import('../types.js').CharacterProgress} p
 * @param {{level?:number, artifactLevel?:number, guardianAffinity?:number, awakenedUpper?:string[], upperAwakened?:boolean}} patch
 */
export function setGrowth(data, p, patch) {
  if (patch.level !== undefined) { p.level = clamp(Math.round(patch.level), LEVEL_MIN, LEVEL_MAX); p.exp = 0; }
  if (patch.artifactLevel !== undefined) p.artifactLevel = clamp(Math.round(patch.artifactLevel), ARTIFACT_LEVEL_MIN, ARTIFACT_LEVEL_MAX);
  if (patch.guardianAffinity !== undefined) p.guardianAffinity = clamp(Math.round(patch.guardianAffinity), AFFINITY_MIN, AFFINITY_MAX);
  if (patch.awakenedUpper !== undefined) p.awakenedUpper = [...patch.awakenedUpper];
  if (patch.upperAwakened !== undefined) p.awakenedUpper = patch.upperAwakened ? upperAttributesFor(data, p.id) : [];
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
