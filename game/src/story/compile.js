// data/scenario の生データ（*.json と 章フォルダの *.scn）→ ゲームが使うシナリオ構造
import { parseScn } from './scn.js';

/**
 * @typedef {Object} Speaker
 * @property {'character'|'guardian'|'enemy'|'npc'} kind
 * @property {string} ref
 * @property {string} [title]
 */

/**
 * @param {{json: Record<string, any>, scn: Record<string, Record<string, string>>} | undefined} raw
 */
export function compileScenario(raw) {
  /** @type {string[]} */ const errors = [];
  /** @type {Record<number, Record<number, ReturnType<typeof parseScn>['scenario'] & {file:string}>>} */
  const chapters = {};
  if (!raw) return { chapters, battles: {}, speakers: new Map(), enemies: {}, corrections: [], errors };

  for (const [folder, files] of Object.entries(raw.scn ?? {})) {
    const m = /^ch(\d+)$/.exec(folder);
    if (!m) { errors.push(`scenario/${folder}: 章フォルダ名は ch<番号> にしてください`); continue; }
    const ch = Number(m[1]);
    chapters[ch] = {};
    for (const [name, text] of Object.entries(files)) {
      const file = `scenario/${folder}/${name}`;
      const r = parseScn(text, file);
      errors.push(...r.errors);
      if (chapters[ch][r.scenario.episode]) errors.push(`${file}: 第${r.scenario.episode}話が重複しています`);
      chapters[ch][r.scenario.episode] = { ...r.scenario, file };
    }
  }

  // 戦闘定義（chN_battles.json をすべて統合し、defaults を適用）
  /** @type {Record<string, any>} */ const battles = {};
  for (const [key, j] of Object.entries(raw.json ?? {})) {
    if (!/^ch\d+_battles$/.test(key)) continue;
    for (const [id, b] of Object.entries(j.battles ?? {})) {
      if (battles[id]) errors.push(`戦闘 ${id} が重複しています`);
      battles[id] = { id, ...(j.defaults ?? {}), ...b };
    }
  }

  // 話者ラベル → 参照先
  /** @type {Map<string, Speaker>} */ const speakers = new Map();
  const sp = raw.json?.speakers ?? {};
  /** @param {string} label @param {Speaker} s */
  const add = (label, s) => {
    if (speakers.has(label)) errors.push(`speakers.json: ラベル「${label}」が重複しています`);
    speakers.set(label, s);
  };
  for (const [kind, key] of /** @type {const} */ ([['character', 'characters'], ['guardian', 'guardians'], ['enemy', 'enemies']])) {
    for (const [ref, labels] of Object.entries(sp[key] ?? {})) for (const l of /** @type {string[]} */ (labels)) add(l, { kind, ref });
  }
  for (const [ref, npc] of Object.entries(sp.npcs ?? {})) {
    for (const l of /** @type {any} */ (npc).labels) add(l, { kind: 'npc', ref, title: /** @type {any} */ (npc).title });
  }

  return {
    chapters,
    battles,
    speakers,
    enemies: raw.json?.enemies?.enemies ?? {},
    corrections: raw.json?.text_corrections?.replacements ?? [],
    errors,
  };
}
