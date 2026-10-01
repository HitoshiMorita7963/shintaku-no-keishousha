// データ整合性チェッカー（Node/ブラウザ共通・副作用なし）。
// tools/validate.mjs・tools/build-data.mjs・tests・ゲーム内「データ検証」画面から呼ばれる。
//
// errors   : 仕様違反。ビルドを止める。
// warnings : 資料間の矛盾・要確認事項。ビルドは止めないが報告する。
import {
  STAT_KEYS, COMBAT_STAT_KEYS, ALL_ATTRIBUTES, BASE_ATTRIBUTE_OF, UPPER_ATTRIBUTE_OF,
  B_CLASS_PLAYABLE_EPISODES, CHAPTER2_EPISODE_COUNT,
} from '../core/constants.js';
import { lerpLevel } from '../core/util.js';
import { resolveEffectText } from './effectText.js';
import { validateScenario } from '../story/validateScenario.js';

const UNFILLED = (v) => v === null || v === undefined || v === '未確定' || (Array.isArray(v) && v.length === 0);
const pad2 = (n) => String(n).padStart(2, '0');
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export const EXPECTED_CHARACTER_IDS = Object.freeze([
  ...Array.from({ length: 15 }, (_, i) => `A${pad2(i + 1)}`),
  ...Array.from({ length: 15 }, (_, i) => `B${pad2(i + 1)}`),
]);

/**
 * @param {{canon: Record<string, Record<string, any>>, provisional: Record<string, any>, confirmed?: Record<string, any>, scenario?: any}} raw
 * @param {{lock?: any, hashes?: Record<string,string>, scriptSources?: Record<string,string>}} [opts]
 */
export function validateData(raw, opts = {}) {
  /** @type {string[]} */ const errors = [];
  /** @type {string[]} */ const warnings = [];
  /** @type {Record<string, number|string>} */ const info = {};
  const err = (m) => errors.push(m);
  const warn = (m) => warnings.push(m);

  const { canon, provisional: prov } = raw;
  const chars = canon.characters ?? {};
  const arts = canon.artifacts ?? {};
  const guards = canon.guardians ?? {};
  const skills = canon.skills ?? {};
  const enemies = canon.enemies ?? {};
  const items = canon.items ?? {};
  const maps = canon.maps ?? {};
  const events = canon.events ?? {};

  // ---- ファイル名とIDの一致 ----
  for (const [folder, recs] of Object.entries(canon)) {
    for (const [stem, rec] of Object.entries(recs)) {
      if (folder === 'events' && stem === 'CH2_B_EXCHANGE_RESULTS') continue; // 原本バリデータと同じ例外
      if (!rec || typeof rec !== 'object') err(`${folder}/${stem}.json: ルートがオブジェクトではありません`);
      else if (rec.id !== stem) err(`${folder}/${stem}.json: ファイル名とid(${rec.id})が不一致`);
    }
  }

  // ---- MP禁止（キー・値の両方を検査） ----
  const mpHits = [];
  const scanMp = (v, where) => {
    if (Array.isArray(v)) v.forEach((x, i) => scanMp(x, `${where}[${i}]`));
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if (/^mp$/i.test(k) || /(^|_)mp(_|$)/i.test(k)) mpHits.push(`${where}.${k}`);
        scanMp(x, `${where}.${k}`);
      }
    } else if (typeof v === 'string' && /(^|[^A-Za-z])MP([^A-Za-z]|$)/.test(v)) mpHits.push(`${where} = "${v}"`);
  };
  for (const [folder, recs] of Object.entries(canon)) scanMp(recs, folder);
  scanMp(prov, 'provisional');
  scanMp(raw.confirmed ?? {}, 'confirmed');
  for (const h of mpHits) err(`MP禁止: ${h}`);

  // ---- キャラクター ----
  const charIds = Object.keys(chars).sort();
  info.characters = charIds.length;
  for (const id of EXPECTED_CHARACTER_IDS) if (!chars[id]) err(`キャラクター ${id} が存在しません`);
  for (const id of charIds) if (!EXPECTED_CHARACTER_IDS.includes(id)) err(`想定外のキャラクターID ${id}`);
  if (charIds.length !== 30) err(`キャラクター数が30ではありません: ${charIds.length}`);

  /** @type {Record<string,string[]>} */ const artOwners = {};
  /** @type {Record<string,string[]>} */ const guaOwners = {};
  let levelCells = 0;
  for (const id of charIds) {
    const c = chars[id];
    const s = c.stats;
    if (!s || typeof s !== 'object') { err(`${id}: stats がありません`); continue; }
    for (const snap of ['lv1', 'lv100']) {
      const x = s[snap];
      if (!x) { err(`${id}: stats.${snap} がありません`); continue; }
      const keys = Object.keys(x);
      const missing = STAT_KEYS.filter((k) => !(k in x));
      const extra = keys.filter((k) => !STAT_KEYS.includes(/** @type {any} */ (k)));
      if (missing.length || extra.length) err(`${id}: stats.${snap} キー不一致 missing=${missing} extra=${extra}`);
      for (const k of STAT_KEYS) if (!isNum(x[k])) err(`${id}: stats.${snap}.${k} が数値ではありません`);
    }
    // Lv1～Lv100 全レベル表（v1.5.1）
    const L = s.levels;
    if (!L) err(`${id}: stats.levels（Lv1～100表）がありません`);
    else {
      for (let lv = 1; lv <= 100; lv++) {
        const row = L[String(lv)];
        if (!row) { err(`${id}: Lv${lv} がありません`); continue; }
        for (const k of STAT_KEYS) {
          levelCells++;
          const expect = Math.round(lerpLevel(s.lv1[k], s.lv100[k], lv));
          if (row[k] !== expect) err(`${id}: Lv${lv}.${k}=${row[k]} が線形補間値 ${expect} と不一致`);
        }
      }
      if (Object.keys(L).length !== 100) err(`${id}: levels の件数が100ではありません (${Object.keys(L).length})`);
    }
    if (s.growth_mode && s.growth_mode !== 'linear_lv1_to_lv100') err(`${id}: growth_mode が線形ではありません: ${s.growth_mode}`);

    if (!arts[c.artifact_id]) err(`${id}: 存在しない神器 ${c.artifact_id} を参照`);
    else (artOwners[c.artifact_id] ??= []).push(id);
    if (!guards[c.guardian_id]) err(`${id}: 存在しない守護獣 ${c.guardian_id} を参照`);
    else (guaOwners[c.guardian_id] ??= []).push(id);

    if (c.class === 'A') {
      if (!('join_episode' in c)) err(`${id}: A組は join_episode が必要`);
    } else if (c.class === 'B') {
      if ('join_episode' in c) err(`${id}: B組は join_episode を使用しない`);
      if (JSON.stringify(c.playable_in_episodes) !== JSON.stringify(B_CLASS_PLAYABLE_EPISODES)) {
        err(`${id}: playable_in_episodes が仕様と不一致 ${JSON.stringify(c.playable_in_episodes)}`);
      }
    } else err(`${id}: class が A/B ではありません`);
    if (id[0] !== c.class) err(`${id}: IDの組(${id[0]})と class(${c.class}) が不一致`);
  }
  info.level_cells_checked = levelCells;

  // ---- 神器 ----
  info.artifacts = Object.keys(arts).length;
  if (Object.keys(arts).length !== 30) err(`神器数が30ではありません: ${Object.keys(arts).length}`);
  for (const [aid, a] of Object.entries(arts)) {
    const owners = artOwners[aid] ?? [];
    if (owners.length !== 1) err(`神器 ${aid}: 所有者がちょうど1人ではありません (${owners})`);
    for (const bad of ['owner_id', 'stats', 'lv1', 'lv100']) if (bad in a) err(`神器 ${aid}: 禁止フィールド ${bad}`);
    if (!ALL_ATTRIBUTES.includes(a.attribute)) err(`神器 ${aid}: 不明な属性 ${a.attribute}`);
    for (const snap of ['stat_bonuses_lv1', 'stat_bonuses_lv100']) {
      const b = a[snap];
      if (!b) { err(`神器 ${aid}: ${snap} がありません`); continue; }
      for (const k of Object.keys(b)) {
        if (!COMBAT_STAT_KEYS.includes(/** @type {any} */ (k))) err(`神器 ${aid}: ${snap}.${k} は補正対象外（HP/SP不可・10ステータス以外不可）`);
      }
      if (!isNum(b.def)) err(`神器 ${aid}: 防御補正は全神器必須（${snap}.def）`);
      if (!isNum(b.atk) && !isNum(b.int)) err(`神器 ${aid}: 攻撃または賢さの補正が必須（${snap}）`);
    }
    const ms = a.milestones ?? [];
    for (let i = 1; i < ms.length; i++) if (ms[i].level <= ms[i - 1].level) err(`神器 ${aid}: milestones がLv昇順ではありません`);
  }

  // ---- 守護獣 ----
  info.guardians = Object.keys(guards).length;
  if (Object.keys(guards).length !== 30) err(`守護獣数が30ではありません: ${Object.keys(guards).length}`);
  for (const [gid, g] of Object.entries(guards)) {
    const owners = guaOwners[gid] ?? [];
    if (owners.length !== 1) err(`守護獣 ${gid}: 所有者がちょうど1人ではありません (${owners})`);
    for (const bad of ['owner_id', 'stats', 'lv1', 'lv100']) if (bad in g) err(`守護獣 ${gid}: 禁止フィールド ${bad}`);
    if (g.starting_affinity !== 0) err(`守護獣 ${gid}: 開始親密度は0%`);
    if (!ALL_ATTRIBUTES.includes(g.attribute)) err(`守護獣 ${gid}: 不明な属性 ${g.attribute}`);
    const curve = g.affinity_multiplier_curve ?? [];
    if (!curve.length || curve[0].affinity !== 0) err(`守護獣 ${gid}: 親密度0%の倍率がありません`);
    for (const ex of ['hp', 'sp']) if (!(g.release_excludes_stats ?? []).includes(ex)) err(`守護獣 ${gid}: ${ex} は解放倍率対象外のはず`);
  }

  // ---- スキル ----
  const effectRules = prov.effect_rules;
  const byCat = (cat) => Object.values(skills).filter((s) => s.category === cat);
  const artSk = byCat('artifact_unique');
  const guaSk = byCat('guardian_unique');
  const tenSk = byCat('tengeki');
  info.artifact_unique_skills = artSk.length;
  info.guardian_unique_skills = guaSk.length;
  info.tengeki = tenSk.length;
  if (artSk.length !== 300) err(`神器固有技が300ではありません: ${artSk.length}`);
  if (guaSk.length !== 150) err(`守護獣固有技が150ではありません: ${guaSk.length}`);
  if (tenSk.length < 70) err(`天撃が70未満です: ${tenSk.length}`);

  for (const cid of charIds) {
    for (let i = 1; i <= 10; i++) {
      const sid = `ARTSK_${cid}_${pad2(i)}`;
      if (!skills[sid]) err(`神器固有技 ${sid} がありません`);
      else if (skills[sid].owner_id !== cid) err(`${sid}: owner_id(${skills[sid].owner_id}) が ${cid} ではありません`);
    }
    const gid = chars[cid].guardian_id;
    for (let i = 1; i <= 5; i++) {
      const sid = `GUA_SK_${cid}_${pad2(i)}`;
      if (!skills[sid]) err(`守護獣固有技 ${sid} がありません`);
      else if (skills[sid].guardian_id !== gid) err(`${sid}: guardian_id(${skills[sid].guardian_id}) が ${gid} ではありません`);
    }
  }
  for (const s of [...artSk, ...guaSk, ...tenSk]) {
    if (!isNum(s.power)) err(`${s.id}: power が数値ではありません`);
    if (!isNum(s.sp_cost)) err(`${s.id}: sp_cost が数値ではありません`);
    if (!ALL_ATTRIBUTES.includes(s.attribute)) err(`${s.id}: 不明な属性 ${s.attribute}`);
    if (!['単体', '全体', '味方全体'].includes(s.target)) err(`${s.id}: 不明な対象 ${s.target}`);
    if (!['atk', 'int', 'atk_and_int', 'none'].includes(s.scaling)) err(`${s.id}: 不明な scaling ${s.scaling}`);
    if (s.category === 'artifact_unique' && !chars[s.owner_id]) err(`${s.id}: 存在しないキャラ ${s.owner_id} を参照`);
    if (s.category === 'guardian_unique' && !guards[s.guardian_id]) err(`${s.id}: 存在しない守護獣 ${s.guardian_id} を参照`);
    if (s.category === 'artifact_unique' && !(s.unlock_artifact_level >= 1 && s.unlock_artifact_level <= 100)) err(`${s.id}: unlock_artifact_level 範囲外`);
    if (s.category === 'guardian_unique' && !(s.unlock_affinity >= 0 && s.unlock_affinity <= 100)) err(`${s.id}: unlock_affinity 範囲外`);
    if (effectRules && resolveEffectText(effectRules, s.effect) === null) warn(`${s.id}: effect「${s.effect}」が effect_rules に未登録（追加効果なしで扱う）`);
  }
  // 天撃：基本7×5・上位7×5
  for (const attr of ALL_ATTRIBUTES) {
    const n = tenSk.filter((s) => s.attribute === attr).length;
    if (n !== 5) err(`天撃 ${attr}属性が5個ではありません: ${n}`);
  }
  for (const s of tenSk) {
    const isUpper = Object.values(UPPER_ATTRIBUTE_OF).includes(s.attribute);
    if (!!s.upper_attribute !== isUpper) err(`${s.id}: upper_attribute と属性(${s.attribute})が不一致`);
    if (isUpper && s.base_attribute !== BASE_ATTRIBUTE_OF[s.attribute]) err(`${s.id}: base_attribute(${s.base_attribute}) が ${BASE_ATTRIBUTE_OF[s.attribute]} ではありません`);
    if (s.scaling !== 'int') err(`${s.id}: 天撃は賢さ依存のはず (${s.scaling})`);
  }

  // 資料間の矛盾（警告）：神器固有技の解放Lv
  {
    let mismatch = 0;
    for (const cid of charIds) {
      for (let i = 1; i <= 10; i++) {
        const s = skills[`ARTSK_${cid}_${pad2(i)}`];
        if (s && s.unlock_artifact_level !== i * 10) mismatch++;
      }
    }
    if (mismatch) warn(`[資料矛盾] 神器固有技 ${mismatch}/300 件の unlock_artifact_level が、06_スキル/02『Lv10/20/…/100で1個ずつ解放』・神器JSON milestones と一致しません（Lv70/90で解放される技が0件）`);
  }
  // 重複名（警告）
  {
    /** @type {Record<string,string[]>} */ const names = {};
    for (const s of Object.values(skills)) (names[s.name] ??= []).push(s.id);
    const dups = Object.entries(names).filter(([, v]) => v.length > 1);
    if (dups.length) warn(`[要確認] 同名スキル ${dups.length} 組（例: ${dups.slice(0, 3).map(([n, v]) => `${n}=${v.join('/')}`).join('、')}）`);
  }
  const legacyTen = Object.values(skills).filter((s) => s.type === '天撃');
  if (legacyTen.length) warn(`[要確認] 旧形式の天撃 SKL_TEN_* ${legacyTen.length}件（威力null）。TEN_* と同名のため戦闘では TEN_* を使用`);

  // ---- 仮データの上書き禁止チェック ----
  /**
   * @param {string} label
   * @param {Record<string, any>} canonRecs
   * @param {Record<string, any>} overlays
   * @param {string[]} [replaceableExtra] 追加で上書きを許すキー（null判定は行う）
   */
  const checkOverlay = (label, canonRecs, overlays, replaceableExtra = []) => {
    for (const [id, ov] of Object.entries(overlays ?? {})) {
      const base = canonRecs[id];
      if (!base) { err(`${label}: 正式データに存在しない ${id} への仮データ`); continue; }
      for (const [k, v] of Object.entries(ov)) {
        if (k === 'fill') {
          for (const fk of Object.keys(v)) {
            if (fk.startsWith('_')) continue;
            if (fk in base && !UNFILLED(base[fk])) err(`${label} ${id}: fill.${fk} が正式データの非null値を上書きしています`);
          }
          continue;
        }
        if (k.startsWith('_')) continue;
        if (!(k in base) && !replaceableExtra.includes(k)) err(`${label} ${id}: ${k} は正式データにないキー（fill に入れること）`);
        else if (k in base && !UNFILLED(base[k])) err(`${label} ${id}: ${k} は正式データで確定済み（${JSON.stringify(base[k])}）のため上書き不可`);
        void v;
      }
    }
  };
  checkOverlay('common_skills', skills, prov.common_skills?.overlays);
  checkOverlay('items', items, prov.items?.overlays);
  checkOverlay('enemies', enemies, prov.enemies?.overlays);

  // ---- 敵 ----
  const enemyCatalog = prov.enemies?.skills_catalog ?? {};
  for (const eid of Object.keys(enemies)) {
    const ov = prov.enemies?.overlays?.[eid];
    if (!ov) { err(`敵 ${eid}: 仮ステータスがありません（戦闘不能）`); continue; }
    for (const snap of ['lv1', 'lv100']) {
      const x = ov.stats?.[snap];
      if (!x) { err(`敵 ${eid}: stats.${snap} がありません`); continue; }
      for (const k of STAT_KEYS) if (!isNum(x[k])) err(`敵 ${eid}: stats.${snap}.${k} が数値ではありません`);
    }
    const refs = [...(ov.skills ?? []), ...((ov.fill?.phases ?? []).flatMap((p) => p.add_skills ?? []))];
    for (const r of refs) if (!enemyCatalog[r.id]) err(`敵 ${eid}: 存在しない敵スキル ${r.id}`);
    for (const d of ov.fill?.drops ?? []) if (!items[d.item_id]) err(`敵 ${eid}: 存在しないアイテム ${d.item_id} をドロップ`);
  }
  for (const it of Object.keys(items)) if (!prov.items?.overlays?.[it]) err(`アイテム ${it}: 仮効果がありません（使用不能）`);

  // ---- 仮スキル ----
  for (const s of Object.values(skills)) {
    if (s.type === '神技' || s.id === 'SKL_ATK' || s.id === 'SKL_GUARD') {
      if (!prov.common_skills?.overlays?.[s.id]) err(`${s.id}: 仮数値がありません（使用不能）`);
    }
  }

  // ---- ユーザー確定の追加設定（data/confirmed） ----
  for (const [cid, tr] of Object.entries(raw.confirmed?.character_traits?.traits ?? {})) {
    if (!chars[cid]) err(`character_traits: 存在しないキャラクター ${cid}`);
    const m = /** @type {any} */ (tr).tengeki_damage_multiplier;
    if (m !== undefined && !(isNum(m) && m > 0)) err(`character_traits ${cid}: tengeki_damage_multiplier が正の数ではありません`);
    const sc = /** @type {any} */ (tr).tengeki_damage_multiplier_scope;
    if (sc !== undefined && !['non_matching', 'all'].includes(sc)) err(`character_traits ${cid}: tengeki_damage_multiplier_scope は non_matching / all`);
  }

  // ---- エンカウント ----
  for (const enc of prov.encounters?.encounters ?? []) {
    if (enc.map_id && !maps[enc.map_id]) err(`エンカウント ${enc.id}: 存在しないマップ ${enc.map_id}`);
    for (const e of enc.enemies) if (!enemies[e.enemy_id] && !raw.scenario?.json?.enemies?.enemies?.[e.enemy_id]) err(`エンカウント ${enc.id}: 存在しない敵 ${e.enemy_id}`);
  }
  for (const [iid] of Object.entries(prov.progression?.starting_inventory ?? {})) {
    if (!items[iid]) err(`progression: 存在しないアイテム ${iid}`);
  }

  // ---- イベント（第2章42話の順序と重要な時系列） ----
  for (let ep = 1; ep <= CHAPTER2_EPISODE_COUNT; ep++) {
    const id = `CH2_EP${pad2(ep)}`;
    const e = events[id];
    if (!e) { err(`イベント ${id} がありません`); continue; }
    if (e.episode !== ep || e.chapter !== 2) err(`${id}: episode/chapter 番号が不一致`);
    if (!(e.flags_set ?? []).length) err(`${id}: flags_set がありません`);
  }
  info.events = Object.keys(events).length;
  {
    const text = (id) => JSON.stringify(events[id] ?? {});
    for (let ep = 1; ep < 35; ep++) {
      const t = text(`CH2_EP${pad2(ep)}`);
      if (/黒田藤吉朗/.test(t) && /死亡/.test(t)) err(`時系列違反: 黒田藤吉朗の死亡が第${ep}話に記述されています（死亡は第35話）`);
    }
    if (!/黒田藤吉朗/.test(text('CH2_EP35')) || !/死亡/.test(text('CH2_EP35'))) err('時系列: 第35話に黒田藤吉朗の死亡記述がありません');
    for (const name of ['フルーレティ', 'ムルムル', 'ダンダリオン', 'ラグゼファン', 'ネムラジエル']) {
      if (!text('CH2_EP21').includes(name)) err(`第21話: ${name} の記述がありません`);
    }
    const flags = Object.values(events).flatMap((e) => e.flags_set ?? []);
    if (flags.some((f) => /COSPLETE/.test(f))) warn('[要確認] イベントフラグ名が "_COSPLETE"（COMPLETE の誤記の可能性）。フラグIDは変更せずそのまま使用');
  }
  const ex = events.CH2_B_EXCHANGE_RESULTS;
  if (ex) {
    const t = { A: 0, B: 0, DRAW: 0 };
    const seenA = new Set(), seenB = new Set();
    for (const m of ex.matches) {
      if (!chars[m.a] || chars[m.a].class !== 'A') err(`B組交流戦: ${m.a} はA組キャラではありません`);
      if (!chars[m.b] || chars[m.b].class !== 'B') err(`B組交流戦: ${m.b} はB組キャラではありません`);
      seenA.add(m.a); seenB.add(m.b);
      t[m.winner] = (t[m.winner] ?? 0) + 1;
    }
    if (seenA.size !== 15 || seenB.size !== 15) err('B組交流戦: A組15人・B組15人の各1試合になっていません');
    if (t.A !== ex.totals.A || t.B !== ex.totals.B || t.DRAW !== ex.totals.DRAW) err('B組交流戦: totals と試合結果の集計が不一致');
    if (t.A !== 7 || t.B !== 7 || t.DRAW !== 1) err('B組交流戦: 確定結果（A7勝・B7勝・1分）と不一致');
    const draw = ex.matches.find((m) => m.winner === 'DRAW');
    if (!draw || draw.a !== 'A01' || draw.b !== 'B01') err('B組交流戦: 龍一郎vs龍之介の引き分けが記録されていません');
  }

  // ---- シナリオ（ユーザー提供の正式台本） ----
  if (raw.scenario) {
    const s = validateScenario(raw.scenario, raw, { scriptSources: opts.scriptSources });
    errors.push(...s.errors);
    warnings.push(...s.warnings);
    Object.assign(info, s.info);
  }

  // ---- 原本ロックとの比較（改変検知） ----
  if (opts.lock) {
    const lock = opts.lock;
    for (const [cid, lc] of Object.entries(lock.characters ?? {})) {
      const c = chars[cid];
      if (!c) { err(`[改変検知] キャラクター ${cid} が削除されています`); continue; }
      if (c.name !== lc.name) err(`[改変検知] ${cid} の名前が変更されています（${lc.name} → ${c.name}）`);
      for (const snap of ['lv1', 'lv100']) {
        for (const k of STAT_KEYS) {
          if (c.stats?.[snap]?.[k] !== lc[snap][k]) err(`[改変検知] ${cid} stats.${snap}.${k}: 原本 ${lc[snap][k]} → 現在 ${c.stats?.[snap]?.[k]}`);
        }
      }
      if (c.artifact_id !== lc.artifact_id || c.guardian_id !== lc.guardian_id) err(`[改変検知] ${cid} の神器/守護獣参照が変更されています`);
    }
    const nameCheck = (label, recs, locked) => {
      for (const [id, name] of Object.entries(locked ?? {})) {
        if (!recs[id]) err(`[改変検知] ${label} ${id} が削除されています`);
        else if ((recs[id].name ?? recs[id].title) !== name) err(`[改変検知] ${label} ${id} の名称変更（${name} → ${recs[id].name ?? recs[id].title}）`);
      }
    };
    nameCheck('神器', arts, lock.artifact_names);
    nameCheck('守護獣', guards, lock.guardian_names);
    nameCheck('スキル', skills, lock.skill_names);
    nameCheck('イベント', events, lock.event_titles);
    if (opts.hashes && lock.file_sha256) {
      for (const [file, h] of Object.entries(lock.file_sha256)) {
        if (!(file in opts.hashes)) err(`[改変検知] 正式データファイル ${file} が削除されています`);
        else if (opts.hashes[file] !== h) err(`[改変検知] 正式データファイル ${file} の内容が原本から変更されています`);
      }
      for (const file of Object.keys(opts.hashes)) {
        if (!(file in lock.file_sha256)) warn(`[追加] 原本にないデータファイル ${file}`);
      }
    }
  } else {
    warn('原本ロック（tools/canon/canon_lock.json）が渡されていないため改変検知をスキップ');
  }

  return { ok: errors.length === 0, errors, warnings, info };
}
