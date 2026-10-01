// キャラクター選択（ニューゲーム時のパーティ決定／学園でのパーティ編成）
import { h, clear } from '../dom.js';
import { characterSummary, characterDetail } from '../components.js';
import { newGame } from '../../model/gameState.js';
import { hubScreen } from './hub.js';
import { titleScreen } from './title.js';

/** @type {import('../app.js').Screen} */
export function charSelectScreen(app, root) {
  const { data } = app;
  const editing = !!app.state;
  const max = data.progression.party_max;
  /** @type {string[]} */
  let picked = editing ? [...app.gs.party] : ['A01'];

  const listEl = h('div', { class: 'card-grid' });
  const footer = h('div', { class: 'select-footer window' });
  const overlay = h('div', { class: 'overlay', hidden: true });

  const render = () => {
    clear(listEl);
    // ストーリーモードでは戦闘加入済み（台本の【加入処理】を経た）メンバーのみ
    const pool = data.charactersOfClass('A').filter((c) => !app.state || app.state.joined.includes(c.id));
    for (const c of pool) {
      const idx = picked.indexOf(c.id);
      const card = h('div', { class: `card selectable${idx >= 0 ? ' is-picked' : ''}` },
        idx >= 0 ? h('span', { class: 'pick-badge', text: idx + 1 }) : null,
        characterSummary(data, c),
        h('div', { class: 'card-actions' },
          h('button', {
            class: `btn btn-small${idx >= 0 ? ' btn-on' : ''}`, 'aria-pressed': idx >= 0 ? 'true' : 'false',
            text: idx >= 0 ? '外す' : '編成',
            disabled: idx < 0 && picked.length >= max,
            onclick: () => { toggle(c.id); },
          }),
          h('button', { class: 'btn btn-small btn-ghost', text: '詳細', onclick: () => showDetail(c.id) }),
        ),
      );
      listEl.append(card);
    }
    clear(footer);
    footer.append(
      h('div', { class: 'picked-line' },
        h('span', { class: 'muted', text: `パーティ ${picked.length}/${max}：` }),
        picked.length ? picked.map((id) => h('span', { class: 'picked-name', text: data.character(id).name })) : h('span', { class: 'muted', text: '未選択' }),
      ),
      h('div', { class: 'row-buttons' },
        h('button', { class: 'btn btn-ghost', text: '戻る', onclick: () => app.go(editing ? hubScreen : titleScreen) }),
        h('button', { class: 'btn btn-primary', text: editing ? '編成を決定' : 'この編成で始める', disabled: picked.length === 0, onclick: confirm }),
      ),
    );
  };

  /** @param {string} id */
  const toggle = (id) => {
    picked = picked.includes(id) ? picked.filter((x) => x !== id) : picked.length < max ? [...picked, id] : picked;
    render();
  };

  /** @param {string} id */
  const showDetail = (id) => {
    clear(overlay);
    const c = data.character(id);
    const p = app.state?.progress[id] ?? null;
    overlay.append(
      h('div', { class: 'window modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': `${c.name}の詳細` },
        characterDetail(data, c, p),
        h('button', { class: 'btn btn-primary modal-close', text: '閉じる', onclick: () => { overlay.hidden = true; } }),
      ),
    );
    overlay.hidden = false;
    /** @type {HTMLButtonElement|null} */ (overlay.querySelector('.modal-close'))?.focus();
  };

  const confirm = () => {
    if (editing) app.gs.party = [...picked];
    else app.state = newGame(data, picked);
    app.go(hubScreen);
  };

  const onKey = (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Escape' && !overlay.hidden) overlay.hidden = true; };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.hidden = true; });

  root.append(
    h('div', { class: 'screen' },
      h('header', { class: 'screen-head' },
        h('h1', { text: editing ? 'パーティ編成' : 'キャラクター選択' }),
        h('p', { class: 'muted', text: editing && app.gs.mode === 'story'
          ? `戦闘メンバー（${app.gs.joined.length}人）から最大${max}人を選んでください`
          : `A組15人から最大${max}人を選んでください（B組は指定合同戦闘でのみ操作可能）` }),
      ),
      listEl,
      footer,
      overlay,
    ),
  );
  render();
  return () => document.removeEventListener('keydown', onKey);
}
