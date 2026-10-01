# data/confirmed — ユーザー確定の追加設定

ZIP（v1.5.1）受領後に **ユーザーが確定した** 設定のうち、ZIP原本のJSON（`tools/canon/canon_lock.json` でロック）を書き換えずに追加するもの。

- `data/provisional/`（Claudeの仮値）とは違い、ここは確定設定。Claude が勝手に追加・変更しない。
- 参照IDの存在は `npm run validate` で検査される。

| ファイル | 内容 |
|---|---|
| `character_traits.json` | キャラクター固有の戦闘特性（染川咲：天撃全属性マスター・属性不一致の天撃ダメージ×1.2） |
