// データ整合性チェック（CLI）。 npm run validate
// - game/src/data/validate.js の全チェック（JSON・参照・成長表・MP禁止・時系列・仮データ上書き禁止・原本ロック）
// - Markdown一覧とJSONの突き合わせ（資料間の矛盾を警告として列挙）
// 原本の scripts/validate_*.py と同等以上の検査を Node で行う（この環境に Python がないため）。
import fs from 'node:fs';
import path from 'node:path';
import { loadRawData, ROOT, readProjectFile } from './lib/load-raw.mjs';
import { validateData } from '../game/src/data/validate.js';
import { STAT_KEYS } from '../game/src/core/constants.js';

/** Markdownの表を行配列に分解する */
function mdTable(text) {
  return text.split(/\r?\n/).filter((l) => l.startsWith('|') && !/^\|\s*-/.test(l)).map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
}

/** Markdown資料とJSONの突き合わせ。返り値は警告メッセージ配列。 */
export function checkMarkdown(canon) {
  const warnings = [];
  const chars = canon.characters;

  // 1) 03_キャラクター/00_30人一覧.md・00_30人ステータス最新.md（v1.5/v1.5.1）
  for (const [file, offset] of [['03_キャラクター/00_30人一覧.md', 2], ['03_キャラクター/00_30人ステータス最新.md', 4]]) {
    const rows = mdTable(readProjectFile(file)).filter((r) => /^[AB]\d\d$/.test(r[0]));
    let diff = 0;
    for (const r of rows) {
      const c = chars[r[0]];
      if (!c) continue;
      if (r[1].replace(/\s/g, '') !== c.name.replace(/\s/g, '')) warnings.push(`[資料矛盾] ${file}: ${r[0]} の名前「${r[1]}」≠ JSON「${c.name}」`);
      STAT_KEYS.forEach((k, i) => { if (Number(r[offset + i]) !== c.stats.lv100[k]) diff++; });
    }
    if (diff) warnings.push(`[資料矛盾] ${file}: Lv100値 ${diff} 箇所がJSONと不一致`);
  }

  // 2) A組/B組設定.md（Lv100列が旧値のまま）
  for (const file of ['03_キャラクター/A組/00_A組設定.md', '03_キャラクター/B組/00_B組設定.md']) {
    const rows = mdTable(readProjectFile(file)).filter((r) => /^[AB]\d\d$/.test(r[0]));
    let diff = 0, cells = 0;
    for (const r of rows) {
      const c = chars[r[0]];
      STAT_KEYS.forEach((k, i) => { cells++; if (Number(r[4 + i]) !== c.stats.lv100[k]) diff++; });
      if (r[3] !== c.role) warnings.push(`[資料矛盾] ${file}: ${r[0]} 役割「${r[3]}」≠ JSON「${c.role}」`);
      const art = canon.artifacts[c.artifact_id];
      const gua = canon.guardians[c.guardian_id];
      if (r[14] !== art.name) warnings.push(`[資料矛盾] ${file}: ${r[0]} 神器「${r[14]}」≠ JSON「${art.name}」`);
      if (r[15] !== `${gua.name} / ${gua.species}`) warnings.push(`[資料矛盾] ${file}: ${r[0]} 守護獣「${r[15]}」≠ JSON「${gua.name} / ${gua.species}」`);
      if (r[16] !== art.attribute || r[17] !== gua.attribute) warnings.push(`[資料矛盾] ${file}: ${r[0]} 属性表記がJSONと不一致`);
    }
    if (diff) warnings.push(`[資料矛盾] ${file}: Lv100ステータス ${diff}/${cells} 箇所が v1.5.1 JSON と不一致（旧値の可能性。JSONを正として使用）`);
  }

  // 3) 神器一覧の武器形態
  {
    const rows = mdTable(readProjectFile('04_神器/01_神器一覧.md')).filter((r) => /^ART_/.test(r[0]));
    const diffs = rows.filter((r) => canon.artifacts[r[0]] && canon.artifacts[r[0]].weapon_form !== r[4]);
    if (diffs.length) warnings.push(`[資料矛盾] 04_神器/01_神器一覧.md: 武器形態 ${diffs.length}/30 件がJSONと不一致（例: ${diffs[0][0]} 一覧「${diffs[0][4]}」/ JSON「${canon.artifacts[diffs[0][0]].weapon_form}」）`);
  }
  return warnings;
}

function main() {
  const raw = loadRawData();
  const lockPath = path.join(ROOT, 'tools', 'canon', 'canon_lock.json');
  const lock = fs.existsSync(lockPath) ? JSON.parse(fs.readFileSync(lockPath, 'utf8')) : undefined;
  const result = validateData(raw, { lock, hashes: raw.hashes });
  const mdWarnings = checkMarkdown(raw.canon);

  for (const e of raw.parseErrors) result.errors.unshift(e);
  const ok = result.errors.length === 0;

  console.log(ok ? 'PASS' : 'FAIL');
  console.log(Object.entries(result.info).map(([k, v]) => `${k}=${v}`).join(' '));
  for (const e of result.errors) console.log('ERROR:', e);
  for (const w of [...result.warnings, ...mdWarnings]) console.log('WARNING:', w);
  process.exit(ok ? 0 : 1);
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1].endsWith('validate.mjs')) main();
