// 開発者設定：キャラLv・神器Lv・親和度・上位属性覚醒を直接設定（動作確認用）。
// 三つの成長軸が独立していることをここで確認できる。
import { h, clear } from '../dom.js';
import { setGrowth } from '../../model/gameState.js';
import { hubScreen } from './hub.js';

/** @type {import('../app.js').Screen} */
export function devScreen(app, root) {
  const { data } = app;
  const gs = app.gs;
  const table = h('div', { class: 'dev-table' });
  const aff = data.ui.affinity_label;

  /**
   * @param {string} label @param {number} value @param {number} min @param {number} max
   * @param {(v:number)=>void} onChange
   */
  const num = (label, value, min, max, onChange) =>
    h('label', { class: 'dev-field' }, h('span', { text: label }),
      h('input', { type: 'number', min, max, value, inputmode: 'numeric', onchange: (/** @type {Event} */ e) => onChange(Number(/** @type {HTMLInputElement} */ (e.target).value)) }));

  const render = () => {
    clear(table);
    for (const c of data.charactersOfClass('A')) {
      const p = gs.progress[c.id];
      table.append(h('div', { class: `dev-row${gs.party.includes(c.id) ? ' in-party' : ''}` },
        h('span', { class: 'dev-name', text: c.name }),
        num('Lv', p.level, 1, 100, (v) => { setGrowth(data, p, { level: v }); render(); }),
        num(data.ui.artifact_level_label, p.artifactLevel, 1, 100, (v) => { setGrowth(data, p, { artifactLevel: v }); render(); }),
        num(`${aff}%`, p.guardianAffinity, 0, 100, (v) => { setGrowth(data, p, { guardianAffinity: v }); render(); }),
        h('label', { class: 'dev-field dev-check' },
          h('input', { type: 'checkbox', checked: p.upperAwakened, onchange: (/** @type {Event} */ e) => { setGrowth(data, p, { upperAwakened: /** @type {HTMLInputElement} */ (e.target).checked }); } }),
          h('span', { text: '上位属性' })),
      ));
    }
  };

  /** @param {{level?:number, artifactLevel?:number, guardianAffinity?:number, upperAwakened?:boolean}} patch */
  const all = (patch) => { for (const p of Object.values(gs.progress)) setGrowth(data, p, patch); render(); };

  root.append(
    h('div', { class: 'screen' },
      h('header', { class: 'screen-head' },
        h('h1', { text: '開発者設定' }),
        h('button', { class: 'btn btn-ghost', text: '戻る', onclick: () => app.go(hubScreen) }),
      ),
      h('p', { class: 'muted small', text: '動作確認用。キャラLv・神器Lv・親和度は独立して保存されます。変更したキャラはHP/SPが全回復します。' }),
      h('div', { class: 'window row-buttons wrap' },
        ...[1, 10, 30, 50, 70, 100].map((lv) => h('button', { class: 'btn btn-small', text: `全員 Lv${lv}`, onclick: () => all({ level: lv }) })),
        ...[1, 10, 50, 100].map((lv) => h('button', { class: 'btn btn-small', text: `全員 神器Lv${lv}`, onclick: () => all({ artifactLevel: lv }) })),
        ...[0, 40, 100].map((v) => h('button', { class: 'btn btn-small', text: `全員 ${aff}${v}%`, onclick: () => all({ guardianAffinity: v }) })),
        h('button', { class: 'btn btn-small', text: '全員 上位属性覚醒', onclick: () => all({ upperAwakened: true }) }),
      ),
      h('div', { class: 'window' }, table),
    ),
  );
  render();
}
