// フィールドマップ（ドラクエ型の歩けるマップ）の判定ロジック。描画・入力に依存しない。
// マップは data/scenario/fieldmaps.json（行の文字列＋記号表）。記号の意味はこのファイルの TILES。

/** @typedef {'up'|'down'|'left'|'right'} Dir */

/**
 * タイルの種類。solid=通れない。
 * 屋外：. 草 , 道 : 砂地 ~ 水 T 木 f 花 = 柵 # 壁 ^ 屋根 D 扉 S 看板・的 O 噴水 I 鳥居
 * 屋内：_ 床 w 壁 B ベッド K 机 N 窓 M 鏡 R 絨毯 L 本棚 P 観葉植物 X 出入口
 */
export const TILES = Object.freeze({
  '.': { name: 'grass', solid: false },
  ',': { name: 'path', solid: false },
  ':': { name: 'sand', solid: false },
  '~': { name: 'water', solid: true },
  T: { name: 'tree', solid: true },
  f: { name: 'flower', solid: false },
  '=': { name: 'fence', solid: true },
  '#': { name: 'wall', solid: true },
  '^': { name: 'roof', solid: true },
  D: { name: 'door', solid: true },
  S: { name: 'sign', solid: true },
  O: { name: 'fountain', solid: true },
  I: { name: 'torii', solid: true },
  _: { name: 'floor', solid: false },
  w: { name: 'iwall', solid: true },
  B: { name: 'bed', solid: true },
  K: { name: 'desk', solid: true },
  N: { name: 'window', solid: true },
  M: { name: 'mirror', solid: true },
  R: { name: 'rug', solid: false },
  L: { name: 'shelf', solid: true },
  P: { name: 'plant', solid: true },
  X: { name: 'doorway', solid: false },
});

export const DIRS = Object.freeze({ up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] });

/**
 * @typedef {Object} FieldObject
 * @property {string} label 表示名（シナリオの選択肢・学園の施設名と対応）
 * @property {number[][]} tiles [[x,y],…]
 * @property {boolean} [exit] 踏むと退出（出入口）
 * @property {boolean} [goal] 踏むと到達（歩く場面のゴール）
 * @property {string} [npc] 人物（キャラクターID）。描画される・通れない
 * @property {Dir} [dir] 人物の向き
 */

/**
 * @param {any} def fieldmaps.json の1マップ
 */
export class FieldMap {
  constructor(def) {
    this.id = def.id;
    this.name = def.name;
    this.kind = def.kind ?? 'outdoor';
    /** S の見た目（sign=看板 / target=訓練用の的） */
    this.signStyle = def.sign_style ?? 'sign';
    /** @type {string[]} */
    this.rows = def.rows;
    this.height = this.rows.length;
    this.width = this.rows[0]?.length ?? 0;
    /** @type {{x:number, y:number, dir: Dir}} */
    this.spawn = def.spawn;
    /** @type {FieldObject[]} */
    this.objects = def.objects ?? [];
    /** @type {Map<string, FieldObject>} */
    this.byTile = new Map();
    for (const o of this.objects) for (const [x, y] of o.tiles) this.byTile.set(`${x},${y}`, o);
  }

  /** @param {number} x @param {number} y */
  tile(x, y) {
    const ch = this.rows[y]?.[x];
    return ch === undefined ? null : /** @type {Record<string, {name:string, solid:boolean}>} */ (TILES)[ch] ?? null;
  }

  /** @param {number} x @param {number} y */
  objectAt(x, y) {
    return this.byTile.get(`${x},${y}`) ?? null;
  }

  /** 通れるか（範囲外・固いタイル・人物は不可） @param {number} x @param {number} y */
  walkable(x, y) {
    const t = this.tile(x, y);
    if (!t || t.solid) return false;
    const o = this.objectAt(x, y);
    return !(o && o.npc);
  }

  /**
   * 1歩進もうとした結果
   * @param {number} x @param {number} y @param {Dir} dir
   * @returns {{moved: boolean, x: number, y: number, bump: FieldObject | null, stepOn: FieldObject | null}}
   */
  step(x, y, dir) {
    const [dx, dy] = DIRS[dir];
    const nx = x + dx;
    const ny = y + dy;
    if (!this.walkable(nx, ny)) return { moved: false, x, y, bump: this.objectAt(nx, ny), stepOn: null };
    const o = this.objectAt(nx, ny);
    return { moved: true, x: nx, y: ny, bump: null, stepOn: o && (o.exit || o.goal) ? o : null };
  }

  /** 向いている先の調べられるもの @param {number} x @param {number} y @param {Dir} dir */
  facing(x, y, dir) {
    const [dx, dy] = DIRS[dir];
    return this.objectAt(x + dx, y + dy);
  }
}

/**
 * @param {Record<string, any>} maps data.scenario.fieldMaps
 * @param {string} id
 */
export function loadFieldMap(maps, id) {
  const def = maps[id];
  if (!def) throw new Error(`フィールドマップ ${id} がありません（data/scenario/fieldmaps.json）`);
  return new FieldMap({ ...def, id });
}

/**
 * マップ定義の検証（validate.js から使う）
 * @param {string} id
 * @param {any} def
 * @returns {string[]}
 */
export function checkFieldMap(id, def) {
  const errs = [];
  const where = `fieldmaps.json ${id}`;
  if (!Array.isArray(def.rows) || !def.rows.length) return [`${where}: rows がありません`];
  const w = def.rows[0].length;
  def.rows.forEach((r, y) => {
    if (r.length !== w) errs.push(`${where}: ${y}行目の幅 ${r.length} ≠ ${w}`);
    for (const ch of r) if (!(ch in TILES)) errs.push(`${where}: ${y}行目に未知の記号「${ch}」`);
  });
  if (errs.length) return errs;
  const m = new FieldMap({ ...def, id });
  const s = def.spawn;
  if (!s || !m.walkable(s.x, s.y)) errs.push(`${where}: 開始位置 spawn が通れる場所ではありません`);
  if (s && !(s.dir in DIRS)) errs.push(`${where}: spawn.dir が不正`);
  const labels = new Set();
  for (const o of m.objects) {
    if (!o.label) errs.push(`${where}: label のないオブジェクト`);
    if (labels.has(o.label)) errs.push(`${where}: label「${o.label}」が重複`);
    labels.add(o.label);
    for (const [x, y] of o.tiles ?? []) if (!m.tile(x, y)) errs.push(`${where}: ${o.label} の位置 (${x},${y}) がマップ外`);
    if ((o.exit || o.goal) && o.tiles.some(([x, y]) => m.tile(x, y)?.solid)) errs.push(`${where}: ${o.label} は踏めるタイルに置く必要があります`);
  }
  // 開始位置から全オブジェクトへ到達できるか（隣接マスに行ければよい）
  if (s && m.walkable(s.x, s.y)) {
    const seen = new Set([`${s.x},${s.y}`]);
    const q = [[s.x, s.y]];
    while (q.length) {
      const [x, y] = /** @type {number[]} */ (q.shift());
      for (const [dx, dy] of Object.values(DIRS)) {
        const k = `${x + dx},${y + dy}`;
        if (!seen.has(k) && m.walkable(x + dx, y + dy)) { seen.add(k); q.push([x + dx, y + dy]); }
      }
    }
    for (const o of m.objects) {
      const reach = o.tiles.some(([x, y]) => seen.has(`${x},${y}`) || Object.values(DIRS).some(([dx, dy]) => seen.has(`${x + dx},${y + dy}`)));
      if (!reach) errs.push(`${where}: ${o.label} に開始位置から到達できません`);
    }
  }
  return errs;
}
