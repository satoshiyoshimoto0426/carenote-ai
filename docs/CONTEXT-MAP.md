# CONTEXT-MAP — carenote-ai（ナレッジグラフ lite）

> AI のコード調査の**第一手**はここと該当 `docs/` を読むこと（横断規約 §2.5-E）。
> 各モジュールが「何を持つか」と「主要な横断接続（データフロー）」を1枚で把握する。
> コード変更で構成・接続が変わったら、同じ PR でここを更新する（Doc-as-Code）。
> プロダクトの正本は [`../SPEC.md`](../SPEC.md)。本書はその実装マップ。

---

## 1. 現状のモジュール構成（何を持つか）

| モジュール | 役割 |
|---|---|
| `middleware.ts` | Clerk 認証ゲート。公開ルート（`/sign-in`, `/sign-up`）以外を保護 |
| `app/(auth)/` | Clerk のサインイン/サインアップ画面 |
| `app/(dashboard)/dashboard/` | 履歴ダッシュボード（過去の評価一覧） |
| `app/(dashboard)/evaluate/` | PDFアップロード＋評価実行 UI（クライアント） |
| `app/api/blob-upload/` | Vercel Blob のアップロード用トークン発行 |
| `app/api/evaluate/` | Claude API でPDFを評価→JSON整形→Supabase保存→Blob削除。モデル名は `lib/evaluate/model.ts`（別名 `claude-sonnet-4-5`・Issue #4）。履歴の file_name は元のファイル名を使わず固定の「資料」（`lib/evaluate/storedFileName.ts`・Issue #10。修正前の行には元の名前が残る） |
| `app/api/history/` | ログインユーザーの評価履歴を返す |
| `components/` | UI部品（FileUploader / LoadingProgress / EvaluationResults / CategoryCard / ScoreRing / MiniBar / SharingStatus）。外枠（左の帯・上の帯）は `components/shell/`（§3「外枠」） |
| `lib/db.ts` | Supabase データアクセス（saveEvaluation / getEvaluations。読めなければ `DbAccessError` ── `lib/db/errors.ts`。使われていなかった getEvaluationById は 2026-09-24 に削除） |
| `lib/requestBody.ts` | API の入口が **JSON の**本文を読む道（`readJsonObject`: JSON のオブジェクトだけ通し、読めない JSON・`null`・配列・文字列などは null → 入口が 400）。使う入口は clients・clients/[id]/related・documents・documents/[id]・transcripts・generate・preview・kaipoke/assessment・rescue・extension/generate・blob-upload・evaluate の 12（blob-upload と evaluate は 2026-09-24 に寄せた ── それまでは直接読み、blob-upload は壊れた JSON で JSON の無い 500 だった）。JSON でない本文は別: `/api/transcribe` は音声を formData で読む。入口ごとの 400 は `tests/api/entryErrors.route.test.ts` |
| `lib/evaluationCriteria.ts` | 評価プロンプト（8カテゴリ・27点満点の採点基準） |
| `lib/exportExcel.ts` | 評価結果の Excel 出力（xlsx） |
| `lib/supabase/{client,server}.ts` | Supabase クライアント（anon＝RLS / service role＝RLSバイパス・サーバ専用） |
| `types/evaluation.ts` | 評価関連の型（EvaluationResult ほか） |
| `supabase/schema.sql` | DB スキーマ（evaluations テーブル） |

## 2. 主要な横断接続（データフロー）

```
[ブラウザ] ──(全リクエスト)──> middleware.ts ──(Clerk)──> 認証チェック
   │
   │ evaluate ページ（client）
   ├─ upload() ─────────────> /api/blob-upload ──> Vercel Blob（PDF一時保管）
   │
   └─ POST ─────────────────> /api/evaluate
                                  ├─ Vercel Blob から PDF 取得
                                  ├─ Claude API（PDF評価・JSON生成）
                                  ├─ lib/db.saveEvaluation ──> Supabase（evaluations）
                                  └─ del(blob)（個人情報保護のため評価後に削除）

[ダッシュボード] ── /api/history ──> lib/db.getEvaluations ──> Supabase
[評価結果画面]   ── lib/exportExcel ──> xlsx ダウンロード
```

外部サービス: **Clerk**（認証）, **Supabase**（DB・RLS）, **Vercel Blob**（PDF一時保管）, **Claude API**（評価＋ケアプラン生成）。

## 3. 作成補助（再定義の本体）── 実装状況

> 詳細と段階フェーズは [`../SPEC.md`](../SPEC.md) を参照。製品の軸は「評価」から「作成補助」へ。

| モジュール | 役割 | 状況 |
|---|---|---|
| `lib/rules/` | **品質エンジン**：帳票別の作成ルール（carePlan / assessment / monitoring）。**v1=吉本（ケアマネ歴13年）の知見ベース**（意向形ニーズ/長期12か月・短期6か月/です・ます体/アセスメント連動・根拠の記録性を最重視）。生成プロンプトへ注入 | v1反映済 |
| `lib/anthropic.ts` | Anthropic SDK クライアント（既定 Opus 4.8、`ANTHROPIC_MODEL` で上書き可） | P1実装済 |
| `lib/generation/structured.ts` | 全帳票共通の生成コア（adaptive thinking＋構造化出力＋プロンプトキャッシュ） | P1実装済 |
| `lib/generation/{carePlan,assessment,monitoring,meetingSummary,supportLog}.ts` | 帳票別の生成（スキーマ＋プロンプト構築。`*Prompt.ts` は純粋関数でテスト済）。第4表=担当者会議の要点、第5表=支援経過も対応。各 generate に `options.rescue` を追加（救済モードで完成形まで埋める） | P1実装済 |
| `lib/rules/rescue.ts` | 救済モードのプロンプト上書き（「創作しない」を限定緩和。吉本承認・§2.7-C）。各 generate が options.rescue 時に末尾追記 | 実装済 |
| `lib/generation/rescue.ts` | **救済モード**：人物像（＋時系列 `timeline`）から書類一式を依存順生成（アセス→第1/2表→{会議・経過・モニタリング}を並列）。上流出力を `lib/draftText` で文字列化し下流入力へ。メモ組立は純粋関数・テスト済 | 実装済 |
| `lib/generation/rescueIntake.ts` | **救済モード Stage0**：PDF資料（最大5件・documentブロック）＋手打ち人物像を1回のAI読解で「出典付きサマリ＋要注意点」に統合（`generateIntake`）。氏名等は転記せず一般表現へ。プロンプトは純粋関数・テスト済 | 実装済 |
| `lib/draftText.ts` | 下書き→コピー用プレーンテキスト整形（純粋関数・テスト済）。救済モードの帳票連結にも使用 | P1実装済 |
| `app/api/generate/` | 認証＋`documentType`分岐（carePlan/assessment/monitoring）＋入力検証 | P1実装済 |
| `app/api/rescue/` | 救済モードAPI（Clerk認証）。人物像（＋timeline／sourceDocs=Blob上のPDF最大5件）→（資料あれば Stage0 `generateIntake`）→`generateRescueBundle`→一式JSON＋`intake`。PDFは finally で必ず del()（非保持原則）。maxDuration=300 | 実装済 |
| `app/(dashboard)/create/` | 作成UI（つくる）：書類の種類の文字のタブ（`components/create/DocTypeTabs.tsx`）→入力→送る前に見る→下書き・確認・コピー（`components/drafts/` に表示部品）。タブの行の右端に一式まとめて（救済モード `/rescue`）への入口（A案 R1 ── §3「つくるの見た目」） | P1実装済 |
| `app/(dashboard)/rescue/` | 救済モードUI：人物像の**構造化フォーム**（性格/生活歴/既往・診断/心身/家族・住環境/サービス/意向/補足）→一式生成→全帳票表示＋コピー。完成形まで埋める旨のバナー表示 | 実装済 |
| `extension/` | **時短エンジン**：ブラウザ拡張(MV3)。対象=**カイポケ**。サイドパネルで下書き生成→セクション単位コピー(Step1)＋カイポケ画面へ流し込み(Step2)。`src/adapters/kaipoke.js`＝CareNote→カイポケ欄マッピング(出典[KAIPOKE-DOM.md](KAIPOKE-DOM.md))。調査: [P2-KAIPOKE.md](P2-KAIPOKE.md)・[CALL-PIPELINE-FEASIBILITY.md](CALL-PIPELINE-FEASIBILITY.md)（電話録音→要約→転記の可否／カイポケ公開APIは無し・公認既製品あり・2026-09-09） | **P2 Step1+Step2 実装済**（テキスト欄の半自動入力。第2表等はDOM追加取得後） |
| 評価（現行） | 独立機能として継続。開発時は生成物の品質回帰チェックにも転用 | 継続 |

### 生成のデータフロー（P1実装済・3帳票）
```
[作成ページ /create] ──(帳票選択＋メモ入力)──> POST /api/generate ──(Clerk認証)──
   └─ documentType で分岐: generateAssessment / generateCarePlan / generateMonitoring
        └─ lib/generation/structured.generateStructuredDraft（共通コア）
             ├─ system = 役割 + lib/rules/<帳票>（品質ルール） ※プロンプトキャッシュ
             ├─ Claude API（構造化出力で帳票JSONを生成）
             └─> 下書き ──> components/drafts/<帳票>View で表示 → lib/draftText でコピー（人が確定）
```

### 拡張のデータフロー（P2実装済・カイポケ）
```
[サイドパネル extension/src/panel.js]
   ├─ 生成: POST {baseUrl}/api/extension/generate（Bearer = 利用者別トークン。認可=lib/extensionAuth・G3）
   │        └─ lib/generation/dispatch.generateFromBody（Web版と共通コア）→ 下書きJSON
   │   ※JSON貼付での読込もフォールバックで可（API未設定でも転記支援は使える）
   ├─ 表示: 帳票をセクション単位で表示・ワンクリックコピー（Step1・どのソフトでも使える）
   └─ 流し込み: chrome.tabs.sendMessage(activeTab, CARENOTE_INJECT)
        └─ extension/src/content.js（r.kaipoke.biz常駐）
             └─ globalThis.CareNoteKaipoke.inject（src/adapters/kaipoke.js）
                  └─ name優先→ラベル近接探索で欄を解決 → JSF互換でvalue設定＋input/change発火
                     ＋ハイライト表示（保存・確定は人間／SPEC F7）
```
セキュリティ: 拡張はカイポケ画面の内容を外部送信しない。ログイン情報も扱わない（SPEC §12）。
下書きはローカル(chrome.storage.local)のみ保存。外部送信は生成API（自分のバックエンド）だけ。

### 救済モードのデータフロー（実装済・SPEC §6.5 F9）
```
[救済ページ /rescue] ──(人物像フォーム＋時系列 timeline＋PDF sourceDocs≦5)──> POST /api/rescue ──(Clerk認証)──
   └─ Stage0（sourceDocs があるときのみ）: Blob取得→base64→rescueIntake.generateIntake
        （documentブロックで統合読解→出典付き summary＋cautions。処理後 finally で必ず del()）
   └─ composeRescueNotes（Stage0サマリを人物像メモの先頭に連結・純粋関数。手打ち優先はルール側で指示）
   └─ lib/generation/rescue.generateRescueBundle（依存順オーケストレーション・全帳票 rescue=true）
        1) generateAssessment(persona)
        2) generateCarePlan(persona + アセス結果)            ← assessmentToText で連結
        3) Promise.all[ generateMeetingSummary / generateSupportLog / generateMonitoring ]
                                                            ← carePlanToText で連結（並列）
        └─> {assessment, carePlan, meetingSummary, supportLog, monitoring, intake?}
             └─ components/drafts/<帳票>View で一括表示＋コピー（モードバナーで「下書き・要事実照合」明示）
```
品質緩和（救済モードのみ）: `lib/rules/rescue.RESCUE_SYSTEM_OVERRIDE` を各 generate の system 末尾に追記し、
完成形まで埋める（保留印なし）。通常生成は従来ルール（創作しない）を維持。氏名等の固有事実は創作しない。

### 利用者保存（A案・フェーズ1）── 実装状況
> 仕様: [specs/ui-redesign-and-client-storage.md](specs/ui-redesign-and-client-storage.md)。要配慮個人情報を扱うため R2（個人情報・法務）と一体。

| モジュール | 役割 | 状況 |
|---|---|---|
| `lib/privacy/crypto.ts` | 実名のアプリ層暗号化（AES-256-GCM・鍵=`CARENOTE_PII_KEY`） | 実装・テスト済 |
| `lib/privacy/pseudonymize.ts` | 氏名⇄記号の置換＋利用者コード採番（純粋・テスト済） | 実装・テスト済 |
| `lib/privacy/retention.ts` | 保持期限算出（5年） | 実装・テスト済 |
| `lib/db/errors.ts` | DB の失敗を「0件・見えない・空」と分ける共通の部品（`DbAccessError`〔職員向けの `publicMessage` つき〕・`dbFailedMessage`・`isMalformedIdError`〔22P02 は0件扱い〕）。`ClientLookupError` はこの子。見張り= `lib/db/dbFailures.test.ts`（2026-09-24） | 実装済 |
| `lib/db/{clients,documents}.ts` | 利用者・帳票のデータアクセス（service role＋アプリ層 created_by スコープ。実名は client_identities に暗号化）。approve/unapproveDocument（G4）。`getLatestDocMeta`（利用者一覧の日付の列の材料。本人が保存した書類の種類・状態・保存日時だけ・ページに分けて全部読む ── 2026-09-24 U5）。帳票の `content` は**暗号化しない JSONB**で、名簿の名前は記号・番号類は戻した元の値・名簿に無い名前はそのまま入り得る（「実名を含めない」とは言えない。2026-09-23 に説明を事実へ訂正） | 実装済 |
| `app/api/clients/`・`app/api/clients/[id]/`・`app/api/documents/`・`app/api/documents/[id]/` | 利用者CRUD（一覧/作成/詳細＋帳票）・帳票保存・帳票承認 PATCH（Clerk認証） | 実装済 |
| `app/api/clients/latest-docs/`・`lib/documents/latest.ts` | 利用者一覧の「書類の種類ごとの最新日付」と「更新」（GET・Clerk認証・no-store）。`latest.ts` は純粋なまとめ（`summarizeLatestDocs`・ブラウザでも読める）。画面の列は統合の後で繋ぐ（下の「利用者一覧の書類の日付」） | API 実装済（2026-09-24） |
| `lib/clients/{listError,useClientList}.ts` | 画面から利用者一覧を読む（`fetchClientList`・`useClientList`）。「0人」と「読めなかった」を分け、読めなかったときの文言（先頭は必ず「利用者一覧を読めませんでした」）を1か所に置く。ブラウザでも読むのでサーバ専用のものを import しない。使う側: `fetchClientList` は利用者の画面の表（`components/clients/ClientsContext.tsx`）、`useClientList` は文字起こしの保存（`SaveTranscriptBar`）と `/rescue` の保存パネル | 実装済（2026-09-23） |
| `types/{client,document}.ts` | 利用者・帳票の型 | 実装済 |
| `supabase/clients_documents.sql`・`supabase/approval_migration.sql` | clients / client_identities / documents ＋ RLS（多層防御）。approval_migration は既存DBへの G4 列追加（冪等） | 要適用（SQL Editor） |

**承認モデル（G4・2026-07-09）**: documents.status は `draft|approved` の2状態。保存（POST /api/documents）は
**常に draft**（クライアントの status 指定は無視）。承認は `PATCH /api/documents/[id] {action:"approve"|"unapprove"}`
の人間操作のみ（approved_at/approved_by を監査証跡に記録・created_by スコープ）。**未承認の保存書類はコピー不可**
（UI 側で disabled。生成直後・保存前のコピーは従来どおり可）。コピー整形は `lib/draftText.documentContentToText`。

**保存先の確かめ（2026-09-23・作り直し計画 S1）**: `POST /api/documents` は ①ログイン（401）②`resolveScope`（範囲を決められなければ DB に触らず 503）③本文と中身の形（本文がオブジェクトでなければ 400「リクエストの解析に失敗しました。」。中身はオブジェクトのみ・配列・文字列は 400・入れ子は **32段**まで・超えたら 400）と大きさ（JSON で **200KB** まで・超えたら 413）④`getClientById(clientId, scope)`（名簿と同じ範囲で見えない利用者なら **404「利用者が見つかりません。」で保存しない**。**DB を読めなければ 503 と `CLIENT_LOOKUP_FAILED_MESSAGE`** で保存しない）⑤`saveDocument`（常に draft・org_id はログイン中の範囲）の順。以前は Clerk の orgId をそのまま保存し、保存先が見えるかを確かめていなかった（id が分かれば他事業所の利用者に紐づけられた）。縛るのは `tests/api/documents.route.test.ts`（本物の saveDocument ＋偽 Supabase で、書こうとした行まで見る）と `tests/api/orgScope.route.test.ts`。

**「見えない」と「読めなかった」を分ける（2026-09-24・S1 の検収の指摘）**: `getClientById` は 0件をエラーにしない `maybeSingle` で読み、見えない・存在しない・uuid の形でない id（22P02）は `null`、**DB の失敗は `ClientLookupError` を投げる**（以前はどちらも `null` で、DB が一瞬落ちただけで書類の保存が 404「利用者が見つかりません。」と答え、救済モードの職員が「新しい利用者として保存」で同じ方を二重に登録し得た ── U0 で止めた二重登録の裏口）。`getClientById` を通る入口すべて（`POST /api/documents`・`GET /api/clients/[id]`・`/api/clients/[id]/related` の GET/POST/DELETE・`/api/transcripts` の POST/GET・`/api/transcripts/[id]` の GET/DELETE）が **503 と `CLIENT_LOOKUP_FAILED_MESSAGE`**（「見つかりません」とは言わない）を返す。関係者名簿（`getRelatedPeople/addRelatedPerson/deleteRelatedPerson`）と文字起こし（`lib/db/transcripts.ts`）はこの例外を握らずに投げる。本文の読み方は `lib/requestBody.ts` の `readJsonObject` に一本化（JSON の `null`・配列・文字列・数値は 400。以前は `body.x` が TypeError になり JSON の無い 500 だった。同じ書き方が本文を読む 10 の入口にあった）。入口をまたいだ 400／503 は `tests/api/entryErrors.route.test.ts`、判定そのものは `lib/db/clients.test.ts`・`lib/db/transcripts.test.ts`・`lib/requestBody.test.ts` が縛る。

**lib/db 全体で「0件」と「DB の失敗」を分ける (2026-09-24・S1 の検収の指摘 ── 同じ種類の3回目)**: 上の直しの後も、隣の関数が DB の失敗を 0件で返していた（`getRelatedPeople`・`getTranscriptsByClient`・`getDocumentsByClient`・`getEvaluations` は `[]`、`getTranscriptText` と `approveDocument`/`unapproveDocument` は `null`、`deleteTranscript` は `false` ＝入口で「見つかりませんでした」「書類が見つかりません。」）。いまは共通の `lib/db/errors.ts` の `DbAccessError` を投げ（1件を読むものは `maybeSingle`、uuid の形でない id は0件扱い、`deleteTranscript` は消えた件数まで見る）、入口（`GET /api/clients/[id]`・`PATCH /api/documents/[id]`・`GET /api/clients/[id]/related`・`GET /api/transcripts`・`GET/DELETE /api/transcripts/[id]`・`GET /api/history`）が **503 と `e.publicMessage`** を返す（`ClientLookupError` も子なので同じ受け方）。「失敗」だけを表す戻り値（`saveDocument`・`createClientRecord`・`saveEvaluation` の null、`saveTranscript` の `failed`、`deleteRelatedPerson` の `"error"`、`addRelatedPerson` の「登録に失敗しました。」）はそのまま。**見張り** `lib/db/dbFailures.test.ts`: Supabase を偽物にして問い合わせを1つずつ失敗させ、どの関数も「0件・見えない・空」と答えないことを確かめる。`lib/db.ts`・`lib/db/*.ts` の async 関数が一覧（CONTRACTS）に無ければ落ちる（新しい関数は DB が落ちたときの答えを決めて載せる）。入口の 503 は `tests/api/entryErrors.route.test.ts` の `DB_FAILURE_ROUTES`。
**画面も黙らない（同日）**: 503 を受けた画面が空・0件に見せないよう、`components/clients/RelatedPeople.tsx`（関係者名簿）・`components/clients/SavedTranscripts.tsx`（残した文字起こし ── 旧「保存した文字起こし」。以前は欄ごと消えていた・「消す」の失敗はサーバの文をそのまま）・`app/(dashboard)/dashboard/page.tsx`（評価の履歴。件数は 0 でなく「—」）が、読めなかったことを `role="alert"` の文字で出す（名簿と文字起こしは「もう一度読む」つき）。検査= `tests/ui/clientListErrors.live.test.tsx`。

**利用者一覧の書類の日付（2026-09-24・作り直し計画 U5 の API 部分・吉本さん決定 2026-09-23）**: `GET /api/clients/latest-docs` は ①ログイン（401）②`resolveScope`（範囲を決められなければ DB に触らず 503）③`getClients(scope)`（名簿と同じ範囲の利用者だけ）④`getLatestDocMeta(ids, userId)`（`lib/db/documents.ts`。**この職員が保存した書類だけ**＝created_by・中身の content は読まない・利用者 id を100件ずつ・500行ずつ、満杯でないページが来るまで読む ── PostgREST の既定1000行の黙った打ち切りで、ある書類を「まだありません」に見せないため。どのページでも DB を読めなければ `DbAccessError` を投げ、途中までを返さない）⑤`summarizeLatestDocs`（`lib/documents/latest.ts`・純粋。種類ごとに一番新しい書類〔下書きも数える〕と、「更新」＝一番新しい書類の日付と利用者の登録日の新しい方。日時は文字でなく時刻で比べ、読めない日時は投げる）の順で、`{ clients: [{ clientId, latest, updatedAt }] }` を `Cache-Control: no-store` で返す。書類の行を読めなければ 503（`LATEST_DOCS_LOAD_FAILED_MESSAGE`）、利用者一覧を読めない・日時を読めないなどは 500（同じ文・理由はサーバのログだけ）。どれも空の答えにしない。一覧（`GET /api/clients`）と別の入口にしたのは、日付の失敗を日付の欄だけに留めるため。書類の見える範囲は変えていないので、事業所で共有していても同僚が保存した書類の日付は入らない（画面は「書類の日付は、自分が保存した書類だけです」を出す）。画面の列（アセス／プラン／会議／経過／モニタ／更新）は統合の後で繋ぐ。検査= `lib/documents/latest.test.ts`・`lib/db/documents.test.ts`（1回1000行で切る偽の PostgREST で2500行を全部読む）・`tests/api/latestDocs.route.test.ts`・`tests/api/orgScope.route.test.ts`・`tests/api/entryErrors.route.test.ts`（`DB_FAILURE_ROUTES`）・`lib/db/dbFailures.test.ts`（CONTRACTS）。

実行の前提: ①`supabase/clients_documents.sql`（既存DBは `approval_migration.sql` も）を Supabase で実行 ②`CARENOTE_PII_KEY`(base64 32B) を設定。

**一覧の失敗の扱い (2026-09-23・作り直し計画 U0)**: `getClients` は DB を読めなければ**例外**（以前は `[]` を返し、失敗が「まだ利用者がいません」に化けていた）→ `GET /api/clients` が受け止めて **500＋職員向けの文言**（`CLIENT_LIST_LOAD_FAILED_MESSAGE`。DB の詳しい理由はサーバのログだけ）。
一覧を使う画面は3つで、すべて `lib/clients/listError.ts` を通す: ①`/clients`（読めなければ「まだ利用者がいません」を出さない）②`components/create/SaveTranscriptBar.tsx`（保存先を選べないことを出す）③`/rescue` の保存パネル（**一覧を読めるまで保存を止める** ── 読めないまま進むと行き先が「新しい利用者として保存」だけになり、同じ方を黙って二重に登録する。氏名の表記が空白だけ違うと `expandAliasVariants` が別人とみなして事業所全体の送信が止まる）。②③は「一覧をもう一度読む」で読み直せる。
検査= `lib/db/clients.test.ts`（例外）・`tests/api/clients.route.test.ts`（500）・`lib/clients/listError.test.ts`・`tests/ui/clientListErrors.live.test.tsx`（3画面を jsdom で動かす）。

**一式の保存の押し直し (2026-09-24・S1 の検収の指摘)**: `/rescue` の保存は `lib/rescue/saveBundle.ts`（`saveBundleDocuments`）が「新しい利用者なら `POST /api/clients` → 5帳票を1枚ずつ `POST /api/documents`」の順に進め、**1歩ごとに途中経過**（保存先の利用者・保存済みの帳票）を画面の state へ渡す。途中の1枚で失敗して押し直すと、**同じ利用者へ残りの帳票だけ**を保存する（以前は作った利用者の id を関数の中にしか持たず、押し直すたびにもう1人作り、保存済みの帳票も二重に保存していた ── 失敗の文言「少し待ってから、もう一度お試しください」が押し直しを勧めるので必ず起きる）。途中経過がある間は保存先を選び直させず、どこへ・あと何枚かを文字で出す。一式を作り直したら「保存しました」と途中経過を捨てる（以前は前の一式の「保存しました」が次の一式に残っていた）。検査= `lib/rescue/saveBundle.test.ts`・`tests/ui/clientListErrors.live.test.tsx`（押し直しを画面で動かす）。

**B（現行ダークのまま機能追加）完了**: `app/(dashboard)/clients/`（一覧＋新規作成）・`clients/[id]/`（詳細＋保存帳票）、
Sidebar に「👥 利用者」、救済結果を選択/新規の利用者に5帳票一括保存（`/rescue` の保存パネル）。compile/build 検証済（実行は上記前提が必要・UI見た目はAで刷新）。
**残り（A＝editorial 総替え）**: layout/Sidebar/ホーム/既存ページ（create/evaluate/rescue/clients）をデザインシステムv0へ。
**仮名化の配線済み (2026-07-19)**: `getClientAliases`（lib/db/clients・実名復号→記号対応表・表記ゆれ展開）を
`/api/generate` と `/api/rescue` に組込み、**登録利用者の実名を記号化してからClaudeへ送信**（intakeサマリにも適用）。
限界: 登録外の実名・PDF原本は置換不可＝第一の防御は「実名を書かない」運用（docs/DATA-HANDLING-EXPLANATION.md §3・§7）。
拡張API（/api/extension/generate）はClerkユーザー文脈が無いため名簿置換は対象外だが、型置換＋漏れ検査（`maskRequestBody(body, [], vault)`）は通す（2026-09-12）。
**未対応**: `/create` からの「利用者に保存」導線。
**黒塗りの3段化 (2026-09-09・電話連絡パイプライン第1段)**: `lib/privacy/maskPii.ts` が唯一の入口
（名簿置換 `pseudonymize.maskNames` → 型置換 `patterns.maskPatterns`〔電話・郵便番号・メール・住所（都道府県なしは番地の形つきのみ・Issue #8）・生年月日・番号類〕
→ 自己点検 `leakCheck.assertNoLeak`）。`/api/generate` と `/api/rescue` はこれを通し、実名や型が残れば **422** で送信中止（fail-closed）。
findings は種類と件数のみ（原文をログに出さない）。予定の日付は消さない（カレンダー登録・支援経過の日付を守る）。
**二枚方式 (同日)**: 型置換の元の値はリクエスト内の札入れ `lib/privacy/vault.ts`（〔電話番号1〕＝090-…・同じ値は同じ札・フィールド間で共有）が覚え、
AIの返事は `restoreDeep` で手元に戻してから返す（`appointments` は戻さない）。名前（A様）は「記号で保持」契約どおり戻さない（表示時の復元は次の増分）。
**規約（2026-09-12・独立審査 critical #7）: 戻した帳票を再び AI へ送る API は必ず `maskBody.maskDeep` を通す。** 該当= `/api/kaipoke/assessment`（draft）・`/api/rescue`（intake）。restoreDeep を使う経路= `/api/generate`・`/api/extension/generate`・`/api/rescue`・`/api/kaipoke/assessment`。
**漏れ検査の独立性 (同日)**: `patterns.hasLongDigitRun`（10桁以上の数字列）と `pseudonymize.nameRegex`（空白・ゼロ幅・旧字体の揺れ）を `leakCheck.findLeaks` が使い、置換ルールの取りこぼしが検査の取りこぼしにならない。
**センサー (同日)**: `tools/check-invisible.mjs`（NUL・ゼロ幅文字の混入検査）を CI `quality-gates.yml` と `.claude/hooks/stop-build-check.sh` が呼ぶ。
**ルート層テスト (同日)**: `tests/api/*.route.test.ts`（generate/preview・kaipoke/assessment・rescue・extension/generate）と `lib/db/clients.test.ts`（偽 Supabase）が fail-closed を固定。拡張の DOM 経路は `extension/src/adapters/kaipoke.dom.test.ts`（jsdom）。
**送る前に見る画面 (同日・第2段)**: `POST /api/preview`（AIへ送らず、`lib/privacy/maskBody.maskRequestBody` を通した本文＋`candidates.findNameCandidates` の候補を返す）
→ `components/drafts/PreSendPreview.tsx`（候補を赤下線）→ 職員が「この内容で送る」→ `/api/generate`（同じ maskRequestBody）。`/create` に組込済（実機確認済 2026-09-09）。
**フル版表示 (同日)**: `GET /api/clients/aliases`（記号→実名・本人の利用者のみ）→ `/create` 結果画面の「実名で表示」切替。
`pseudonymize.restoreNamesDeep` は表示とコピー専用。保存帳票の中の名簿の名前は記号のまま（番号類は戻した元の値。何が入るかの正本は `lib/db/documents.ts` の説明）。
**第3段 文字起こし入口 (同日・D1=外部サービス)**: `/create` 支援経過欄の「録音ファイルから文字にする」→ `POST /api/transcribe`
→ `lib/transcribe/provider.ts`（OpenAI 文字起こしAPI・`OPENAI_API_KEY`・差し込み口で他社切替可）→ 文字を支援メモに追記 → 第2段へ。
音声は非保持。`lib/transcribe/validate.ts` が **4MB**・形式・エラー言い換え（25MB は文字起こしサービスの上限だが、手前の Vercel が 4.5MB で切るため到達できない ── 2026-09-17 実測 6MB→413）。運用は **Genspark SecondBrain（使い方B）**が正、この経路は予備（DATA-HANDLING v0.3 §5-2）。
**第4段 カレンダー (同日・D2=個人 Google)**: `types/supportLog.ts` に `appointments`（AIが抽出・記号＋用件・番号禁止・「今日の日付」で相対表現を解決）
→ `lib/calendar/links.ts`（JST→UTC・終日・maskPatterns 二重安全網・`googleCalendarUrl`／`buildIcs` RFC5545）→ `components/drafts/AppointmentsPanel.tsx`
（「Googleカレンダーに追加」＝作成画面を開くだけ・保存は人／.ics）。**API・OAuth 審査は使わない**（テスト状態は7日でトークン失効＝公式確認）。記号版 result から作り実名を渡さない。
**第5段 アセスメント追記 (2026-09-10)**: `assessmentUpdates`（AIが状態像の変化から欄別の追記文を作る・書き換え禁止・個人情報禁止）→ CareNote `AssessmentUpdatesPanel`（表示・コピー）
／拡張 `kaipoke.js` の**追記モード**（`buildAppendedValue`〔純粋・二重追記防止〕→ `previewAppend`〔書かない〕→ `applyAppend`〔退避して末尾に足す〕→ `undoAppend`）。
`content.js` CARENOTE_APPEND_*、`panel.js` 「前後を見る／この欄に追記する／元に戻す」。inject（上書き）とは別経路。登録は人。
**D4 関係者名簿 (2026-09-10)**: `supabase/client_related.sql`（`client_related_identities`・暗号化・続柄一意）→ `lib/db/clients.ts` `getRelatedPeople/addRelatedPerson/deleteRelatedPerson`＋`loadAliases` が関係者を含める
（記号＝`pseudonymize.relatedAliasCode`「A様の長女」・**表が読めなければ 503 で送らない**）→ `GET/POST/DELETE /api/clients/[id]/related`（DELETE は利用者IDでも絞り 0件は 404）→ `components/clients/RelatedPeople.tsx`（利用者の区画 `ClientPane` の中 ── A6）。SQL は手動実行が要る。
**第6段 OCR統合 (2026-09-11)**: `/rescue` 参考資料に画像（JPEG/PNG/WebP・`blob-upload` 許可）＋資料ごとの種別 → `/api/rescue`（`contentType`/`docType` を検証）
→ `lib/generation/rescueIntake.ts`（PDF=document ブロック／画像=image ブロック・種別ごとの読みどころ・`facts`〔分類＋出典＋日付〕・`conflicts`・`documents`）
→ `composeIntakeNotes`（食い違い→分類別事実）を `generateRescueBundle` の入力に。結果の全文章とファイル名に maskPii（`maskDeep`）。画面に読み取り報告・食い違い・事実（分類別）。sourceDocs の検証は `lib/rescue/sourceDocs.ts`（SSRF 許可リスト＝**非公開ストアのホストのみ**・純粋・テスト済）。Blob は **非公開ストア** `carenote-intake-private`（D6・2026-09-12）に置き、`lib/blob/readPrivate.ts`（get()）で読む（/api/evaluate も同じ）。400/422 でも finally で削除・失敗は `warnings`。
**カイポケ転記 手順仕様書 (2026-09-11)**: [KAIPOKE-TRANSCRIPTION-SPEC.md](KAIPOKE-TRANSCRIPTION-SPEC.md)（ブラウザ操作型AIの実機転記記録＝アセスメント11ページ全欄・第2表往復・禁止文字・keyup同期・エラー回避）。
取り込み済: `kaipoke.js` `normalizeForKaipoke`（〜→～・丸数字→(n)・ローマ数字・組文字・空白）を `writeField` で必ず通す／`writeField` が keyup も dispatch／`measureText` に総文字数の安全上限（行×字−行数）／
`isReloginRequired`（再ログイン画面検知）→ `content.js` が書き込み系を拒否・`panel.js` バッジ「再ログインが必要」／FIELD_MAPS.assessment に P1 の26字幅と P2 `form:supportSubject` を追加。
**カイポケ転記シート (同日)**: `lib/kaipoke/assessmentLayout.ts`（10ページ31欄・安全上限・純粋）→ `lib/generation/kaipokeAssessment.ts`（下書き→欄別文章・`isInferred`）→ `POST /api/kaipoke/assessment`
→ `/create` の「カイポケの欄に合わせる」→ `KaipokeSheetView`（欄ごとコピー／拡張用JSON）→ 拡張 documentType `kaipokeAssessment`（`injectKaipokeSheet`：ページ単位・既存文章は消さない）。
**第2表の半自動化 (同日)**: 拡張 `kaipoke.js` `buildPlan2Steps`／`plan2ScreenFromNames`／`parseFrequency`／`classifyServiceType`／`fillPlan2Step`（追加画面1つ分だけ埋める・画面違いは書かない）
→ `content.js` CARENOTE_PLAN2_FILL → `panel.js` 「第2表を1件ずつ流し込む」（案内→流し込む→登録は人→次へ、進捗は storage）。`readFieldValue(el)` が欄の今の文章（`getValue(draft,key)` と別物）。第3表は未対応。
**職員向けマニュアル (2026-09-12・ROADMAP 第4版 P-MANUAL)**: 本文の正本は `lib/manual/content.ts`（7章・手順145・よくある質問65。実画面の棚卸し→執筆→「実在しないラベルを潰す」検証の産物）。
同じデータを3つの形で出す: ①アプリ内 `app/(dashboard)/guide/page.tsx`（`/guide`・目次・章ごとの動画枠・手順・注意・FAQ）
②印刷/PDF `tools/build-manual.mjs` → `public/manual/index.html`（`npm run manual` で再生成・**生成物なので手で直さない**）＋ Chrome ヘッドレスで `public/manual/CareNote-AI-操作マニュアル.pdf`（本文を直したら HTML→PDF の順で作り直す）
③動画 `docs/MANUAL-VIDEO-SPEC.md`（収録台本・91場面。§7＝実際の作り方）。**①〜④⑥⑦の6章は収録済**で
`public/manual/videos/chN.mp4`（`video.status: "ready"`）。⑤カイポケ転記だけ他社画面のため未収録＝画面に「準備中」と出る。
道具は `tools/make-narration.mjs`（声＝MiniMax・男性。読みは `lib/manual/readingDict.ts` で固定し、
`tools/check-reading.mjs` が文字起こしで読み間違いを検出する）→ `tools/shoot-run.mjs`＋`tools/shoot-plans.mjs`（Chrome を自動操作して撮る）
→ `tools/make-card.mjs`（撮れない場面の説明カード）→ `tools/make-video.mjs`（ffmpeg で合成）。
**字幕は動画へ焼き込む一本化**（再生ページに track タグを足すと二重に出る ── 再発防止テストは `lib/manual/videoScript.test.ts`）。
各画面の見出しからは `PageHeader` の `helpAnchor` で `/guide#chN` へ飛べる（A案の外枠では上の帯の「この画面の使い方」も同じ章へ飛ぶ ── 行き先は `lib/nav.ts` の `helpAnchorOf`）。開閉の要る FAQ だけ `components/manual/FaqAccordion.tsx`（"use client"）。
**UI の文字を変えたら content.ts も同じ PR で直す**（Doc-as-Code）。
**決定（2026-09-12）**: `public/manual/` は Next.js の public 配下＝**ログイン無しで URL を知っていれば閲覧できる**（middleware の matcher がドット付きパスを除外）。秘密情報は含めない前提で、研修配布と PDF 生成のためこの形を採る。検索避けは `noindex` と `public/robots.txt`。
**録音パイプライン (2026-09-17・docs/specs/recording-pipeline.md)**: 対面3帳票へ録音を拡大。
R0 上限の是正（4MB＝Vercel の実効上限。25MB は到達不能だった）／R1 入口を4帳票へ（`components/create/NotesField.tsx`）／
R2 確認画面の長文対応（`lib/privacy/previewNav.ts`・赤い言葉に通し番号と「次へ」・畳んでも赤は全部出す・
「なぜ赤いか」は畳んだ欄は各行の末尾、開いた欄は本文の下に `redWordReasons` で文字で出す ── ふきだしはタッチ端末に出ない・2026-09-23）／
R3 画面内録音（`components/recording/RecordingPanel.tsx`＋`lib/recording/{config,segments,mimeType}.ts`。
5分区切り・音声は端末にもサーバにも残さない・**表示スイッチ `NEXT_PUBLIC_CARENOTE_RECORDING` は既定 off**）／
R4 文字起こし全文の保存（`supabase/client_transcripts.sql`＋`lib/db/transcripts.ts`＋`app/api/transcripts/`。
AES-256-GCM・5年・可視性は `getClientById` に一本化・**AIへは渡さない**）／R5 説明書 v0.6（草案）。
画面を動かす検査＝`components/recording/RecordingPanel.live.test.tsx`（jsdom）。

**管理者の準備手順（2026-09-13）**: `docs/ADMIN-SETUP.md` が正本（①関係者名簿の表 ②索引 ③Clerk 組織 ④既存データの移行）。SQL の中身は `supabase/client_related.sql` と `supabase/client_org_scope.sql`。

**名簿の範囲（2026-09-13・G3b 吉本さん決定「事業所で共有」）**: `lib/db/clients.ts` の `scopeExpr` が唯一の絞り込みで、掛かるのは **`clients` だけ**。氏名の2表（`client_identities` / `client_related_identities`）は**親の利用者IDで引く**（`selectByClientIds`）── 3表を別々に `org_id` で絞ると、移行が揃わなかったときや組織未選択時に登録された関係者がいるときに**利用者は見えるのに氏名だけ名簿から落ちる**（＝置換も漏れ検査も効かない fail-open。独立審査 2026-09-13）。ルート（**12ファイル・17ハンドラ** ── 文字起こし・書類の保存・書類の日付を含む。2026-09-24 に書類の日付を足した）が範囲を渡すことは `tests/api/orgScope.route.test.ts` が縛る。

記号（A様）の採番は**範囲内の最大＋1**（件数だと範囲が混ざったとき同じ記号を二度振る）。安全網は3段: ①`assertClientCodesUnique`（同じ記号の利用者が2人 ── **復号する前に**見るので復号失敗行があっても取りこぼさない）②`expandAliasVariants` が「同じ表記が違う記号」を見つけたら `AliasConflictError`（空白違いの別人・同姓同名を黙って捨てない）③`assertUnderRowLimit`（900件超で停止 ── PostgREST の既定1000行の黙った打ち切り対策）。これらは待っても直らないので `ALIAS_PERMANENT_MESSAGE`（管理者へ連絡）で返し、読み直さない。

**⚠ Clerk の `orgId` は「所属」ではなく「いま選んでいる事業所（Active Organization）」**。所属させただけでは null のまま＝共有は始まらない。だから `components/SharingStatus.tsx` が状態を常時表示し、その場で切り替えられるようにしている（`OrganizationSwitcher`）。**置き場所は外枠の上の帯の右側**（どの幅でも出る。2026-09-23 A案 ── それまでは左メニューとスマホ用の2か所）。表示の3状態（確認中／事業所で共有中＋事業所名／自分の登録分のみ＋「置き換わりません」の注意の帯）と切り替えが**隠されずに**出ることは `components/SharingStatus.test.tsx` が縛る（Clerk は偽物にする・2026-09-23。切り替えを包む要素を隠しても緑だった穴は 2026-09-24 に `isReachable` で塞いだ）。`getClientAliases` は orgId が null のとき warn を残す（センサー）。**有効化には Clerk の組織設定＋SQL 2本の実行＋既存データの移行＋各職員が事業所を選ぶこと が要る**（手順の正本= `docs/ADMIN-SETUP.md`）。保存書類（`documents`）の共有は未対応で `created_by` のまま（利用者一覧の書類の日付も、自分が保存した書類だけ）。

仕様と5段計画: [specs/call-pipeline.md](specs/call-pipeline.md)。根拠調査: [CALL-PIPELINE-FEASIBILITY.md](CALL-PIPELINE-FEASIBILITY.md)。

### 見た目の土台 ── デザイントークン v2（A案「作業台」・2026-09-23・ブランチ `redesign/a`）
値の正本は **`app/globals.css` の `:root`**。地（`--paper` `--card` `--pane` `--rail` `--active` `--row-selected`）／
文字4段（`--ink` → `--ink-2` / `--ink-table` → `--muted` → `--faint`）／線（`--line` `--btn-line` `--line-inner` `--line-faint`）／
**飾り専用 `--dash`（「—」と区切りの「/」だけ。文字に使わない）**／色の役割（`--green`=主ボタン・選択中、`--red-word`=赤い言葉だけ、
`--amber*`=注意、`--clay*`=エラー）／書体（`--sans`=IBM Plex Sans JP、`--mono`=IBM Plex Mono ── 記号・件数・日付）。
書体の読み込みは `app/layout.tsx` の Google Fonts `<link>`（next/font はビルドが外部通信に左右されるので使わない）。
Clerk の画面用の**写し**が `lib/clerkAppearance.ts`（Clerk は CSS 変数を解釈しない箇所があるため16進数で持つ）。
センサー: `app/globals.test.ts`（①層の外で要素の余白を決める規則 ── `@media`/`@supports`/`@container` の中と `@layer a, b;` の直後も見る
②文字色トークンが地〔paper/card/pane/surface-2〕の上で WCAG AA 4.5:1 以上 ③`--sans`/`--mono` の先頭の書体を layout.tsx が読み込む ──
`RootLayout` を実際に描いた HTML に、その書体と太さ〔Sans 400/500/700・Mono 400/500〕を載せた `rel="stylesheet"` の Google Fonts `<link>` があるか）、
`lib/clerkAppearance.test.ts`（写しとトークンのずれ ＋ 下の層の順番 ＋ 押す・入力する部品に 44px〔`min-h-11`〕を約束するクラスが付いているか・
elements の部品が「押す／押さない／まだ計測していない」のどれかに分けてあるか）。CSS の読み取り器は `tests/helpers/cssTokens.ts`（テスト専用）。
**`--faint` は 58 か所で本物の文字（赤い言葉の理由など）に使われている** ── 4.5:1 を割る値にしない。
**Clerk のスタイルは `clerk` 層に入れる（3か所で1組）**: `app/layout.tsx` の `ClerkProvider appearance={{ cssLayerName: CLERK_CSS_LAYER }}`
＋ `app/globals.css` 先頭の `@layer theme, base, clerk, components, utilities;`（`@import "tailwindcss"` より前）＋ 名前の正本 `lib/clerkAppearance.ts` の `CLERK_CSS_LAYER`。
これが無いと Clerk の層外スタイルが Tailwind のクラスに勝ち、`clerkAppearance.elements`（ログイン枠・組織切替の見た目）が画面に効かない（2026-09-23 に /sign-in で計測）。
ログインが要る画面の見た目の確認で**まだ済んでいないもの**は `docs/REDESIGN-A-SIGNOFF.md`（redesign/a を main へ出す前に全部済ませる）。

### ナビ4項目・アイコン・書類の種類の正本（A案「作業台」・2026-09-23・ブランチ `redesign/a`）
- **`lib/nav.ts`（純粋）**: ナビは6項目→4項目（吉本さん決定）。`NAV_ITEMS` = 利用者 `/clients`・つくる `/create`・点検 `/evaluate`・使い方 `/guide`。
  `sectionOf(pathname)` が古い URL も振り分ける（`/rescue`→つくる、`/dashboard`→点検。URL は消さない ── ブックマーク・マニュアル・撮影の道具が使う）。
  `helpAnchorOf(pathname, mode)` が「この画面の使い方」の行き先（利用者→ch2、つくる→ch3、一式まとめて〔`mode=bundle` か `/rescue`〕→ch6、点検→ch1、使い方→なし）。
  テスト `lib/nav.test.ts` は、返す章が `lib/manual/content.ts` に実在することと、今の各ページの `PageHeader helpAnchor` と同じ行き先であることも確かめる。
  読む側: 左の帯 `components/shell/Rail.tsx`（どれが光るか）と上の帯 `components/shell/TopBar.tsx`（項目の名前・「この画面の使い方」の行き先）。
- **`components/ui/icons.tsx`**: `strokeWidth`（既定 1.6。A案は選択中のナビを 1.8）。A案用に `IconPeople`（利用者）・`IconPencil`（つくる）・`IconCheckCircle`（点検）・`IconMic`・`IconChevronUp/Down` を追加（使い方は既存の `IconHelpCircle`）。
  センサー `components/ui/icons.test.tsx` ── 書き出した全アイコンが `aria-hidden="true"`・`currentColor`・`strokeWidth` を守るか（アートボードの SVG をそのまま貼ると aria-hidden が無い）。
- **`lib/create/docTypes.ts`**: 書類5種類の並び順 `DOC_ORDER` と、画面ごとの名前 `DOC_TYPE_LABELS`（`tab`=つくるの種類ボタン／`description`=その下の1行／`saved`=利用者の画面の書類の行／`bundle`=救済モードの結果の見出し／`output`=A案の送信の帯の「作るもの」・**まだ画面に出していない**）。
  create・clients/[id]・rescue の3画面がここを読む（前は各画面に別々に書いてあった）。**画面の文字は変えていない**（`lib/create/docTypes.test.ts` が固定）。
  `output` の担当者会議以外の4つは案（画面に出す前に吉本さんの確認が要る）。`app/api/documents/route.ts` の `ALLOWED_TYPES` は同じ5種類を別に持っている。

### 外枠 ── 左の帯・上の帯・共有状態（A案「作業台」・2026-09-23・ブランチ `redesign/a`）
`app/(dashboard)/layout.tsx` = `[Rail] [列: TopBar（上の帯＋注意の帯）→ main.app-main-inner → 送り先の表示]`。旧 `components/Sidebar.tsx`（6項目・220px）とスマホ用の `MobileNav`・`.app-topbar`・`.app-sharing-mobile` は廃止。
- **`components/shell/Rail.tsx`**: 768px 以上は幅 72px の左の帯（CN・4項目・下端に Clerk `UserButton` とメールの「@」より前を文字で）。768px 未満は**同じ4項目が画面の下のタブ**（文字つき・高さ 56px・safe-area）── スマホから利用者・つくるへ行けるようになった。光る項目は `lib/nav.ts` の `sectionOf`（`aria-current="page"`・緑の線 1.8）。スマホの下のタブにはアカウントのボタンを入れていない（以前のスマホ画面と同じ）。
- **`components/shell/TopBar.tsx`**: 高さ 52px の上の帯（スクロールしても上に貼りつく）。左 = ページの差し込み（無ければ項目の名前）、右 = 「この画面の使い方」（`helpAnchorOf`。使い方の画面では出さない）＋ 共有状態。帯＋注意の帯の実際の高さを ResizeObserver で測って `--shell-head-h` に書く（`.presend-nav` と `html` の `scroll-padding-top` が読む。旧: 固定の 72/76/80px）。`html` の scroll-padding（上 = 帯＋8px、スマホの下 = タブ＋safe-area＋8px・`app/globals.css` の `@layer base`）が、フォーカスした部品・使い方の章の飛び先（`/guide#chN`）を帯やタブの裏に隠さない（WCAG 2.2 AA 2.4.11。章ごとの旧 `.shell-anchor` は廃止 ── 両方あると二重に下がる）。画面が描かれていない（隠れたタブの）間は測れず、見えた時に書き直す。
- **`components/shell/TopBarSlot.tsx`**: ページが上の帯の左に見出し・道しるべを差し込む口（`TopBarSlotProvider` を layout が持ち、`TopBarSlot` で包んだ中身を createPortal で帯へ）。使っているのは利用者（A5・`components/clients/ClientsLayout.tsx`）。つくるは作り直すスライスで使う。**1画面で差し込むのは1か所だけ**（2つの差し込みが同じ口に入ると、並び順が描かれた順に左右されるため）。
- **`components/SharingStatus.tsx`**: `variant="bar"`（点・「共有状態を確認中／事業所で共有中＋事業所の名前／自分の登録分のみ」・`OrganizationSwitcher`）と `variant="strip"`（共有していないときだけ帯の下に `role="status"` で「…置き換わりません。複数人で使うときは、右上の事業所の切り替えから選んでください。」）。旧 `full`/`compact` は廃止。`OrganizationSwitcher` の見た目で文字を隠す指定は**切り替えのボタンの中だけ**に書く（Clerk は `__personalWorkspace` など一部の名前を、押すと開く一覧の行にも使う。`SharingStatus.test.tsx` が見張る）。
- 高さは `calc(100dvh - …)` で決めない（注意の帯が出ると下の端が画面の外へ出るため）。寸法トークン `--topbar-h` `--rail-w` `--tabbar-h` `--pane-header-h` は `app/globals.css` の `:root`。
  768px 以上は外枠（`.app-shell`）が画面の高さちょうど（`100dvh`）で**文書は動かない** ── 列を flex の縦並びにして本文に残りの高さを渡し、本文の中の区画が自分の中で動く（下の「区画」）。スマホは今までどおり文書が動き、上の帯が貼りつく。
- 「CareNote — Powered by Claude API」（AI の送り先が画面に出る唯一の場所）は、送る帯に送信先の表示が入るまで残す。768px 以上では列の下端に常に見えている1行（A4 から）、スマホでは本文の終わり。
- テスト: `components/shell/Rail.test.tsx`・`TopBar.test.tsx`（帯の高さを読む CSS が固定の数字・引き算に戻らないこと、html の scroll-padding が帯・タブの高さから決まり二重に足していないことも）・`TopBarSlot.live.test.tsx`（jsdom・差し込みと高さの書き込み）・`components/SharingStatus.test.tsx`（3つの状態・注意の帯・切り替え・44px）・`app/(dashboard)/layout.test.tsx`（外枠が共有状態・4項目・送り先の表示を持つ）。外枠の文字と地の組み合わせの 4.5:1 は `app/globals.test.ts`。
  `SharingStatus.test.tsx`・`TopBar.test.tsx`・`layout.test.tsx` の3つは安全テストの一覧 `tools/safety-tests.json` に名指しで入っている（共有状態は黒塗りが効いているかの唯一の知らせ・送り先の表示は吉本さん決定で残す物）。
- **まだ直していない文書**（後のマイルストーンでまとめて書き直す・作り直しは本番に出さない決定）: `lib/manual/content.ts`（共有状態は「画面の左下」・6項目のメニュー・スマホの2アイコン など）、`docs/ADMIN-SETUP.md`・`docs/DATA-HANDLING-EXPLANATION.md`（共有状態の場所）、`docs/MANUAL-VIDEO-SPEC.md`（左メニューの名前とメールで録画のアカウントを確かめる手順）、6章の動画（旧い左メニューが映っている）。

### 区画（ペイン）・まだ作り替えていない画面の器・ホーム（A案「作業台」・A4・2026-09-23・ブランチ `redesign/a`）
- **本文 `main.app-main-inner` は画面いっぱい**（幅の上限・余白なし）。区画を端から端まで並べ、1px の線だけで区切る（カードを積まない）。
- **部品** `components/ui/primitives.tsx`: `Pane`（section／aside・`width` 640／440・`tinted`＝地を `--pane`・`label`＝読み上げの名前）、`PaneHeader`（高さ 48px・**Pane の直下に置く**・`title` は h2）、
  `SectionLabel`（12px 太字・字間 0.06em・`htmlFor` で欄に結んだ label）、`TextAction`（文字だけの操作 ── `href`＝リンク／`onClick`＝ボタン・スマホ 44px）。
  ボタンの寸法もアートボードへ: `btnPrimary`＝高さ 44px の緑（1画面に1つ）、`btnSecondary`＝パソコン 34px・スマホ 44px・枠 `--btn-line`・文字 `--ink`。`Card`/`PageHeader`/`SectionTitle` は作り替え前の画面のために残す（計画 X1 で片付け）。R1（2026-09-24）で `Card` は角の丸みと影を外した 1px の線の面に、`PageHeader` は見出し 20px・説明 13px・静かな「この画面の使い方」にした（作り替え前の画面が一度にカードを積んだ見た目でなくなる）。
- **CSS** `app/globals.css` の `@layer components`: `.panes`（区画を横に並べる）・`.pane`・`.pane-640`・`.pane-440`・`.pane-tinted`・隣り合う区画の 1px の線（`.pane + .pane`）・`.pane-header`・`.pane-title`・`.section-label`・`.text-action`・`.legacy-page`。
  層に入れるのは、部品に className で足した Tailwind の指定（余白など）が勝てるように（層の外の規則は層の中に必ず勝つ ── 2026-09-23 の余白 0 の不具合と同じ仕組み）。素の CSS なのでスキャンの取りこぼしと無関係に本番の CSS に出る（本番用ビルドで確認済み）。
- **768px 以上は区画が自分の中で縦に動く**（左の入力を動かしても右は動かない）。区画の頭の帯は区画の上に貼りつく。スマホは区画を縦に積み、文書が動く（スマホ用の形は M1/M2）。
- **貼りつく物の基準 `--sticky-top`**（計画の指摘「区画の中は 0・文書が動く所は帯＋注意の帯」）: 768px 以上で区画（`.pane`・`.legacy-page`）が「自分の上端に重なる物の高さ」を書く
  （0。頭の帯を直下に持つ区画は `--pane-header-h` ── `.pane:has(> .pane-header)`。表の見出しの行〔40px・貼りつく〕を直下に持つ利用者の一覧は 40px ── `.pane:has(> .client-table)`・A5 の検証で、Shift+Tab で上へ戻った記号のリンクが見出しの行の裏に隠れていた）。**区画の上に貼りつく物を足したら、その区画の `--sticky-top` も書く**。`.presend-nav`（前へ／次へ）の top と区画の `scroll-padding-top`（フォーカス・飛び先の止まる位置）がこれを読み、
  無い所（スマホ＝文書が動く）では今までどおり `--shell-head-h`。**動く器に padding-top を付けない**（ブラウザは貼りつく物の基準をその分下げる ── `.legacy-page` の上下 40px は `::before`/`::after` の空の箱で空ける）。
- **動く器の直下の物は縮ませない**（`.pane > *`・`.legacy-page > *` に `flex-shrink: 0`・768px 以上）。器は高さの決まった flex の縦並びで、
  overflow-hidden の一覧（角を丸めた Card）は縮む下限が 0 になり、器の高さで自分の行を切り落として下の行へ行けなくなる（2026-09-24 A4 の検証の blocker ──
  利用者の一覧と点検の履歴）。**残りの高さを埋める物は `grow`**（flex-grow だけ）を付け、`flex-1` は使わない（縮む指定と高さ 0 の出発点を入れ直すので、
  overflow-hidden や小さい `min-h` と組むと同じ切り落としが起きる）。器の中で縮めて中だけ動かしたい物だけが `flex-1 min-h-0` を自分で付ける。
- **まだ作り替えていない画面の器 `.legacy-page`**: 4画面（`evaluate`・`dashboard`・`rescue`・`guide`）の根元に付ける（A4 では7画面。`clients`・`clients/[id]` は A5 で、`create` は R1 で外した ── 下の「利用者の作業台」「つくるの見た目」）。
  以前の本文の幅（最大 1000px＝中身 920px＋左右 40px）と余白（スマホ 16/16/32px）を再現し、768px 以上ではそれ自体が1つの区画のように動く。旧 `.app-main-inner` の「幅の決定点」の決まりはここが引き継いだ。作り替えたページから外し、全部外れたら消す（計画 X1）。
- **ホーム = 利用者**（吉本さん決定 2026-09-23）: `app/page.tsx` が `/` を `/clients` へ（旧 `/evaluate`）。ログイン直後の行き先は Clerk の `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` / `AFTER_SIGN_UP_URL`。
  手元の見本 `.env.local.example` は `/clients` にした（ただしこのファイルは `.gitignore` の `.env*` に当たり **git に入っていない**）。本番の Vercel の値は吉本さんが変える（`docs/REDESIGN-A-SIGNOFF.md` の 8）。
- テスト: `components/ui/primitives.test.tsx`（部品が付けるクラス・ボタンの 44px・区画の CSS の形〔層・768px 以上で動く・動く器の直下の物は縮まない・`.pane-640`／`.pane-440` の幅・区画の境目の 1px の線（スマホは上・768px 以上は左）・`--sticky-top`・旧画面の器の幅〕）・`app/page.test.ts`（`/` → `/clients`）。
- **まだ直していない文書**（D1a/D2 でまとめて）: 「ログインすると、ダッシュボードか評価するの画面が開きます」── `lib/manual/content.ts`:248（あわせて 98-99・216-217・302）・`docs/MANUAL-VIDEO-SPEC.md`:221・`docs/manual-video/ch2.draft.vtt`・公開中の ch2 の字幕。

### 利用者の作業台 ── 一覧の表と右の 440px の区画（A案「作業台」・A5・2026-09-24・ブランチ `redesign/a` ＝ 計画 U1＋U2）
- **並び**: `app/(dashboard)/clients/layout.tsx`（サーバー）→ `components/clients/ClientsLayout.tsx`（ブラウザ）が `/clients` と `/clients/{id}` を包む。
  上の帯（`TopBarSlot` で差し込む）= 見出し「利用者」＋人数（等幅）か、道しるべ「利用者 / B様」（`/clients/{id}`）＋「記号・属性で探す」＋「新しい利用者」（脇のボタン → `/clients?new=1`）。
  本文 = `.panes` の中に [左 = 一覧の表（`Pane`・残りの幅）] | 1px の線 | [右 = `Pane as="aside" width={440} tinted` ＝ ページの中身]。
  layout は利用者を選び替えても作り直されないので、**表は消えず、一覧も読み直さない**。右の区画だけがページで入れ替わる。
- **何を選んでいるか**は URL だけで決める（`usePathname` → `lib/clients/clientList.ts` の `selectedClientIdOf`）。選んだ行は地 `--row-selected`（`tr[data-selected]`）とリンクの `aria-current="page"`。
  **`/clients` を開いただけでは誰も選ばない**（右の区画は案内「左の一覧から利用者を選ぶと、書類と関係者名簿がここに出ます」だけ）── 関係者名簿の実名は、行を押してその方の URL を開いたときだけ出す（吉本さん決定 2026-09-23）。
  `?new=1` は `useSearchParams` で読む（layout は searchParams を受け取れない ── 計画の指摘 U2）。`/clients?new=1` のときだけ登録の欄で、「新しい利用者」を押した色にする。
- **`components/clients/ClientsContext.tsx`**（`ClientsProvider` / `useClients`）: 一覧（GET `/api/clients`）・読み込みの状態（`loading`/`ready`/`error`）・探す言葉・`addClient`（登録した利用者を読み直さずに先頭へ）・`reload` を、表・上の帯の探す欄・登録の欄が分け合う。
  **読めなかったら「0人」にしない**: 通信の失敗・200 以外・JSON でない・配列でない、はすべて `error` にし、「利用者一覧を読めませんでした」＋サーバーの文を出す（まだ利用者がいません、も人数も出さない ── 計画 U0 と同じ決まり）。
  読み方と文は `lib/clients/listError.ts` の `fetchClientList`（計画 U0 ── 文字起こしの保存・救済モードの保存パネルが使う `lib/clients/useClientList.ts` と同じ）を使う
  （2026-09-24 に枝 `redesign/a-backend` を取り込んだとき、ここに持っていた同じ決まりの写しを消して1つにした）。
  「/clients を開いて一覧を読めなかったとき」の検査は `tests/ui/clientListErrors.live.test.tsx` が `ClientsLayout` を描いて確かめる（一覧がページから layout へ移ったため）。
- **`components/clients/ClientTable.tsx`**: 表（見出しの行 40px・行 52px・列 = 記号〔等幅・行の見出しのセル `<th scope="row">` の中の `<a href="/clients/{id}">`〕・属性〔`clientAttrLine` か「（属性未設定）」〕・登録日〔等幅・日本時間の 2026/09/01〕）。
  **行（`<tr>`）は押す物にしない**（押せるのは記号のリンクだけ ── 撮影の道具 `tools/shoot-run.mjs` の openClient と救済モードの保存後のリンクがこの形を使う）。書類の種類ごとの日付の列は後の段（計画 U5）。
  表の上に見える1行「利用者ごとに書類が貯まります（氏名は記号で表示）」（`.client-table-lead` ── 以前の一覧の見出しの説明文＝氏名を記号で出す約束。A5 で黙って消えていたのを検証の指摘で戻した。アートボードには無いので、残すか消すかは吉本さんが決める ── `docs/REDESIGN-A-SIGNOFF.md` の 10）。
  **表は一覧の区画（`Pane`）の直下に置く**（包む箱を足すと `.pane:has(> .client-table)` が黙って外れ、見出しの行の裏にフォーカスが隠れる）。
  読み込み中・読めなかった（「一覧をもう一度読む」）・まだいない（氏名を暗号化して記号で表示する約束の文）・探して当てはまる人がいない（「探す言葉を消す」）の4つの知らせ。`ClientSearchField` が上の帯の探す欄。**実名は描かない**（`ClientRecord` は氏名を持たず、ここは記号・属性・登録日だけ）。
- **`components/clients/NewClientForm.tsx`**: 右の区画の登録の欄（`/clients?new=1` のとき `app/(dashboard)/clients/page.tsx` が出す）。欄の id（`#c-name` `#c-age` `#c-gender` `#c-care-level` `#c-household`）・名前・「氏名は暗号化して保存し、画面では記号で表示します」は以前と同じ。
  登録できたら表の先頭へ足して、その方の画面（`/clients/{id}`）を開く（以前は欄を閉じて一覧に行が増えるだけ）。**一覧を読めていないあいだは登録を止める**（表が見えないと、もういる方を気づかずに二重に登録できるため ── U0 で救済モードの保存を止めたのと同じ理由）。
- **`lib/clients/clientList.ts`（純粋）**: `clientAttrLine`（「85歳・女性・要介護2・独居」）・`filterClients`（記号と属性を画面の中だけで絞る・全角半角をそろえる・空白区切りは全部を含む・「B様」は記号そのものと比べる）・`formatRegisteredDate`（日本時間の 2026/09/01 ── 登録日の列と、区画の書類の保存日）・`selectedClientIdOf`。`ClientPane.tsx` も属性の1行はここを使う。
- **`app/(dashboard)/clients/[id]/page.tsx`**（サーバー）: 右の区画の中身。`params` と `searchParams`（`?doc=`）を読み、`components/clients/ClientPane.tsx` を `key={id}` で描く（別の方を選んだら区画の状態を作り直す・`?doc=` だけ変わったときは一覧を読み直さない）。
- **`components/clients/ClientPane.tsx`**（A6・計画 U3b ── アートボード A-clients の右の区画）: 頭（記号〔等幅 30px の h2〕・「（仮名）」・「仮名表示中」の札・属性の1行・緑の「つくる」→ `/create?client={id}`）→ 書類 → 関係者名簿 → 残した文字起こし。
  **書類は種類ごとに1行**（`DOC_ORDER` の順）: いちばん新しい版の状態の札・保存した日（等幅・日本時間）・「開く」（→ `?doc={書類の id}`）、まだ無い種類は「まだありません」＋「つくる」（→ `/create?client={id}&type={種類}`）。
  古い版は「以前の版（n）」（`<details>`）の中に並べ、**どの版も開ける**（振り分けは `lib/clients/documentRows.ts` の `groupDocumentsByType` ── 5種類に無い種類の書類も落とさず行にする）。
  見出しの下に「ここに出る書類は、自分が保存したものだけです」（書類は `created_by` で絞られ、同僚の書類は出ない ── 事業所で共有しても「まだありません」に見えるため）。書類が1つも無ければ「まだ書類がありません。「つくる」の「一式まとめて」から作って保存できます。」。
  「一式まとめて」→ `/rescue?client={id}`（救済モードが利用者を受け取って保存先に選ぶのは後の段 ── 計画 C9。`/create` が `client`・`type` を受け取るのも後の段 ── 計画 C2。それまでは素の画面が開く）。
  `?doc=` のとき: 「書類の一覧へ戻る」・書類の名前・札・日付・`DocumentPanel`（区画の端から端まで）。一覧に無い id なら「この書類を開けませんでした。…」。書類を開いているあいだは関係者名簿も文字起こしも描かない（読みにいかない）。
  **緑の主ボタンは1つ**: ふだんは頭の「つくる」、下書きを開いているあいだは `DocumentPanel` の「承認する」（「つくる」は脇のボタンの見た目になる）。
  区画の幅: `components/clients/ClientsLayout.tsx` が `?doc=` を見て、選んだ方の書類を開いているあいだだけ 640px（`.pane-640`）に広げる（書類の中身は 440px では窮屈）。
  状態の札は書類の行では `StatusBadge compact`（印なし・左右を詰める ── 440px で名前・札・日付・「開く」を1行に収めるため。文字と色は同じ）。
  見た目は `app/globals.css` の3つ目の `@layer components`（`.client-pane*`・`.client-doc-older`・`.client-related-alias`）。テスト `components/clients/ClientPane.test.tsx`（jsdom・「仮名表示中」・札・つくるの URL・どの版も開ける・頭と書類の行に実名を描かない・緑は1つ・並び順・開けない id・読めなかったとき）、`lib/clients/documentRows.test.ts`、札の文字の 4.5:1 は `app/globals.test.ts`。
- **`components/clients/RelatedPeople.tsx`**（A6・計画 U4）: 区画の「関係者名簿」。行 = 続柄 | 実名 | → 記号（`pseudonymize.relatedAliasCode`・等幅の緑）| 「削除」（確かめなし ── 使い方の本文どおり）。
  登録の欄（`input[list="relation-hints"]`＋datalist・「続柄・役割（例: 長女・長男・妻）」・「氏名（例: 佐藤 一郎）」・両方入れるまで押せない「登録」）は残した（撮影の道具 `tools/shoot-plans.mjs` と使い方の本文が使う）。
  区画が狭いので、続柄の欄は1行ぜんぶ・氏名と「登録」を次の行に（3つ横並びだと続柄の例の文が切れる）。欄には見えない label（読み上げの名前）を足した。「登録」は脇のボタン（緑は頭の「つくる」1つ）。
  説明の文は保証できることだけ:「ここに登録した名前は、AIへ送る前に「B様の長女」のような記号に置き換わります。この名簿の実名はAIには送りません。」（計画の指摘 ── 以前の「実名はこの画面にだけ表示します」は、実名で表示・残した文字起こしにも実名が出るので書かない。**文言は吉本さんの確認待ち** ── `docs/REDESIGN-A-SIGNOFF.md` の 13）。
  **読めなかったら空の名簿に見せない**（role="alert" でサーバーの文・通信の失敗は通信環境の文＋「もう一度読む」。以前は黙って空になった）。
- **`components/clients/SavedTranscripts.tsx`**（A6・計画 U4）: 区画の「残した文字起こし」（旧「保存した文字起こし（A様）」）。行 = 日付と種類（＋見出し）| 字数（等幅）| 「読む」（旧「開く」・押したときだけ `GET /api/transcripts/{id}` で復号した本文を取り寄せる）| 「消す」（確かめの画面あり）。
  実名が入っている注意と、5年の決まりの正直な文「いまは自動で消えません（管理者がまとめて消します）」はそのまま。**読めなかったら欄を消さない**（表が未作成の 503 は管理者がやることを名指しした文 `TRANSCRIPT_TABLE_MISSING_MESSAGE` をそのまま出す・「もう一度読む」。0件で読めたときは今までどおり欄を出さない）。消せなかったらサーバーの文をそのまま出す。
  枝 `redesign/a-backend` の 41adc43 も同じ直しを以前の見た目のまま入れていた。2026-09-24 の取り込みではこの2つの部品（A6 の形）を残し、
  向こうの検査 `tests/ui/clientListErrors.live.test.tsx` の描き方だけを新しい引数（`RelatedPeople` は `clientId`・`clientCode`、`SavedTranscripts` は `clientId` だけ）に直した（確かめる中身は同じ）。
  テスト: `components/clients/RelatedPeople.test.tsx`・`components/clients/SavedTranscripts.live.test.tsx`（jsdom）・`tests/ui/clientListErrors.live.test.tsx`（503 のとき）。
- **`components/clients/DocumentPanel.tsx`**（A6・計画 U3a）: 開いた書類の**承認（G4）の操作と中身**。以前はページに直接書いてあり検査が無かったので、文字も動きも変えずにここへ移した。
  下書き＝「承認する」＋押せない「コピー」＋「承認後にコピーできます」／承認済み＝「コピー」（`lib/draftText.documentContentToText`）・「カイポケ用データ」（**`JSON.stringify(content, null, 2)` そのもの ── 拡張 `extension/src/panel.html` の「下書きJSONを貼り付けて読み込む」との約束**）・「承認を取り消す」。
  承認・取消は `PATCH /api/documents/{id}`、通ったら `onChange` で呼ぶ側が行を差し替える。状態の札 `StatusBadge`（下書き＝黄・承認済み＝緑）もここ。
  テスト `components/clients/DocumentPanel.live.test.tsx`（jsdom ── 下書きはコピーできない・カイポケ用データの中身・承認／取消の失敗が画面に出る）。
- **安全テストの一覧 `tools/safety-tests.json` の `files` に入れてある**（計画 U3a・U4 の「SAFETY_TESTS へ足す」── 一覧と見張りは枝 `redesign/a-backend` にあり、2026-09-24 の取り込みで足した）:
  `components/clients/DocumentPanel.live.test.tsx`（承認 G4）・`ClientPane.test.tsx`（「仮名表示中」・実名を描かない）・`RelatedPeople.test.tsx`（名簿・読めなかったとき）・`SavedTranscripts.live.test.tsx`（本文を取りに行かない・消す前に確かめる）・
  `ClientTable.test.tsx`（氏名を出さない・読めなかったら空の一覧に見せない）・`ClientsLayout.test.tsx`（開いただけでは誰も選ばない・読めないあいだは登録を止める）。
  `components/clients` は `protectedDirs` に入っていないので、この6つは名指しで守る（消えても飛ばされても `npm test` が落ちる）。
- **見た目** `app/globals.css` の2つ目の `@layer components`（`.client-table*`・`.client-code-link`・`.clients-*`）。部品に `btnSecondary` などの Tailwind の指定がある要素の上書きは、ここ（層 components）ではなく部品の側の Tailwind で書く（層 utilities に負けて効かない ── A5 の本番用ビルドで「新しい利用者」の押した色が出なかった）。
  スマホ（768px 未満）: 上の帯が狭いので、見出しは読み上げ用に残して見た目だけ隠し、人数と道しるべは出さない（一覧へ戻るのは下のタブ）。案内だけの右の区画は出さない。**スマホ用の形はまだ**（選んだ方の詳細や登録の欄は表の下に出る ── 計画 M1）。
- テスト: `components/clients/ClientTable.test.tsx`（jsdom・本物の Context ＋偽の通信 ── 行のリンク・行は押す物にしない・絞り込み・まだいないときの約束の文・読めなかったら知らせ〔空の一覧に見せない〕・読み直し・API に氏名が紛れても出さない・表の上の約束の1行・選んだ行の地と寸法の CSS・見出しの行の高さと区画の `--sticky-top` が同じ値）・
  `components/clients/ClientsLayout.test.tsx`（jsdom・本物の上の帯と一緒に ── 選んだ行が URL に付いてくる・**勝手に選ばない**〔`/clients` では一覧しか問い合わせない〕・選び替えても読み直さない・道しるべ・登録した利用者が読み直さずに表に出る・読めないあいだは登録できない・表と約束の1行が一覧の区画の直下にある）・`lib/clients/clientList.test.ts`。
  選んだ行の文字の 4.5:1 は `app/globals.test.ts`。利用者の画面の「この画面の使い方」が上の帯の1つだけになったことは `lib/nav.test.ts`。
- **まだ直していない文書**（D1a/D2 でまとめて）: `lib/manual/content.ts`:102・260（右上の「新規」→「新しい利用者」）・108-110・272-274（登録すると、その方の画面が開く）・280（「利用者 ＞ A様」のパンくずは上の帯の「利用者 / A様」になった）、
  `tools/shoot-plans.mjs`:55・103（`click: "新規"`。本番はまだ「新規」なので、本番に出すまで変えない）、`docs/MANUAL-VIDEO-SPEC.md`:204・224。
  A6（利用者の区画）で本文と合わなくなった所: `lib/manual/content.ts`:276-277（見出しは頭の「B様（仮名）」＋「仮名表示中」── 形は同じ・場所が区画の頭）・280・326（関係者名簿は頭の上ではなく、書類の下）・1036（「救済モードで一式」ボタン → 区画の「一式まとめて」）・1066（「この方の書類」→ 区画の「書類」・種類ごとの1行と「以前の版」・行を押すのではなく「開く」）、
  `docs/MANUAL-VIDEO-SPEC.md`:228-231（ch2 #9・10・12 ── 見出しと、パンくずの下の関係者名簿）・302（ch6 #12「この方の書類」に5件並ぶ）、公開中の ch2・ch6 の動画。
  A6 の関係者名簿・文字起こしで合わなくなった所: `lib/manual/content.ts`:372（「実名が出るのは、この関係者名簿の画面と…だけです」── 残した文字起こしにも出る。区画の説明の文と同じ直しが要る）・375-376（「読み込みに失敗しても画面には何も出ない」── いまは知らせと「もう一度読む」が出る）、
  `docs/ADMIN-SETUP.md`:113（「保存した文字起こし」→「残した文字起こし」）。「消す」（ADMIN-SETUP.md:132・145）はそのまま。

### テストの見張り（Quality Gates・2026-09-23 追加）
```
npm test ─> tools/run-tests.mjs
   ├─ ⓪ tools/safety-tests.json（安全テストの一覧）を tools/testManifest.mjs で照合 ── vitest より前・数秒
   │     ・名指しのファイル（理由つき）がディスクにある／守るフォルダが最低件数を下回っていない
   │       （lib/privacy・tests/api・lib/recording・lib/transcribe・lib/rescue）
   │     ・守るファイルに .skip( .only( .todo( skipIf runIf fails xit などの書き方が無い
   │       （`const s = it.skip` のように括弧なしで別名へ入れる形も ── 引数つきの実行ではここが唯一の見張り）
   ├─ ① vitest run（NO_COLOR）。引数なしのときは JSON レポートも一時ファイルへ書かせる（落ちたときの名指し用・読んだら unlinkSync で消す ──
   │     rmSync は日本語を含む置き場所でプロセスごと黙って落ちた・2026-09-24。tools の道具に rmSync があれば tools/testManifest.test.ts が落ちる）
   ├─ ②③ ディスク上のテストファイル数＝走った数・`Errors` 行が無い・vitest の終了コード 0（2026-09-13 から）
   ├─ ④ 集計行 Test Files / Tests に skipped・todo・expected fail が1件でもあれば失敗
   │     集計行は stdout だけから読む（テストが console.error で書いた偽の集計行が、つなぐと本物より後ろに来て勝っていた ── 2026-09-23 検収）
   └─ ⑤ JSON レポートでも「全ファイルが走り（ディスクと一致）・全テストが合格」かを確かめる（2つ目の判定・読めなければ失敗）
        ②④⑤で落ちたときは、走らなかったファイル・飛ばされたテストをファイル名とテスト名で挙げる
```
なぜ: ②だけでは、安全テストを1つ消すと両方の数が減って緑のまま、`it.skip` を入れても緑のままだった（吉本さん決定「安全テストが消えない・飛ばされない見張り」）。
見張りの検査は `tools/testManifest.test.ts`（わざと壊した状態を作って止まることを確かめる）。
画面の検査（送る前の画面・録音・共有状態・外枠の上の帯と左の帯）は、描いた HTML を `tests/helpers/markup.ts`（parse5 で木として読む。`textOf` は属性の中身と、隠す印＝`hidden` 属性・`aria-hidden="true"`・class の `hidden`/`invisible`/`sr-only`・style の `display:none`/`visibility:hidden` のある要素の文字を数えない。部品そのもの＝切り替え・チェックの印・赤い印が出ているかは `isReachable` で、自分と祖先の同じ印を見る。CSS ファイル側の見え方は判定しないので、「出していない」は HTML 全体で見る）で読む。文字列の照合では class の `disabled:` や title のふきだしで空振りしていた（2026-09-23・steering-log）。jsdom で動かす画面の検査（利用者の画面 `components/clients/*.test.tsx`・`components/shell/TopBarSlot.live.test.tsx`）は、jsdom の `textContent` が隠した文字も数えるので、「出ている」を同じ道具の橋 `shownText(container, 要素)`・`isShown(container, 要素)`（`markupOf` で jsdom の要素を読み直した木の同じ場所へ移す。形が食い違えば投げる）で読む（2026-09-24 に2つの枝を取り込んだときに寄せた）。道具そのものの検査は `tests/helpers/markup.test.ts`・`tests/helpers/markupDom.live.test.ts`（jsdom の橋）。CI（`quality-gates.yml`）は `npm run test` 経由で同じ見張りを通る（`package.json` の test が `node tools/run-tests.mjs` のままか・CI の行が `npm run test` のままか・`quality-gates.yml` に落ちても緑にする `continue-on-error` や段を飛ばす `if:` が無いかも、同じ検査が確かめる ── 入口を書き換えて見張りごと飛ばす抜け道を塞ぐ）。
引数つき（`npm test -- <ファイル>`）でも⓪と `Errors` 行・終了コードの確認は必ず走る。件数の突き合わせと④⑤は引数なしのときだけ（`-t` で絞ると外れたテストが skipped と数えられるため）。
一覧の抜けを防ぐ検査: `lib/generation` で「AI への指示に氏名・実名・個人情報を書かせない」を固定している検査は、字面から拾って一覧と突き合わせる（2026-09-23 の検収で `kaipokeAssessment.test.ts` の抜けが見つかったため）。
書く瞬間の注意喚起: 一覧の最低件数を下げる・名指しを消す・判定を緩める変更は、MaouCastle ルートの `.claude/hooks/pre-tool-guard.sh`（慎重領域 §6 #9）が
見張りの4ファイル（`tools/run-tests.mjs`・`tools/safety-tests.json`・`tools/testManifest.mjs`・`tools/testManifest.test.ts`）への Edit/Write で知らせる。
これはルートの `.claude/settings.json`（`Bash|Edit|Write`）で動く。carenote-ai 自身の `.claude/settings.json` は Bash だけを見る fail-safe で、注意喚起を持たない。
**未了（redesign/a を本番へ出す前に必須）**: この注意喚起は maoucastle-game のブランチ `harness/h3-safety-advisory`（ab5e3ad）にあり、
main へはまだ入っていない。ハーネスの変更なので PR＋独立審査（§2.7-F 出口）を通す ── [maoucastle-game#38](https://github.com/satoshiyoshimoto0426/maoucastle-game/issues/38)。

### つくるの見た目 ── 見た目だけの作り替え（A案「作業台」・R1・2026-09-24・ブランチ `redesign/a-restyle`）
- **流れ・押したときの動き・画面の文字は変えていない**（入力 → 送る前に見る → 結果の3段のまま。送る直前の文章を固定して左右の区画に分けるのは計画 C4、録音中にタブを止めるのは C3）。
- **並び** `app/(dashboard)/create/page.tsx`: `.panes` の中に区画（`Pane label="つくる"`・画面の残りの幅いっぱい）1つ。上から 見出し（`PageHeader`「帳票作成（下書き）」・`helpAnchor="ch3"` ── マニュアルが見出しの文字を使う）→
  書類の種類のタブの行（`.create-tabbar`・48px・下に 1px の線）→ 中身（`role="tabpanel"` の `.create-panel`）。中身は、区画の端から端までの帯（`.create-band`＝下書きの注意の黄色の帯／`.create-row`＝実名・記号の切り替え）と、読みやすい幅の列（`.create-col`・中身 760px）。
  タブの行は区画の上に**貼りつけない**（狭い幅でタブが2段に折り返すと高さが 48px でなくなり、区画の中で貼りつく「前へ／次へ」がその裏に潜るため）。
- **`components/create/DocTypeTabs.tsx`**: 文字のタブ（`role="tablist"`・`aria-selected`・選んだタブは太字＋下に 2px の線 `--ink`）。並びと文字は `lib/create/docTypes.ts` のまま、押すと以前と同じ `switchDocType`。
  キーボードは選んだタブだけが Tab の並びに入り、←/→・Home/End で移って Enter/スペースで選ぶ（移るだけでは選ばない ── 選ぶと結果の下書きが消えるので）。スマホではタブを1行のまま横に動かす。
- **一式まとめて（救済モード）への入口**: タブの行の右端の文字のリンク「一式まとめて（救済モード）」→ `/rescue`（左の帯から救済モードの項目が無くなったので、ここから行く）。**タブの並び（tablist）の外**に置く（中に入れると読み上げでタブの1つに数えられる ── 計画の指摘）。
- **部品の見た目**（文字・並び順・テストが見る形は以前のまま）: `components/drafts/PreSendPreview.tsx`（見出しの**緑の帯**〔`.presend-head`・淡い緑の地＋緑の線〕→ 「前へ／次へ」の**赤い枠**の帯〔`.presend-nav`・`--red-word` の 1px の線で四方を囲む・置き場所の地で塗る〕→ 欄を 1px の線で区切る。
  緑の帯と赤い枠は、使い方〔`lib/manual/content.ts`:135・429・433・477・1165〕がこの色で「送る前の画面か」「赤い言葉が残っているか」を見分けさせているので残す ── R1 で一度線だけにして、FAQ が「赤い言葉があっても送ってよい」と読める状態になった〔2026-09-24 検証の blocker〕。見張りは `app/globals.test.ts`「使い方が指す見た目」と `PreSendPreview.test.tsx`。赤い言葉の印は `.red-word`〔`--red-word` の文字＋波線・いま見ている所は 1.5px の枠〕。全文を開いていない欄の知らせは注意の黄色）、
  `components/drafts/*View.tsx`・`DraftSection.tsx`（白いカードをやめ `.draft-section`／`.draft-item` の 1px の線。項目の名前は緑・黄色でなく `--ink-2`）、`ItemsToConfirm`・`AssessmentUpdatesPanel`（細い線で囲んだ黄色の帯）、`AppointmentsPanel`・`KaipokeSheetView`（線で区切った行。つくるでは緑の主ボタンを1つにするため `primaryClass` に脇のボタンを渡す）、
  `components/recording/RecordingPanel.tsx`（上に 1px の線・マイクの印。同意のチェックは帯の中で最初の checkbox のまま）、`components/create/SaveTranscriptBar.tsx`・`NotesField.tsx`（上に 1px の線・欄の名前は `.section-label`）。
  救済モード（`rescue/page.tsx`）は、左だけ太い線で飾った注意・エラーの帯を細い線で囲む帯にしただけ（文字は同じ）。
- **トークンとクラス** `app/globals.css`: `--t-title` 24px → 20px、`--clay-line`（エラーの帯の縁）、`.mono`（数字と記号だけの文字列を等幅に ── 日本語の字には使わない）、4つ目の `@layer components`（`.create-*`・`.doc-tab*`・`.draft-*`・`.red-word`）。
  `components/ui/primitives.tsx`: `textareaClass` を 14.5px・行の高さ 1.9 に、1行に並べる小さな欄 `inlineFieldClass`（34px／スマホ 44px）を追加（`inputClass` に高さ・余白を足して上書きすると、どちらが勝つかが出力の順で決まり、選ぶ欄の文字が切れていた）。
- テスト: `app/(dashboard)/create/page.test.tsx`（一式まとめてのリンク〔`/rescue`・タブの並びの外〕・タブ5つの並びと文字・選んだタブは1つでケアプラン・Tab の並びに入るのはそのタブだけ・中身の名前・送る前の約束の一文）。エラーの帯の文字の 4.5:1 は `app/globals.test.ts`。
  送る前の見出しの緑の帯の文字の 4.5:1 も `app/globals.test.ts`。`components/recording/RecordingPanel*.test.tsx` は1文字も変えずに通る。
  `components/drafts/PreSendPreview.test.tsx` は以前の検査を1文字も変えず、緑の帯と赤い枠の帯に文字が入っていることの検査を1つ足した。
- **使い方と合っている所**（R1 の検証の直しで戻した）: 送る前の画面の「緑の帯」（`lib/manual/content.ts`:135・429・477、`docs/MANUAL-VIDEO-SPEC.md`:209・243・267）、
  赤い言葉の知らせの「赤い枠」「赤い帯」（`lib/manual/content.ts`:225・433・1165〔FAQ「赤い枠が出ていなければ、そのまま送って構いません」〕、`docs/MANUAL-VIDEO-SPEC.md`:244）。
  エラーの帯（`.create-error`）も細い線で囲んだ枠なので、ch7 の「赤い枠」（`lib/manual/content.ts`:1082・1139、`docs/MANUAL-VIDEO-SPEC.md`:320・327）もそのまま通じる。
- **まだ直していない文書**（D1b でまとめて）: `lib/manual/content.ts`:413（「上に並んだ5つのボタン」── 文字のタブ）・
  913・1036（救済モードへは、つくるのタブの行の右端「一式まとめて（救済モード）」から入る）、
  `docs/MANUAL-VIDEO-SPEC.md`:207（ch1 #6「画面の上に並ぶ帳票の種類」）・239（ch3 #2「5つの書類ボタン」）（形が文字のタブに）、
  公開中の ch1・ch3 の動画（書類の種類がボタンの並びで、送る前の画面の帯と枠が角の丸い箱で映っている ── 色の呼び方〔緑の帯・赤い枠〕と文字は今と同じ）。

## 4. 更新トリガ（いつここを直すか）
- モジュール（ディレクトリ）を新設・廃止したとき
- API ルートの追加・データフローの変更
- 外部サービスの追加・変更
- ブラウザ拡張のソフト別アダプタを追加したとき
- 安全テストを足した・消した・名前を変えたとき（`tools/safety-tests.json` も同じコミットで直す）

---
*最終更新: 2026-09-24 / 枝 `redesign/a-restyle`（つくると共通部品の A案の見た目・動きと文字は変えない・送る前の画面の緑の帯と赤い枠は残す）を取り込んだ（今夜の本番公開用）*
*2026-09-24 / 見張り（tools/run-tests.mjs）が一時レポートを消す所で、日本語を含む置き場所だとプロセスごと落ちていた（合否を出さずに 127）のを unlinkSync に直し、tools の道具に rmSync を戻さない検査を足した*
*2026-09-24 / 枝 `redesign/a-backend`（API・DB の失敗の扱い・安全テストの見張り・書類の日付の API）を `redesign/a` へ取り込んだ。利用者の一覧の読み方を `lib/clients/listError.ts` の `fetchClientList` に1つにし、利用者の画面の検査6つを安全テストの一覧へ足した。利用者の画面・外枠の検査の「出ている」を `tests/helpers/markup.ts`（jsdom の橋 `shownText`・`isShown` を足した）で読む形に寄せた*
*2026-09-24 / 利用者一覧の書類の日付の API（`GET /api/clients/latest-docs`・`getLatestDocMeta`・`lib/documents/latest.ts`）を足した（作り直し計画 U5 の API 部分。画面の列は統合の後）。範囲を使うルートは 12ファイル・17ハンドラ*
*2026-09-24 / 本文を直接読んでいた blob-upload（壊れた JSON で JSON の無い 500）と evaluate も `lib/requestBody.ts` に寄せた（12の入口。blob-upload は handleUpload の形も確かめる）。「唯一の道」の言い過ぎを直した（S1 の検収の指摘）*
*2026-09-24 / 関係者名簿・保存した文字起こし・ダッシュボードが、読めなかったとき（503）に空・0件を見せず文字で出す（S1 の検収の指摘）*
*2026-09-24 / lib/db 全体で DB の失敗を `DbAccessError`（`lib/db/errors.ts`）にし、入口は 503。見張り `lib/db/dbFailures.test.ts`（故障の注入・async 関数の抜けの検査）。使われていなかった `getEvaluationById` を削除（S1 の検収の指摘）*
*2026-09-24 / 救済モードの一式の保存を途中の失敗から押し直しても、利用者をもう1人作らず・保存済みの帳票を二重に保存しない（`lib/rescue/saveBundle.ts`。S1 の検収の指摘）*
*2026-09-24 / `getClientById` が DB の失敗を `ClientLookupError` にし、使う入口すべてが 404 でなく 503 を返す。本文は `lib/requestBody.ts` でオブジェクトだけ通す（10の入口）。書類の中身は入れ子32段まで（S1 の検収の指摘）*
*2026-09-24 / 画面の検査が、隠した部品（共有状態の切り替え・同意のチェック・赤い印）を「出ている」と数えないよう `isReachable` を足した（検収の指摘）*
*2026-09-23 / テストの見張りが集計行を stdout だけから読み、JSON レポートを2つ目の判定にする（テストが書いた偽の集計行で緑になっていた ── 検収の指摘）*
*2026-09-23 / 書類の保存（`POST /api/documents`）が名簿と同じ範囲で保存先の利用者を確かめる（見えなければ 404・範囲を決められなければ 503・中身はオブジェクトで 200KB まで）。保存帳票の `content` の説明を事実へ訂正。範囲を使うルートの数を 11ファイル・16ハンドラへ数え直し*
*2026-09-23 / 利用者一覧の失敗を空の一覧に見せない（`getClients` の例外→`GET /api/clients` の 500→`lib/clients/` 経由で3画面が「利用者一覧を読めませんでした」・救済モードは二重登録を防ぐため保存を止める）*
*2026-09-23 / 画面の安全テストを木で読む道具（`tests/helpers/markup.ts`）と共有状態の検査（`components/SharingStatus.test.tsx`）を反映。同日、`textOf` が隠した要素の文字を数えないことと、その限界を追記*
*2026-09-23 / テストの見張り（安全テストの一覧 `tools/safety-tests.json`・判定 `tools/testManifest.mjs`・落ちたときの名指し・ルートのフックの注意喚起との接続）を反映*
*2026-09-23 / デザイントークン v2（A案「作業台」）・書体 IBM Plex・トークンのセンサー（globals.test / clerkAppearance.test）を追記。同日: Clerk の層（cssLayerName）と、ログインが要る画面の確認残り（REDESIGN-A-SIGNOFF.md）を追記。同日: Clerk の押す部品の 44px とその見張りを追記。同日: 書体の読み込みの見張りを「描いた HTML の <link>」を見る形に強めた。同日: ナビ4項目の決まり（lib/nav.ts）・A案のアイコン・書類の種類の正本（lib/create/docTypes.ts）を追記。同日: 外枠（左の帯・上の帯・共有状態の置き場所・components/shell/）を追記し、Sidebar を外した。同日: 区画（ペイン）の部品と CSS・まだ作り替えていない画面の器（.legacy-page）・ホーム＝利用者（A4）を追記。2026-09-24: 動く器の直下の物を縮ませない決まり（一覧が切れて下の行へ行けなかった A4 の不具合）を追記。同日: 利用者の作業台（一覧の表・右の 440px の区画・上の帯への差し込み・ClientsContext・勝手に選ばない ── A5）を追記し、利用者の2画面を .legacy-page から外した。同日: A5 の検証の直し（表の見出しの行の高さぶん区画の --sticky-top を下げる・氏名を記号で表示する約束の1行を表の上に戻した）を追記。同日: 開いた書類の承認（G4）の操作を components/clients/DocumentPanel.tsx へ中身を変えずに移し、検査を足した（A6 U3a）。同日: 利用者の区画（ClientPane・書類は種類ごとの1行と以前の版・?doc= で開く・区画を 640px に広げる）を追記（A6 U3b）。同日: 関係者名簿と残した文字起こしを区画の行の形にし、読めなかったことを出す形を追記（A6 U4）*
*2026-06-16 / 救済モード（人物像→書類一式の一括下書き・SPEC §6.5 F9）を反映*
*2026-06-15 / P2拡張: カイポケ・サイドパネル＋流し込みアダプタ(extension/)を反映*
*2026-06-11 / P1拡張: アセスメント・モニタリング生成＋共通コア(structured.ts)を反映*
