// コマンドごとの選択肢（使える技・アイテム）を列挙する。UIと敵AIの両方が利用する。
import { guardianReleaseCost, attributeMatches } from './formulas.js';
import { ALL_ATTRIBUTES } from '../core/constants.js';

/** @typedef {import('./unit.js').BattleUnit} BattleUnit */
/** @typedef {import('../types.js').Skill} Skill */

/**
 * @typedef {Object} CommandOption
 * @property {'skill'|'item'|'release'} kind
 * @property {string} id
 * @property {string} name
 * @property {number} spCost
 * @property {boolean} usable
 * @property {string} [reason] 使えない理由
 * @property {Skill} [skill]
 * @property {import('../types.js').ItemDef} [item]
 * @property {number} [count]
 * @property {import('../types.js').TargetType} target
 * @property {string} [note] 補足（解放条件など）
 */

/**
 * 神器固有技の解放Lv（設定で参照元を切替。資料間の矛盾のため）
 * @param {import('../data/gameData.js').GameData} data
 * @param {Skill} s
 */
export function artifactSkillUnlockLevel(data, s) {
  if (data.rules.artifact.skill_unlock_source === 'milestones' && s.ownerId) {
    const idx = Number(s.id.slice(-2)) - 1;
    const art = data.artifactOf(s.ownerId);
    const ms = art.milestones[idx];
    if (ms) return ms.level;
  }
  return s.unlockArtifactLevel ?? 1;
}

/**
 * @param {BattleUnit} u
 * @param {Skill} s
 * @returns {CommandOption}
 */
function skillOption(u, s, locked = '', note = '') {
  const lackSp = u.sp < s.spCost;
  return {
    kind: 'skill', id: s.id, name: s.name, spCost: s.spCost, skill: s, target: s.target,
    usable: !locked && !lackSp, reason: locked || (lackSp ? 'SPが足りない' : undefined), note,
  };
}

/**
 * @param {import('../data/gameData.js').GameData} data
 * @param {BattleUnit} u
 * @param {string} command
 * @param {Record<string, number>} inventory
 * @returns {CommandOption[]}
 */
export function listOptions(data, u, command, inventory) {
  switch (command) {
    case 'attack':
      return [skillOption(u, data.skill('SKL_ATK'))];
    case 'guard':
      return [skillOption(u, data.skill('SKL_GUARD'))];
    case 'shingi':
      return data.skillsOfCategory('common')
        .sort((a, b) => Number(a.id.replace(/\D/g, '')) - Number(b.id.replace(/\D/g, '')))
        .map((s) => skillOption(u, s));
    case 'tengeki': {
      const access = data.rules.tengeki_access;
      const rank = (/** @type {Skill} */ s) => ALL_ATTRIBUTES.indexOf(/** @type {string} */ (s.attribute));
      // 基本属性：access.basic（all=全員全属性 / matching=神器・守護獣と同属性のみ）
      // 上位属性：access.upper_scope（matching=自分の属性に対応する上位属性のみ / all）
      const own = [u.artifact?.def.attribute ?? null, u.guardian?.def.attribute ?? null];
      const matches = (/** @type {Skill} */ s) => own.some((a) => attributeMatches(data.rules, s.attribute, a));
      const visible = (/** @type {Skill} */ s) => {
        if (s.upper) return access.upper !== 'none' && (access.upper_scope === 'all' || matches(s));
        return access.basic === 'all' || matches(s);
      };
      return data.skillsOfCategory('tengeki')
        .sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id))
        .filter(visible)
        .map((s) => skillOption(u, s, s.upper && access.upper === 'awakened_flag' && !u.upperAwakened ? '上位属性が未覚醒' : ''));
    }
    case 'artifact': {
      if (!u.artifact) return [];
      return data.artifactSkillsOf(u.refId).map((s) => {
        const need = artifactSkillUnlockLevel(data, s);
        return skillOption(u, s, u.artifact && u.artifact.level < need ? `神器Lv${need}で解放` : '');
      }).sort((a, b) => artifactSkillUnlockLevel(data, /** @type {Skill} */ (a.skill)) - artifactSkillUnlockLevel(data, /** @type {Skill} */ (b.skill)));
    }
    case 'guardian': {
      const g = u.guardian;
      if (!g) return [];
      if (!g.released) {
        const cost = guardianReleaseCost(data.rules, u);
        const already = g.releasedOnce && data.rules.guardian.release_once_per_battle;
        return [{
          kind: 'release', id: g.def.id, name: `${g.def.name}を解放`, spCost: cost, target: 'self',
          usable: !already && u.sp >= cost,
          reason: already ? 'この戦闘では解放済み' : u.sp < cost ? 'SPが足りない' : undefined,
          note: `${g.def.species}・${g.def.attribute}属性`,
        }];
      }
      return data.guardianSkillsOf(g.def.id).map((s) => {
        const need = s.unlockAffinity ?? 0;
        return skillOption(u, s, g.affinity < need ? `${data.ui.affinity_label}${need}%で解放` : '');
      });
    }
    case 'item':
      return Object.entries(inventory)
        .filter(([, n]) => n > 0)
        .map(([id, n]) => {
          const it = data.item(id);
          return { kind: /** @type {const} */ ('item'), id, name: it.name, spCost: 0, item: it, count: n, target: it.target, usable: true };
        });
    default:
      return [];
  }
}
