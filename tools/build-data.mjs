// data/ のJSON群を検証し、ブラウザ用バンドル game/generated/data.bundle.js を生成する。
//   npm run build:data
// JSONを編集したらこれを実行するだけでゲームに反映される（コード変更は不要）。
// 検証エラーがある場合はバンドルを生成しない（壊れたデータでゲームを動かさない）。
import fs from 'node:fs';
import path from 'node:path';
import { loadRawData, ROOT } from './lib/load-raw.mjs';
import { validateData } from '../game/src/data/validate.js';

const raw = loadRawData();
const lockPath = path.join(ROOT, 'tools', 'canon', 'canon_lock.json');
const lock = fs.existsSync(lockPath) ? JSON.parse(fs.readFileSync(lockPath, 'utf8')) : undefined;
const result = validateData(raw, { lock, hashes: raw.hashes });
const errors = [...raw.parseErrors, ...result.errors];

if (errors.length) {
  console.error('データ検証エラーのためバンドルを生成しません:');
  for (const e of errors) console.error('  ERROR:', e);
  process.exit(1);
}

const meta = {
  built_at: new Date().toISOString(),
  data_version: Object.values(raw.canon.characters)[0]?.data_version ?? 'unknown',
  validation: { ok: true, info: result.info, warnings: result.warnings },
};
const payload = { canon: raw.canon, provisional: raw.provisional, confirmed: raw.confirmed, meta };
const outDir = path.join(ROOT, 'game', 'generated');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'data.bundle.js');
fs.writeFileSync(
  out,
  '// 自動生成ファイル（npm run build:data）。直接編集しないこと。編集は data/ のJSONで行う。\n' +
    `window.SHINKAN_DATA = ${JSON.stringify(payload)};\n`,
  'utf8',
);
const kb = (fs.statSync(out).size / 1024).toFixed(0);
console.log(`OK: ${path.relative(ROOT, out)} (${kb} KB) — warnings ${result.warnings.length}`);
