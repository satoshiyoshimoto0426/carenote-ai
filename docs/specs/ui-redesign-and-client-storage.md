# 機能仕様: UI再設計 ＋ 利用者データ保存（A案）

> 種別: 機能仕様（製品正本 [`../../SPEC.md`](../../SPEC.md) の下位）。作成 2026-06-16。
> 横断規約 `~/.claude/CLAUDE.md` ＋ プロジェクト `CLAUDE.md` ＋ SPEC §7/§12 に従う。
> 本仕様は**実装前のレビュー用**。確定後にフェーズ1から着手する。
> 関連: ロードマップ R2（個人情報・法務）と一体。デザインは memory「carenote UI design direction」。

## 1. 目的・対象ユーザー
- **目的**: 「人ごとに書類が貯まる」体験と落ち着いたUIで、ケアマネの作成負担を減らし、1社実証に耐える形にする。
- **対象**: コンサル先1社のケアマネジャー（作成・確認・保存）と、提供側（吉本さん＝運用・設定）。
- **背景**: 現状は単発生成（保存なし）＋ダーク/絵文字UI。利用者軸での蓄積と、editorialな質感へ刷新する。

## 2. スコープ
**含む（フェーズ1=1社実証MVP）**: 利用者(clients)・書類(documents)の保存、仮名化、Clerk org→Supabase RLS、
デザインシステムv0適用、画面=ホーム／利用者詳細／（救済・作成からの)保存導線。
**次段（フェーズ2）**: 複数メンバーの権限・招待、ホーム運用指標の実データ化、通知、利用者一覧の充実、保持期間の自動削除ジョブ。
**含まない**: 第6表（給付管理）。新しい介護ソフトへの対応追加。

## 3. 確定済みの前提（再議しない）
- スタック: Next.js 16 / React 19 / TypeScript / Biome / Tailwind / Supabase(RLS) / Clerk / Claude API。
- デザインシステム v0: ライト×深緑 editorial（紙 `#F7F5F1` / 深緑 `#15604D` / 明朝見出し / 線アイコン / グラデ・絵文字なし / 余白と髪の毛罫線）。
- IA: ホーム（横断ハブ・今日やること＋運用指標）＋利用者軸＋「救済→確認→カイポケ流し込み→人が保存」の一本動線＋設定。
- **利用者保存=A案で確定**（要配慮個人情報をDB保存）。既存の `lib/generation`・`extension`・評価は部品として流用。

## 4. 採用する方針（質問スキップ時の既定・変更可）
- **仮名化=標準**: 氏名・住所・医療機関名など固有名詞を記号化。**DBにも記号で保存**し、氏名⇄記号の対応表だけ分離保管。Claude API（海外）へは記号のみ送る。
- **保持期間=5年**（吉本決定 2026-06-16・介護記録の保存義務に合わせ長めに設定）。`retention_until = created_at + 5年`。その期間は自動削除しない（期間経過後の削除はフェーズ2のジョブ）。
- **実データ投入の前提**: コンサル先との**データ処理委託契約／本人同意**（R2）。締結前に本番実データを入れない。

## 5. 画面と受け入れ基準
| 画面 | 要点 | 受け入れ基準 |
|---|---|---|
| ホーム | 今日やること＋運用指標＋すぐ始める＋最近の利用者 | 期限が近い書類が上に出る。指標は実データ（フェーズ2で）。 |
| 利用者詳細 | 基本情報＋書類タイムライン＋動線（救済/カイポケ/コピー） | 利用者の全書類が状態付きで一覧。仮名表示中が分かる。 |
| 利用者作成/編集 | 利用者を新規作成・基本情報入力 | 氏名は対応表に、属性は clients に保存。記号が自動採番。 |
| 救済モード入力 | 既存の構造化フォーム（新トーン） | 1項目以上で生成→結果を利用者に保存できる。 |
| 設定 | 仮名化・保存・保持期間・権限・連携・コスト | 仮名化ON/保持期間/権限/拡張接続状態を確認・変更できる。 |

## 6. データモデル
- **clients**: `id` / `org_id`(Clerk org) / `code`(表示記号 例「A様」自動採番) / `attributes`(jsonb: 年齢・性別・要介護度・世帯等の**非識別**属性) / `created_by` / `created_at` / `updated_at`。
- **client_identities**（対応表・分離・厳格アクセス）: `client_id`(fk) / `name_encrypted`（実名。アプリ層暗号化 or pgcrypto） / `org_id`。**Claudeへは絶対に渡さない**。
- **documents**: `id` / `client_id`(fk) / `org_id` / `doc_type`(assessment|carePlan|meetingSummary|supportLog|monitoring) / `status`(draft|complete) / `content`(jsonb=下書きJSON) / `source`(rescue|create) / `retention_until`(date) / `created_by` / `created_at` / `updated_at`。
- **アクセス制御**: 既存 `lib/db.ts` と同方式に合わせる＝**サーバ専用クライアント（service role）＋アプリ層で `created_by`(Clerk userId) スコープ**。`org_id`(Clerk orgId・null可) は列として保存し、**org単位の共有はフェーズ2（権限）**で有効化。RLS ポリシーは多層防御として付与（既存 evaluations と同様）。`client_identities` はサーバ経由のみアクセスし、復号は権限内でのみ。
  - 注: Clerk-Supabase の JWT/RLS 連携は現状未配線のため、Phase1 の実効的な制限はアプリ層で行う（実名は暗号化＋テーブル分離で守る）。

## 7. 仮名化の設計（核心・SPEC §7/§12）
- **送信前マスク**: 生成・評価でClaudeへ送るペイロードは**記号(code)のみ**。実名・対応表は送らない。
- **表示時復元**: 画面表示時に code→実名を解決（同org・権限内のみ）。
- **純粋関数**: `lib/privacy/pseudonymize.ts` に `maskNames(text, map)` / `restoreNames(text, map)`（DOM/API非依存・**必ず単体テスト**）。
- 既存の生成ルール（氏名を創作しない）と整合。救済モードも氏名は記号のまま生成。

## 8. プロジェクト構成（どこに足すか）
- `app/(dashboard)/{page.tsx=ホーム, clients/, clients/[id]/}` 追加。`rescue/`・`create/` に「利用者に保存」導線を追加。
- `app/api/clients/`・`app/api/documents/` 追加（Clerk認証・RLS経由）。
- `lib/db/{clients,documents}.ts`（`lib/supabase` 経由のデータアクセス）、`lib/privacy/pseudonymize.ts`。
- `supabase/` に migration（clients / client_identities / documents ＋ RLS ポリシー）。
- `components/` に editorial デザインの共通部品（サイドバー刷新・線アイコン・トークン）。

## 9. コマンド・コードスタイル
- コマンドは既存どおり（`npm run dev/build/lint/format/test`、`npx tsc --noEmit`）。
- スタイルは既存 `CLAUDE.md`/`SPEC §11` 準拠（RSC基本・`"use client"`最小・Supabaseは`lib/supabase`経由・RLS無効化禁止・`any`/`TODO`/lint無効化禁止・Biome整形）。

## 10. テスト戦略
- **必須(単体)**: `lib/privacy/pseudonymize`（マスク/復元・固有名詞の取りこぼし無し）、`lib/db` の入力検証、retention_until の算出。
- **RLS**: ポリシーの検証（他org不可視）。可能なら統合テスト、最低限は手順を文書化して手動確認。
- **E2E(Playwright・フェーズ1末)**: 利用者作成→救済生成→保存→利用者詳細で閲覧/コピー/カイポケ送信。
- カバレッジ目標80%（横断規約）。

## 11. 境界（SPEC §12 を継承＋本機能固有）
- **常にやる**: Claudeへは記号のみ送る／RLS必須／確定保存は人／AI出力は下書き／コード変更時は本仕様と関連docsを同PRで更新。
- **先に確認**: 本番実データ投入（委託契約締結後）／保持期間・削除ポリシー変更／海外送信先の追加／権限モデルの変更。
- **絶対やらない**: 実名をClaude APIへ送る／RLS無効化／拡張がログイン情報を保存・送信／**委託契約前に本番実データを投入**。

## 12. 受け入れ基準（全体）
1. ケアマネが利用者を作成→救済モードで一式生成→各書類が当該利用者に保存され、後から閲覧・コピー・カイポケ送信できる。
2. Claude API へ実名が送られない（仮名化テストで担保）。
3. 他事業所のデータが見えない（RLS）。
4. 画面はデザインシステム v0 に準拠（グラデ・絵文字を使わない）。

## 13. 未確定・要確認
- データ処理委託契約／同意の文面・締結（先方・必要なら専門家）＝本番実データ投入の前提。
- 実名の暗号化方式（アプリ層 vs pgcrypto）＝実装時に決定。
- ~~保持期間の年数~~ → **5年に確定**（2026-06-16）。

---
*次: 本仕様を確定 → フェーズ1（migration＋仮名化＋clients/documents API＋ホーム/利用者詳細）から着手。*
