// 複数画面で使う表示部品
import { h, attrChip, gauge } from './dom.js';
import { STAT_KEYS } from '../core/constants.js';
import { characterBaseStats, artifactStatBonus, artifactMilestone, guardianMultipliers, expToNext } from '../model/growth.js';
import { artifactSkillUnlockLevel } from '../battle/commands.js';

/**
 * キャラクター概要カード（選択画面用）
 * @param {import('../data/gameData.js').GameData} data
 * @param {import('../types.js').Character} c
 */
export function characterSummary(data, c) {
  const a = data.artifact(c.artifact_id);
  const g = data.guardian(c.guardian_id);
  return h('div', { class: 'char-summary' },
    h('div', { class: 'char-head' },
      h('span', { class: 'char-id', text: c.id }),
      h('span', { class: 'char-name', text: c.name }),
    ),
    h('div', { class: 'char-meta' },
      h('span', { text: `入試No.${c.entrance_number}` }),
      h('span', { class: 'role', text: c.role }),
    ),
    h('div', { class: 'char-gear' },
      h('span', { class: 'gear-label', text: '神器' }), attrChip(a.attribute), h('span', { text: a.name }),
    ),
    h('div', { class: 'char-gear' },
      h('span', { class: 'gear-label', text: '守護獣' }), attrChip(g.attribute), h('span', { text: `${g.name}（${g.species}）` }),
    ),
  );
}

/**
 * 10ステータス表。基礎（キャラLv）＋神器補正＝合計。Lv1/Lv100の正式値も併記。
 * @param {import('../data/gameData.js').GameData} data
 * @param {import('../types.js').Character} c
 * @param {import('../types.js').CharacterProgress | null} p null なら Lv1/Lv100 のみ表示
 */
export function statTable(data, c, p) {
  const labels = data.ui.stat_labels;
  const base = p ? characterBaseStats(c, p.level) : null;
  const bonus = p ? artifactStatBonus(data.artifact(c.artifact_id), p.artifactLevel) : {};
  const head = p
    ? ['', `Lv${p.level}`, '神器', '合計', 'Lv1', 'Lv100']
    : ['', 'Lv1', 'Lv100'];
  return h('table', { class: 'stat-table' },
    h('thead', {}, h('tr', {}, head.map((t) => h('th', { text: t })))),
    h('tbody', {}, STAT_KEYS.map((k) => {
      const b = base ? base[k] : 0;
      const bo = /** @type {Record<string, number>} */ (bonus)[k] ?? 0;
      return h('tr', {},
        h('th', { text: labels[k] }),
        p ? h('td', { text: b }) : null,
        p ? h('td', { class: bo ? 'bonus' : 'muted', text: bo ? `+${bo}` : '—' }) : null,
        p ? h('td', { class: 'total', text: b + bo }) : null,
        h('td', { class: 'muted', text: c.stats.lv1[k] }),
        h('td', { class: 'muted', text: c.stats.lv100[k] }),
      );
    })),
  );
}

/**
 * キャラクター詳細（ステータス画面・選択画面の詳細）
 * @param {import('../data/gameData.js').GameData} data
 * @param {import('../types.js').Character} c
 * @param {import('../types.js').CharacterProgress | null} p
 */
export function characterDetail(data, c, p) {
  const a = data.artifact(c.artifact_id);
  const g = data.guardian(c.guardian_id);
  const aLv = p?.artifactLevel ?? 1;
  const aff = p?.guardianAffinity ?? g.starting_affinity;
  const ms = artifactMilestone(a, aLv);
  const gm = guardianMultipliers(g, aff, data.rules.guardian.affinity_curve_interpolation);
  const affLabel = data.ui.affinity_label;
  const artSkills = data.artifactSkillsOf(c.id).sort((x, y) => artifactSkillUnlockLevel(data, x) - artifactSkillUnlockLevel(data, y));
  const guaSkills = data.guardianSkillsOf(g.id);

  return h('div', { class: 'char-detail' },
    h('div', { class: 'detail-head' },
      h('h2', { text: c.name }),
      h('div', { class: 'char-meta' },
        h('span', { text: `${c.class}組 ${c.id}` }), h('span', { text: `入試No.${c.entrance_number}` }),
        h('span', { text: `${c.age}歳` }), h('span', { class: 'role', text: c.role }),
      ),
      p ? h('div', { class: 'detail-res' },
        gauge('hp', p.hp, characterBaseStats(c, p.level).hp),
        gauge('sp', p.sp, characterBaseStats(c, p.level).sp),
        h('div', { class: 'exp-line', text: p.level >= 100 ? 'Lv100（最大）' : `EXP ${p.exp} / ${expToNext(data.progression.exp_curve, p.level)}` }),
      ) : null,
    ),
    traitLine(data, c.id),
    statTable(data, c, p),
    h('section', { class: 'detail-sec' },
      h('h3', {}, '神器 ', attrChip(a.attribute), ` ${a.name}`),
      h('p', { class: 'kv' },
        `武器形態：${a.weapon_form} ／ ${data.ui.artifact_level_label}${aLv} ／ 属性ダメージ×${ms.attributeMultiplier.toFixed(2)} ／ 会心+${Math.round(ms.critBonus * 100)}%`),
      h('p', { class: 'muted small', text: `特殊効果：${a.special_effect} ／ 固有能力：${a.unique_ability}` }),
      skillList(artSkills.map((s) => ({ s, need: artifactSkillUnlockLevel(data, s), have: aLv, label: data.ui.artifact_level_label, unit: '' }))),
    ),
    h('section', { class: 'detail-sec' },
      h('h3', {}, '守護獣 ', attrChip(g.attribute), ` ${g.name}（${g.species}）`),
      h('p', { class: 'kv', text: `${affLabel}${aff}% ／ 解放時 能力×${gm.statMultiplier.toFixed(1)}（HP/SP除く）／ 属性ダメージ×${gm.attributeMultiplier.toFixed(2)}` }),
      h('p', { class: 'muted small', text: `特殊効果：${g.special_effect} ／ 固有能力：${g.unique_ability}` }),
      skillList(guaSkills.map((s) => ({ s, need: s.unlockAffinity ?? 0, have: aff, label: affLabel, unit: '%' }))),
    ),
  );
}

/**
 * キャラクター固有の戦闘特性（data/confirmed/character_traits.json）
 * @param {import('../data/gameData.js').GameData} data @param {string} cid
 */
function traitLine(data, cid) {
  const t = data.characterTraits[cid];
  if (!t) return null;
  const parts = [];
  if (t.tengeki_all_attributes_mastered) parts.push('天撃 全属性マスター');
  if (t.tengeki_damage_multiplier && t.tengeki_damage_multiplier !== 1) parts.push(`天撃ダメージ×${t.tengeki_damage_multiplier}${t.tengeki_damage_multiplier_scope === 'non_matching' ? '（属性不一致時）' : ''}`);
  return parts.length ? h('p', { class: 'trait-line', text: `特性：${parts.join(' ／ ')}` }) : null;
}

/**
 * @param {{s: import('../types.js').Skill, need: number, have: number, label: string, unit: string}[]} rows
 */
function skillList(rows) {
  return h('ul', { class: 'skill-list' }, rows.map(({ s, need, have, label, unit }) =>
    h('li', { class: have >= need ? '' : 'locked' },
      attrChip(s.attribute),
      h('span', { class: 'sk-name', text: s.name }),
      h('span', { class: 'sk-meta', text: `SP${s.spCost}・${targetLabel(s.target)}${s.power ? `・威力${s.power}` : ''}` }),
      h('span', { class: 'sk-unlock', text: have >= need ? '使用可' : `${label}${need}${unit}` }),
    )));
}

/** @param {import('../types.js').TargetType} t */
export function targetLabel(t) {
  return ({ single_enemy: '敵単体', all_enemies: '敵全体', self: '自分', single_ally: '味方単体', all_allies: '味方全体', single_ally_fainted: '戦闘不能の味方' })[t] ?? t;
}
