import fs from 'node:fs';
import path from 'node:path';
import { loadRawData, ROOT } from '../tools/lib/load-raw.mjs';
import { GameData } from '../game/src/data/gameData.js';

let cached = null;
export function load() {
  if (!cached) {
    const raw = loadRawData();
    const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'canon', 'canon_lock.json'), 'utf8'));
    cached = { raw, lock, data: new GameData(raw) };
  }
  return cached;
}
