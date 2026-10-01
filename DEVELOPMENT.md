# 開発ガイド（ゲーム実装）

仕様書は `README.md`・`CLAUDE_MASTER_PROMPT.md`・`00_`～`14_`・`data/`、台本は `15_シナリオ台本/` を参照。実装状況と資料の矛盾一覧は `docs/01_開発開始レポート.md`・`docs/02_シナリオ実装レポート.md`。

## 遊ぶ

```bash
npm install
npm run build:data
npm run serve
```

ブラウザで http://localhost:5173/ を開く（スマホからは同一LAN上のPCのIPアドレスで）。

## コマンド

| コマンド | 内容 |
|---|---|
| `npm run validate` | データ整合性チェック（原本ロック照合・Markdown突き合わせ込み） |
| `npm run build:data` | `data/` → `game/generated/data.bundle.js`（検証エラー時は生成しない） |
| `npm run typecheck` | JSDoc 型チェック |
| `npm test` | 自動テスト |
| `npm run check` | 上記すべて |

## データを変えたいとき

- 正式データ（`data/characters` 等）は **ユーザーの指示なしに変更しない**。`tools/canon/canon_lock.json` と照合され、変更すると検証エラーになる。
  ユーザー承認後のみ `node tools/make-canon-lock.mjs --confirm-user-approved-update` でロックを更新。
- 未確定の数値（ダメージ式の係数、神技の威力、敵ステータス等）は `data/provisional/*.json` を編集 → `npm run build:data`。コード変更は不要。
- `data/provisional/` は正式値を上書きできない（null・未確定の欄のみ補完）。上書きしようとすると検証エラー。

## シナリオを変えたいとき

- 台詞・場面：`data/scenario/ch2/epNN.scn`（書き方は `data/scenario/README.md`）
- 戦闘：`data/scenario/ch2_battles.json`
- 台本（`15_シナリオ台本/`）にない文言を書くと `npm run validate` がエラーにします。

## コード構成

- `game/src/battle/engine.js` — 戦闘エンジン（UI非依存・イベント列を返す）
- `game/src/battle/formulas.js` — 計算式（純関数）
- `game/src/model/growth.js` — キャラLv／神器Lv／親和度（三軸独立）
- `game/src/data/validate.js` — 整合性チェック（CLI・テスト・ゲーム内で共通）
- `game/src/story/` — シナリオのパーサー・検証・進行（UI非依存）
- `game/src/ui/screens/story.js` — イベント再生画面
