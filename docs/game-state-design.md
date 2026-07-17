# ゲーム状態データ構造（設計）

参考: [rulebook.md](rulebook.md)、[cards.md](cards.md)、[board-reference/](board-reference/)（ユドンリウムコネクト版のスクリーンショット3枚。準備前→準備完了→ゲーム途中）

盤面レイアウトの実例としてユドコネ版スクショを参照したが、"Face Down Card Area" "Hands Area"（自分だけ中身が見える表示切替）はユドンリウムコネクトというツール自体の汎用機能であり、本ゲーム固有のルールではないため、本設計には反映しない。手札はシンプルに「本人にのみ内容が見える」ものとして扱う。

## 全体構造

```
GameState
├─ phase: "lock" | "hand" | "move" | "gameOver"
├─ currentPlayerId
├─ winnerId: PlayerId | null
├─ board: Board            -- 7x7の場
├─ players: Player[]
├─ deck: CardInstance[]        -- 山札（共有・裏向き、配列の末尾が1番上）
├─ discardPile: CardInstance[] -- 捨て場（共有・表向き、配列の末尾が1番上）
├─ eternalDeck: CardInstance[] -- エターナルカード山（共有・裏向き）
└─ actionLog: Action[]         -- 状態変更の履歴（オンライン同期用）
```

## Board

```
Board
└─ cells: Cell[7][7]

Cell
├─ position: { row, col }
├─ stack: CardInstance[]         -- 複数枚重なる可能性がある。末尾 = 1番上
└─ occupantPlayerId: PlayerId | null   -- このマスにいる駒（1マスに1つまで）
```

ゲートは盤面外の別要素ではなく、7x7の中の4辺中央のマス（例: (0,3), (6,3), (3,0), (3,6)）として扱う。各プレイヤーの`gatePosition`でどのマスが誰のゲートかを紐づける。

## Player

```
Player
├─ id
├─ seatIndex          -- ターン順（時計回り）
├─ color               -- 駒の色。赤|橙|黄|緑|青|桃|紫のいずれか（ファーストカードの色と一致）
├─ position: { row, col }   -- 現在の駒の位置
├─ gatePosition: { row, col } -- 自分のゲート（固定）
├─ hand: CardInstance[]   -- 手札。本人にのみ内容が見える。他プレイヤーには枚数のみ公開
└─ lockAreas: { 赤: CardInstance|null, 橙: …, 黄: …, 緑: …, 青: …, 桃: …, 紫: … }
```

補足: 「なないろの欠片」のように1色に複数枚ロックされる例外があるため、`lockAreas`の値は将来的に配列に拡張する可能性がある（現状は基本1枚なのでオブジェクト単体で開始し、必要になったら配列化する）。

## カードのデータ

```
CardDefinition   -- cards.mdの内容をデータ化したもの（カードの「種類」の定義）
├─ id             -- 例: "red-jump-pad"
├─ name           -- 例: "ジャンプ台"
├─ color           -- 赤|橙|黄|緑|青|桃|紫|虹|白|黒
├─ category        -- "normal" | "first" | "eternal"
├─ baseEffectText  -- ★（黒の契約の烙印など一部のみ）
├─ reachEffectText -- ●（あれば）
├─ handEffectText  -- ■（あれば）
├─ flavorText      -- Ω
└─ notes           -- ※ 補足

CardInstance     -- 実際に卓上・手札にある1枚（同じ種類が複数枚存在するため区別が必要）
├─ instanceId    -- 一意なID
├─ cardDefId      -- CardDefinitionへの参照
└─ faceUp         -- 表向きかどうか（山札・場のカードに適用。手札・ロック済みカードは常時表向き扱い）
```

## Action（状態変更の単位）

`現在の状態 + アクション → 次の状態` の純粋な形で扱う。

```
Action
├─ type       -- 例: "LOCK_CARD" | "DRAW" | "MOVE" | "CONTACT" | "USE_HAND_EFFECT" | "OPEN_CARD" | "PLACE_BLIND_CARD" | "GATE_BONUS_RESOLVE" ...
├─ playerId
├─ payload    -- アクション種別ごとのデータ
└─ timestamp
```

### 乱数の扱い（合意事項）

「無作為に1枚」「シャッフル」等の乱数が絡む処理は、各クライアントが個別に乱数を生成すると1人用⇄オンライン非同期の間で同期が壊れる。そのため、乱数の結果はアクションを発生させた側（1人用なら自分のクライアント、オンライン化後はサーバー）が決定し、その結果を**アクションのpayloadに確定値として含めて記録する**。

例: `DRAW`アクションには「山札の先頭から引く」という指示だけでなく、実際に引いた`instanceId`を含める。これにより、1人用でもオンライン同期後でも同じ`applyAction`ロジックで再生可能になる。

## 未確定・今後の検討事項

- `lockAreas`の値を単一カードか配列にするか（「なないろの欠片」対応）は実装時に決定
- フェーズ内の「宣言」→「処理」ステップ（FAQ参照）をどこまで状態として明示的に持つか（今は大枠のphaseのみ）
- サーバー側で全プレイヤーの手札を保持しつつ、クライアントへ送る際に他プレイヤーの手札内容を枚数のみに間引く「ビュー生成」処理は、オンライン化のタイミングで別途設計する
