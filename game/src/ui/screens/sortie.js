// 出撃メンバー選択（台本「戦闘ごとにA組・B組のキャラクターを選択して出撃可能」：第38・40・41話）
import { h, clear } from '../dom.js';
import { attrChip } from '../dom.js';
import { sortieCandidates } from '../../battle/setup.js';
import { battleScreen } from './battle.js';

/**
 * @type {import('../app.js').Screen}
 * @param {{battleId: string, onDone: Function, onGiveUp: Function}} story
 */
export function sortieScreen(app, root, /** @type {any} */ story) {
  const { data } = app;
  const gs = app.gs;
  const def = data.storyBattle(story.battleId);
  const max = def.party_size ?? data.progression.party_max;
  const cands = sortieCandidates(data, gs, def);
  /** @type {string[]} */
  let picked = (app.lastSortie ?? gs.party).filter((id) => cands.includes(id)).slice(0, max);
  if (!picked.length) picked = cands.slice(0, max);

  const list = h('div', { class: 'sortie-list' });
  const footer = h('div', { class: 'select-footer window' });

  const levelOf = (/** @type {string} */ id) => gs.progress[id]?.level;
  const render = () => {
    clear(list);
    for (const cls of /** @type {const} */ (['A', 'B'])) {
      const ids = cands.filter((id) => data.character(id).class === cls);
      if (!ids.length) continue;
      list.append(h('h2', { class: 'sortie-head', text: `${cls}組（${ids.length}人）` }));
      list.append(h('div', { class: 'sortie-grid' }, ids.map((id) => {
        const c = data.character(id);
        const idx = picked.indexOf(id);
        return h('button', {
          class: `sortie-card${idx >= 0 ? ' is-picked' : ''}`, 'data-class': cls, 'aria-pressed': idx >= 0 ? 'true' : 'false',
          disabled: idx < 0 && picked.length >= max,
          onclick: () => { picked = idx >= 0 ? picked.filter((x) => x !== id) : [...picked, id]; render(); },
        },
          idx >= 0 ? h('span', { class: 'pick-badge', text: idx + 1 }) : null,
          h('span', { class: 'sortie-name', text: c.name }),
          h('span', { class: 'sortie-meta' }, attrChip(data.artifact(c.artifact_id).attribute), attrChip(data.guardian(c.guardian_id).attribute),
            h('span', { text: ` ${c.role}` }), levelOf(id) ? h('span', { class: 'lv', text: ` Lv${levelOf(id)}` }) : h('span', { class: 'lv', text: ' 初出撃' })),
        );
      })));
    }
    clear(footer);
    footer.append(
      h('div', { class: 'picked-line' },
        h('span', { class: 'muted', text: `出撃 ${picked.length}/${max}：` }),
        picked.map((id) => h('span', { class: 'picked-name', text: data.character(id).name }))),
      h('div', { class: 'row-buttons' },
        h('button', { class: 'btn btn-primary', text: '出撃する', disabled: !picked.length, onclick: go }),
      ),
    );
  };
  const go = () => {
    app.lastSortie = [...picked];
    app.go(battleScreen, { story: { ...story, chosen: [...picked] } });
  };

  root.append(h('div', { class: 'screen' },
    h('header', { class: 'screen-head' },
      h('h1', { text: '出撃メンバー選択' }),
      h('p', { class: 'muted', text: `${def.name}　―　最大${max}人${def.candidates === 'A+B' ? '（A組・B組から選択）' : ''}` }),
    ),
    list, footer,
  ));
  render();
}
