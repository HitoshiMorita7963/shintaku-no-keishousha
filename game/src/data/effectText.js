// スキルJSONの effect（説明文）→ 構造化効果。対応表は data/provisional/effect_rules.json。

/**
 * @param {{exact: Record<string, import('../types.js').EffectSpec>, patterns: {regex:string, effects: import('../types.js').EffectSpec}[]}} rules
 * @param {string | undefined | null} text
 * @returns {import('../types.js').EffectSpec | null} 未登録なら null
 */
export function resolveEffectText(rules, text) {
  if (text == null || text === '') return {};
  if (Object.prototype.hasOwnProperty.call(rules.exact, text)) return rules.exact[text];
  for (const p of rules.patterns) {
    if (new RegExp(p.regex).test(text)) return p.effects;
  }
  return null;
}
