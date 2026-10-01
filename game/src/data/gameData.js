// 生データ（正式＋仮）→ ゲームが使う正規化済みデータ。
// 正式データは読み取り専用（deepFreeze）。仮データは「null/未確定の欄」にのみ補完される
// （上書きしていないことは validate.js が保証する）。
import { GameDataError, deepFreeze } from '../core/util.js';
import { resolveEffectText } from './effectText.js';
import { compileScenario } from '../story/compile.js';

/** 正式スキルJSONの対象表記 → 内部表現 */
const TARGET_MAP = Object.freeze({
  単体: 'single_enemy',
  全体: 'all_enemies',
  味方全体: 'all_allies',
});

/** @param {string} t @param {string} where @returns {import('../types.js').TargetType} */
function mapTarget(t, where) {
  if (t in TARGET_MAP) return /** @type {any} */ (TARGET_MAP[/** @type {keyof typeof TARGET_MAP} */ (t)]);
  const internal = ['single_enemy', 'all_enemies', 'self', 'single_ally', 'all_allies', 'single_ally_fainted'];
  if (internal.includes(t)) return /** @type {any} */ (t);
  throw new GameDataError(`${where}: 未対応の対象「${t}」`);
}

/**
 * 仮データの補完を適用する（null/未確定/空配列の欄のみ）
 * @param {Record<string, any>} base
 * @param {Record<string, any> | undefined} ov
 */
function applyOverlay(base, ov) {
  const out = { ...base };
  if (!ov) return out;
  for (const [k, v] of Object.entries(ov)) {
    if (k.startsWith('_')) continue;
    if (k === 'fill') {
      for (const [fk, fv] of Object.entries(v)) if (!fk.startsWith('_')) out[fk] = fv;
    } else {
      const cur = base[k];
      if (cur === null || cur === undefined || cur === '未確定' || (Array.isArray(cur) && cur.length === 0)) out[k] = v;
    }
  }
  return out;
}

export class GameData {
  /**
   * @param {{canon: Record<string, Record<string, any>>, provisional: Record<string, any>, confirmed?: Record<string, any>, scenario?: any}} raw
   */
  constructor(raw) {
    const { canon, provisional: prov } = raw;
    /** ユーザー確定の追加設定（data/confirmed/） @type {Record<string, any>} */
    const confirmed = raw.confirmed ?? {};
    /** シナリオ（ユーザー提供の正式台本から作成：data/scenario） */
    this.scenario = compileScenario(raw.scenario);
    /** キャラクター固有の戦闘特性 @type {Record<string, {tengeki_all_attributes_mastered?: boolean, tengeki_damage_multiplier?: number, tengeki_damage_multiplier_scope?: "non_matching"|"all"}>} */
    this.characterTraits = confirmed.character_traits?.traits ?? {};
    this.rules = prov.battle_rules;
    this.progression = prov.progression;
    this.ui = prov.ui_text;
    this.effectRules = prov.effect_rules;

    /** @type {Map<string, import('../types.js').Character>} */
    this.characters = new Map(Object.values(canon.characters).map((c) => [c.id, c]));
    /** @type {Map<string, import('../types.js').Artifact>} */
    this.artifacts = new Map(Object.values(canon.artifacts).map((a) => [a.id, a]));
    /** @type {Map<string, import('../types.js').Guardian>} */
    this.guardians = new Map(Object.values(canon.guardians).map((g) => [g.id, g]));
    /** @type {Map<string, any>} */
    this.maps = new Map(Object.values(canon.maps).map((m) => [m.id, m]));
    /** @type {Map<string, any>} */
    this.events = new Map(Object.entries(canon.events));

    /** @type {Map<string, import('../types.js').Skill>} */
    this.skills = new Map();
    this.#buildSkills(canon.skills, prov);

    /** @type {Map<string, import('../types.js').ItemDef>} */
    this.items = new Map();
    for (const it of Object.values(canon.items)) {
      const m = applyOverlay(it, prov.items?.overlays?.[it.id]);
      this.items.set(it.id, {
        id: m.id, name: m.name, effect: m.effect,
        target: mapTarget(m.target, `item ${m.id}`), use: m.use, description: m.description ?? m.effect,
      });
    }

    /** @type {Map<string, import('../types.js').EnemyDef>} */
    this.enemies = new Map();
    for (const e of Object.values(canon.enemies)) {
      const m = applyOverlay(e, prov.enemies?.overlays?.[e.id]);
      this.enemies.set(e.id, {
        id: m.id, name: m.name, category: m.category, specialRule: m.special_rule ?? '',
        stats: m.stats, skills: m.skills ?? [], exp: m.exp ?? { lv1: 0, lv100: 0 },
        drops: m.drops ?? [], immuneAttributes: m.immune_attributes ?? [], phases: m.phases ?? [],
      });
    }

    // 台本のみに登場する敵（data/scenario/enemies.json）。名称は台本、ステータスは仮値。
    for (const [id, e] of Object.entries(this.scenario.enemies)) {
      if (this.enemies.has(id)) throw new GameDataError(`敵 ${id} が正式データと台本データで重複しています`);
      this.enemies.set(id, {
        id, name: e.name, category: e.category, specialRule: '', stats: e.stats, skills: e.skills ?? [],
        exp: e.exp ?? { lv1: 0, lv100: 0 }, drops: e.drops ?? [], immuneAttributes: e.immune_attributes ?? [], phases: [],
      });
    }

    /** @type {any[]} */
    this.encounters = prov.encounters?.encounters ?? [];

    // 正式データを含め実行時に書き換えられないよう凍結
    for (const m of [this.characters, this.artifacts, this.guardians, this.skills, this.items, this.enemies, this.maps, this.events]) {
      for (const v of m.values()) deepFreeze(v);
    }
  }

  /**
   * @param {Record<string, any>} rawSkills
   * @param {Record<string, any>} prov
   */
  #buildSkills(rawSkills, prov) {
    /** @param {any} s */
    const effectsOf = (s) => resolveEffectText(this.effectRules, s.effect) ?? {};
    for (const s of Object.values(rawSkills)) {
      /** @type {import('../types.js').SkillCategory | null} */
      let category = null;
      if (s.category === 'tengeki' || s.category === 'artifact_unique' || s.category === 'guardian_unique') category = s.category;
      else if (s.type === '神技') category = 'common';
      else if (s.id === 'SKL_ATK' || s.id === 'SKL_GUARD') category = 'basic';
      if (category === null) continue; // 旧形式 SKL_TEN_*（威力null・TEN_*と重複）は戦闘で使わない

      const ov = category === 'common' || category === 'basic' ? prov.common_skills?.overlays?.[s.id] : undefined;
      const m = applyOverlay(s, ov);
      if (typeof m.power !== 'number' && m.scaling !== 'none') throw new GameDataError(`スキル ${s.id}: power が未定義です（仮データも未設定）`);
      this.skills.set(s.id, {
        id: s.id,
        name: s.name,
        category,
        attribute: m.attribute ?? null,
        baseAttribute: m.base_attribute ?? m.attribute ?? null,
        upper: !!m.upper_attribute,
        scaling: m.scaling ?? 'none',
        power: m.power ?? 0,
        target: mapTarget(m.target, `skill ${s.id}`),
        spCost: m.sp_cost ?? 0,
        effects: m.effects ?? effectsOf(m),
        description: m.description ?? m.effect ?? m.notes ?? '',
        ownerId: m.owner_id ?? null,
        guardianId: m.guardian_id ?? null,
        unlockArtifactLevel: m.unlock_artifact_level ?? null,
        unlockAffinity: m.unlock_affinity ?? null,
        provisional: !!ov,
      });
    }
    for (const [id, s] of Object.entries(prov.enemies?.skills_catalog ?? {})) {
      this.skills.set(id, {
        id, name: s.name, category: 'enemy', attribute: s.attribute ?? null, baseAttribute: s.attribute ?? null,
        upper: false, scaling: s.scaling, power: s.power, target: mapTarget(s.target, `enemy skill ${id}`),
        spCost: 0, effects: s.effects ?? {}, description: '', ownerId: null, guardianId: null,
        unlockArtifactLevel: null, unlockAffinity: null, provisional: true,
      });
    }
  }

  // ---- 参照（存在しないIDは即座に分かりやすく失敗させる） ----

  /** @param {string} id */
  character(id) { return this.#req(this.characters, id, 'キャラクター'); }
  /** @param {string} id */
  artifact(id) { return this.#req(this.artifacts, id, '神器'); }
  /** @param {string} id */
  guardian(id) { return this.#req(this.guardians, id, '守護獣'); }
  /** @param {string} id */
  skill(id) { return this.#req(this.skills, id, 'スキル'); }
  /** @param {string} id */
  item(id) { return this.#req(this.items, id, 'アイテム'); }
  /** @param {string} id */
  enemy(id) { return this.#req(this.enemies, id, '敵'); }

  /** @param {string} cid */
  artifactOf(cid) { return this.artifact(this.character(cid).artifact_id); }
  /** @param {string} cid */
  guardianOf(cid) { return this.guardian(this.character(cid).guardian_id); }

  /** @param {'A'|'B'} cls */
  charactersOfClass(cls) {
    return [...this.characters.values()].filter((c) => c.class === cls).sort((a, b) => a.id.localeCompare(b.id));
  }

  /** @param {import('../types.js').SkillCategory} cat */
  skillsOfCategory(cat) {
    return [...this.skills.values()].filter((s) => s.category === cat);
  }

  /** 神器固有技（ID順＝ARTSK_xx_01..10） @param {string} cid */
  artifactSkillsOf(cid) {
    return this.skillsOfCategory('artifact_unique').filter((s) => s.ownerId === cid).sort((a, b) => a.id.localeCompare(b.id));
  }

  /** 守護獣固有技 @param {string} gid */
  guardianSkillsOf(gid) {
    return this.skillsOfCategory('guardian_unique').filter((s) => s.guardianId === gid).sort((a, b) => a.id.localeCompare(b.id));
  }

  /** ストーリー戦闘定義 @param {string} id */
  storyBattle(id) {
    const b = this.scenario.battles[id];
    if (!b) throw new GameDataError(`ストーリー戦闘 ${id} が存在しません`);
    return b;
  }

  /** @param {number} chapter @param {number} episode */
  episode(chapter, episode) {
    return this.scenario.chapters[chapter]?.[episode] ?? null;
  }

  /** 実装済みの話番号（昇順） @param {number} chapter */
  episodeNumbers(chapter) {
    return Object.keys(this.scenario.chapters[chapter] ?? {}).map(Number).sort((a, b) => a - b);
  }

  /** 話者ラベルの解決 @param {string} label */
  speaker(label) {
    return this.scenario.speakers.get(label) ?? null;
  }

  /** 正式イベントデータ（data/events） @param {number} chapter @param {number} episode */
  canonEvent(chapter, episode) {
    return this.events.get(`CH${chapter}_EP${String(episode).padStart(2, '0')}`) ?? null;
  }

  /** @param {string} id */
  encounter(id) {
    const e = this.encounters.find((x) => x.id === id);
    if (!e) throw new GameDataError(`エンカウント ${id} が存在しません`);
    return e;
  }

  /**
   * @template V
   * @param {Map<string, V>} map @param {string} id @param {string} label
   * @returns {V}
   */
  #req(map, id, label) {
    const v = map.get(id);
    if (v === undefined) throw new GameDataError(`${label} ${id} が存在しません`);
    return v;
  }
}
