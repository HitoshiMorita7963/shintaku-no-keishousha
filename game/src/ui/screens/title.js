import { h } from '../dom.js';
import { charSelectScreen } from './charSelect.js';
import { validationScreen } from './validation.js';
import { startEpisode } from './story.js';
import { newStoryGame } from '../../model/gameState.js';
import { saveLoadScreen } from './saveLoad.js';
import { hasAnySave } from '../saveStore.js';

/** @type {import('../app.js').Screen} */
export function titleScreen(app, root) {
  app.academyPos = null; // 別のデータで始めたら学園マップは入口から
  const v = app.meta?.data_version ?? '';
  const eps = app.data.episodeNumbers(2);
  root.append(
    h('div', { class: 'screen title-screen' },
      h('div', { class: 'title-logo' },
        h('div', { class: 'title-sub', text: 'ターン制コマンドRPG' }),
        h('h1', { class: 'title-main', text: app.data.ui.game_title }),
      ),
      h('nav', { class: 'window menu title-menu', 'data-cols': '1' },
        h('button', {
          class: 'btn btn-menu', text: 'ニューゲーム（第2章 学園生活編）',
          onclick: () => { app.state = newStoryGame(app.data); app.storyLog = []; startEpisode(app); },
        }),
        h('button', { class: 'btn btn-menu', text: 'つづきから', disabled: !hasAnySave(), title: hasAnySave() ? undefined : 'セーブデータがありません', onclick: () => app.go(saveLoadScreen, 'load') }),
        h('button', { class: 'btn btn-menu', text: '訓練モード（全員使用可）', onclick: () => { app.state = null; app.go(charSelectScreen); } }),
        h('button', { class: 'btn btn-menu', text: 'データ検証', onclick: () => app.go(validationScreen, titleScreen) }),
      ),
      h('p', { class: 'title-foot', text: `第2章 学園生活編（全${eps.length}話） ・ データ v${v}` }),
    ),
  );
  /** @type {HTMLButtonElement|null} */ (root.querySelector('.btn-menu'))?.focus();
}
