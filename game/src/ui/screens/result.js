// 戦闘結果（経験値・Lvアップ・ドロップ／全滅）
import { h } from '../dom.js';
import { recoverAfterDefeat } from '../../battle/setup.js';
import { hubScreen } from './hub.js';
import { battleScreen } from './battle.js';

/**
 * @type {import('../app.js').Screen}
 */
export function resultScreen(app, root, /** @type {any} */ r) {
  const { data } = app;
  const labels = data.ui.stat_labels;
  if (r.result !== 'win') {
    recoverAfterDefeat(data, app.gs);
    root.append(h('div', { class: 'screen center' },
      h('div', { class: 'window result-window' },
        h('h1', { class: 'ng', text: '全滅' }),
        h('p', { text: '目の前が 真っ暗になった……' }),
        h('p', { class: 'muted small', text: '（Phase 1 仮仕様：ペナルティなしで学園に戻り、全員全回復）' }),
        h('div', { class: 'row-buttons' },
          h('button', { class: 'btn', text: 'もう一度戦う', onclick: () => app.go(battleScreen, r.encounterId) }),
          h('button', { class: 'btn btn-primary', text: '学園へ戻る', onclick: () => app.go(hubScreen) }),
        ),
      )));
    return;
  }
  const drops = Object.entries(r.drops ?? {});
  root.append(h('div', { class: 'screen center' },
    h('div', { class: 'window result-window' },
      h('h1', { class: 'ok', text: '勝利！' }),
      h('p', { text: `それぞれ ${r.exp} ポイントの 経験値を かくとく！` }),
      ...r.levelUps.map((/** @type {any} */ lu) => {
        const last = lu.ups[lu.ups.length - 1];
        /** @type {Record<string, number>} */ const sum = {};
        for (const u of lu.ups) for (const [k, v] of Object.entries(u.gains)) sum[k] = (sum[k] ?? 0) + /** @type {number} */ (v);
        return h('div', { class: 'levelup' },
          h('p', {}, h('b', { text: lu.name }), ` は レベル ${last.to} に あがった！`),
          h('p', { class: 'gains', text: Object.entries(sum).map(([k, v]) => `${labels[k]}+${v}`).join('　') }),
        );
      }),
      drops.length ? h('p', { text: `${drops.map(([id, n]) => `${data.item(id).name}×${n}`).join('、')} を 手に入れた！` }) : null,
      h('div', { class: 'row-buttons' },
        h('button', { class: 'btn', text: 'もう一度戦う', onclick: () => app.go(battleScreen, r.encounterId) }),
        h('button', { class: 'btn btn-primary', text: '学園へ戻る', onclick: () => app.go(hubScreen) }),
      ),
    )));
  /** @type {HTMLButtonElement|null} */ (root.querySelector('.btn-primary'))?.focus();
}
