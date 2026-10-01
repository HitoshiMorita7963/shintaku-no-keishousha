// 型定義（JSDoc）。実行時コードは持たない。`npm run typecheck` で検査される。
export {};

/** @typedef {'hp'|'sp'|'atk'|'def'|'spd'|'int'|'tec'|'eva'|'acc'|'luk'} StatKey */
/** @typedef {Record<StatKey, number>} StatBlock */
/** @typedef {Partial<Record<StatKey, number>>} PartialStats */

/**
 * @typedef {'single_enemy'|'all_enemies'|'self'|'single_ally'|'all_allies'|'single_ally_fainted'} TargetType
 * single_enemy / all_enemies は「使用者から見た敵側」。敵が使う場合はプレイヤー側を指す。
 */

/**
 * @typedef {'tengeki'|'artifact_unique'|'guardian_unique'|'common'|'basic'|'enemy'} SkillCategory
 * basic = 通常攻撃・防御 / common = 神技 / enemy = 敵専用（仮）
 */

/**
 * @typedef {Object} BuffSpec
 * @property {'self'|'target'} to
 * @property {StatKey} [stat]
 * @property {'stat'|'crit'|'attr_mult'} [kind]
 * @property {'caster_artifact'|'caster_guardian'} [attribute_from]
 * @property {number} amount
 * @property {number} turns
 */

/**
 * 構造化された技効果（data/provisional/effect_rules.json 等から生成）
 * @typedef {Object} EffectSpec
 * @property {number} [hits]
 * @property {number} [def_ignore]
 * @property {number} [acc_bonus]
 * @property {number} [crit_bonus]
 * @property {number} [resist_ignore]
 * @property {number} [extra_damage_ratio]
 * @property {PartialStats} [stat_add]
 * @property {BuffSpec[]} [buffs]
 * @property {number} [guard]
 * @property {{chance:number, turns:number}} [bind]
 */

/**
 * ゲーム内で使う正規化済みスキル
 * @typedef {Object} Skill
 * @property {string} id
 * @property {string} name
 * @property {SkillCategory} category
 * @property {string|null} attribute
 * @property {string|null} baseAttribute 上位属性天撃の基本属性
 * @property {boolean} upper 上位属性か
 * @property {'atk'|'int'|'atk_and_int'|'atk_tec'|'tec'|'none'} scaling
 * @property {number} power
 * @property {TargetType} target
 * @property {number} spCost
 * @property {EffectSpec} effects
 * @property {string} description
 * @property {string|null} ownerId 神器固有技の所有キャラID
 * @property {string|null} guardianId 守護獣固有技の守護獣ID
 * @property {number|null} unlockArtifactLevel
 * @property {number|null} unlockAffinity
 * @property {boolean} provisional 威力等に仮値を含むか
 */

/**
 * @typedef {Object} Character 正式キャラクターデータ（data/characters）
 * @property {string} id
 * @property {string} name
 * @property {'A'|'B'} class
 * @property {number} age
 * @property {number} entrance_number
 * @property {string} role
 * @property {{lv1: StatBlock, lv100: StatBlock, levels?: Record<string, StatBlock>}} stats
 * @property {string} artifact_id
 * @property {string} guardian_id
 * @property {string} [join_episode]
 * @property {number[]} [playable_in_episodes]
 */

/**
 * @typedef {Object} ArtifactMilestone
 * @property {number} level
 * @property {number} attribute_damage_multiplier
 * @property {number} critical_rate_bonus
 * @property {string} unlock
 */

/**
 * @typedef {Object} Artifact
 * @property {string} id
 * @property {string} name
 * @property {string} attribute
 * @property {string} weapon_form
 * @property {number} level_min
 * @property {number} level_max
 * @property {string} special_effect
 * @property {string} unique_ability
 * @property {PartialStats} stat_bonuses_lv1
 * @property {PartialStats} stat_bonuses_lv100
 * @property {ArtifactMilestone[]} milestones
 */

/**
 * @typedef {Object} Guardian
 * @property {string} id
 * @property {string} name
 * @property {string} species
 * @property {string} attribute
 * @property {number} starting_affinity
 * @property {number} max_affinity
 * @property {string[]} release_excludes_stats
 * @property {{affinity:number, stat_multiplier:number, attribute_damage_multiplier:number}[]} affinity_multiplier_curve
 * @property {number[]} unique_skill_unlock_affinity
 * @property {string} special_effect
 * @property {string} unique_ability
 */

/**
 * @typedef {Object} EnemyDef 正規化済み敵（正式データ＋仮ステータス）
 * @property {string} id
 * @property {string} name
 * @property {string} category
 * @property {string} specialRule
 * @property {{lv1: StatBlock, lv100: StatBlock}} stats
 * @property {{id:string, weight:number}[]} skills
 * @property {{lv1:number, lv100:number}} exp
 * @property {{item_id:string, rate:number}[]} drops
 * @property {string[]} immuneAttributes
 * @property {{hp_ratio_below:number, name:string, stat_multiplier:number, add_skills:{id:string, weight:number}[]}[]} phases
 */

/**
 * @typedef {Object} ItemDef
 * @property {string} id
 * @property {string} name
 * @property {string} effect
 * @property {TargetType} target
 * @property {{kind:'heal_hp'|'heal_sp'|'cure_status'|'revive', ratio?:number, min?:number}} use
 * @property {string} description
 */

/**
 * キャラクターごとの成長状態（三つの成長軸は独立：キャラLv・神器Lv・守護獣親和度）
 * @typedef {Object} CharacterProgress
 * @property {string} id
 * @property {number} level
 * @property {number} exp 現在Lv内での獲得経験値
 * @property {number} artifactLevel
 * @property {number} guardianAffinity 0～100
 * @property {boolean} upperAwakened 上位属性覚醒（仮フラグ）
 * @property {number} hp 現在HP
 * @property {number} sp 現在SP
 */

/**
 * @typedef {Object} GameState
 * @property {number} version
 * @property {string[]} party キャラクターID（並び順＝隊列）
 * @property {Record<string, CharacterProgress>} progress
 * @property {Record<string, number>} inventory
 * @property {Record<string, boolean>} flags
 */

/**
 * @typedef {Object} BattleAction
 * @property {string} command 'attack'|'shingi'|'tengeki'|'artifact'|'guardian'|'item'|'guard'
 * @property {string} [skillId]
 * @property {string} [itemId]
 * @property {'release'} [special]
 * @property {string[]} targetIds
 */

/**
 * 戦闘イベント（UIが順番に再生する）
 * @typedef {{type:string, text?:string, unitId?:string, targetId?:string, amount?:number, crit?:boolean, hp?:number, sp?:number, [k:string]:any}} BattleEvent
 */
