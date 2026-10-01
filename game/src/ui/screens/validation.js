// データ検証結果の表示（ビルド時の検証＋ブラウザ上での再検証）
import { h } from '../dom.js';
import { validateData } from '../../data/validate.js';

/** @type {import('../app.js').Screen} */
export function validationScreen(app, root, back) {
  const bundle = /** @type {any} */ (window).SHINKAN_DATA;
  const live = validateData({ canon: bundle.canon, provisional: bundle.provisional, confirmed: bundle.confirmed });
  const build = app.meta?.validation;

  root.append(
    h('div', { class: 'screen' },
      h('header', { class: 'screen-head' },
        h('h1', { text: 'データ検証' }),
        h('button', { class: 'btn btn-ghost', text: '戻る', onclick: () => app.go(back) }),
      ),
      h('section', { class: 'window' },
        h('h2', {}, 'ブラウザ上の再検証：', h('span', { class: live.ok ? 'ok' : 'ng', text: live.ok ? 'PASS' : 'FAIL' })),
        h('ul', { class: 'kv-list' }, Object.entries(live.info).map(([k, v]) => h('li', {}, h('span', { text: k }), h('b', { text: v })))),
        live.errors.length ? h('ul', { class: 'err-list' }, live.errors.map((e) => h('li', { text: e }))) : null,
        h('p', { class: 'muted small', text: `ビルド日時 ${app.meta?.built_at ?? '-'}。原本ロックとのファイル照合はビルド時（npm run validate）に実施済み：${build?.ok ? 'PASS' : '不明'}` }),
      ),
      h('section', { class: 'window' },
        h('h2', { text: `資料間の矛盾・要確認（${live.warnings.length}件）` }),
        h('ul', { class: 'warn-list' }, live.warnings.map((w) => h('li', { text: w }))),
        h('p', { class: 'muted small', text: 'Markdown一覧との突き合わせは npm run validate で確認できます。詳細は docs/01_開発開始レポート.md。' }),
      ),
    ),
  );
}
