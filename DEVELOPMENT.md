# 開発ガイド（ゲーム実装）

仕様書は `README.md`・`CLAUDE_MASTER_PROMPT.md`・`00_`～`14_`・`data/`、台本は `15_シナリオ台本/` を参照。実装状況と資料の矛盾一覧は `docs/01_開発開始レポート.md`・`docs/02_シナリオ実装レポート.md`。

## 遊ぶ

**`ゲームを起動.bat` をダブルクリック**するとサーバーが起動し、ブラウザが開きます（Node.js が必要）。黒い画面を閉じるとゲームも終了します。

コマンドで起動する場合：`npm run serve` → http://localhost:5173/（スマホからは同一LAN上のPCのIPアドレスで）。

## 操作（歩けるマップ）

- **十字キー＋Enterだけで全部遊べる**：メニュー・戦闘コマンド・選択肢は十字キーで選んでEnterで決定（`game/src/ui/keynav.js`）。会話は Enter（または↓）で進む。↑でログ・オート・スキップのボタンへ。
- 移動：矢印キー／WASD（スマホは画面左下の十字ボタン）。調べる・話す：Enter／Space／Z（スマホは A ボタン）。扉に向かって歩くと入る。学園マップでは何もない所で Enter を押すとメニュー（ステータス・編成・セーブ）。
- 学園（ストーリーモード）はマップを歩いて施設に入る：**教室＝次の話**、訓練場＝訓練戦、寮＝休息・セーブ、保健室＝回復（第21話以降）。右上「メニュー」で従来の学園メニュー（ステータス・編成など）。
- 物語中のマップ：第1話 龍一郎の部屋（調べる）→ 黒馬家の前（街道まで歩く）、第4話 学園内自由移動、第28話 訓練場（A組の生徒に話しかける）。
- 会話中の背景は場面の場所・時間帯から自動で選ぶ（`data/scenario/backgrounds.json`、描画は `game/src/ui/scenery.js`）。
- マップは `data/scenario/fieldmaps.json`（1文字＝1マス。記号は `game/src/field/fieldMap.js` の TILES）。形・配置は台本に記載がないため仮。

## セーブ

- 学園画面の「セーブ」でスロット1～3に保存。タイトルの「つづきから」で再開。
- オートセーブ：ストーリーモードで、話の開始時と学園画面に戻ったときに自動保存（話の途中でやめた場合はその話の最初から）。
- 保存先はブラウザ（localStorage）。別のブラウザ・端末へ移すときは「ファイルに書き出す／ファイルから読み込む」。
- セーブには進行状態だけを保存し、能力値などの正式データは含めない（データ更新後もそのまま読める）。

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
