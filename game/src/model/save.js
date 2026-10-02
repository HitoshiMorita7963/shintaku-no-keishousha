// セーブデータの作成・検証（UI・保存先に依存しない純粋関数）。
// セーブには「進行状態」だけを入れ、キャラクターの能力値などの正式データは入れない
// （正式データは常に data/ から読むため、データ更新後もセーブが壊れない）。
import { SAVE_VERSION } from './gameState.js';
import { LEVEL_MIN, LEVEL_MAX, ARTIFACT_LEVEL_MIN, ARTIFACT_LEVEL_MAX, AFFINITY_MIN, AFFINITY_MAX, ALL_ATTRIBUTES } from '../core/constants.js';

export const SAVE_FORMAT = 'shinkan-save';

/**
 * セーブ一覧に表示する概要
 * @param {import('../data/gameData.js').GameData} data
 * @param {import('../types.js').GameState} state
 */
export function summarize(data, state) {
  const ch = state.story.chapter;
  const ep = state.story.episode;
  const title = data.episode(ch, ep)?.title ?? null;
  const leader = state.party[0];
  return {
    mode: state.mode,
    chapter: ch,
    episode: ep,
    title,
    joined: state.joined.length,
    party: state.party.map((id) => data.character(id).name),
    leaderLevel: leader ? state.progress[leader]?.level ?? 1 : 1,
  };
}

/**
 * セーブデータを作る
 * @param {import('../data/gameData.js').GameData} data
 * @param {import('../types.js').GameState} state
 * @param {string} [dataVersion]
 */
export function createSave(data, state, dataVersion = '') {
  return {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    dataVersion,
    summary: summarize(data, state),
    state: JSON.parse(JSON.stringify(state)),
  };
}

/**
 * セーブデータを検証して GameState を取り出す。不正なら errors に理由を入れて state=null。
 * （壊れたデータ・手で書き換えたデータで、ゲームが途中で落ちないようにする）
 * @param {import('../data/gameData.js').GameData} data
 * @param {any} save
 * @returns {{state: import('../types.js').GameState | null, errors: string[]}}
 */
export function loadSave(data, save) {
  /** @type {string[]} */ const errors = [];
  const fail = (/** @type {string} */ m) => { errors.push(m); return { state: null, errors }; };
  if (!save || typeof save !== 'object') return fail('セーブデータの形式が正しくありません');
  if (save.format !== SAVE_FORMAT) return fail('神官養成学園のセーブデータではありません');
  if (typeof save.version !== 'number' || save.version > SAVE_VERSION) return fail(`このセーブデータ（版 ${save.version}）は新しすぎて読み込めません`);
  if (save.version < 2) return fail('古い形式のセーブデータには対応していません');
  const s = save.state;
  if (!s || typeof s !== 'object') return fail('進行状態がありません');

  const isInt = (/** @type {any} */ v, /** @type {number} */ lo, /** @type {number} */ hi) => Number.isInteger(v) && v >= lo && v <= hi;
  const charOk = (/** @type {any} */ id) => typeof id === 'string' && data.characters.has(id);

  if (s.mode !== 'story' && s.mode !== 'training') errors.push('モードが不正です');
  if (!Array.isArray(s.joined) || !s.joined.every((/** @type {any} */ id) => charOk(id) && data.character(id).class === 'A')) errors.push('戦闘メンバーの記録が不正です');
  if (!Array.isArray(s.party) || !s.party.length || s.party.length > Math.max(data.progression.party_max, 1)) errors.push('パーティの記録が不正です');
  else if (!s.party.every((/** @type {any} */ id) => Array.isArray(s.joined) && s.joined.includes(id))) errors.push('パーティに戦闘メンバー以外が含まれています');
  if (!s.story || !isInt(s.story.chapter, 1, 5) || !isInt(s.story.episode, 1, 999)) errors.push('物語の進行位置が不正です');
  else if (s.mode === 'story' && s.story.episode > 1 && !data.episode(s.story.chapter, s.story.episode) && !data.episode(s.story.chapter, s.story.episode - 1)) {
    errors.push(`第${s.story.chapter}章 第${s.story.episode}話はこのバージョンにありません`);
  }

  if (!s.progress || typeof s.progress !== 'object') errors.push('成長データがありません');
  else {
    for (const [id, p] of Object.entries(/** @type {Record<string, any>} */ (s.progress))) {
      if (!charOk(id) || p?.id !== id) { errors.push(`存在しないキャラクター ${id} の成長データ`); continue; }
      if (!isInt(p.level, LEVEL_MIN, LEVEL_MAX)) errors.push(`${id}: Lv が範囲外`);
      if (!isInt(p.artifactLevel, ARTIFACT_LEVEL_MIN, ARTIFACT_LEVEL_MAX)) errors.push(`${id}: 神器Lv が範囲外`);
      if (!isInt(p.guardianAffinity, AFFINITY_MIN, AFFINITY_MAX)) errors.push(`${id}: 親和度が範囲外`);
      if (!Number.isInteger(p.exp) || p.exp < 0) errors.push(`${id}: 経験値が不正`);
      if (!Number.isInteger(p.hp) || p.hp < 0 || !Number.isInteger(p.sp) || p.sp < 0) errors.push(`${id}: HP/SP が不正`);
      if (!Array.isArray(p.awakenedUpper) || !p.awakenedUpper.every((/** @type {any} */ a) => ALL_ATTRIBUTES.includes(a))) errors.push(`${id}: 上位属性の記録が不正`);
    }
    for (const id of s.joined ?? []) if (!s.progress[id]) errors.push(`${id}: 成長データがありません`);
  }
  if (!s.inventory || typeof s.inventory !== 'object') errors.push('所持品がありません');
  else for (const [id, n] of Object.entries(/** @type {Record<string, any>} */ (s.inventory))) {
    if (!data.items.has(id)) errors.push(`存在しないアイテム ${id}`);
    if (!Number.isInteger(n) || n < 0 || n > 9999) errors.push(`${id}: 個数が不正`);
  }
  if (!s.flags || typeof s.flags !== 'object') errors.push('フラグがありません');
  if (!s.classNumbers || typeof s.classNumbers !== 'object') errors.push('A組番号の記録がありません');

  if (errors.length) return { state: null, errors };

  /** @type {import('../types.js').GameState} */
  const state = JSON.parse(JSON.stringify(s));
  // HP/SP は現在の最大値を超えないよう丸める（データ更新で最大値が変わった場合の保険）
  for (const p of Object.values(state.progress)) {
    const base = data.character(p.id).stats.levels?.[String(p.level)];
    if (base) { p.hp = Math.min(p.hp, base.hp); p.sp = Math.min(p.sp, base.sp); }
  }
  state.version = SAVE_VERSION;
  return { state, errors };
}
