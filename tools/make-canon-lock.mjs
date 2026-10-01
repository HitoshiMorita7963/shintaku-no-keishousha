// 正式データのロックファイルを生成する。
// ZIP（v1.5.1）から取り込んだ直後の状態を「原本」として記録し、以後 validate.mjs が
// 「Lv1/Lv100値・名称・ファイル内容が勝手に変更されていないか」を検査する基準にする。
//
// ※ ユーザーが正式にデータ更新を指示した場合のみ再生成すること:
//    node tools/make-canon-lock.mjs --confirm-user-approved-update
import fs from 'node:fs';
import path from 'node:path';
import { loadRawData, ROOT } from './lib/load-raw.mjs';

if (!process.argv.includes('--confirm-user-approved-update')) {
  console.error('ロックの再生成はユーザー承認済みのデータ更新時のみ行います。');
  console.error('実行する場合: node tools/make-canon-lock.mjs --confirm-user-approved-update');
  process.exit(1);
}

const { canon, hashes, parseErrors } = loadRawData();
if (parseErrors.length) {
  console.error(parseErrors.join('\n'));
  process.exit(1);
}

const lock = {
  description: '神官養成学園 v1.5.1 正式データロック。ユーザー承認なしに再生成しないこと。',
  source: '神官養成学園_Claude開発プロジェクト_v1.5.1_全レベル成長再計算版.zip',
  generated_at: new Date().toISOString(),
  characters: Object.fromEntries(
    Object.values(canon.characters).map((c) => [
      c.id,
      { name: c.name, artifact_id: c.artifact_id, guardian_id: c.guardian_id, lv1: c.stats.lv1, lv100: c.stats.lv100 },
    ]),
  ),
  artifact_names: Object.fromEntries(Object.values(canon.artifacts).map((a) => [a.id, a.name])),
  guardian_names: Object.fromEntries(Object.values(canon.guardians).map((g) => [g.id, g.name])),
  skill_names: Object.fromEntries(Object.values(canon.skills).map((s) => [s.id, s.name])),
  event_titles: Object.fromEntries(
    Object.entries(canon.events).filter(([, e]) => e.title).map(([k, e]) => [k, e.title]),
  ),
  file_sha256: hashes,
};

const out = path.join(ROOT, 'tools', 'canon', 'canon_lock.json');
fs.writeFileSync(out, JSON.stringify(lock, null, 2) + '\n', 'utf8');
console.log(`wrote ${path.relative(ROOT, out)} (${Object.keys(hashes).length} files)`);
