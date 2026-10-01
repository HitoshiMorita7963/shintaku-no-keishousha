import { h } from '../dom.js';
import { charSelectScreen } from './charSelect.js';
import { validationScreen } from './validation.js';

/** @type {import('../app.js').Screen} */
export function titleScreen(app, root) {
  const v = app.meta?.data_version ?? '';
  root.append(
    h('div', { class: 'screen title-screen' },
      h('div', { class: 'title-logo' },
        h('div', { class: 'title-sub', text: 'ターン制コマンドRPG' }),
        h('h1', { class: 'title-main', text: app.data.ui.game_title }),
      ),
      h('nav', { class: 'window menu title-menu', 'data-cols': '1' },
        h('button', { class: 'btn btn-menu', text: 'ニューゲーム', onclick: () => app.go(charSelectScreen) }),
        h('button', { class: 'btn btn-menu', text: 'つづきから', disabled: true, title: 'セーブ／ロードは Phase 9 で実装予定' }),
        h('button', { class: 'btn btn-menu', text: 'データ検証', onclick: () => app.go(validationScreen, titleScreen) }),
      ),
      h('p', { class: 'title-foot', text: `Phase 1 最小プレイアブル版 ・ データ v${v}` }),
    ),
  );
  /** @type {HTMLButtonElement|null} */ (root.querySelector('.btn-menu'))?.focus();
}
