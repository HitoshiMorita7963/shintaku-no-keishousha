// セーブの保存先（ブラウザの localStorage）。使えない環境（プライベートモード等）でも落ちないようにする。
import { createSave, loadSave } from '../model/save.js';

const PREFIX = 'shinkan.save.';
/** スロット：auto（オートセーブ）と手動の 1～3 */
export const SLOTS = /** @type {const} */ (['auto', '1', '2', '3']);

/** @param {string} slot */
export const slotLabel = (slot) => (slot === 'auto' ? 'オートセーブ' : `スロット${slot}`);

/** @returns {Storage | null} */
function storage() {
  try {
    const s = window.localStorage;
    const k = `${PREFIX}__test`;
    s.setItem(k, '1');
    s.removeItem(k);
    return s;
  } catch {
    return null;
  }
}

/** セーブが使えるか */
export function storageAvailable() {
  return storage() !== null;
}

/**
 * 保存する。失敗時はエラーメッセージを返す（成功時は null）
 * @param {import('./app.js').App} app
 * @param {string} slot
 */
export function writeSlot(app, slot) {
  const s = storage();
  if (!s || !app.state) return 'このブラウザではセーブできません（プライベートモード等）';
  try {
    s.setItem(PREFIX + slot, JSON.stringify(createSave(app.data, app.state, app.meta?.data_version ?? '')));
    return null;
  } catch (e) {
    return `セーブに失敗しました：${/** @type {Error} */ (e).message}`;
  }
}

/**
 * スロットの中身（概要の表示用）。空なら null、壊れていれば {broken:true}
 * @param {string} slot
 * @returns {any}
 */
export function peekSlot(slot) {
  const s = storage();
  const raw = s?.getItem(PREFIX + slot);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return { broken: true };
  }
}

/**
 * スロットから読み込む
 * @param {import('../data/gameData.js').GameData} data
 * @param {string} slot
 */
export function readSlot(data, slot) {
  const save = peekSlot(slot);
  if (!save) return { state: null, errors: ['セーブデータがありません'] };
  if (save.broken) return { state: null, errors: ['セーブデータが壊れています'] };
  return loadSave(data, save);
}

/** @param {string} slot */
export function deleteSlot(slot) {
  storage()?.removeItem(PREFIX + slot);
}

/** いずれかのスロットにセーブがあるか */
export function hasAnySave() {
  return SLOTS.some((s) => peekSlot(s) !== null);
}

/**
 * オートセーブ（失敗しても遊びは止めない）
 * @param {import('./app.js').App} app
 */
export function autoSave(app) {
  // オートセーブはストーリーモードのみ（訓練モードで物語のオートセーブを上書きしない）
  if (!app.state || app.state.mode !== 'story') return;
  const err = writeSlot(app, 'auto');
  if (err) console.warn(err);
}
