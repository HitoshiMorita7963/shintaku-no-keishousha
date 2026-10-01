// 倍率の乗算上限の計測（03_神器・守護獣戦闘補正.md『上限を戦闘テストで確認する』）
// ユーザー決定（2026-10-02）：倍率上限は設けない。最大値を計測して出力し、上限が null のままであることを確認する。
// （方針が変わった場合は battle_rules.json の attribute.max_total_multiplier に値を入れる）
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './helpers.mjs';
import { newGame, setGrowth } from '../game/src/model/gameState.js';
import { createPartyUnit } from '../game/src/battle/unit.js';
import { attributeMultiplier } from '../game/src/battle/formulas.js';

const { data } = load();

test('最大属性倍率の計測（全30人×全攻撃技、神器Lv100・親和度100%・解放・属性バフ込み）', () => {
  let worst = { total: 0, who: '', skill: '' };
  const gs = newGame(data, ['A01']);
  for (const c of data.characters.values()) {
    const p = gs.progress[c.id] ?? { id: c.id, level: 100, exp: 0, artifactLevel: 100, guardianAffinity: 100, upperAwakened: true, hp: 1, sp: 1 };
    setGrowth(data, p, { level: 100, artifactLevel: 100, guardianAffinity: 100, upperAwakened: true });
    const u = createPartyUnit(data, p);
    u.guardian.released = true;
    // 神器属性陣・守護獣護輪の両方が掛かった状態
    u.buffs.push({ kind: 'attr_mult', attribute: u.artifact.def.attribute, amount: 0.15, turns: 3, source: 'test' });
    u.buffs.push({ kind: 'attr_mult', attribute: u.guardian.def.attribute, amount: 0.15, turns: 3, source: 'test2' });
    const skills = [...data.skillsOfCategory('tengeki'), ...data.artifactSkillsOf(c.id), ...data.guardianSkillsOf(c.guardian_id)].filter((s) => s.power > 0);
    for (const s of skills) {
      const m = attributeMultiplier(data.rules, u, { immuneAttributes: [] }, s);
      if (m.total > worst.total) worst = { total: m.total, who: c.name, skill: s.name };
    }
  }
  const crit = data.rules.critical.multiplier;
  console.log(`  最大属性倍率 ×${worst.total.toFixed(3)}（${worst.who}「${worst.skill}」）、会心込み ×${(worst.total * crit).toFixed(3)}、守護獣能力倍率 最大×2.0`);
  assert.ok(Number.isFinite(worst.total) && worst.total > 1);
  assert.equal(data.rules.attribute.max_total_multiplier, null, 'ユーザー決定：倍率上限なし');
});
