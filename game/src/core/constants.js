// 資料で確定している定数のみを置く。仮の数値は data/provisional/ に置くこと。

/**
 * 正式な10ステータスキー（14_データ定義/01_データ構造.md）。順序も正式。
 * @type {readonly import('../types.js').StatKey[]}
 */
export const STAT_KEYS = Object.freeze(['hp', 'sp', 'atk', 'def', 'spd', 'int', 'tec', 'eva', 'acc', 'luk']);

/** HP/SPは神器補正・守護獣倍率の対象外（04_神器/02_神器成長仕様.md, 07_戦闘システム/03） */
export const RESOURCE_KEYS = Object.freeze(['hp', 'sp']);

/** @type {readonly import('../types.js').StatKey[]} */
export const COMBAT_STAT_KEYS = Object.freeze(STAT_KEYS.filter((k) => !RESOURCE_KEYS.includes(k)));

export const LEVEL_MIN = 1;
export const LEVEL_MAX = 100;
export const ARTIFACT_LEVEL_MIN = 1;
export const ARTIFACT_LEVEL_MAX = 100;
export const AFFINITY_MIN = 0;
export const AFFINITY_MAX = 100;

/** 基本属性（02_世界観/01_世界観・用語.md） */
export const BASIC_ATTRIBUTES = Object.freeze(['火', '水', '雷', '風', '土', '光', '闇']);

/** 基本属性 → 上位属性（02_世界観/01_世界観・用語.md） */
export const UPPER_ATTRIBUTE_OF = Object.freeze({
  水: '氷', 土: '木', 火: '焔', 風: '嵐', 雷: '霆', 光: '聖', 闇: '冥',
});

/** 上位属性 → 基本属性 */
export const BASE_ATTRIBUTE_OF = Object.freeze(
  Object.fromEntries(Object.entries(UPPER_ATTRIBUTE_OF).map(([b, u]) => [u, b])),
);

export const ALL_ATTRIBUTES = Object.freeze([...BASIC_ATTRIBUTES, ...Object.values(UPPER_ATTRIBUTE_OF)]);

/** B組の操作可能話数（01_ゲーム概要/04_B組操作可能ルール.md） */
export const B_CLASS_PLAYABLE_EPISODES = Object.freeze([25, 26, 27, 38, 40, 41]);

/** 第2章の話数 */
export const CHAPTER2_EPISODE_COUNT = 42;
