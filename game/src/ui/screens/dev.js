// 開発者設定：キャラLv・神器Lv・親和度・上位属性覚醒を直接設定（動作確認用）。
// ストーリーモードでは「話を選んで開始」（それまでの加入・フラグ・覚醒を適用してジャンプ）も可能。
import { h, clear } from '../dom.js';
import { setGrowth, upperAttributesFor, newStoryGame } from '../../model/gameState.js';
import { fastForward } from '../../story/runner.js';
import { hubScreen } from './hub.js';
import { startEpisode } from './story.js';

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
      const possible = upperAttributesFor(data, c.id);
      table.append(h('div', { class: `dev-row${gs.party.includes(c.id) ? ' in-party' : ''}${gs.joined.includes(c.id) ? '' : ' not-joined'}` },
        h('span', { class: 'dev-name', text: `${c.name}${gs.joined.includes(c.id) ? '' : '（未加入）'}` }),
        num('Lv', p.level, 1, 100, (v) => { setGrowth(data, p, { level: v }); render(); }),
        num(data.ui.artifact_level_label, p.artifactLevel, 1, 100, (v) => { setGrowth(data, p, { artifactLevel: v }); render(); }),
        num(`${aff}%`, p.guardianAffinity, 0, 100, (v) => { setGrowth(data, p, { guardianAffinity: v }); render(); }),
        h('label', { class: 'dev-field dev-check' },
          h('input', {
            type: 'checkbox', checked: possible.every((a) => p.awakenedUpper.includes(a)),
            onchange: (/** @type {Event} */ e) => { setGrowth(data, p, { upperAwakened: /** @type {HTMLInputElement} */ (e.target).checked }); render(); },
          }),
          h('span', { text: `上位属性（${possible.join('')}）：${p.awakenedUpper.join('') || 'なし'}` })),
      ));
    }
  };

  /** @param {{level?:number, artifactLevel?:number, guardianAffinity?:number, upperAwakened?:boolean}} patch */
  const all = (patch) => { for (const p of Object.values(gs.progress)) setGrowth(data, p, patch); render(); };

  const eps = data.episodeNumbers(2);
  const epSelect = h('select', { class: 'dev-select', 'aria-label': '話' },
    eps.map((n) => h('option', { value: n, text: `第${n}話「${data.episode(2, n)?.title}」` })));
  const jump = () => {
    const target = Number(/** @type {HTMLSelectElement} */ (epSelect).value);
    if (!confirm(`新しいストーリーを作り、第${target}話の直前まで（加入・フラグ・覚醒など）を適用して開始します。現在の進行は失われます。`)) return;
    const st = newStoryGame(data);
    fastForward(data, st, 2, target);
    app.state = st;
    app.storyLog = [];
    startEpisode(app);
  };

  root.append(
    h('div', { class: 'screen' },
      h('header', { class: 'screen-head' },
        h('h1', { text: '開発者設定' }),
        h('button', { class: 'btn btn-ghost', text: '戻る', onclick: () => app.go(hubScreen) }),
      ),
      h('section', { class: 'window' },
        h('h2', { text: '話を選んで開始（ストーリー）' }),
        h('div', { class: 'row-buttons wrap' }, epSelect, h('button', { class: 'btn btn-small btn-primary', text: 'この話から開始', onclick: jump })),
        h('p', { class: 'muted small', text: 'それより前の話の戦闘・台詞は飛ばし、状態変化（戦闘加入・フラグ・上位属性覚醒・A組番号）だけを適用します。Lvは変わりません。' }),
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
