// ストーリー進行（UI非依存）。1話分のシナリオを順に取り出し、状態を変える命令（加入・フラグ・覚醒など）を適用する。
// UIは next() が返す表示単位（台詞・地の文・選択・戦闘…）を描画するだけ。
import { GameDataError, assert } from '../core/util.js';
import { joinCharacter, awakenUpper, setGrowth } from '../model/gameState.js';

/**
 * @typedef {{type:'episode_start', chapter:number, episode:number, title:string}
 *  | {type:'scene', id:string, title:string, location:string}
 *  | {type:'line', kind:'say'|'act'|'narr'|'sys', who?:string, text:string}
 *  | {type:'system', text:string}
 *  | {type:'unlock', items:string[]}
 *  | {type:'title', text:string}
 *  | {type:'fx', kind:string}
 *  | {type:'explore', prompt:string, options:{label:string, lines:StoryItem[]}[], exit:string}
 *  | {type:'battle', id:string}
 *  | {type:'episode_end', chapter:number, episode:number, title:string}} StoryItem
 */

/**
 * シーン・ブロック呼び出しを展開して1列にする
 * @param {any} ep
 */
function flatten(ep) {
  /** @type {any[]} */ const out = [];
  /** @param {any[]} steps @param {number} depth */
  const push = (steps, depth) => {
    for (const st of steps) {
      if (st.t === 'dir' && st.name === 'call') {
        assert(depth < 5, `${ep.file}: [call] の入れ子が深すぎます`);
        push(ep.blocks[st.args[0]] ?? [], depth + 1);
      } else out.push(st);
    }
  };
  for (const sc of ep.scenes) {
    out.push({ t: 'scene', id: sc.id, title: sc.title, location: sc.location });
    push(sc.steps, 0);
  }
  return out;
}

/** @param {any} st @returns {StoryItem} */
function lineOf(st) {
  return { type: 'line', kind: st.t, who: st.who, text: st.text };
}

export class StoryRunner {
  /**
   * @param {import('../data/gameData.js').GameData} data
   * @param {import('../types.js').GameState} state
   * @param {number} chapter
   * @param {number} episode
   */
  constructor(data, state, chapter, episode) {
    const ep = data.episode(chapter, episode);
    if (!ep) throw new GameDataError(`第${chapter}章 第${episode}話のシナリオがありません`);
    this.data = data;
    this.state = state;
    this.chapter = chapter;
    this.episode = episode;
    this.ep = ep;
    this.items = flatten(ep);
    this.pos = -1; // -1 = 話の開始カード
    this.done = false;
    /** 直前に表示したシーン（戦闘から戻ったときの表示復元用） @type {Extract<StoryItem, {type:'scene'}> | null} */
    this.lastScene = null;
  }

  get title() { return this.ep.title; }

  /**
   * 次の表示単位。状態を変える命令はここで適用され、表示不要なら読み飛ばす。
   * @returns {StoryItem}
   */
  next() {
    if (this.pos === -1) {
      this.pos = 0;
      return { type: 'episode_start', chapter: this.chapter, episode: this.episode, title: this.ep.title };
    }
    while (this.pos < this.items.length) {
      const st = this.items[this.pos++];
      const item = this.#apply(st);
      if (item) return item;
    }
    if (!this.done) {
      this.done = true;
      completeEpisode(this.data, this.state, this.chapter, this.episode);
    }
    return { type: 'episode_end', chapter: this.chapter, episode: this.episode, title: this.ep.title };
  }

  /** @param {any} st @returns {StoryItem | null} */
  #apply(st) {
    switch (st.t) {
      case 'scene': return { type: 'scene', id: st.id, title: st.title, location: st.location };
      case 'say': case 'act': case 'narr': case 'sys': return lineOf(st);
      case 'explore':
        return {
          type: 'explore', prompt: st.prompt, exit: st.exit,
          options: st.options.map((/** @type {any} */ o) => ({ label: o.label, lines: o.steps.filter((/** @type {any} */ s) => s.t !== 'dir').map(lineOf) })),
        };
      case 'dir': return applyDirective(this.data, this.state, st);
      default: throw new GameDataError(`未対応のシナリオ要素 ${st.t}`);
    }
  }
}

/**
 * 状態を変える命令の適用（表示が必要なものは StoryItem を返す）
 * @param {import('../data/gameData.js').GameData} data
 * @param {import('../types.js').GameState} state
 * @param {{name:string, args:string[]}} st
 * @returns {StoryItem | null}
 */
export function applyDirective(data, state, st) {
  const a = st.args;
  /** @param {string} who */
  const targets = (who) => (who === 'joined' ? [...state.joined] : [who]);
  switch (st.name) {
    case 'battle': return { type: 'battle', id: a[0] };
    case 'join': {
      const ids = a.filter((x) => /^[AB]\d\d$/.test(x));
      const word = a.find((x) => !/^[AB]\d\d$/.test(x)) ?? '戦闘メンバーに加入しました';
      const names = ids.filter((id) => joinCharacter(data, state, id)).map((id) => data.character(id).name);
      return names.length ? { type: 'system', text: names.map((n) => `${n}が${word}！`).join('\n') } : null;
    }
    case 'flag':
      for (const kv of a) {
        const [k, v] = kv.split('=');
        state.flags[k] = v === 'TRUE' ? true : v === 'FALSE' ? false : v;
      }
      return null;
    case 'awaken': {
      const attrs = a[1].split(',');
      awakenUpper(state.progress[a[0]], attrs);
      return { type: 'system', text: `${data.character(a[0]).name}は ${attrs.join('・')}属性に 覚醒した！` };
    }
    case 'affinity': {
      const n = Number(a[1]);
      for (const id of targets(a[0])) {
        const p = state.progress[id];
        if (p) setGrowth(data, p, { guardianAffinity: p.guardianAffinity + n });
      }
      return { type: 'system', text: `守護獣との${data.ui.affinity_label}が ${n} 上がった！（仮の値）` };
    }
    case 'artifact_level': {
      const n = Number(a[1]);
      for (const id of targets(a[0])) {
        const p = state.progress[id];
        if (p) setGrowth(data, p, { artifactLevel: p.artifactLevel + n });
      }
      return { type: 'system', text: `${data.ui.artifact_level_label}が ${n} 上がった！（仮の値）` };
    }
    case 'numbers':
      for (const pair of a[0].split(',')) {
        const [id, num] = pair.split('=');
        state.classNumbers[id] = Number(num);
      }
      return null;
    case 'unlock': return { type: 'unlock', items: a.join(' ').split('、') };
    case 'title': return { type: 'title', text: a.join(' ') };
    case 'fx': return { type: 'fx', kind: a[0] ?? '' };
    default: throw new GameDataError(`未対応のディレクティブ [${st.name}]`);
  }
}

/**
 * 話の終了処理：正式イベントの flags_set（CH2_EPxx_COSPLETE）を立て、次の話へ進める
 * @param {import('../data/gameData.js').GameData} data
 * @param {import('../types.js').GameState} state
 * @param {number} chapter
 * @param {number} episode
 */
export function completeEpisode(data, state, chapter, episode) {
  const ev = data.canonEvent(chapter, episode);
  for (const f of ev?.flags_set ?? []) state.flags[f] = true;
  if (state.story.chapter === chapter && state.story.episode <= episode) state.story.episode = episode + 1;
}

/**
 * 開発者用：指定話の直前まで、戦闘・台詞を飛ばして状態変化だけを適用する
 * （加入・フラグ・覚醒・番号・親和度・神器Lv・戦闘中トリガーによる覚醒/親和度）
 * @param {import('../data/gameData.js').GameData} data
 * @param {import('../types.js').GameState} state
 * @param {number} chapter
 * @param {number} target
 */
export function fastForward(data, state, chapter, target) {
  for (const n of data.episodeNumbers(chapter)) {
    if (n >= target) break;
    if (n < state.story.episode) continue;
    const ep = /** @type {any} */ (data.episode(chapter, n));
    for (const st of flatten(ep)) {
      if (st.t !== 'dir') continue;
      if (st.name === 'battle') {
        for (const tr of data.storyBattle(st.args[0]).triggers ?? []) {
          for (const act of tr.actions ?? []) {
            if (act.awaken) for (const [id, attrs] of Object.entries(act.awaken)) if (state.progress[id]) awakenUpper(state.progress[id], /** @type {string[]} */ (attrs));
            if (act.affinity) for (const [id, v] of Object.entries(act.affinity)) if (state.progress[id]) state.progress[id].guardianAffinity = Math.min(100, state.progress[id].guardianAffinity + /** @type {number} */ (v));
          }
        }
        continue;
      }
      applyDirective(data, state, st);
    }
    completeEpisode(data, state, chapter, n);
  }
}
