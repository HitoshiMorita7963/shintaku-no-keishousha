// 戦闘システムのテスト（7コマンド・SP管理・属性・守護獣・神器・敵AI・勝敗・報酬）
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './helpers.mjs';
import { Rng } from '../game/src/core/rng.js';
import { newGame, setGrowth } from '../game/src/model/gameState.js';
import { createBattle, applyBattleResult } from '../game/src/battle/setup.js';
import { createPartyUnit, createEnemyUnit } from '../game/src/battle/unit.js';
import { attributeMultiplier, rollDamage } from '../game/src/battle/formulas.js';
import { decideEnemyAction, decideAutoPartyAction } from '../game/src/battle/ai.js';
import { COMBAT_STAT_KEYS } from '../game/src/core/constants.js';

const { data } = load();

/** @param {string[]} party @param {string} enc @param {number} seed @param {{level?:number, artifactLevel?:number, guardianAffinity?:number, upperAwakened?:boolean}} [g] */
function setup(party, enc = 'ENC_TRAIN_SOLDIERS', seed = 1, g = {}) {
  const gs = newGame(data, party);
  for (const id of party) setGrowth(data, gs.progress[id], g);
  const engine = createBattle(data, gs, enc, new Rng(seed));
  return { gs, engine };
}

/** 戦闘を最後まで自動で進める */
function autoplay(engine, maxTurns = 80) {
  engine.start();
  while (!engine.outcome() && engine.turn < maxTurns) {
    engine.beginTurn();
    for (;;) {
      const { unit } = engine.nextActor();
      if (!unit) break;
      const a = unit.side === 'party' ? decideAutoPartyAction(engine, unit) : decideEnemyAction(engine, unit);
      engine.perform(unit, a);
      for (const u of engine.units) {
        assert.ok(u.hp >= 0 && u.hp <= u.maxHp, `${u.name} HP範囲外 ${u.hp}`);
        assert.ok(u.sp >= 0 && u.sp <= u.maxSp, `${u.name} SP範囲外 ${u.sp}`);
      }
      if (engine.outcome()) break;
    }
    engine.endTurn();
  }
}

test('7コマンドが資料通りの順で定義されている', () => {
  assert.deepEqual(data.rules.commands.map((c) => c.label), ['攻撃', '神技', '天撃', '神器', '守護獣', 'アイテム', '防御']);
});

test('行動順：素早さ順（乱数込み）で全生存ユニットが1回ずつ', () => {
  const { engine } = setup(['A01', 'A02', 'A04']);
  engine.start();
  const ev = engine.beginTurn();
  assert.equal(ev[0].type, 'turn_start');
  assert.equal(engine.order.length, 6);
  assert.equal(new Set(engine.order).size, 6);
});

test('天撃はSPを消費し、SP不足だと使えない（MPではなくSP）', () => {
  const { engine } = setup(['A15']);
  const u = engine.party[0];
  const fire = engine.options(u, 'tengeki').find((o) => o.id === 'TEN_雷_01');
  assert.ok(fire && fire.usable);
  const sp0 = u.sp;
  engine.perform(u, { command: 'tengeki', skillId: 'TEN_雷_01', targetIds: [engine.enemies[0].uid] });
  assert.equal(u.sp, sp0 - fire.spCost);
  u.sp = 0;
  const o = engine.options(u, 'tengeki').find((x) => x.id === 'TEN_雷_01');
  assert.equal(o.usable, false);
  assert.equal(o.reason, 'SPが足りない');
  assert.throws(() => engine.perform(u, { command: 'tengeki', skillId: 'TEN_雷_01', targetIds: [] }));
});

test('同族性：天撃属性＝神器属性×1.5、＝守護獣属性×1.5、両方×2.25（07_戦闘システム/01）', () => {
  const gs = newGame(data, ['A15', 'A01', 'A04']);
  const dummy = { immuneAttributes: [] };
  const a15 = createPartyUnit(data, gs.progress.A15); // 神器 雷 / 守護獣 雷
  const a01 = createPartyUnit(data, gs.progress.A01); // 神器 風 / 守護獣 闇
  const a04 = createPartyUnit(data, gs.progress.A04); // 神器 雷 / 守護獣 光
  const sk = (id) => data.skill(id);
  assert.equal(attributeMultiplier(data.rules, a15, dummy, sk('TEN_雷_01')).parts.sameKind, 2.25);
  assert.equal(attributeMultiplier(data.rules, a01, dummy, sk('TEN_風_01')).parts.sameKind, 1.5);
  assert.equal(attributeMultiplier(data.rules, a01, dummy, sk('TEN_闇_01')).parts.sameKind, 1.5);
  assert.equal(attributeMultiplier(data.rules, a01, dummy, sk('TEN_火_01')).parts.sameKind, 1);
  assert.equal(attributeMultiplier(data.rules, a04, dummy, sk('TEN_光_01')).parts.sameKind, 1.5);
  // 同族性は天撃のみ（神器固有技には適用しない）
  assert.equal(attributeMultiplier(data.rules, a15, dummy, sk('ARTSK_A15_05')).parts.sameKind, 1);
});

test('天撃の使用条件：全キャラ全属性の基本天撃を使用可、不一致属性は同族性補正なし（ユーザー確認済み）', () => {
  const dummy = { immuneAttributes: [] };
  for (const c of data.charactersOfClass('A')) {
    const { engine } = setup([c.id]);
    const u = engine.party[0];
    const basic = engine.options(u, 'tengeki').filter((o) => !o.skill.upper);
    assert.equal(basic.length, 35, c.id);
    assert.ok(basic.every((o) => o.usable), c.id);
    const own = [data.artifactOf(c.id).attribute, data.guardianOf(c.id).attribute];
    for (const o of basic) {
      const m = attributeMultiplier(data.rules, u, dummy, o.skill);
      if (!own.includes(o.skill.attribute)) assert.equal(m.parts.sameKind, 1, `${c.id} ${o.name}`);
      else assert.ok(m.parts.sameKind >= 1.5, `${c.id} ${o.name}`);
    }
  }
});

test('染川咲（A05）だけ属性不一致の天撃ダメージ×1.2（ユーザー確認済み）', () => {
  const gs = newGame(data, ['A05', 'A01']);
  const dummy = { immuneAttributes: [] };
  const a05 = createPartyUnit(data, gs.progress.A05); // 神器 光 / 守護獣 水
  const a01 = createPartyUnit(data, gs.progress.A01);
  const total = (u, id) => attributeMultiplier(data.rules, u, dummy, data.skill(id)).total;
  assert.equal(total(a05, 'TEN_火_01'), 1.2);              // 不一致属性：補正1.2のみ
  assert.equal(total(a05, 'TEN_光_01'), 1.5);              // 属性一致：同族1.5のみ（×1.2は掛からない）
  assert.equal(total(a05, 'TEN_水_01'), 1.5);              // 守護獣属性一致も同様
  assert.equal(total(a01, 'TEN_火_01'), 1);                // 他キャラは不一致なら補正なし
  assert.equal(total(a05, 'ARTSK_A05_01'), 1);             // 天撃以外には掛からない
  for (const c of data.characters.values()) if (c.id !== 'A05') assert.equal(data.characterTraits[c.id], undefined);
});

test('上位属性天撃は一致属性のみ・覚醒前は使用不可、覚醒後は使用可', () => {
  const { engine } = setup(['A01']);
  const u = engine.party[0];
  const upper = () => engine.options(u, 'tengeki').filter((o) => o.skill.upper);
  assert.deepEqual([...new Set(upper().map((o) => o.skill.attribute))].sort(), ['冥', '嵐'].sort());
  assert.ok(upper().every((o) => !o.usable && o.reason === '上位属性が未覚醒'));
  u.upperAwakened = true;
  assert.ok(upper().every((o) => o.usable));
  assert.equal(engine.options(u, 'tengeki').length, 45); // 基本35＋自分の属性に対応する上位10（上位の範囲は台本待ちの仮）
});

test('神器固有技：神器Lv1では未解放、データの解放Lvに達すると使用可', () => {
  const { engine } = setup(['A01']);
  const u = engine.party[0];
  assert.ok(engine.options(u, 'artifact').every((o) => !o.usable));
  const e2 = setup(['A01'], 'ENC_TRAIN_SOLDIERS', 1, { artifactLevel: 10 }).engine;
  const usable = e2.options(e2.party[0], 'artifact').filter((o) => o.usable).map((o) => o.id);
  const expected = data.artifactSkillsOf('A01').filter((s) => s.unlockArtifactLevel <= 10).map((s) => s.id);
  assert.deepEqual(usable.sort(), expected.sort());
});

test('守護獣：解放でSP消費、HP/SP以外が1.5倍（親和度0%）、固有技は解放後のみ', () => {
  const { engine } = setup(['A01']);
  const u = engine.party[0];
  const before = Object.fromEntries(COMBAT_STAT_KEYS.map((k) => [k, u.stat(k)]));
  const hp0 = u.maxHp;
  const opt = engine.options(u, 'guardian');
  assert.equal(opt[0].kind, 'release');
  const sp0 = u.sp;
  engine.perform(u, { command: 'guardian', special: 'release', targetIds: [] });
  assert.equal(u.sp, sp0 - opt[0].spCost);
  assert.equal(u.guardian.released, true);
  assert.equal(u.maxHp, hp0);
  for (const k of COMBAT_STAT_KEYS) {
    const expected = Math.floor(u.base[k] * 1.5) + (u.artifact.bonus[k] ?? 0);
    assert.equal(u.stat(k), Math.max(1, expected), k);
    assert.ok(u.stat(k) >= before[k]);
  }
  const gopts = engine.options(u, 'guardian');
  assert.equal(gopts.length, 5);
  assert.deepEqual(gopts.filter((o) => o.usable).map((o) => o.id), ['GUA_SK_A01_01']); // 親和度0%で解放されるのは1つ目のみ
});

test('防御：被ダメージが軽減される（同じ乱数で比較）', () => {
  const { engine } = setup(['A09']);
  const u = engine.party[0];
  const e = engine.enemies[0];
  const atk = data.skill('SKL_ENE_ATTACK');
  const normal = rollDamage(data.rules, new Rng(7), e, u, atk, 0, 1);
  u.guarding = data.skill('SKL_GUARD').effects.guard;
  const guarded = rollDamage(data.rules, new Rng(7), e, u, atk, 0, 1);
  if (normal.hit) assert.ok(guarded.damage < normal.damage, `${guarded.damage} < ${normal.damage}`);
});

test('属性無効（フルーレティ：雷無効化）', () => {
  const gs = newGame(data, ['A15']);
  const u = createPartyUnit(data, gs.progress.A15);
  const f = createEnemyUnit(data, 'ENE_FLEURETY', 1, 'E1', 'フルーレティ');
  const r = rollDamage(data.rules, new Rng(3), u, f, data.skill('TEN_雷_01'), 0, 1);
  assert.equal(r.immune, true);
  assert.equal(r.damage, 0);
  const r2 = rollDamage(data.rules, new Rng(3), u, f, data.skill('TEN_火_01'), 0, 1);
  assert.ok(r2.damage > 0);
});

test('アイテム：回復薬でHP回復・所持数が減る／蘇生薬で復活', () => {
  const { gs, engine } = setup(['A01', 'A02']);
  const [a, b] = engine.party;
  a.hp = 10;
  const n0 = gs.inventory.ITM_POTION;
  engine.perform(b, { command: 'item', itemId: 'ITM_POTION', targetIds: [a.uid] });
  assert.ok(a.hp > 10);
  assert.equal(gs.inventory.ITM_POTION, n0 - 1);
  a.hp = 0;
  engine.perform(b, { command: 'item', itemId: 'ITM_REVIVE', targetIds: [a.uid] });
  assert.ok(a.hp > 0);
});

test('敵AIは常に有効な行動を返す', () => {
  const { engine } = setup(['A01', 'A02'], 'ENC_TRAIN_ARMY');
  engine.start();
  for (const e of engine.enemies) {
    const a = decideEnemyAction(engine, e);
    assert.ok(data.skills.has(a.skillId));
    assert.doesNotThrow(() => engine.perform(e, a));
  }
});

test('勝利で経験値とLvアップ、敗北では経験値なし', () => {
  const { gs, engine } = setup(['A01', 'A02', 'A05', 'A15'], 'ENC_TRAIN_SOLDIERS', 11);
  autoplay(engine);
  assert.ok(engine.result);
  const res = applyBattleResult(data, gs, engine);
  if (engine.result === 'win') {
    assert.ok(res.exp > 0);
    assert.ok(Object.values(gs.progress).some((p) => p.level > 1));
  } else assert.equal(res.exp, 0);
});

test('偽獣化：HP50%未満でフェーズ移行', () => {
  const { engine } = setup(['A15'], 'ENC_TEST_FLEURETY');
  const f = engine.enemies[0];
  const u = engine.party[0];
  f.hp = Math.floor(f.maxHp * 0.5) + 1;
  const atkBefore = f.stat('atk');
  for (let i = 0; i < 20 && f.phaseIndex < 0 && f.alive; i++) engine.perform(u, { command: 'attack', skillId: 'SKL_ATK', targetIds: [f.uid] });
  assert.equal(f.phaseIndex, 0);
  assert.ok(f.stat('atk') > atkBefore);
});

test('乱数シードを変えた300戦（Lv1/50/100・全エンカウント・A組15人ローテ）で例外なく決着', () => {
  const ids = data.charactersOfClass('A').map((c) => c.id);
  let results = { win: 0, lose: 0, none: 0 };
  for (let i = 0; i < 300; i++) {
    const party = [0, 1, 2, 3].map((k) => ids[(i + k * 4) % 15]);
    const lv = [1, 50, 100][i % 3];
    const enc = data.encounters[i % data.encounters.length].id;
    const { engine } = setup(party, enc, 1000 + i, { level: lv, artifactLevel: lv, guardianAffinity: lv, upperAwakened: lv === 100 });
    autoplay(engine);
    results[engine.result ?? 'none']++;
  }
  assert.equal(results.none, 0, JSON.stringify(results));
});
