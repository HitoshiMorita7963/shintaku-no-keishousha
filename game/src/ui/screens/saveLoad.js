// セーブ／ロード画面。スロット（オート＋1～3）とファイルへの書き出し・読み込み。
import { h, clear } from '../dom.js';
import { SLOTS, slotLabel, peekSlot, writeSlot, readSlot, deleteSlot, storageAvailable } from '../saveStore.js';
import { createSave, loadSave } from '../../model/save.js';
import { hubScreen } from './hub.js';
import { titleScreen } from './title.js';

/**
 * @type {import('../app.js').Screen}
 * @param {'save'|'load'} mode
 */
export function saveLoadScreen(app, root, /** @type {'save'|'load'} */ mode) {
  const { data } = app;
  const list = h('div', { class: 'save-list' });
  const notice = h('p', { class: 'notice', role: 'status', text: '' });
  const back = () => app.go(mode === 'save' ? hubScreen : titleScreen);

  /** 読み込んだ状態で再開 @param {import('../../types.js').GameState} state @param {string} from */
  const resume = (state, from) => {
    app.state = state;
    app.runner = null;
    app.storySnapshot = null;
    app.storyLog = [];
    app.go(hubScreen, `${from}から再開しました。`);
  };

  /** @param {any} save */
  const describe = (save) => {
    if (!save) return h('p', { class: 'muted', text: '（空き）' });
    if (save.broken || !save.summary) return h('p', { class: 'ng', text: '（読み込めないデータ）' });
    const s = save.summary;
    const when = new Date(save.savedAt);
    const place = s.mode === 'training'
      ? '訓練モード'
      : s.title ? `第${s.chapter}章 第${s.episode}話「${s.title}」の前` : `第${s.chapter}章 クリア`;
    return h('div', { class: 'save-desc' },
      h('p', { class: 'save-place', text: place }),
      h('p', { class: 'muted small', text: `戦闘メンバー${s.joined}人 ／ ${s.party.join('・')} ／ 先頭Lv${s.leaderLevel}` }),
      h('p', { class: 'muted small', text: isNaN(when.getTime()) ? '' : when.toLocaleString('ja-JP') }),
    );
  };

  const render = () => {
    clear(list);
    for (const slot of SLOTS) {
      const save = peekSlot(slot);
      /** @type {HTMLElement[]} */ const buttons = [];
      if (mode === 'save' && slot !== 'auto') {
        buttons.push(h('button', {
          class: 'btn btn-small btn-primary', text: 'ここにセーブ',
          onclick: () => {
            if (save && !confirm(`${slotLabel(slot)}に上書きしますか？`)) return;
            const err = writeSlot(app, slot);
            notice.textContent = err ?? `${slotLabel(slot)}にセーブしました。`;
            render();
          },
        }));
      }
      if (mode === 'load' && save && !save.broken) {
        buttons.push(h('button', {
          class: 'btn btn-small btn-primary', text: 'ロード',
          onclick: () => {
            const r = readSlot(data, slot);
            if (!r.state) { notice.textContent = `読み込めません：${r.errors.slice(0, 3).join('／')}`; return; }
            resume(r.state, slotLabel(slot));
          },
        }));
      }
      if (save && slot !== 'auto') {
        buttons.push(h('button', {
          class: 'btn btn-small btn-ghost', text: '削除',
          onclick: () => { if (confirm(`${slotLabel(slot)}を削除しますか？（元に戻せません）`)) { deleteSlot(slot); render(); } },
        }));
      }
      list.append(h('div', { class: 'window save-slot' },
        h('div', { class: 'save-slot-head' }, h('b', { text: slotLabel(slot) }), h('div', { class: 'row-buttons' }, buttons)),
        describe(save),
      ));
    }
  };

  // ファイルへの書き出し（バックアップ・別端末への移動用）
  const exportFile = () => {
    if (!app.state) return;
    const json = JSON.stringify(createSave(data, app.state, app.meta?.data_version ?? ''), null, 2);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const s = app.state.story;
    a.download = `神官養成学園_セーブ_第${s.chapter}章第${s.episode}話.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    notice.textContent = 'セーブデータをファイルに書き出しました。';
  };

  const fileInput = /** @type {HTMLInputElement} */ (h('input', {
    type: 'file', accept: 'application/json,.json', class: 'visually-hidden',
    onchange: async () => {
      const f = fileInput.files?.[0];
      if (!f) return;
      try {
        const r = loadSave(data, JSON.parse(await f.text()));
        if (!r.state) { notice.textContent = `読み込めません：${r.errors.slice(0, 3).join('／')}`; return; }
        resume(r.state, 'ファイル');
      } catch {
        notice.textContent = '読み込めません：JSONファイルではありません';
      } finally {
        fileInput.value = '';
      }
    },
  }));

  root.append(h('div', { class: 'screen' },
    h('header', { class: 'screen-head' },
      h('h1', { text: mode === 'save' ? 'セーブ' : 'つづきから' }),
      h('button', { class: 'btn btn-ghost', text: '戻る', onclick: back }),
    ),
    storageAvailable() ? null : h('p', { class: 'ng', text: 'このブラウザではスロットに保存できません（プライベートモード等）。ファイルへの書き出し・読み込みは使えます。' }),
    h('p', { class: 'muted small', text: 'オートセーブは、話の開始時と学園画面に戻ったときに自動で行われます。話の途中から再開すると、その話の最初から始まります。' }),
    notice,
    list,
    h('section', { class: 'window' },
      h('h2', { text: 'ファイル' }),
      h('p', { class: 'muted small', text: 'バックアップや、スマホなど別の端末へ移すときに使います。' }),
      h('div', { class: 'row-buttons wrap' },
        mode === 'save' ? h('button', { class: 'btn btn-small', text: 'ファイルに書き出す', onclick: exportFile }) : null,
        h('button', { class: 'btn btn-small', text: 'ファイルから読み込む', onclick: () => fileInput.click() }),
        fileInput,
      ),
    ),
  ));
  render();
}
