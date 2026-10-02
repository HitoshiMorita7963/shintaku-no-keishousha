// フィールドマップ（歩けるマップ）のテスト：マップ定義・移動判定・シナリオとの対応
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './helpers.mjs';
import { checkFieldMap, loadFieldMap } from '../game/src/field/fieldMap.js';
import { parseScn } from '../game/src/story/scn.js';
import { newStoryGame } from '../game/src/model/gameState.js';
import { StoryRunner } from '../game/src/story/runner.js';

const { data } = load();
const maps = data.scenario.fieldMaps;

test('全マップの定義が正しい（幅・記号・開始位置・全オブジェクトに到達可能）', () => {
  assert.ok(Object.keys(maps).length >= 4);
  for (const [id, def] of Object.entries(maps)) assert.deepEqual(checkFieldMap(id, def), [], id);
});

test('移動判定：壁・家具・人物は通れず、出口は踏むと反応する', () => {
  const room = loadFieldMap(maps, 'ROOM_KUROMA');
  assert.equal(room.step(3, 2, 'left').moved, false); // ベッド
  assert.equal(room.step(3, 2, 'left').bump?.label, 'ベッド');
  assert.equal(room.facing(3, 2, 'left')?.label, 'ベッド');
  assert.equal(room.step(3, 1, 'up').moved, false); // 壁
  const r = room.step(5, 5, 'down');
  assert.equal(r.moved, true);
  assert.equal(r.stepOn?.label, '家を出る');
  const tg = loadFieldMap(maps, 'TRAINING_GROUND');
  assert.equal(tg.walkable(4, 4), false); // 剛毅が立っている
  assert.equal(tg.facing(4, 5, 'up')?.npc, 'A03');
});

test('壊れたマップ定義は検出される', () => {
  assert.ok(checkFieldMap('X', { rows: ['__', '_'], spawn: { x: 0, y: 0, dir: 'down' } }).length > 0);
  assert.ok(checkFieldMap('X', { rows: ['_w_'], spawn: { x: 0, y: 0, dir: 'down' }, objects: [{ label: '出口', tiles: [[2, 0]], exit: true }] })
    .some((e) => e.includes('到達できません')));
});

test('[explore … @マップ] と [walk マップ] を解析し、ストーリーで返す', () => {
  const { scenario, errors } = parseScn('@episode 1 t\n@scene 01-01 a\n[explore 調べる @ROOM_KUROMA]\n? 机\n= x\n[/explore 家を出る]\n[walk FIELD_HOME]\n', 't.scn');
  assert.deepEqual(errors, []);
  const ex = /** @type {any} */ (scenario.scenes[0].steps[0]);
  assert.equal(ex.prompt, '調べる');
  assert.equal(ex.map, 'ROOM_KUROMA');
  assert.equal(scenario.scenes[0].steps[1].t, 'dir');

  const state = newStoryGame(data);
  const runner = new StoryRunner(data, state, 2, 1);
  const types = [];
  for (let i = 0; i < 200; i++) {
    const it = runner.next();
    if (it.type === 'explore') types.push(`explore@${it.map}`);
    if (it.type === 'walk') types.push(`walk@${it.map}`);
    if (it.type === 'episode_end') break;
  }
  assert.deepEqual(types, ['explore@ROOM_KUROMA', 'walk@FIELD_HOME']);
});
