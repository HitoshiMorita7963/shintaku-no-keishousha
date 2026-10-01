// 画面遷移とアプリ全体の状態（ゲームデータ・ゲーム状態・設定）を持つ。
import { clear, h } from './dom.js';

/**
 * @typedef {(app: App, root: HTMLElement, ...args: any[]) => (void | (() => void))} Screen
 * 画面関数。戻り値があれば画面離脱時に呼ばれるクリーンアップ。
 */

export class App {
  /**
   * @param {HTMLElement} root
   * @param {import('../data/gameData.js').GameData} data
   * @param {any} meta ビルド時の検証結果など
   */
  constructor(root, data, meta) {
    this.root = root;
    this.data = data;
    this.meta = meta;
    /** @type {import('../types.js').GameState | null} */
    this.state = null;
    /** @type {(() => void) | null} */
    this.cleanup = null;
    this.settings = { messageSpeed: /** @type {'normal'|'fast'} */ ('normal') };
  }

  /** 現在のゲーム状態（ニューゲーム前に呼ぶとエラー） */
  get gs() {
    if (!this.state) throw new Error('ゲームが開始されていません');
    return this.state;
  }

  /** @param {Screen} screen @param {...any} args */
  go(screen, ...args) {
    if (this.cleanup) { try { this.cleanup(); } catch (e) { console.error(e); } }
    this.cleanup = null;
    clear(this.root);
    window.scrollTo(0, 0);
    try {
      const r = /** @type {any} */ (screen)(this, this.root, ...args);
      if (typeof r === 'function') this.cleanup = r;
    } catch (e) {
      this.fatal(e);
    }
  }

  /** 致命的エラー表示（デバッグしやすいよう内容をそのまま表示） @param {unknown} e */
  fatal(e) {
    console.error(e);
    clear(this.root);
    const err = /** @type {Error} */ (e);
    this.root.append(
      h('div', { class: 'screen center' },
        h('div', { class: 'window error-window' },
          h('h2', { text: 'エラーが発生しました' }),
          h('pre', { class: 'error-text', text: `${err?.name ?? 'Error'}: ${err?.message ?? String(e)}\n\n${err?.stack ?? ''}` }),
          h('button', { class: 'btn', text: 'タイトルへ戻る', onclick: () => location.reload() }),
        ),
      ),
    );
  }
}
