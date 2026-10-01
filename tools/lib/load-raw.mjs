// data/ 以下のJSONをディスクから読み込み、ゲーム・検証・テストで共通に使う
// 「生データ」オブジェクトを組み立てる。Node専用（ブラウザは生成済みバンドルを使う）。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DATA_DIR = path.join(ROOT, 'data');

/** 正式データ（ZIP由来）のフォルダ。provisional/ と schemas/ は別扱い。 */
export const CANON_FOLDERS = ['characters', 'artifacts', 'guardians', 'skills', 'enemies', 'items', 'maps', 'events'];

/**
 * @param {string} file
 * @returns {{ value: any, error: string | null, sha256: string }}
 */
function readJson(file) {
  const buf = fs.readFileSync(file);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  try {
    return { value: JSON.parse(buf.toString('utf8')), error: null, sha256 };
  } catch (e) {
    return { value: null, error: `JSON parse error: ${/** @type {Error} */ (e).message}`, sha256 };
  }
}

/**
 * data/ 全体を読み込む。
 * 返り値の canon[folder][fileStem] = JSON本体。parseErrors にパース失敗を集約。
 */
export function loadRawData(dataDir = DATA_DIR) {
  /** @type {Record<string, Record<string, any>>} */
  const canon = {};
  /** @type {Record<string, string>} 相対パス → sha256 */
  const hashes = {};
  /** @type {string[]} */
  const parseErrors = [];

  for (const folder of CANON_FOLDERS) {
    canon[folder] = {};
    const dir = path.join(dataDir, folder);
    if (!fs.existsSync(dir)) {
      parseErrors.push(`${folder}/: フォルダが存在しません`);
      continue;
    }
    for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
      const r = readJson(path.join(dir, name));
      hashes[`${folder}/${name}`] = r.sha256;
      if (r.error) parseErrors.push(`${folder}/${name}: ${r.error}`);
      else canon[folder][name.slice(0, -5)] = r.value;
    }
  }

  /** ZIP以外の補足データ（1ファイル＝1キー） @param {string} folder */
  const loadSupplement = (folder) => {
    /** @type {Record<string, any>} */
    const out = {};
    const dir = path.join(dataDir, folder);
    if (!fs.existsSync(dir)) return out;
    for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
      const r = readJson(path.join(dir, name));
      if (r.error) parseErrors.push(`${folder}/${name}: ${r.error}`);
      else out[name.slice(0, -5)] = r.value;
    }
    return out;
  };

  // provisional/ = Claudeの仮値（未確定）、confirmed/ = ZIP受領後にユーザーが確定した追加設定
  const provisional = loadSupplement('provisional');
  const confirmed = loadSupplement('confirmed');

  return { canon, provisional, confirmed, hashes, parseErrors };
}

/** project_manifest.json 等、data/ 外の参照ファイルを読む */
export function readProjectFile(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}
