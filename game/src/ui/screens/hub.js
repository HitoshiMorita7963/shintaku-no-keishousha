// 学園（Phase 1 では訓練場のみ）。戦闘・ステータス・編成・休息・開発者設定への入口。
import { h, gauge } from '../dom.js';
import { restAll, maxResources } from '../../model/gameState.js';
import { charSelectScreen } from './charSelect.js';
import { statusScreen } from './status.js';
import { battleScreen } from './battle.js';
import { devScreen } from './dev.js';
import { validationScreen } from './validation.js';
import { titleScreen } from './title.js';

/** @type {import('../app.js').Screen} */
export function hubScreen(app, root, notice = '') {
  const { data } = app;
  const gs = app.gs;
  const map = data.maps.get('MAP_TRAINING');

  const partyRow = h('div', { class: 'party-row' }, gs.party.map((id) => {
    const p = gs.progress[id];
    const m = maxResources(data, p);
    return h('div', { class: 'mini-card' },
      h('div', { class: 'mini-name' }, h('span', { text: data.character(id).name }), h('span', { class: 'lv', text: `Lv${p.level}` })),
      gauge('hp', p.hp, m.hp), gauge('sp', p.sp, m.sp),
    );
  }));

  const items = Object.entries(gs.inventory).filter(([, n]) => n > 0).map(([id, n]) => `${data.item(id).name}×${n}`).join('　') || 'なし';

  const encounterBtns = data.encounters.map((enc) =>
    h('button', { class: `btn btn-menu${enc.debug ? ' btn-debug' : ''}`, onclick: () => app.go(battleScreen, enc.id) }, enc.name));

  root.append(
    h('div', { class: 'screen' },
      h('header', { class: 'screen-head' },
        h('h1', { text: `神官養成学園 ― ${map?.name ?? '訓練場'}` }),
        notice ? h('p', { class: 'notice', text: notice }) : null,
      ),
      partyRow,
      h('p', { class: 'muted small', text: `所持品：${items}` }),
      h('div', { class: 'hub-grid' },
        h('section', { class: 'window menu', 'data-cols': '1' },
          h('h2', { text: '戦闘' }),
          ...encounterBtns,
          h('p', { class: 'muted small', text: '※ Phase 1 の訓練戦（敵の能力値は仮データ）。ストーリー戦闘はイベント統合フェーズで実装。' }),
        ),
        h('section', { class: 'window menu', 'data-cols': '1' },
          h('h2', { text: '学園' }),
          h('button', { class: 'btn btn-menu', text: 'ステータス', onclick: () => app.go(statusScreen) }),
          h('button', { class: 'btn btn-menu', text: 'パーティ編成', onclick: () => app.go(charSelectScreen) }),
          h('button', { class: 'btn btn-menu', text: '休息（全員全回復）', onclick: () => { restAll(data, gs); app.go(hubScreen, '全員のHP・SPが回復した。'); } }),
          h('button', { class: 'btn btn-menu btn-debug', text: '開発者設定（Lv・神器Lv・親和度）', onclick: () => app.go(devScreen) }),
          h('button', { class: 'btn btn-menu', text: 'データ検証', onclick: () => app.go(validationScreen, hubScreen) }),
          h('button', { class: 'btn btn-menu btn-ghost', text: 'タイトルへ', onclick: () => { app.state = null; app.go(titleScreen); } }),
        ),
      ),
    ),
  );
  /** @type {HTMLButtonElement|null} */ (root.querySelector('.btn-menu'))?.focus();
}
