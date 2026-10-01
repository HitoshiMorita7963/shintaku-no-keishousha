// ストーリー画面（イベント再生）。StoryRunner（UI非依存）から表示単位を受け取って描画する。
// 操作：タップ／クリック／Enter／Space で進む。ログ・オート・スキップあり。
import { h, clear } from '../dom.js';
import { clone } from '../../core/util.js';
import { CHAPTER2_EPISODE_COUNT } from '../../core/constants.js';
import { StoryRunner } from '../../story/runner.js';
import { battleScreen } from './battle.js';
import { sortieScreen } from './sortie.js';
import { hubScreen } from './hub.js';

/** @typedef {import('../../story/runner.js').StoryItem} StoryItem */

const TYPE_MS = 22;

/**
 * 現在の話を開始（または再開）する
 * @param {import('../app.js').App} app
 */
export function startEpisode(app) {
  const gs = app.gs;
  app.storySnapshot = clone(gs); // 中断時に話の開始時点へ戻すため
  app.runner = new StoryRunner(app.data, gs, gs.story.chapter, gs.story.episode);
  app.go(storyScreen);
}

/**
 * 章の最後の話を終えたときの案内
 * @param {number} chapter @param {number} episode
 */
export function chapterEndText(chapter, episode) {
  if (chapter === 2 && episode >= CHAPTER2_EPISODE_COUNT) return '第2章「学園生活編」クリア！　第3章「神官としての実戦編」は台本の受領後に実装します。';
  return `第${episode + 1}話以降は台本の受領後に実装します。`;
}

/** @type {import('../app.js').Screen} */
export function storyScreen(app, root) {
  const { data } = app;
  const runner = /** @type {StoryRunner} */ (app.runner);
  let aborted = false;
  let auto = false;
  /** @type {string[]} */ const log = app.storyLog ?? (app.storyLog = []);
  /** @type {(() => void) | null} */ let onAdvance = null;
  /** @type {ReturnType<typeof setTimeout> | null} */ let autoTimer = null;

  // ---------- DOM ----------
  const epLabel = h('span', { class: 'ep-label', text: `第${runner.chapter}章 第${runner.episode}話「${runner.title}」` });
  const sceneLabel = h('span', { class: 'scene-label', text: '' });
  const autoBtn = h('button', { class: 'btn btn-small btn-ghost', text: 'オート', 'aria-pressed': 'false', onclick: () => toggleAuto() });
  const stageLoc = h('div', { class: 'stage-loc', text: '' });
  const choiceArea = h('div', { class: 'choice-area' });
  const stage = h('div', { class: 'stage' }, stageLoc, choiceArea);
  const nameEl = h('div', { class: 'dlg-name', text: '' });
  const textEl = h('div', { class: 'dlg-text', text: '' });
  const nextEl = h('div', { class: 'dlg-next', 'aria-hidden': 'true', text: '▼' });
  const dialog = h('div', { class: 'window dialog', role: 'button', tabindex: '0', 'aria-label': '次へ', onclick: () => onAdvance?.() }, nameEl, textEl, nextEl);
  const overlay = h('div', { class: 'story-overlay', hidden: true });
  const fxLayer = h('div', { class: 'fx-layer' });

  root.append(h('div', { class: 'screen story' },
    h('header', { class: 'story-head' },
      h('div', { class: 'story-labels' }, epLabel, sceneLabel),
      h('div', { class: 'story-tools' },
        h('button', { class: 'btn btn-small btn-ghost', text: 'ログ', onclick: () => showLog() }),
        autoBtn,
        h('button', { class: 'btn btn-small btn-ghost', text: 'スキップ', onclick: () => skip() }),
      ),
    ),
    stage, dialog, overlay, fxLayer,
  ));

  const onKey = (/** @type {KeyboardEvent} */ e) => {
    if (!overlay.hidden && e.key === 'Escape') { overlay.hidden = true; return; }
    if (['Enter', ' ', 'ArrowDown'].includes(e.key) && onAdvance && document.activeElement?.tagName !== 'BUTTON') { e.preventDefault(); onAdvance(); }
  };
  document.addEventListener('keydown', onKey);

  // ---------- 表示部品 ----------
  /** 話者ラベル → 表示用の色区分 @param {string} who */
  const sideOf = (who) => {
    const s = data.speaker(who);
    if (!s) return 'npc';
    if (s.kind === 'character') return data.character(s.ref).class === 'A' ? 'a' : 'b';
    return s.kind;
  };

  /**
   * 1行を表示し、プレイヤーが進めるまで待つ
   * @param {{name?: string, side?: string, text: string, kind: string}} line
   */
  const showLine = (line) => new Promise((resolve) => {
    clear(choiceArea);
    dialog.dataset.kind = line.kind;
    dialog.dataset.side = line.side ?? '';
    nameEl.textContent = line.name ?? '';
    nameEl.hidden = !line.name;
    textEl.textContent = '';
    nextEl.hidden = true;
    log.push(line.name ? `${line.name}：${line.text}` : line.text);
    if (log.length > 300) log.splice(0, log.length - 300);
    let i = 0;
    const chars = [...line.text];
    const timer = setInterval(() => {
      i += 1;
      textEl.textContent = chars.slice(0, i).join('');
      if (i >= chars.length) finishTyping();
    }, TYPE_MS);
    let typing = true;
    function finishTyping() {
      if (!typing) return;
      typing = false;
      clearInterval(timer);
      textEl.textContent = line.text;
      nextEl.hidden = false;
      if (auto) autoTimer = setTimeout(() => onAdvance?.(), 900 + chars.length * 45);
    }
    onAdvance = () => {
      if (typing) { finishTyping(); return; }
      if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
      onAdvance = null;
      resolve(undefined);
    };
    dialog.focus({ preventScroll: true });
  });

  /**
   * 全画面カード（話の開始・タイトル・話の終了）
   * @param {HTMLElement} content
   * @param {{label:string, primary?:boolean, run:()=>void}[]} [buttons] 省略時はタップで閉じる
   */
  const showCard = (content, buttons) => new Promise((resolve) => {
    clear(overlay);
    overlay.hidden = false;
    const close = () => { overlay.hidden = true; onAdvance = null; resolve(undefined); };
    const card = h('div', { class: 'story-card' }, content);
    if (buttons) {
      card.append(h('div', { class: 'row-buttons center-buttons' }, buttons.map((b) =>
        h('button', { class: `btn${b.primary ? ' btn-primary' : ''}`, text: b.label, onclick: () => { close(); b.run(); } }))));
    } else {
      card.append(h('p', { class: 'muted small blink', text: 'タップで進む' }));
      overlay.onclick = close;
      onAdvance = close;
    }
    overlay.append(card);
    /** @type {HTMLButtonElement|null} */ (overlay.querySelector('.btn-primary'))?.focus();
  });

  /** @param {string} kind */
  const playFx = (kind) => new Promise((resolve) => {
    const cls = /白/.test(kind) ? 'fx-white' : /暗転/.test(kind) ? 'fx-black' : 'fx-dim';
    fxLayer.className = `fx-layer ${cls}`;
    setTimeout(() => { fxLayer.className = 'fx-layer'; resolve(undefined); }, 700);
  });

  /** @param {Extract<StoryItem, {type:'explore'}>} item */
  const explore = (item) => new Promise((resolve) => {
    /** @type {Set<string>} */ const seen = new Set();
    const menu = () => {
      onAdvance = null;
      clear(choiceArea);
      dialog.dataset.kind = 'narr';
      nameEl.hidden = true;
      textEl.textContent = item.prompt;
      nextEl.hidden = true;
      choiceArea.append(h('div', { class: 'window choice-list' },
        item.options.map((o) => h('button', {
          class: `btn btn-menu${seen.has(o.label) ? ' is-seen' : ''}`, text: o.label,
          onclick: async () => { seen.add(o.label); for (const l of o.lines) await present(l); menu(); },
        })),
        h('button', { class: 'btn btn-menu btn-primary', text: item.exit, onclick: () => { clear(choiceArea); resolve(undefined); } }),
      ));
      /** @type {HTMLButtonElement|null} */ (choiceArea.querySelector('button'))?.focus();
    };
    menu();
  });

  /** 1単位を表示 @param {StoryItem} item */
  const present = async (item) => {
    switch (item.type) {
      case 'episode_start':
        await showCard(h('div', {},
          h('p', { class: 'card-sub', text: `第${item.chapter}章　学園生活編` }),
          h('p', { class: 'card-ep', text: `第${item.episode}話` }),
          h('h1', { class: 'card-title', text: item.title }),
        ));
        return;
      case 'scene':
        runner.lastScene = item;
        sceneLabel.textContent = `${item.id}　${item.title}`;
        if (item.location) stageLoc.textContent = item.location;
        stage.classList.remove('stage-in');
        void stage.offsetWidth;
        stage.classList.add('stage-in');
        return;
      case 'line':
        if (item.kind === 'say') return showLine({ name: item.who, side: sideOf(/** @type {string} */ (item.who)), text: `「${item.text}」`, kind: 'say' });
        if (item.kind === 'act') return showLine({ name: item.who, side: sideOf(/** @type {string} */ (item.who)), text: item.text, kind: 'act' });
        if (item.kind === 'sys') return showLine({ text: item.text, kind: 'sys' });
        return showLine({ text: item.text, kind: 'narr' });
      case 'system':
        for (const t of item.text.split('\n')) await showLine({ text: t, kind: 'sys' });
        return;
      case 'unlock':
        return showLine({ text: `【解禁】${item.items.join('／')}`, kind: 'sys' });
      case 'title':
        await showCard(h('h1', { class: 'card-title', text: item.text }));
        return;
      case 'fx':
        return playFx(item.kind);
      case 'explore':
        return explore(item);
      default:
    }
  };

  const toggleAuto = () => {
    auto = !auto;
    autoBtn.classList.toggle('btn-on', auto);
    autoBtn.setAttribute('aria-pressed', String(auto));
    if (auto && onAdvance && !nextEl.hidden) onAdvance();
  };

  const showLog = () => {
    clear(overlay);
    overlay.hidden = false;
    overlay.onclick = null;
    overlay.append(h('div', { class: 'window modal story-log', role: 'dialog', 'aria-label': 'ログ' },
      h('h2', { text: 'ログ' }),
      h('div', { class: 'log-lines' }, log.slice(-120).map((l) => h('p', { text: l }))),
      h('button', { class: 'btn btn-primary modal-close', text: '閉じる', onclick: () => { overlay.hidden = true; } }),
    ));
    const ll = overlay.querySelector('.log-lines');
    if (ll) ll.scrollTop = ll.scrollHeight;
  };

  /** スキップ：次の戦闘・選択肢・話の終わりまで台詞を飛ばす（状態変化は適用される） */
  let skipping = false;
  const skip = () => {
    if (!confirm('次の戦闘・選択肢・話の終わりまで台詞をスキップしますか？')) return;
    skipping = true;
    onAdvance?.(); // 文字送り中なら全文表示
    onAdvance?.(); // 次へ
  };

  // 戦闘から戻ったときは直前のシーン表示を復元
  if (runner.lastScene) {
    sceneLabel.textContent = `${runner.lastScene.id}　${runner.lastScene.title}`;
    if (runner.lastScene.location) stageLoc.textContent = runner.lastScene.location;
  }

  // ---------- 進行 ----------
  const loop = async () => {
    for (;;) {
      if (aborted) return;
      const item = runner.next();
      if (item.type === 'battle') {
        skipping = false;
        const battleId = item.id;
        const target = data.storyBattle(battleId).party === 'select' ? sortieScreen : battleScreen;
        const storySpec = {
          battleId,
          onDone: () => app.go(storyScreen),
          onGiveUp: () => {
            if (app.storySnapshot) app.state = app.storySnapshot;
            app.runner = null;
            app.go(hubScreen, `第${runner.episode}話を中断しました（話の最初からやり直せます）。`);
          },
        };
        if (target === sortieScreen) app.go(sortieScreen, storySpec);
        else app.go(battleScreen, { story: storySpec });
        return;
      }
      if (item.type === 'episode_end') {
        skipping = false;
        app.runner = null;
        app.storySnapshot = null;
        const nextEp = data.episode(runner.chapter, runner.episode + 1);
        await showCard(h('div', {},
          h('p', { class: 'card-ep', text: `第${item.episode}話「${item.title}」` }),
          h('h1', { class: 'card-title', text: '完' }),
          nextEp ? null : h('p', { class: 'muted small', text: chapterEndText(runner.chapter, runner.episode) }),
        ), [
          { label: '学園へ', run: () => app.go(hubScreen) },
          ...(nextEp ? [{ label: `第${runner.episode + 1}話へ`, primary: true, run: () => startEpisode(app) }] : []),
        ]);
        return;
      }
      if (skipping && (item.type === 'line' || item.type === 'system' || item.type === 'unlock' || item.type === 'fx' || item.type === 'scene')) {
        if (item.type === 'scene') await present(item);
        continue;
      }
      skipping = false;
      await present(item);
    }
  };
  loop().catch((e) => app.fatal(e));

  return () => {
    aborted = true;
    if (autoTimer) clearTimeout(autoTimer);
    document.removeEventListener('keydown', onKey);
  };
}
