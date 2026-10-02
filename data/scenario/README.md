# data/scenario — シナリオ（イベント）データ

ユーザー提供の正式台本（`15_シナリオ台本/`）から作ったゲーム用シナリオです。
台詞・地の文は台本の文言をそのまま使い、`npm run validate` で **台本原文と1行ずつ照合** します（不一致はエラー）。

## ファイル

| ファイル | 内容 |
|---|---|
| `ch2/epNN.scn` | 第2章 第NN話のシナリオ（1話1ファイル） |
| `ch2_battles.json` | 第2章のストーリー戦闘（参加者・相手・勝敗・戦闘中イベント） |
| `speakers.json` | 話者ラベル → キャラクター／守護獣／敵／NPC |
| `enemies.json` | 台本にのみ登場する敵（悪意モンスター等。ステータスは仮値） |
| `text_corrections.json` | 台本表記を正式データに合わせる置換（例：夜神神楽→夜桜神楽） |

## .scn の書き方

```
// コメント
@episode 6 荒垣剛毅
@scene 06-01 朝・A組教室 @ A組教室      ← 「@ 」の後ろは場所（省略可）
龍一郎「台詞」                            ← 台詞（話者は speakers.json に登録が必要）
咲＞ほぼ即答。                            ← 人物の様子（台本の「### 咲 ほぼ即答。」）
教室が静かになる。                        ← 地の文（「」で終わらない行）
= 「まだ眠い……」                         ← 「」で終わる地の文は = を付ける
■ 神器「風牙剣・迅風」を入手した！        ← システムメッセージ
[battle EP06_B1]                          ← 戦闘（ch2_battles.json）
[join A03]                                ← 戦闘加入（文言を変える場合：[join A14 仲間になった]）
[flag MASAMA_INTEREST=TRUE]               ← フラグ（台本のフラグ名をそのまま）
[awaken A05 氷,木,焔,嵐,霆,聖,冥]          ← 上位属性の覚醒
[numbers A01=1,A15=2,…]                   ← A組番号の発表
[unlock 項目、項目]                       ← 解禁表示
[title 第2章「学園生活編」本格開始]        ← タイトルカード
[fx 暗転]                                 ← 画面演出（暗転・白転・暗く）
[explore 調べる] ? ベッド … [/explore 家を出る]   ← 調べる場所の選択肢
[explore 調べる @ROOM_KUROMA] …                 ← マップを歩いて調べる（選択肢名・終了ラベル＝fieldmaps.json のオブジェクト名）
[walk FIELD_HOME]                              ← マップを歩かせる（goal に着くと次へ）
@block EP06_T1 … @end                     ← 戦闘中イベントの台詞（ch2_battles.json の triggers から参照）
```

## 戦闘定義（ch2_battles.json）の要点

- `result_mode`：`must_win`（勝利必須・負けたら再戦）／`any`（勝敗どちらでも進行）／`scripted`（台本で結果が決まっている。`end_after_turns` ターンで終了し `story_result` を適用）
- `opponents`：`{ "enemy": "ENE_…" }` または `{ "character": "A03" }`（相手もキャラクターの正式データで戦う）
- `min_hp_ratio`：そのHP割合より下がらない（「撃破できない」演出）。`hp_ratio`：開始時HP割合。`scale`：1対1ボス戦用の縮小（仮）
- `command_limits`：使えるコマンドの制限（第2話の初戦闘）
- `triggers`：戦闘中イベント。`when`（`turn_at_least`／`hp_below`／`any`）→ `block`（台詞）＋ `actions`（`unlock_commands`／`awaken`／`release_guardian`／`affinity`／`end_battle`）
- `exchange`：B組交流戦の対戦。結果は正式データ `data/events/CH2_B_EXCHANGE_RESULTS.json` と照合される

編集後は `npm run build:data` で反映（コード変更は不要）。
