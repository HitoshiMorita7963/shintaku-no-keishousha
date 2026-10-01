// 成長（キャラLv・神器Lv・守護獣親和度）のテスト
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './helpers.mjs';
import { STAT_KEYS } from '../game/src/core/constants.js';
import { characterBaseStats, artifactStatBonus, artifactMilestone, guardianMultipliers, expToNext } from '../game/src/model/growth.js';
import { newGame, gainExp, setGrowth } from '../game/src/model/gameState.js';
import { createPartyUnit } from '../game/src/battle/unit.js';

const { data } = load();

test('Lv1/Lv100 は正式値そのまま、Lv2～99 は完全線形補間（四捨五入）', () => {
  for (const c of data.characters.values()) {
    assert.deepEqual(characterBaseStats(c, 1), { ...c.stats.lv1 });
    assert.deepEqual(characterBaseStats(c, 100), { ...c.stats.lv100 });
    for (let lv = 2; lv <= 99; lv++) {
      const s = characterBaseStats(c, lv);
      for (const k of STAT_KEYS) {
        const exact = c.stats.lv1[k] + ((c.stats.lv100[k] - c.stats.lv1[k]) * (lv - 1)) / 99;
        assert.equal(s[k], Math.round(exact), `${c.id} Lv${lv} ${k}`);
        assert.ok(Math.abs(s[k] - exact) <= 0.5);
      }
    }
  }
});

test('中間Lvで早期カンスト・オーバーシュートしない（単調・Lv100を超えない）', () => {
  for (const c of data.characters.values()) {
    for (const k of STAT_KEYS) {
      let prev = -Infinity;
      for (let lv = 1; lv <= 100; lv++) {
        const v = characterBaseStats(c, lv)[k];
        assert.ok(v >= prev, `${c.id} ${k} Lv${lv}`);
        assert.ok(v <= Math.max(c.stats.lv1[k], c.stats.lv100[k]));
        prev = v;
      }
    }
  }
});

test('範囲外のLvはエラー', () => {
  const c = data.character('A01');
  assert.throws(() => characterBaseStats(c, 0));
  assert.throws(() => characterBaseStats(c, 101));
});

test('神器補正：HP/SPなし・Lv1/Lv100は神器JSON値・毎Lv線形', () => {
  for (const a of data.artifacts.values()) {
    const b1 = artifactStatBonus(a, 1);
    const b100 = artifactStatBonus(a, 100);
    assert.ok(!('hp' in b1) && !('sp' in b1));
    for (const [k, v] of Object.entries(a.stat_bonuses_lv1)) assert.equal(b1[k], v);
    for (const [k, v] of Object.entries(a.stat_bonuses_lv100)) assert.equal(b100[k], v);
    assert.ok(b100.def > 0, `${a.id} 防御補正必須`);
  }
});

test('神器節目：Lv9までは倍率1.0、Lv100で神器JSONの最終値', () => {
  const a = data.artifact('ART_A01');
  assert.deepEqual(artifactMilestone(a, 9), { attributeMultiplier: 1, critBonus: 0 });
  assert.deepEqual(artifactMilestone(a, 55), { attributeMultiplier: 1.09, critBonus: 0.02 });
  assert.deepEqual(artifactMilestone(a, 100), { attributeMultiplier: 1.2, critBonus: 0.04 });
});

test('守護獣倍率：親和度0%で1.5倍、100%で2.0倍（段階）', () => {
  const g = data.guardian('GUA_A01');
  assert.equal(guardianMultipliers(g, 0).statMultiplier, 1.5);
  assert.equal(guardianMultipliers(g, 19).statMultiplier, 1.5);
  assert.equal(guardianMultipliers(g, 20).statMultiplier, 1.6);
  assert.equal(guardianMultipliers(g, 100).statMultiplier, 2.0);
  assert.equal(guardianMultipliers(g, 100).attributeMultiplier, 1.2);
});

test('三つの成長軸は独立（神器Lv・親和度を変えてもキャラ基礎値・最大HP/SPは不変）', () => {
  const gs = newGame(data, ['A01']);
  const p = gs.progress.A01;
  setGrowth(data, p, { level: 40 });
  const u1 = createPartyUnit(data, p);
  setGrowth(data, p, { artifactLevel: 100, guardianAffinity: 100 });
  const u2 = createPartyUnit(data, p);
  assert.equal(p.level, 40);
  assert.deepEqual(u1.base, u2.base);
  assert.equal(u1.maxHp, u2.maxHp);
  assert.equal(u1.maxSp, u2.maxSp);
  assert.ok(u2.stat('atk') > u1.stat('atk')); // 神器補正分だけ上がる
  setGrowth(data, p, { level: 41 });
  assert.equal(p.artifactLevel, 100);
  assert.equal(p.guardianAffinity, 100);
});

test('経験値でLvアップし、上昇量は正式Lv表の差分と一致', () => {
  const gs = newGame(data, ['A05']);
  const p = gs.progress.A05;
  const c = data.character('A05');
  const ups = gainExp(data, p, expToNext(data.progression.exp_curve, 1) + expToNext(data.progression.exp_curve, 2));
  assert.equal(p.level, 3);
  assert.equal(ups.length, 2);
  for (const k of STAT_KEYS) assert.equal(ups[0].gains[k], c.stats.levels['2'][k] - c.stats.levels['1'][k]);
});

test('Lv100が上限', () => {
  const gs = newGame(data, ['A01']);
  const p = gs.progress.A01;
  setGrowth(data, p, { level: 99 });
  gainExp(data, p, 10 ** 9);
  assert.equal(p.level, 100);
  assert.equal(p.exp, 0);
  gainExp(data, p, 10 ** 9);
  assert.equal(p.level, 100);
});
