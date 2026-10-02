// 学園（ストーリーモードの拠点）。学園マップを歩き、施設に入って行動する（ドラクエ型）。
//   教室：次の話へ　訓練場：訓練戦　寮：休息・セーブ　保健室：回復（第21話で解放）
//   メニュー：従来の学園メニュー（ステータス・編成・開発者設定など）
import { h, clear } from '../dom.js';
import { restAll } from '../../model/gameState.js';
import { loadFieldMap } from '../../field/fieldMap.js';
import { createFieldView } from '../fieldView.js';
import { battleScreen } from './battle.js';
import { startEpisode, chapterEndText } from './story.js';
import { saveLoadScreen } from './saveLoad.js';
import { hubMenuScreen } from './hub.js';

/** @type {import('../app.js').Screen} */
export function academyScreen(app, root, notice = '') {
  const { data } = app;
  const gs = app.gs;
  const map = loadFieldMap(data.scenario.fieldMaps, 'ACADEMY');
  const ch = gs.story.chapter;
  const nextEp = data.episode(ch, gs.story.episode);

  const textEl = h('div', { class: 'dlg-text', text: '' });
  const nextEl = h('div', { class: 'dlg-next', 'aria-hidden': 'true', text: '▼' });
  const choiceArea = h('div', { class: 'choice-area' });
  const dialog = h('div', { class: 'window dialog', 'data-kind': 'sys', role: 'button', tabindex: '-1', onclick: () => onAdvance?.() }, textEl, nextEl);
  const fieldHost = h('div', { class: 'field-host' });
  const stage = h('div', { class: 'stage is-field' }, fieldHost, choiceArea);
  root.append(h('div', { class: 'screen story academy' },
    h('header', { class: 'story-head' },
      h('div', { class: 'story-labels' },
        h('span', { class: 'ep-label', text: '神官養成学園' }),
        h('span', { class: 'scene-label', text: nextEp ? `次：第${gs.story.episode}話「${nextEp.title}」（教室へ）` : chapterEndText(ch, gs.story.episode - 1) })),
      h('div', { class: 'story-tools' },
        h('button', { class: 'btn btn-small btn-ghost', text: 'メニュー', onclick: () => { keepPos(); app.go(hubMenuScreen); } })),
    ),
    stage, dialog,
  ));

  /** @type {(() => void) | null} */ let onAdvance = null;
  const onKey = (/** @type {KeyboardEvent} */ e) => {
    if (['Enter', ' ', 'z', 'Z'].includes(e.key) && onAdvance && !choiceArea.contains(document.activeElement)) { e.preventDefault(); e.stopImmediatePropagation(); onAdvance(); }
  };
  document.addEventListener('keydown', onKey, true);

  const idle = () => {
    textEl.textContent = '学園を歩いて、施設の扉の前で調べよう（教室：次の話　訓練場：訓練　寮：休息・セーブ）';
    nextEl.hidden = true;
  };

  /** メッセージを表示し、進めるまで待つ @param {string} text */
  const say = (text) => new Promise((resolve) => {
    clear(choiceArea);
    textEl.textContent = text;
    nextEl.hidden = false;
    onAdvance = () => { onAdvance = null; nextEl.hidden = true; resolve(undefined); };
  });

  /**
   * 選択肢（最後は「やめる」）
   * @param {string} text
   * @param {{label:string, run:() => void | Promise<void>}[]} opts
   */
  const choose = (text, opts) => new Promise((resolve) => {
    onAdvance = null;
    textEl.textContent = text;
    nextEl.hidden = true;
    clear(choiceArea);
    const close = () => { clear(choiceArea); resolve(undefined); };
    choiceArea.append(h('div', { class: 'window choice-list' },
      opts.map((o) => h('button', { class: 'btn btn-menu', text: o.label, onclick: async () => { clear(choiceArea); await o.run(); resolve(undefined); } })),
      h('button', { class: 'btn btn-menu btn-ghost', text: 'やめる', onclick: close })));
    /** @type {HTMLButtonElement|null} */ (choiceArea.querySelector('button'))?.focus();
  });

  let view = /** @type {ReturnType<typeof createFieldView> | null} */ (null);
  const keepPos = () => { if (view) app.academyPos = view.position(); };

  const flag = (/** @type {string} */ f) => !!gs.flags[f];
  const encounters = () => data.encounters.filter((e) => flag(e.story_requires_flag ?? 'CH2_EP02_COSPLETE'));

  /** @param {import('../../field/fieldMap.js').FieldObject} obj */
  const onInteract = async (obj) => {
    switch (obj.label) {
      case '教室':
        if (!nextEp) { await say(chapterEndText(ch, gs.story.episode - 1)); break; }
        await choose(`【教室】第${gs.story.episode}話「${nextEp.title}」を始めますか？`, [
          { label: '始める', run: () => { keepPos(); startEpisode(app); } },
        ]);
        break;
      case '訓練場': {
        const encs = encounters();
        if (!encs.length) { await say('【訓練場】物語を進めると訓練が解放されます。'); break; }
        await choose('【訓練場】どの訓練をしますか？（敵の能力値は仮データ）', encs.map((enc) => ({
          label: enc.name, run: () => { keepPos(); app.go(battleScreen, enc.id); },
        })));
        break;
      }
      case '寮':
        await choose('【寮】どうしますか？', [
          { label: '休む（全員のHP・SPが回復・仮）', run: async () => { restAll(data, gs); await say('ぐっすり休んだ。全員のHP・SPが回復した。'); } },
          { label: 'セーブする', run: () => { keepPos(); app.go(saveLoadScreen, 'save'); } },
        ]);
        break;
      case '保健室':
        if (flag('INFIRMARY_UNLOCKED')) {
          restAll(data, gs);
          await say('大島美鈴「無茶をしたら、ここに来なさい。」');
          await say('全員のHP・SPが回復した。');
        } else await say('【保健室】');
        break;
      default:
        await say(`【${obj.label}】`);
    }
    if (view) idle();
  };

  view = createFieldView(fieldHost, { data, map, playerId: 'A01', start: app.academyPos ?? undefined, onInteract });
  if (notice) say(notice).then(idle);
  else idle();

  return () => {
    keepPos();
    view?.destroy();
    view = null;
    document.removeEventListener('keydown', onKey, true);
  };
}
