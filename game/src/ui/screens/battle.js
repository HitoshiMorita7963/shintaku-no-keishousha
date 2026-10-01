// 戦闘画面。BattleEngine（UI非依存）を駆動し、返ってくるイベントを順に再生する。
import { h, clear, gauge, attrChip, sleep, enableArrowNav } from '../dom.js';
import { targetLabel } from '../components.js';
import { BattleEngine } from '../../battle/engine.js';
import { createBattle, applyBattleResult } from '../../battle/setup.js';
import { decideEnemyAction } from '../../battle/ai.js';
import { attributeMultiplier } from '../../battle/formulas.js';
import { Rng } from '../../core/rng.js';
import { resultScreen } from './result.js';

/** @typedef {import('../../battle/unit.js').BattleUnit} BattleUnit */
/** @typedef {import('../../battle/commands.js').CommandOption} CommandOption */

const DELAY = { normal: 650, fast: 220 };

/** @type {import('../app.js').Screen} */
export function battleScreen(app, root, encounterId) {
  const { data } = app;
  const engine = createBattle(data, app.gs, encounterId, new Rng());
  const enc = data.encounter(encounterId);
  let aborted = false;

  // ---------- 表示用状態（イベント再生に合わせて少しずつ更新する） ----------
  /** @type {Map<string, {hp:number, sp:number}>} */
  const shown = new Map(engine.units.map((u) => [u.uid, { hp: u.hp, sp: u.sp }]));
  /** @type {string|null} */ let activeUid = null;
  /** @type {Set<string>} */ let targetable = new Set();
  /** @type {((uid:string)=>void)|null} */ let onPickTarget = null;
  /** @type {(() => void) | null} */ let skipWait = null;

  // ---------- DOM ----------
  const turnLabel = h('span', { class: 'turn-label', text: '' });
  const orderBar = h('div', { class: 'order-bar', 'aria-label': '行動順' });
  const speedBtn = h('button', { class: 'btn btn-small btn-ghost', text: '', onclick: () => toggleSpeed() });
  const enemyArea = h('div', { class: 'enemy-area' });
  const partyArea = h('div', { class: 'party-area' });
  const msgLines = h('div', { class: 'msg-lines' });
  const msgWin = h('div', { class: 'window msg-window', 'aria-live': 'polite', onclick: () => skipWait?.() }, msgLines);
  const cmdArea = h('div', { class: 'window cmd-area' });
  enableArrowNav(cmdArea);

  root.append(
    h('div', { class: 'screen battle', 'data-map': enc.map_id ?? '' },
      h('div', { class: 'battle-top' }, h('span', { class: 'enc-name', text: enc.name }), turnLabel, speedBtn),
      orderBar, enemyArea, msgWin, partyArea, cmdArea,
    ),
  );

  const toggleSpeed = () => {
    app.settings.messageSpeed = app.settings.messageSpeed === 'normal' ? 'fast' : 'normal';
    speedBtn.textContent = app.settings.messageSpeed === 'normal' ? '速度：通常' : '速度：速い';
  };
  speedBtn.textContent = app.settings.messageSpeed === 'normal' ? '速度：通常' : '速度：速い';

  // ---------- 描画 ----------
  /** @param {BattleUnit} u */
  const badges = (u) => {
    const out = [];
    if (u.guardian?.released) out.push(h('span', { class: 'badge badge-guardian', title: `${u.guardian.def.name} 解放中`, text: '獣' }));
    if (u.guarding !== null) out.push(h('span', { class: 'badge badge-guard', text: '防' }));
    if (u.bindTurns > 0) out.push(h('span', { class: 'badge badge-bad', text: '縛' }));
    if (u.phaseIndex >= 0) out.push(h('span', { class: 'badge badge-bad', text: u.enemyDef?.phases[u.phaseIndex]?.name ?? '変' }));
    const up = u.buffs.some((b) => b.amount > 0);
    const down = u.buffs.some((b) => b.amount < 0);
    if (up) out.push(h('span', { class: 'badge badge-up', text: '▲' }));
    if (down) out.push(h('span', { class: 'badge badge-down', text: '▼' }));
    return out;
  };

  /** @param {BattleUnit} u */
  const unitCard = (u) => {
    const s = /** @type {{hp:number, sp:number}} */ (shown.get(u.uid));
    const isTarget = targetable.has(u.uid);
    const dead = s.hp <= 0;
    const cls = ['unit-card', u.side, dead ? 'is-dead' : '', u.uid === activeUid ? 'is-active' : '', isTarget ? 'is-targetable' : ''].filter(Boolean).join(' ');
    const card = h(isTarget ? 'button' : 'div', {
      class: cls, 'data-uid': u.uid,
      onclick: isTarget ? () => onPickTarget?.(u.uid) : undefined,
      'aria-label': isTarget ? `${u.name}を選ぶ` : undefined,
    },
      h('div', { class: 'unit-name' }, h('span', { class: 'nm', text: u.name }), h('span', { class: 'lv', text: `Lv${u.level}` })),
      u.side === 'party'
        ? [gauge('hp', s.hp, u.maxHp), gauge('sp', s.sp, u.maxSp)]
        : [gauge('hp', s.hp, u.maxHp, false)],
      h('div', { class: 'badges' }, badges(u)),
    );
    return card;
  };

  const renderUnits = () => {
    clear(enemyArea);
    for (const u of engine.enemies) enemyArea.append(unitCard(u));
    clear(partyArea);
    for (const u of engine.party) partyArea.append(unitCard(u));
  };

  const renderOrder = () => {
    clear(orderBar);
    turnLabel.textContent = `ターン ${engine.turn}`;
    for (const u of engine.order) {
      orderBar.append(h('span', {
        class: `order-chip ${u.side}${u.uid === activeUid ? ' is-active' : ''}${!u.alive ? ' is-dead' : ''}${engine.queue.includes(u) || u.uid === activeUid ? '' : ' is-done'}`,
        text: u.name.replace(/\s.*/, ''),
      }));
    }
  };

  /** @param {string} uid @param {string} cls */
  const flash = (uid, cls) => {
    const el = root.querySelector(`[data-uid="${uid}"]`);
    if (!el) return;
    el.classList.remove(cls);
    void (/** @type {HTMLElement} */ (el).offsetWidth);
    el.classList.add(cls);
  };

  /** @param {string} text */
  const pushMessage = (text) => {
    msgLines.append(h('p', { text }));
    while (msgLines.childElementCount > 4) msgLines.firstChild?.remove();
  };

  const wait = (/** @type {number} */ ms) => new Promise((resolve) => {
    const t = setTimeout(done, ms);
    function done() { clearTimeout(t); skipWait = null; resolve(undefined); }
    skipWait = done;
  });

  /** イベント列を順に再生 @param {import('../../types.js').BattleEvent[]} events */
  const play = async (events) => {
    for (const e of events) {
      if (aborted) return;
      if (e.type === 'turn_start') { renderOrder(); continue; }
      if (e.type === 'action' && e.unitId) { activeUid = e.unitId; renderOrder(); }
      const s = e.targetId ? shown.get(e.targetId) : e.unitId ? shown.get(e.unitId) : undefined;
      if (e.type === 'damage' && s && typeof e.hp === 'number') s.hp = e.hp;
      if ((e.type === 'heal' || e.type === 'revive') && s && typeof e.hp === 'number') s.hp = e.hp;
      if (e.type === 'sp' && typeof e.sp === 'number') {
        const t = shown.get(/** @type {string} */ (e.targetId ?? e.unitId));
        if (t) t.sp = e.sp;
      }
      renderUnits();
      if (e.type === 'damage' && e.targetId) flash(e.targetId, e.crit ? 'fx-crit' : 'fx-hit');
      if ((e.type === 'heal' || e.type === 'revive') && e.targetId) flash(e.targetId, 'fx-heal');
      if (e.type === 'release' && e.unitId) flash(e.unitId, 'fx-release');
      if (e.text) {
        pushMessage(e.text);
        await wait(DELAY[app.settings.messageSpeed]);
      }
    }
    // 最終状態に同期（表示ずれ防止）
    for (const u of engine.units) shown.set(u.uid, { hp: u.hp, sp: u.sp });
    renderUnits();
  };

  // ---------- コマンド入力 ----------
  /**
   * 味方1人分の行動を選ばせる
   * @param {BattleUnit} u
   * @returns {Promise<import('../../types.js').BattleAction>}
   */
  const chooseAction = (u) => new Promise((resolve) => {
    /** @type {(() => void) | null} */ let back = null;
    const onKey = (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Escape' && back) { e.preventDefault(); back(); } };
    document.addEventListener('keydown', onKey);
    /** @param {import('../../types.js').BattleAction} a */
    const finish = (a) => {
      document.removeEventListener('keydown', onKey);
      targetable = new Set(); onPickTarget = null;
      clear(cmdArea);
      cmdArea.append(h('p', { class: 'muted', text: '…' }));
      resolve(a);
    };

    const showCommands = () => {
      back = null;
      targetable = new Set(); onPickTarget = null; renderUnits();
      clear(cmdArea);
      cmdArea.dataset.cols = '4';
      cmdArea.append(
        h('div', { class: 'cmd-title' }, h('b', { text: u.name }), ' の行動',
          u.guardian?.released ? h('span', { class: 'badge badge-guardian', text: `${u.guardian.def.name}解放中` }) : null),
        h('div', { class: 'cmd-grid' }, data.rules.commands.map((/** @type {{id:string,label:string}} */ c) =>
          h('button', { class: 'btn btn-cmd', 'data-cmd': c.id, text: c.label, onclick: () => onCommand(c.id) }))),
      );
      /** @type {HTMLButtonElement|null} */ (cmdArea.querySelector('.btn-cmd'))?.focus();
    };

    /** @param {string} cmd */
    const onCommand = (cmd) => {
      if (cmd === 'guard') return finish({ command: 'guard', skillId: 'SKL_GUARD', targetIds: [] });
      if (cmd === 'attack') {
        const o = engine.options(u, 'attack')[0];
        return chooseTarget(o, 'attack', showCommands);
      }
      showOptions(cmd);
    };

    /** @param {string} cmd @param {string} [filter] */
    const showOptions = (cmd, filter = '全') => {
      back = showCommands;
      targetable = new Set(); onPickTarget = null; renderUnits();
      const label = data.rules.commands.find((/** @type {any} */ c) => c.id === cmd)?.label ?? cmd;
      let opts = engine.options(u, cmd);
      clear(cmdArea);
      cmdArea.dataset.cols = '1';
      const head = h('div', { class: 'cmd-title' },
        h('button', { class: 'btn btn-small btn-ghost', text: '◀ 戻る', onclick: showCommands }),
        h('b', { text: ` ${label}` }), h('span', { class: 'muted small', text: `　SP ${u.sp}/${u.maxSp}` }));
      cmdArea.append(head);

      if (cmd === 'tengeki') {
        const attrs = ['全', ...new Set(opts.map((o) => /** @type {string} */ (o.skill?.attribute)))];
        cmdArea.append(h('div', { class: 'filter-row' }, attrs.map((a) =>
          h('button', { class: `chip-btn${a === filter ? ' is-on' : ''}`, 'data-attr': a === '全' ? undefined : a, text: a, onclick: () => showOptions(cmd, a) }))));
        if (filter !== '全') opts = opts.filter((o) => o.skill?.attribute === filter);
      }
      if (!opts.length) {
        cmdArea.append(h('p', { class: 'muted', text: cmd === 'item' ? '使えるアイテムがない。' : '使える技がない。' }));
        return;
      }
      const list = h('div', { class: 'opt-list' }, opts.map((o) => optionRow(o, cmd)));
      cmdArea.append(list);
      /** @type {HTMLButtonElement|null} */ (list.querySelector('button:not([disabled])'))?.focus();
    };

    /** @param {CommandOption} o @param {string} cmd */
    const optionRow = (o, cmd) => {
      const s = o.skill;
      let mult = '';
      if (s && s.attribute) {
        const m = attributeMultiplier(data.rules, u, /** @type {any} */ ({ immuneAttributes: [] }), s);
        if (m.total > 1.0001) mult = `補正×${m.total.toFixed(2)}`;
      }
      return h('button', {
        class: `opt-row${o.usable ? '' : ' is-locked'}`, disabled: !o.usable,
        onclick: () => {
          if (o.kind === 'release') return finish({ command: 'guardian', special: 'release', targetIds: [] });
          chooseTarget(o, cmd, () => showOptions(cmd));
        },
      },
        h('span', { class: 'opt-main' },
          s ? attrChip(s.attribute) : null,
          h('span', { class: 'opt-name', text: o.name }),
          o.kind === 'item' ? h('span', { class: 'opt-count', text: `×${o.count}` }) : null,
          o.spCost ? h('span', { class: 'opt-sp', text: `SP${o.spCost}` }) : null,
        ),
        h('span', { class: 'opt-sub' },
          h('span', { text: targetLabel(o.target) }),
          s && s.power ? h('span', { text: `威力${s.power}` }) : null,
          mult ? h('span', { class: 'opt-mult', text: mult }) : null,
          o.note ? h('span', { text: o.note }) : null,
          s?.provisional ? h('span', { class: 'opt-prov', text: '仮' }) : null,
          o.reason ? h('span', { class: 'opt-reason', text: o.reason }) : null,
        ),
        h('span', { class: 'opt-desc', text: o.item?.description ?? s?.description ?? '' }),
      );
    };

    /** @param {CommandOption} o @param {string} cmd @param {() => void} goBack */
    const chooseTarget = (o, cmd, goBack) => {
      /** @type {import('../../types.js').BattleAction} */
      const base = o.kind === 'item' ? { command: 'item', itemId: o.id, targetIds: [] } : { command: cmd, skillId: o.id, targetIds: [] };
      if (!BattleEngine.needsTargetChoice(o.target)) return finish(base);
      const cands = engine.targetCandidates(u, o.target);
      if (!cands.length) { pushMessage('対象がいない。'); return; }
      back = goBack;
      targetable = new Set(cands.map((c) => c.uid));
      onPickTarget = (uid) => finish({ ...base, targetIds: [uid] });
      renderUnits();
      clear(cmdArea);
      cmdArea.dataset.cols = '2';
      cmdArea.append(
        h('div', { class: 'cmd-title' },
          h('button', { class: 'btn btn-small btn-ghost', text: '◀ 戻る', onclick: goBack }),
          h('b', { text: ` ${o.name}` }), h('span', { class: 'muted small', text: '　対象を選んでください' })),
        h('div', { class: 'target-grid' }, cands.map((c) =>
          h('button', { class: 'btn btn-target', text: c.name, onclick: () => finish({ ...base, targetIds: [c.uid] }) }))),
      );
      /** @type {HTMLButtonElement|null} */ (cmdArea.querySelector('.btn-target'))?.focus();
    };

    showCommands();
  });

  // ---------- 戦闘ループ ----------
  const loop = async () => {
    renderUnits();
    cmdArea.append(h('p', { class: 'muted', text: '…' }));
    await play(engine.start());
    while (!aborted && !engine.outcome()) {
      await play(engine.beginTurn());
      for (;;) {
        if (aborted) return;
        const { unit, events } = engine.nextActor();
        await play(events);
        if (!unit) break;
        activeUid = unit.uid;
        renderOrder(); renderUnits();
        const action = unit.side === 'party' ? await chooseAction(unit) : decideEnemyAction(engine, unit);
        if (unit.side === 'enemy') await wait(DELAY[app.settings.messageSpeed] / 2);
        await play(engine.perform(unit, action));
        activeUid = null;
        if (engine.outcome()) break;
      }
      if (!engine.result) await play(engine.endTurn());
    }
    if (aborted) return;
    clear(cmdArea);
    pushMessage(engine.result === 'win' ? '敵を すべて たおした！' : '全滅してしまった…');
    await wait(DELAY[app.settings.messageSpeed] * 2);
    const res = applyBattleResult(data, app.gs, engine);
    app.go(resultScreen, { result: engine.result, encounterId, ...res });
  };
  loop().catch((e) => app.fatal(e));

  return () => { aborted = true; skipWait?.(); };
}
