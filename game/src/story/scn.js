// シナリオ記述（.scn）のパーサー。Node（ビルド・検証）とブラウザ（なし：ビルド済みJSONを使う）で共通。
//
// 書式（1行1命令。台本の書き方に近づけてある）
//   // コメント
//   @episode 6 荒垣剛毅
//   @scene 06-01 朝・A組教室 @ A組教室        … 「@ 」以降は場所（任意）
//   龍一郎「台詞」                             … 台詞（話者は data/scenario/speakers.json で解決）
//   咲＞ほぼ即答。                             … 人物の動作・様子（台本の「### 咲 ほぼ即答。」形式）
//   = 地の文                                   … 地の文（明示）
//   地の文                                     … 「」で終わらない行は地の文
//   ■ システムメッセージ
//   [battle EP06_B1]                           … ゲーム処理（下記 DIRECTIVES）
//   [explore 調べる]  ? 選択肢  …  [/explore 家を出る]
//   @block ID … @end                           … 戦闘中イベント等から参照される台詞ブロック

/** 使用できるディレクティブ名と引数の説明（検証・ドキュメント用） */
export const DIRECTIVES = Object.freeze({
  battle: '戦闘 <battle_id>（data/scenario/ch2_battles.json）',
  join: '戦闘加入 <キャラID…> [文言]（文言省略時「戦闘メンバーに加入しました！」）',
  flag: 'フラグ設定 <KEY=値>…（値 true/false/文字列）',
  awaken: '上位属性覚醒 <キャラID> <属性,属性…>',
  affinity: '守護獣親和度 <キャラID|joined> <+n>（仮値）',
  artifact_level: '神器Lv <キャラID|joined> <+n>（仮値）',
  numbers: 'A組番号 <ID=番号,…>',
  unlock: '解禁表示 <項目、項目…>（表示のみ）',
  title: 'タイトルカード <文言>',
  fx: '画面演出 <暗転|白転|…>（表示のみ）',
  call: 'ブロック呼び出し <block_id>',
});

const ACT_RE = /^([^\s「」=■\[@/?＞][^「」\s＞]{0,15})＞(.+)$/;
const SAY_RE = /^([^\s「」=■\[@/?][^「」\s]{0,15})「(.*)」$/s;

/**
 * @typedef {{t:'say', who:string, text:string, line:number}
 *  | {t:'narr', text:string, line:number}
 *  | {t:'act', who:string, text:string, line:number}
 *  | {t:'sys', text:string, line:number}
 *  | {t:'dir', name:string, args:string[], line:number}
 *  | {t:'explore', prompt:string, options:{label:string, steps:Step[]}[], exit:string, line:number}} Step
 */

/**
 * @param {string} src
 * @param {string} file エラーメッセージ用
 */
export function parseScn(src, file = '(scn)') {
  /** @type {{episode:number, title:string, scenes:{id:string, title:string, location:string, steps:Step[], line:number}[], blocks:Record<string, Step[]>}} */
  const out = { episode: 0, title: '', scenes: [], blocks: {} };
  /** @type {string[]} */ const errors = [];
  /** @type {Step[] | null} */ let target = null;
  /** @type {Step[] | null} */ let savedTarget = null; // ブロック中の退避
  /** @type {Extract<Step, {t:'explore'}> | null} */ let explore = null;
  /** @type {Step[] | null} */ let exploreOuter = null;

  const lines = src.split(/\r?\n/);
  lines.forEach((rawLine, i) => {
    const line = rawLine.trim();
    const no = i + 1;
    const where = `${file}:${no}`;
    if (!line || line.startsWith('//')) return;

    if (line.startsWith('@episode ')) {
      const m = /^@episode\s+(\d+)\s+(.+)$/.exec(line);
      if (!m) { errors.push(`${where}: @episode の書式が不正`); return; }
      out.episode = Number(m[1]);
      out.title = m[2].trim();
      return;
    }
    if (line.startsWith('@scene ')) {
      const m = /^@scene\s+(\S+)\s+(.*?)(?:\s+@\s+(.+))?$/.exec(line);
      if (!m) { errors.push(`${where}: @scene の書式が不正`); return; }
      if (explore) errors.push(`${where}: [explore] が閉じられていません`);
      const scene = { id: m[1], title: m[2].trim(), location: (m[3] ?? '').trim(), steps: /** @type {Step[]} */ ([]), line: no };
      out.scenes.push(scene);
      target = scene.steps;
      return;
    }
    if (line.startsWith('@block ')) {
      const id = line.slice(7).trim();
      if (out.blocks[id]) errors.push(`${where}: ブロック ${id} が重複`);
      savedTarget = target;
      out.blocks[id] = [];
      target = out.blocks[id];
      return;
    }
    if (line === '@end') {
      target = savedTarget;
      savedTarget = null;
      return;
    }
    if (!target) { errors.push(`${where}: @scene / @block の外に本文があります`); return; }

    // [explore 問い] ? 選択肢 … [/explore 終了ラベル]
    if (line.startsWith('[explore')) {
      const prompt = line.replace(/^\[explore\s*/, '').replace(/\]$/, '').trim();
      explore = { t: 'explore', prompt, options: [], exit: '', line: no };
      target.push(explore);
      exploreOuter = target;
      return;
    }
    if (line.startsWith('[/explore')) {
      if (!explore || !exploreOuter) { errors.push(`${where}: 対応する [explore] がありません`); return; }
      explore.exit = line.replace(/^\[\/explore\s*/, '').replace(/\]$/, '').trim() || '次へ';
      target = exploreOuter;
      explore = null;
      exploreOuter = null;
      return;
    }
    if (line.startsWith('? ')) {
      if (!explore) { errors.push(`${where}: 「? 選択肢」は [explore] の中でのみ使用できます`); return; }
      const opt = { label: line.slice(2).trim(), steps: /** @type {Step[]} */ ([]) };
      explore.options.push(opt);
      target = opt.steps;
      return;
    }

    if (line.startsWith('[')) {
      const m = /^\[(\w+)(?:\s+(.*))?\]$/.exec(line);
      if (!m) { errors.push(`${where}: ディレクティブの書式が不正: ${line}`); return; }
      if (!(m[1] in DIRECTIVES)) { errors.push(`${where}: 未知のディレクティブ [${m[1]}]`); return; }
      target.push({ t: 'dir', name: m[1], args: (m[2] ?? '').trim() ? (m[2] ?? '').trim().split(/\s+/) : [], line: no });
      return;
    }
    if (line.startsWith('■')) { target.push({ t: 'sys', text: line.slice(1).trim(), line: no }); return; }
    if (line.startsWith('=')) { target.push({ t: 'narr', text: line.slice(1).trim(), line: no }); return; }
    const act = ACT_RE.exec(line);
    if (act) { target.push({ t: 'act', who: act[1], text: act[2].trim(), line: no }); return; }
    const say = SAY_RE.exec(line);
    if (say) { target.push({ t: 'say', who: say[1], text: say[2], line: no }); return; }
    target.push({ t: 'narr', text: line, line: no });
  });
  if (explore) errors.push(`${file}: [explore] が閉じられていません`);
  if (!out.episode) errors.push(`${file}: @episode がありません`);
  return { scenario: out, errors };
}

/**
 * 台本原文との照合用の正規化（空白・Markdown記号を除去）
 * @param {string} s
 */
export function normalizeForMatch(s) {
  return s.replace(/\*\*/g, '').replace(/[#>*`]/g, '').replace(/[\s　]+/g, '');
}
