// シナリオ（data/scenario）の整合性チェック。validate.js から呼ばれる。
import { compileScenario } from './compile.js';
import { normalizeForMatch } from './scn.js';
import { UPPER_ATTRIBUTE_OF, B_CLASS_PLAYABLE_EPISODES, CHAPTER2_EPISODE_COUNT } from '../core/constants.js';

const RESULT_MODES = ['must_win', 'any', 'scripted'];
const STORY_RESULTS = ['win', 'lose', 'draw', 'continue'];
const COMMANDS = ['attack', 'shingi', 'tengeki', 'artifact', 'guardian', 'item', 'guard'];

/**
 * @param {any} rawScenario loadRawData().scenario
 * @param {{canon: Record<string, Record<string, any>>, provisional: Record<string, any>}} raw
 * @param {{scriptSources?: Record<string, string>}} opts scriptSources: 章フォルダ名 → 台本原文（tools のみ）
 */
export function validateScenario(rawScenario, raw, opts = {}) {
  /** @type {string[]} */ const errors = [];
  /** @type {string[]} */ const warnings = [];
  /** @type {Record<string, number|string>} */ const info = {};
  const sc = compileScenario(rawScenario);
  errors.push(...sc.errors);
  const { canon } = raw;
  const chars = canon.characters ?? {};
  const enemyIds = new Set([...Object.keys(canon.enemies ?? {}), ...Object.keys(sc.enemies)]);
  const upperAttrs = Object.values(UPPER_ATTRIBUTE_OF);

  for (const id of Object.keys(sc.enemies)) if (canon.enemies?.[id]) errors.push(`scenario/enemies.json: ${id} は正式データに既にあります`);
  for (const id of Object.keys(chars)) { /* 話者表のキャラIDは正式データに存在すること */ }
  for (const [label, s] of sc.speakers) {
    if (s.kind === 'character' && !chars[s.ref]) errors.push(`speakers.json: ${label} → 存在しないキャラ ${s.ref}`);
    if (s.kind === 'guardian' && !canon.guardians?.[s.ref]) errors.push(`speakers.json: ${label} → 存在しない守護獣 ${s.ref}`);
    if (s.kind === 'enemy' && !enemyIds.has(s.ref)) errors.push(`speakers.json: ${label} → 存在しない敵 ${s.ref}`);
  }

  // ---- 台本原文との照合用 ----
  /** @type {Record<string, string>} */ const normSources = {};
  for (const [ch, text] of Object.entries(opts.scriptSources ?? {})) {
    let s = text;
    for (const c of sc.corrections) s = s.split(c.from).join(c.to);
    normSources[ch] = normalizeForMatch(s);
  }
  const chapterFolder = (/** @type {number} */ ch) => `第${ch}章`;
  let checkedLines = 0;

  const usedBattles = new Set();
  /** @type {{ep:number, id:string}[]} */ const joins = [];
  /** @type {{ep:number, text:string}[]} */ const allText = [];

  for (const [chStr, eps] of Object.entries(sc.chapters)) {
    const ch = Number(chStr);
    const nums = Object.keys(eps).map(Number).sort((a, b) => a - b);
    info[`chapter${ch}_episodes`] = nums.length;
    nums.forEach((n, i) => { if (n !== i + 1) errors.push(`第${ch}章: 第${i + 1}話が欠けています（話の順番は変更不可）`); });
    if (ch === 2 && nums.some((n) => n > CHAPTER2_EPISODE_COUNT)) errors.push(`第2章は全${CHAPTER2_EPISODE_COUNT}話（ユーザー確認済み）。第${Math.max(...nums)}話があります`);
    const src = normSources[chapterFolder(ch)];
    if (opts.scriptSources && !src) warnings.push(`第${ch}章の台本原文（15_シナリオ台本/${chapterFolder(ch)}/）がないため原文照合をスキップ`);

    for (const n of nums) {
      const ep = eps[n];
      const where = (/** @type {number} */ line) => `${ep.file}:${line}`;
      const evId = `CH${ch}_EP${String(n).padStart(2, '0')}`;
      if (!canon.events?.[evId]) errors.push(`${ep.file}: 正式イベント ${evId} が存在しません`);
      // 話タイトルは台本を正とする（ユーザー確認済み 2026-10-02）。正式イベントJSONのタイトルとの差は件数のみ記録
      else if (canon.events[evId].title !== ep.title) info.titles_from_script = Number(info.titles_from_script ?? 0) + 1;
      if (!ep.scenes.length) errors.push(`${ep.file}: シーンがありません`);

      /** @param {any[]} steps */
      const walk = (steps) => {
        for (const st of steps) {
          if (st.t === 'explore') { for (const o of st.options) walk(o.steps); continue; }
          if (st.t === 'say' || st.t === 'act') {
            if (!sc.speakers.has(st.who)) errors.push(`${where(st.line)}: 未登録の話者「${st.who}」（data/scenario/speakers.json）`);
          }
          if (st.t === 'say' || st.t === 'act' || st.t === 'narr' || st.t === 'sys') {
            allText.push({ ep: n, text: st.text });
            if (src) {
              checkedLines++;
              const norm = normalizeForMatch(st.text);
              if (norm && !src.includes(norm)) errors.push(`${where(st.line)}: 台本原文に見つかりません「${st.text}」`);
            }
          }
          if (st.t !== 'dir') continue;
          const a = st.args;
          switch (st.name) {
            case 'battle': {
              const b = sc.battles[a[0]];
              if (!b) errors.push(`${where(st.line)}: 戦闘 ${a[0]} が ch${ch}_battles.json にありません`);
              else {
                if (usedBattles.has(a[0])) errors.push(`${where(st.line)}: 戦闘 ${a[0]} が複数回使われています`);
                usedBattles.add(a[0]);
                if (b.episode !== n) errors.push(`戦闘 ${a[0]}: episode(${b.episode}) が第${n}話と一致しません`);
                for (const tr of b.triggers ?? []) if (tr.block && !ep.blocks[tr.block]) errors.push(`戦闘 ${a[0]}: ブロック ${tr.block} が第${n}話にありません`);
              }
              break;
            }
            case 'join':
              for (const id of a.filter((x) => /^[AB]\d\d$/.test(x))) {
                if (!chars[id]) errors.push(`${where(st.line)}: 存在しないキャラ ${id}`);
                else if (chars[id].class !== 'A') errors.push(`${where(st.line)}: ${id} はB組（第2章で戦闘加入はA組のみ）`);
                joins.push({ ep: n, id });
              }
              break;
            case 'awaken':
              if (!chars[a[0]]) errors.push(`${where(st.line)}: 存在しないキャラ ${a[0]}`);
              for (const at of (a[1] ?? '').split(',')) if (!upperAttrs.includes(at)) errors.push(`${where(st.line)}: 上位属性ではありません「${at}」`);
              break;
            case 'flag':
              for (const kv of a) if (!/^[A-Z0-9_]+=.+$/.test(kv)) errors.push(`${where(st.line)}: フラグの書式は KEY=値 です（${kv}）`);
              break;
            case 'numbers': {
              const pairs = (a[0] ?? '').split(',').map((p) => p.split('='));
              const nums2 = pairs.map((p) => Number(p[1]));
              if (pairs.length !== 15 || new Set(nums2).size !== 15 || nums2.some((x) => !(x >= 1 && x <= 15))) errors.push(`${where(st.line)}: A組番号は15人分・1～15の重複なし`);
              for (const [id] of pairs) if (!chars[id] || chars[id].class !== 'A') errors.push(`${where(st.line)}: ${id} はA組ではありません`);
              if (n === 5) for (const [id, num] of pairs) {
                if (chars[id] && chars[id].entrance_number !== Number(num)) warnings.push(`[台本と正式データの差異] 第5話の番号 ${id}=${num} が entrance_number(${chars[id].entrance_number}) と不一致`);
              }
              break;
            }
            case 'affinity': case 'artifact_level':
              if (a[0] !== 'joined' && !chars[a[0]]) errors.push(`${where(st.line)}: 対象 ${a[0]} が不正`);
              if (!/^[+-]\d+$/.test(a[1] ?? '')) errors.push(`${where(st.line)}: 増減値は +n / -n`);
              break;
            case 'call':
              if (!ep.blocks[a[0]]) errors.push(`${where(st.line)}: ブロック ${a[0]} がありません`);
              break;
            default:
          }
        }
      };
      for (const s of ep.scenes) walk(s.steps);
      for (const b of Object.values(ep.blocks)) walk(b);
    }
  }
  info.scenario_lines_checked_against_script = checkedLines;
  info.story_battles = Object.keys(sc.battles).length;

  // ---- 戦闘定義 ----
  for (const [id, b] of Object.entries(sc.battles)) {
    if (!usedBattles.has(id)) warnings.push(`戦闘 ${id} はどのシナリオからも使われていません`);
    if (!RESULT_MODES.includes(b.result_mode)) errors.push(`戦闘 ${id}: result_mode が不正 (${b.result_mode})`);
    if (b.result_mode === 'scripted' && !STORY_RESULTS.includes(b.story_result)) errors.push(`戦闘 ${id}: scripted には story_result が必要`);
    if (b.result_mode === 'scripted' && !b.end_after_turns && !(b.triggers ?? []).some((/** @type {any} */ t) => (t.actions ?? []).some((/** @type {any} */ x) => x.end_battle))) {
      errors.push(`戦闘 ${id}: scripted には end_after_turns または end_battle トリガーが必要`);
    }
    const fixedParty = Array.isArray(b.party);
    if (!fixedParty && !['current', 'joined', 'select'].includes(b.party)) errors.push(`戦闘 ${id}: party が不正 (${b.party})`);
    if (fixedParty && !b.party.length) errors.push(`戦闘 ${id}: party が空です`);
    const party = fixedParty ? b.party : [];
    for (const p of party) if (!chars[p]) errors.push(`戦闘 ${id}: 存在しないキャラ ${p}`);
    // 確定ルール：B組の操作は 01_ゲーム概要/04_B組操作可能ルール.md の話数のみ
    const bOps = party.filter((p) => chars[p]?.class === 'B');
    if (b.party === 'select') {
      if (!['A', 'A+B'].includes(b.candidates)) errors.push(`戦闘 ${id}: candidates は "A" または "A+B"`);
      if (b.candidates === 'A+B') bOps.push('(B組候補)');
    }
    if (bOps.length && !B_CLASS_PLAYABLE_EPISODES.includes(b.episode)) errors.push(`戦闘 ${id}: 第${b.episode}話ではB組を操作できません（操作可能話数 ${B_CLASS_PLAYABLE_EPISODES.join(',')}）`);
    const refs = new Set(party);
    // 参加者が実行時に決まる戦闘は、トリガー対象にA組を許可
    if (!fixedParty) for (const c of Object.values(chars)) refs.add(c.id);
    for (const o of b.opponents ?? []) {
      if (o.enemy) { if (!enemyIds.has(o.enemy)) errors.push(`戦闘 ${id}: 存在しない敵 ${o.enemy}`); refs.add(o.enemy); }
      else if (o.character) { if (!chars[o.character]) errors.push(`戦闘 ${id}: 存在しないキャラ ${o.character}`); refs.add(o.character); }
      else errors.push(`戦闘 ${id}: opponents に enemy / character がありません`);
    }
    if (!(b.opponents ?? []).length) errors.push(`戦闘 ${id}: 相手がいません`);
    for (const r of b.lose_if_down ?? []) if (!refs.has(r)) errors.push(`戦闘 ${id}: lose_if_down の ${r} が参加していません`);
    for (const [r, cmds] of Object.entries(b.command_limits ?? {})) {
      if (!refs.has(r)) errors.push(`戦闘 ${id}: command_limits の ${r} が参加していません`);
      for (const c of /** @type {string[]} */ (cmds)) if (!COMMANDS.includes(c)) errors.push(`戦闘 ${id}: 不明なコマンド ${c}`);
    }
    const trIds = new Set();
    for (const tr of b.triggers ?? []) {
      if (trIds.has(tr.id)) errors.push(`戦闘 ${id}: トリガーID ${tr.id} が重複`);
      trIds.add(tr.id);
      for (const rq of tr.requires ?? []) if (!(b.triggers ?? []).some((/** @type {any} */ x) => x.id === rq)) errors.push(`戦闘 ${id}: requires ${rq} がありません`);
      const units = [];
      const collect = (/** @type {any} */ w) => { if (w?.any) w.any.forEach(collect); if (w?.all) w.all.forEach(collect); if (w?.hp_below) units.push(w.hp_below.unit); };
      collect(tr.when);
      for (const a of tr.actions ?? []) {
        if (a.release_guardian) units.push(a.release_guardian);
        if (a.unlock_commands) units.push(...a.unlock_commands);
        if (a.awaken) units.push(...Object.keys(a.awaken));
        if (a.affinity) units.push(...Object.keys(a.affinity));
        if (a.end_battle && !STORY_RESULTS.includes(a.end_battle)) errors.push(`戦闘 ${id}: end_battle が不正 (${a.end_battle})`);
      }
      for (const u of units) if (!refs.has(u)) errors.push(`戦闘 ${id}: トリガーの ${u} が参加していません`);
    }
  }

  // ---- 確定進行ルール：第21話終了時点でA組15人全員が戦闘可能（01_ゲーム概要/03_確定進行ルール.md） ----
  {
    const start = new Set(raw.provisional?.progression?.story_start?.joined ?? []);
    const seen = new Set(start);
    for (const j of joins) {
      if (seen.has(j.id)) errors.push(`第${j.ep}話: ${j.id} が二重に加入しています`);
      seen.add(j.id);
    }
    const by21 = new Set([...start, ...joins.filter((j) => j.ep <= 21).map((j) => j.id)]);
    const aIds = Object.values(chars).filter((c) => c.class === 'A').map((c) => c.id);
    const missing = aIds.filter((x) => !by21.has(x));
    if (missing.length && Object.keys(sc.chapters[2] ?? {}).length >= 21) errors.push(`確定進行ルール違反：第21話終了時点で未加入 ${missing.join(',')}`);
    info.joins = joins.map((j) => `${j.id}@${j.ep}`).join(' ');
  }

  // ---- 確定データ：B組交流戦の結果（data/events/CH2_B_EXCHANGE_RESULTS.json） ----
  const ex = canon.events?.CH2_B_EXCHANGE_RESULTS;
  const exBattles = Object.values(sc.battles).filter((b) => b.exchange);
  if (ex && exBattles.length) {
    for (const m of ex.matches) {
      const b = exBattles.find((x) => x.exchange.a === m.a && x.exchange.b === m.b);
      if (!b) { errors.push(`B組交流戦: ${m.a} vs ${m.b} の戦闘がありません`); continue; }
      const expected = m.winner === 'A' ? 'win' : m.winner === 'B' ? 'lose' : 'draw';
      const actual = b.result_mode === 'scripted' ? b.story_result : 'win';
      if (actual !== expected) errors.push(`B組交流戦 ${b.id}: 台本上の結果 ${actual} が正式データ（${m.winner}）と不一致`);
      if (b.party?.[0] !== m.a || b.opponents?.[0]?.character !== m.b) errors.push(`B組交流戦 ${b.id}: 対戦者が exchange と一致しません`);
    }
    if (exBattles.length !== ex.matches.length) errors.push(`B組交流戦: 戦闘数 ${exBattles.length} ≠ 正式データ ${ex.matches.length}`);
  }

  // ---- 時系列：黒田藤吉朗は第35話で死亡。それより前の話で死亡させない ----
  for (const { ep, text } of allText) {
    if (ep < 35 && /黒田/.test(text) && /死|亡くな|殉職/.test(text)) errors.push(`時系列違反：第${ep}話で黒田藤吉朗の死亡に触れています「${text}」`);
  }

  return { errors, warnings, info };
}
