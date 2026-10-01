// データ整合性テスト（ユーザー指定の最低限チェック項目をすべて網羅）
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './helpers.mjs';
import { validateData, EXPECTED_CHARACTER_IDS } from '../game/src/data/validate.js';
import { STAT_KEYS } from '../game/src/core/constants.js';

const { raw, lock, data } = load();

test('統合バリデータが PASS（原本ロック・ファイルハッシュ照合込み）', () => {
  const r = validateData(raw, { lock, hashes: raw.hashes });
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
});

test('キャラクター30人・A01～A15・B01～B15が存在', () => {
  assert.equal(data.characters.size, 30);
  for (const id of EXPECTED_CHARACTER_IDS) assert.ok(data.characters.has(id), id);
});

test('全員 Lv1～Lv100 の表があり、HP/SP を含み、MP がない', () => {
  for (const c of data.characters.values()) {
    for (let lv = 1; lv <= 100; lv++) {
      const row = c.stats.levels[String(lv)];
      assert.ok(row, `${c.id} Lv${lv}`);
      assert.deepEqual(Object.keys(row).sort(), [...STAT_KEYS].sort());
      assert.ok(!('mp' in row) && !('MP' in row));
    }
  }
});

test('Lv1・Lv100 の値が原本（ZIP v1.5.1）から変更されていない', () => {
  for (const [id, lc] of Object.entries(lock.characters)) {
    const c = data.character(id);
    assert.deepEqual({ ...c.stats.lv1 }, lc.lv1, `${id} lv1`);
    assert.deepEqual({ ...c.stats.lv100 }, lc.lv100, `${id} lv100`);
    assert.equal(c.name, lc.name);
  }
});

test('神器30・神器固有技300・守護獣固有技150・天撃70以上', () => {
  assert.equal(data.artifacts.size, 30);
  assert.equal(data.skillsOfCategory('artifact_unique').length, 300);
  assert.equal(data.skillsOfCategory('guardian_unique').length, 150);
  assert.ok(data.skillsOfCategory('tengeki').length >= 70);
  for (const c of data.characters.values()) {
    assert.equal(data.artifactSkillsOf(c.id).length, 10, c.id);
    assert.equal(data.guardianSkillsOf(c.guardian_id).length, 5, c.id);
  }
});

test('参照先IDが全て解決する（存在しないキャラ・スキルを参照しない）', () => {
  for (const c of data.characters.values()) {
    assert.ok(data.artifact(c.artifact_id));
    assert.ok(data.guardian(c.guardian_id));
  }
  for (const s of data.skills.values()) {
    if (s.ownerId) assert.ok(data.characters.has(s.ownerId), s.id);
    if (s.guardianId) assert.ok(data.guardians.has(s.guardianId), s.id);
  }
  for (const e of data.enemies.values()) for (const r of e.skills) assert.ok(data.skills.has(r.id), `${e.id} → ${r.id}`);
  for (const enc of data.encounters) for (const x of enc.enemies) assert.ok(data.enemies.has(x.enemy_id));
});

test('改変検知が機能する：Lv100値を書き換えるとエラーになる', () => {
  const tampered = structuredClone(raw);
  tampered.canon.characters.A01.stats.lv100.atk += 1;
  const r = validateData(tampered, { lock });
  assert.ok(r.errors.some((e) => e.includes('[改変検知] A01 stats.lv100.atk')), r.errors.join('\n'));
});

test('MP 検知が機能する', () => {
  const tampered = structuredClone(raw);
  tampered.canon.characters.A01.stats.lv1.mp = 10;
  const r = validateData(tampered, { lock });
  assert.ok(r.errors.some((e) => e.startsWith('MP禁止')));
});

test('仮データが正式値を上書きしようとするとエラー', () => {
  const tampered = structuredClone(raw);
  tampered.provisional.common_skills.overlays.SKL_ATK.sp_cost = 5; // 正式データは 0
  const r = validateData(tampered, { lock });
  assert.ok(r.errors.some((e) => e.includes('SKL_ATK') && e.includes('上書き不可')));
});

test('時系列：黒田藤吉朗の死亡を第21話に書くとエラー', () => {
  const tampered = structuredClone(raw);
  tampered.canon.events.CH2_EP21.notes.push('黒田藤吉朗が死亡');
  const r = validateData(tampered, { lock });
  assert.ok(r.errors.some((e) => e.includes('時系列違反')));
});

test('正式データは実行時に凍結されている', () => {
  const c = data.character('A01');
  assert.throws(() => { /** @type {any} */ (c.stats.lv100).atk = 1; });
  assert.equal(c.stats.lv100.atk, 587);
});
