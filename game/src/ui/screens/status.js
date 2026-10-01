// ステータス画面（パーティ＋A組全員）
import { h, clear } from '../dom.js';
import { characterDetail } from '../components.js';
import { hubScreen } from './hub.js';

/** @type {import('../app.js').Screen} */
export function statusScreen(app, root) {
  const { data } = app;
  const gs = app.gs;
  const ids = [...gs.party, ...Object.keys(gs.progress).filter((id) => !gs.party.includes(id)).sort()];
  let current = ids[0];
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  const body = h('div', { class: 'window' });

  const render = () => {
    clear(tabs);
    for (const id of ids) {
      tabs.append(h('button', {
        class: `tab${id === current ? ' is-active' : ''}${gs.party.includes(id) ? ' in-party' : ''}`,
        role: 'tab', 'aria-selected': id === current ? 'true' : 'false',
        text: data.character(id).name, onclick: () => { current = id; render(); },
      }));
    }
    clear(body);
    body.append(characterDetail(data, data.character(current), gs.progress[current]));
  };

  root.append(
    h('div', { class: 'screen' },
      h('header', { class: 'screen-head' },
        h('h1', { text: 'ステータス' }),
        h('button', { class: 'btn btn-ghost', text: '戻る', onclick: () => app.go(hubScreen) }),
      ),
      tabs, body,
    ),
  );
  render();
}
