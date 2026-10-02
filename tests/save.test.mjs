// セーブ／ロードのテスト
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './helpers.mjs';
import { newStoryGame, newGame, setGrowth, gainExp } from '../game/src/model/gameState.js';
import { fastForward } from '../game/src/story/runner.js';
import { createSave, loadSave, SAVE_FORMAT } from '../game/src/model/save.js';
import { ensureProgress } from '../game/src/battle/setup.js';

const { data } = load();

/** JSON文字列を経由（実際の保存と同じ） */
const roundTrip = (save) => JSON.parse(JSON.stringify(save));

test('セーブ→ロードで進行状態が完全に復元される（第38話・B組の成長データ込み）', () => {
  const st = newStoryGame(data);
  fastForward(data, st, 2, 38);
  setGrowth(data, st.progress.A01, { level: 37, artifactLevel: 12, guardianAffinity: 40 });
  gainExp(data, st.progress.A01, 100);
  st.progress.A01.hp = 50;
  ensureProgress(data, st, 'B01');
  st.inventory.ITM_POTION = 3;
  const save = roundTrip(createSave(data, st, '1.5.1'));
  assert.equal(save.format, SAVE_FORMAT);
  assert.equal(save.summary.episode, 38);
  assert.equal(save.summary.title, '卒業前合同実習');
  const r = loadSave(data, save);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.state, st);
});

test('訓練モードのセーブも読み込める', () => {
  const st = newGame(data, ['A01', 'A05']);
  const r = loadSave(data, roundTrip(createSave(data, st)));
  assert.deepEqual(r.errors, []);
  assert.equal(r.state.mode, 'training');
});

test('第2章クリア後（第43話の位置）のセーブも読み込める', () => {
  const st = newStoryGame(data);
  fastForward(data, st, 2, 43);
  assert.equal(st.story.episode, 43);
  const r = loadSave(data, roundTrip(createSave(data, st)));
  assert.deepEqual(r.errors, []);
  assert.equal(createSave(data, st).summary.title, null);
});

test('壊れた・書き換えられたセーブは読み込まない（ゲームを壊さない）', () => {
  const base = roundTrip(createSave(data, newStoryGame(data)));
  const bad = (mut) => { const s = structuredClone(base); mut(s); return loadSave(data, s); };
  assert.equal(loadSave(data, null).state, null);
  assert.equal(loadSave(data, { format: 'other' }).state, null);
  assert.equal(bad((s) => { s.version = 999; }).state, null);
  assert.equal(bad((s) => { s.state.progress.A01.level = 101; }).state, null);
  assert.equal(bad((s) => { s.state.progress.A01.guardianAffinity = -1; }).state, null);
  assert.equal(bad((s) => { s.state.progress.Z99 = { id: 'Z99' }; }).state, null);
  assert.equal(bad((s) => { s.state.joined.push('B01'); }).state, null, 'B組は戦闘メンバーに入れられない');
  assert.equal(bad((s) => { s.state.party = ['A02']; }).state, null, '未加入キャラはパーティに入れない');
  assert.equal(bad((s) => { s.state.inventory.ITM_FAKE = 1; }).state, null);
  assert.equal(bad((s) => { s.state.progress.A01.awakenedUpper = ['MP']; }).state, null);
  assert.equal(bad((s) => { s.state.story.episode = 200; }).state, null);
});

test('セーブには正式データ（能力値）を含めない', () => {
  const json = JSON.stringify(createSave(data, newStoryGame(data)));
  assert.ok(!json.includes('"lv100"') && !json.includes('"atk"'));
});
