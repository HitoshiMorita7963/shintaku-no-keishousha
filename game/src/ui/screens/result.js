// 戦闘結果（経験値・Lvアップ・ドロップ／全滅／ストーリー戦闘の結果）
import { h } from '../dom.js';
import { recoverAfterDefeat } from '../../battle/setup.js';
import { hubScreen } from './hub.js';
import { battleScreen } from './battle.js';

const STORY_LABEL = /** @type {Record<string, string>} */ ({ win: '勝利！', lose: '敗北', draw: '引き分け', continue: '戦闘終了', scripted: '戦闘終了' });

/** @param {any} r @param {Record<string, string>} labels @param {import('../../data/gameData.js').GameData} data */
function rewardsBlock(r, labels, data) {
  const drops = Object.entries(r.drops ?? {});
  return [
    r.exp ? h('p', { text: `それぞれ ${r.exp} ポイントの 経験値を かくとく！` }) : null,
    ...(r.levelUps ?? []).map((/** @type {any} */ lu) => {
      const last = lu.ups[lu.ups.length - 1];
      /** @type {Record<string, number>} */ const sum = {};
      for (const u of lu.ups) for (const [k, v] of Object.entries(u.gains)) sum[k] = (sum[k] ?? 0) + /** @type {number} */ (v);
      return h('div', { class: 'levelup' },
        h('p', {}, h('b', { text: lu.name }), ` は レベル ${last.to} に あがった！`),
        h('p', { class: 'gains', text: Object.entries(sum).map(([k, v]) => `${labels[k]}+${v}`).join('　') }),
      );
    }),
    drops.length ? h('p', { text: `${drops.map(([id, n]) => `${data.item(id).name}×${n}`).join('、')} を 手に入れた！` }) : null,
  ];
}

/** @type {import('../app.js').Screen} */
export function resultScreen(app, root, /** @type {any} */ r) {
  const { data } = app;
  const labels = data.ui.stat_labels;

  // ---- ストーリー戦闘 ----
  if (r.story) {
    const s = r.story;
    if (!s.proceed) {
      recoverAfterDefeat(data, app.gs);
      root.append(h('div', { class: 'screen center' },
        h('div', { class: 'window result-window' },
          h('h1', { class: 'ng', text: '敗北……' }),
          h('p', { text: `「${s.def.name}」に 勝利しないと 物語は 先へ進めない。` }),
          h('div', { class: 'row-buttons' },
            h('button', { class: 'btn', text: 'この話を中断して学園へ', onclick: () => s.onGiveUp() }),
            h('button', { class: 'btn btn-primary', text: 'もう一度戦う', onclick: () => app.go(battleScreen, { story: { battleId: s.battleId, chosen: s.chosen, onDone: s.onDone, onGiveUp: s.onGiveUp } }) }),
          ),
        )));
      /** @type {HTMLButtonElement|null} */ (root.querySelector('.btn-primary'))?.focus();
      return;
    }
    const label = STORY_LABEL[s.storyResult] ?? '戦闘終了';
    root.append(h('div', { class: 'screen center' },
      h('div', { class: 'window result-window' },
        h('p', { class: 'muted small', text: s.def.name }),
        h('h1', { class: s.storyResult === 'win' ? 'ok' : s.storyResult === 'lose' ? 'ng' : '', text: label }),
        s.def.result_mode === 'scripted' && r.result !== 'win' ? h('p', { class: 'muted small', text: '（台本で結果が決まっている戦闘です）' }) : null,
        ...rewardsBlock(r, labels, data),
        h('div', { class: 'row-buttons' },
          h('button', { class: 'btn btn-primary', text: '物語を続ける', onclick: () => s.onDone({ storyResult: s.storyResult, battle: s.def }) }),
        ),
      )));
    /** @type {HTMLButtonElement|null} */ (root.querySelector('.btn-primary'))?.focus();
    return;
  }

  // ---- 訓練戦 ----
  if (r.result !== 'win') {
    recoverAfterDefeat(data, app.gs);
    root.append(h('div', { class: 'screen center' },
      h('div', { class: 'window result-window' },
        h('h1', { class: 'ng', text: '全滅' }),
        h('p', { text: '目の前が 真っ暗になった……' }),
        h('p', { class: 'muted small', text: '（仮仕様：ペナルティなしで学園に戻り、全員全回復）' }),
        h('div', { class: 'row-buttons' },
          h('button', { class: 'btn', text: 'もう一度戦う', onclick: () => app.go(battleScreen, r.encounterId) }),
          h('button', { class: 'btn btn-primary', text: '学園へ戻る', onclick: () => app.go(hubScreen) }),
        ),
      )));
    return;
  }
  root.append(h('div', { class: 'screen center' },
    h('div', { class: 'window result-window' },
      h('h1', { class: 'ok', text: '勝利！' }),
      ...rewardsBlock(r, labels, data),
      h('div', { class: 'row-buttons' },
        h('button', { class: 'btn', text: 'もう一度戦う', onclick: () => app.go(battleScreen, r.encounterId) }),
        h('button', { class: 'btn btn-primary', text: '学園へ戻る', onclick: () => app.go(hubScreen) }),
      ),
    )));
  /** @type {HTMLButtonElement|null} */ (root.querySelector('.btn-primary'))?.focus();
}
