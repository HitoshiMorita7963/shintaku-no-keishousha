// 学園（拠点）。ストーリーモードでは次の話へ進む入口、訓練モードでは Phase 1 の訓練戦メニュー。
import { h, gauge } from '../dom.js';
import { restAll, maxResources } from '../../model/gameState.js';
import { charSelectScreen } from './charSelect.js';
import { statusScreen } from './status.js';
import { battleScreen } from './battle.js';
import { devScreen } from './dev.js';
import { validationScreen } from './validation.js';
import { titleScreen } from './title.js';
import { startEpisode, chapterEndText } from './story.js';

/** @type {import('../app.js').Screen} */
export function hubScreen(app, root, notice = '') {
  const { data } = app;
  const gs = app.gs;
  const story = gs.mode === 'story';
  const flag = (/** @type {string} */ f) => !!gs.flags[f];

  const partyRow = h('div', { class: 'party-row' }, gs.party.map((id) => {
    const p = gs.progress[id];
    const m = maxResources(data, p);
    const no = gs.classNumbers[id];
    return h('div', { class: 'mini-card' },
      h('div', { class: 'mini-name' }, h('span', { text: data.character(id).name }), h('span', { class: 'lv', text: `${no ? `No.${no}　` : ''}Lv${p.level}` })),
      gauge('hp', p.hp, m.hp), gauge('sp', p.sp, m.sp),
    );
  }));

  const items = Object.entries(gs.inventory).filter(([, n]) => n > 0).map(([id, n]) => `${data.item(id).name}×${n}`).join('　') || 'なし';

  // 訓練戦：ストーリーでは台本・正式イベントのフラグで解放（敵の初登場話より前には出さない）
  const encs = data.encounters.filter((e) => (story ? flag(e.story_requires_flag ?? 'CH2_EP02_COSPLETE') : !e.story_only));
  const encounterBtns = encs.map((enc) =>
    h('button', { class: `btn btn-menu${enc.debug ? ' btn-debug' : ''}`, onclick: () => app.go(battleScreen, enc.id) }, enc.name));

  // ストーリー：次の話
  const ch = gs.story.chapter;
  const nextEp = story ? data.episode(ch, gs.story.episode) : null;
  const storySection = story
    ? h('section', { class: 'window story-next' },
      nextEp
        ? [
          h('p', { class: 'muted small', text: `第${ch}章 学園生活編` }),
          h('button', { class: 'btn btn-primary btn-big', onclick: () => startEpisode(app) }, `第${gs.story.episode}話「${nextEp.title}」へ`),
        ]
        : h('p', { class: 'notice', text: chapterEndText(ch, gs.story.episode - 1) }),
      h('p', { class: 'muted small', text: `戦闘メンバー ${gs.joined.length}/15人` }),
    )
    : null;

  root.append(
    h('div', { class: 'screen' },
      h('header', { class: 'screen-head' },
        h('h1', { text: story ? '神官養成学園' : '神官養成学園 ― 訓練モード' }),
        notice ? h('p', { class: 'notice', text: notice }) : null,
      ),
      storySection,
      partyRow,
      h('p', { class: 'muted small', text: `所持品：${items}` }),
      h('div', { class: 'hub-grid' },
        h('section', { class: 'window menu', 'data-cols': '1' },
          h('h2', { text: story ? '訓練場' : '戦闘' }),
          ...(encounterBtns.length ? encounterBtns : [h('p', { class: 'muted small', text: '物語を進めると訓練が解放されます。' })]),
          h('p', { class: 'muted small', text: '※ 敵の能力値は仮データ。' }),
        ),
        h('section', { class: 'window menu', 'data-cols': '1' },
          h('h2', { text: '学園' }),
          h('button', { class: 'btn btn-menu', text: 'ステータス', onclick: () => app.go(statusScreen) }),
          h('button', { class: 'btn btn-menu', text: 'パーティ編成', onclick: () => app.go(charSelectScreen) }),
          story && flag('INFIRMARY_UNLOCKED')
            ? h('button', { class: 'btn btn-menu', text: '保健室（大島美鈴）', onclick: () => { restAll(data, gs); app.go(hubScreen, '大島美鈴「無茶をしたら、ここに来なさい。」　全員のHP・SPが回復した。'); } })
            : null,
          h('button', { class: 'btn btn-menu', text: '休息（全員全回復・仮）', onclick: () => { restAll(data, gs); app.go(hubScreen, '全員のHP・SPが回復した。'); } }),
          h('button', { class: 'btn btn-menu btn-debug', text: '開発者設定', onclick: () => app.go(devScreen) }),
          h('button', { class: 'btn btn-menu', text: 'データ検証', onclick: () => app.go(validationScreen, hubScreen) }),
          h('button', { class: 'btn btn-menu btn-ghost', text: 'タイトルへ', onclick: () => { app.state = null; app.runner = null; app.go(titleScreen); } }),
        ),
      ),
    ),
  );
  /** @type {HTMLButtonElement|null} */ (root.querySelector('.btn-primary, .btn-menu'))?.focus();
}
