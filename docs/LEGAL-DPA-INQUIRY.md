# Anthropic への照会ドラフト（ロードマップ G1／P-LEGAL-A の第一手）

> 目的: 介護記録（要配慮個人情報）を Claude API へ送る構成を法的に整えるため、
> **DPA（データ処理契約）と ZDR（ゼロデータ保持）の条件・所要日数を書面で取得**する。
> 取得した日数からローンチ日を逆算する（docs/ROADMAP.md）。
> 送り先: Anthropic の営業窓口（ https://www.anthropic.com/contact-sales ）または
> Console（console.anthropic.com）のサポートから。※窓口・条件は回答で確定させる（推測しない）。

---

## 送信文面（日本語で送る場合）

件名: 医療・介護分野での API 利用に関する DPA / データ保持設定のご相談

Anthropic ご担当者様

日本で介護事業者向けの記録作成支援サービス（CareNote AI）を開発している
個人事業主の吉本と申します。Claude API（従量課金・Console 経由）を利用しています。

当サービスでは、日本の個人情報保護法における「要配慮個人情報」に該当しうる
介護記録・医療関連情報を API へ送信する構成を検討しており、導入先事業者との
契約整備のため、以下を確認させてください。

1. API 利用における DPA（Data Processing Agreement / データ処理補遺）の締結手続き
   （標準の商用条件に含まれる場合はその旨と、書面としての提示方法）
2. ゼロデータ保持（Zero Data Retention）の適用可否・申請手続き・条件
   （最低利用額や契約形態の要件があれば、その内容）
3. API に送信したデータの保持期間・処理拠点（国・リージョン）・
   モデル学習への不使用の確認
4. 上記手続きの標準的な所要日数

小規模事業者ですが、医療・介護分野での適正な利用のため、正式な回答を
いただけますと幸いです。

吉本（CareNote AI）
連絡先: sy19800426@gmail.com

## English version (if requested)

Subject: DPA / Zero Data Retention inquiry for healthcare (long-term care) use case in Japan

Hello,

I am an independent developer in Japan building CareNote AI, a documentation-support
service for licensed long-term care providers, using the Claude API (Console, pay-as-you-go).

Our service may transmit long-term care records that qualify as "special care-required
personal information" under Japan's APPI. To finalize agreements with client facilities,
could you confirm:

1. How to execute a DPA for API usage (if it is included in the standard Commercial
   Terms, how we can obtain it as a document).
2. Availability, process, and conditions for Zero Data Retention (including any
   minimum-spend or contract requirements).
3. Data retention period, processing locations/regions, and confirmation that API
   data is not used for model training.
4. Typical lead time for the above.

Thank you,
Yoshimoto (CareNote AI) — sy19800426@gmail.com

---

## 回答記録（2026-07-19・Anthropic 購買エージェント／出典つき回答）

| 項目 | 回答 | 日付 |
|---|---|---|
| DPA の締結方法・書面 | **署名不要・自動適用**。Commercial Terms に参照組込みで、同意時点で有効（個別交渉なし・$500K未満は標準一律）。本文は公開＝コンサル先に提示・レビュー可: anthropic.com/legal/data-processing-addendum（役割=当方controller/Anthropic processor・終了後30日でデータ返却or削除・サブプロセッサ事前通知・48時間以内の侵害通知・Schedule 2 TOMs） | 2026-07-19 |
| ZDR の可否・条件 | 可能だが **$100K+のコミットメント＋Safeguardsレビュー**・組織単位申請・API経由(api.anthropic.com)のみ対象（Console/Workbenchは対象外）。→ **1社実証の規模では見送りが妥当**（下記の代替で説明） | 2026-07-19 |
| 保持期間・処理拠点・学習不使用 | 入出力は**受領/生成から30日以内に自動削除**（例外: Files API等の長期保存サービス・ZDR合意・Usage Policy執行=フラグ時最長2年/T&S分類スコア最長7年・法令）。**学習利用は Commercial Terms §B で禁止**。処理拠点は公開情報で断定不可（国際移転はDPAのSCCsで手当て）→ Trust Center/API窓口でフォローアップ | 2026-07-19 |
| 所要日数 → ローンチ逆算 | **DPA=即時（待ち時間ゼロ）**。ZDR=審査次第だが見送りのため影響なし。→ **G1の外部待ちは実質消滅。残りは自前の書類整備のみ** | 2026-07-19 |

### 結論（G1 の残タスク＝書類整備のみ）
1. コンサル先向け「データ取扱説明書」1枚（委託構成・公開DPAの要点・30日自動削除・学習不使用・仮名化・米国処理の明示）🧩→👤🏢
2. プライバシーポリシーに米国処理・越境移転を明記 🧩→👤
3. （任意フォロー）処理リージョンの確定を API 窓口（claude.com/contact-sales）へ照会 👤
4. 実装側の対応済み事項: 仮名化（氏名→記号・実名はDBにも暗号化分離）・PDF非保持（処理後即削除）・Files API不使用
