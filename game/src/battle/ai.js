// 敵AI（仮仕様：data/provisional/battle_rules.json enemy_ai）。
// 行動は敵データの skills（重み付き）から抽選。単体技の対象は HP割合が低い相手をやや優先。

/** @typedef {import('./unit.js').BattleUnit} BattleUnit */

/**
 * @param {import('./engine.js').BattleEngine} engine
 * @param {BattleUnit} u
 * @returns {import('../types.js').BattleAction}
 */
export function decideEnemyAction(engine, u) {
  const { data, rng, rules } = engine;
  const usable = u.enemySkills.filter((s) => data.skill(s.id).spCost <= u.sp);
  const choice = usable.length ? rng.weighted(usable, (s) => s.weight) : { id: 'SKL_ENE_ATTACK', weight: 1 };
  const skill = data.skill(choice.id);
  const cands = engine.targetCandidates(u, skill.target);
  /** @type {string[]} */ let targetIds = [];
  if (skill.target === 'single_enemy' || skill.target === 'single_ally') {
    const bias = rules.enemy_ai.low_hp_target_bias;
    const t = rng.weighted(cands, (c) => 1 + bias * (1 - c.hp / c.maxHp));
    if (t) targetIds = [t.uid];
  }
  return { command: 'enemy', skillId: skill.id, targetIds };
}

/**
 * テスト・自動戦闘用の簡易味方AI（UIでは使わない）。使える攻撃技からランダムに選ぶ。
 * @param {import('./engine.js').BattleEngine} engine
 * @param {BattleUnit} u
 * @returns {import('../types.js').BattleAction}
 */
export function decideAutoPartyAction(engine, u) {
  const { rng } = engine;
  const commands = ['attack', 'attack', 'shingi', 'tengeki', 'artifact', 'guardian'].filter((c) => !u.allowedCommands || u.allowedCommands.includes(c));
  if (!commands.length) return { command: 'guard', skillId: 'SKL_GUARD', targetIds: [] };
  for (let tries = 0; tries < 8; tries++) {
    const command = rng.pick(commands);
    const opts = engine.options(u, command).filter((o) => o.usable);
    if (!opts.length) continue;
    const o = rng.pick(opts);
    if (o.kind === 'release') return { command, special: 'release', targetIds: [] };
    const cands = engine.targetCandidates(u, o.target);
    return { command, skillId: o.id, targetIds: cands.length ? [rng.pick(cands).uid] : [] };
  }
  const foes = engine.targetCandidates(u, 'single_enemy');
  return { command: 'attack', skillId: 'SKL_ATK', targetIds: foes.length ? [foes[0].uid] : [] };
}
