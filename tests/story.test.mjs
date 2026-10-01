// ストーリー（第2章 第1～31話）のテスト。台本どおりの加入・覚醒・番号・フラグ・戦闘結果になるかを通しで確認する。
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './helpers.mjs';
import { Rng } from '../game/src/core/rng.js';
import { newStoryGame } from '../game/src/model/gameState.js';
import { StoryRunner, fastForward } from '../game/src/story/runner.js';
import { createStoryBattle, applyBattleResult, storyOutcome } from '../game/src/battle/setup.js';
import { decideEnemyAction, decideAutoPartyAction } from '../game/src/battle/ai.js';

const { data } = load();

/** ストーリー戦闘を自動で最後まで進める */
function autoBattle(state, battleId, seed) {
  const { engine, def } = createStoryBattle(data, state, battleId, new Rng(seed));
  engine.start();
  while (!engine.outcome() && engine.turn < 60) {
    engine.beginTurn();
    engine.evaluateTriggers();
    for (;;) {
      if (engine.outcome()) break;
      const { unit } = engine.nextActor();
      if (!unit) break;
      const a = unit.side === 'party' || !unit.enemyDef ? decideAutoPartyAction(engine, unit) : decideEnemyAction(engine, unit);
      engine.perform(unit, a);
      engine.evaluateTriggers();
    }
    if (!engine.outcome()) { engine.endTurn(); engine.checkTurnLimit(); }
  }
  applyBattleResult(data, state, engine);
  return { ...storyOutcome(def, engine), engine, def };
}

/** 1話を最後まで再生（戦闘は自動・必須勝利は勝つまで再戦） */
function playEpisode(state, n, stats) {
  const runner = new StoryRunner(data, state, 2, n);
  for (let guard = 0; guard < 5000; guard++) {
    const item = runner.next();
    if (item.type === 'episode_end') return;
    if (item.type !== 'battle') continue;
    let tries = 0;
    for (;;) {
      tries++;
      const r = autoBattle(state, item.id, n * 1000 + tries);
      if (r.proceed) { stats.push({ id: item.id, tries, result: r.storyResult }); break; }
      assert.ok(tries < 40, `${item.id}: 自動戦闘で40回勝てません（バランス要確認）`);
    }
  }
  assert.fail(`第${n}話が終わりません`);
}

test('第2章 第1～31話を通しでプレイできる（自動戦闘）', () => {
  const state = newStoryGame(data);
  const stats = [];
  for (const n of data.episodeNumbers(2)) {
    assert.equal(state.story.episode, n, '話の順番');
    playEpisode(state, n, stats);
    assert.equal(state.flags[`CH2_EP${String(n).padStart(2, '0')}_COSPLETE`], true, `第${n}話の完了フラグ`);
    if (n === 1) assert.deepEqual(state.joined, ['A01'], '第1話では龍一郎のみ');
    if (n === 2) assert.ok(state.joined.includes('A02'), '第2話で実幸が加入');
    if (n === 20) {
      assert.ok(!state.joined.includes('A14') && !state.joined.includes('A15'), '将真・優輝は第21話まで未加入');
    }
    if (n === 21) {
      assert.equal(state.joined.length, 15, '確定進行ルール：第21話終了時点でA組15人全員が戦闘可能');
      assert.equal(state.flags.FIVE_DEMONS_DEFEATED, true);
      assert.equal(state.flags.ALL_15_JOINED, true);
      assert.equal(state.flags.DEMON_MYSTERY, 'ACTIVE');
      assert.deepEqual([...state.progress.A05.awakenedUpper].sort(), ['冥', '嵐', '木', '氷', '焔', '聖', '霆'].sort(), '咲は上位属性に覚醒');
      assert.deepEqual(state.progress.A08.awakenedUpper, ['冥'], '神楽は冥');
    }
  }
  assert.equal(state.flags.MASAMA_INTEREST, true, '第13話のフラグ');
  assert.deepEqual(state.progress.A07.awakenedUpper, ['嵐'], '駆流美は第23話で嵐');
  assert.deepEqual(state.progress.A01.awakenedUpper, ['嵐'], '龍一郎は第23話の戦闘中に嵐属性・解放');
  // 第25話 25-03 の正式No.
  assert.deepEqual(state.classNumbers, { A01: 1, A15: 2, A11: 3, A05: 4, A02: 5, A04: 6, A07: 7, A13: 8, A14: 9, A09: 10, A03: 11, A06: 12, A08: 13, A12: 14, A10: 15 });
  // 交流戦の結果は正式データどおり（戦闘の実際の勝敗に関係なく台本の結果）
  const ex = data.events.get('CH2_B_EXCHANGE_RESULTS');
  for (const m of ex.matches) {
    const b = Object.values(data.scenario.battles).find((x) => x.exchange?.a === m.a);
    const s = stats.find((x) => x.id === b.id);
    assert.equal(s.result, m.winner === 'A' ? 'win' : m.winner === 'B' ? 'lose' : 'draw', `${b.id}`);
  }
  assert.equal(state.story.episode, 32);
  const retries = stats.filter((s) => s.tries > 1).map((s) => `${s.id}×${s.tries}`);
  console.log(`  ストーリー戦闘 ${stats.length}回、再戦が必要だった戦闘: ${retries.join(' ') || 'なし'}`);
});

test('第2話：初戦闘はコマンド制限があり、神器覚醒イベントで解除される', () => {
  const state = newStoryGame(data);
  fastForward(data, state, 2, 2);
  const { engine } = createStoryBattle(data, state, 'EP02_B1', new Rng(1));
  const ryu = engine.party.find((u) => u.refId === 'A01');
  assert.deepEqual(ryu.allowedCommands, ['attack', 'guard']);
  assert.throws(() => engine.perform(ryu, { command: 'tengeki', skillId: 'TEN_風_01', targetIds: [] }), /まだ使えません/);
  engine.start();
  engine.turn = 3;
  const fired = engine.evaluateTriggers().map((f) => f.id);
  assert.deepEqual(fired, ['T1', 'T2'], 'T2 は T1 の後');
  assert.equal(ryu.allowedCommands, null);
});

test('第20話：優輝には勝てず、規定ターンで台本どおり敗北として進行', () => {
  const state = newStoryGame(data);
  fastForward(data, state, 2, 20);
  const r = autoBattle(state, 'EP20_B1', 7);
  const yuuki = r.engine.enemies[0];
  assert.ok(yuuki.hp >= yuuki.minHp && yuuki.minHp > 0);
  assert.equal(r.proceed, true);
  assert.equal(r.storyResult, 'lose');
});

test('第21話：5VS5は悪魔を撃破できず、規定ターンで分断イベントへ', () => {
  const state = newStoryGame(data);
  fastForward(data, state, 2, 21);
  const r = autoBattle(state, 'EP21_B1', 3);
  assert.ok(r.engine.enemies.every((e) => e.alive), '撃破できない');
  assert.equal(r.storyResult, 'continue');
});

test('第27話：黒龍 VS 白龍は引き分け', () => {
  const state = newStoryGame(data);
  fastForward(data, state, 2, 27);
  const r = autoBattle(state, 'EP27_B1', 5);
  assert.equal(r.storyResult, 'draw');
});

test('話の飛ばし（開発者用）：第22話直前で15人加入・咲の覚醒済み', () => {
  const state = newStoryGame(data);
  fastForward(data, state, 2, 22);
  assert.equal(state.joined.length, 15);
  assert.equal(state.story.episode, 22);
  assert.equal(state.progress.A05.awakenedUpper.length, 7);
  assert.equal(state.flags.INFIRMARY_UNLOCKED, true);
});

test('B組は戦闘加入できない（指定戦闘でのみ相手・操作対象）', async () => {
  const { joinCharacter } = await import('../game/src/model/gameState.js');
  const state = newStoryGame(data);
  assert.throws(() => joinCharacter(data, state, 'B01'), /A組のみ/);
  const ex = Object.values(data.scenario.battles).filter((b) => b.exchange);
  assert.equal(ex.length, 15);
  for (const b of ex) assert.equal(data.character(b.opponents[0].character).class, 'B');
});
