# カイポケ DOM 構造メモ（P2 アダプタ用）

> 取得日: 2026-06-12 / 取得方法: 吉本さんのカイポケ会員環境＋**テスト利用者**の画面を Chrome 連携で読取。
> **本書は画面の構造情報のみを記載する。利用者の実データ・氏名・値の記載は禁止**（SPEC §7 / §12）。
> 画面構造はカイポケのバージョンアップで変わりうる。アダプタ実装時に再検証すること。

## 共通事項

- アプリ本体: `r.kaipoke.biz/kaipokebiz/business/...`（要ログイン・30分無操作で自動ログアウト）
- 技術: JSF（JavaServer Faces）系。`<form name="form">` POST 遷移、`?conversationContext=N` で画面フロー管理（**URL直叩きでの状態復元は不可**＝アダプタは「開いている画面に書く」方式にする）
- フィールド命名: `form:` プレフィックス＋**意味の通る英語名**（安定・アダプタ向き）
  - 日付は4分割セレクト: `...YmdEra / ...YmdYear / ...YmdMonth / ...YmdDay`
  - ラジオ群は同名複数（例: `form:assessmentReasonDivision-01` ×9択）、「その他」記入欄は `-02`
  - テキストエリアは**行数×全角文字数の上限**あり（例:「最大10行(幅全角26文字)」）→ **生成側で文字量制御が必要**
- タブ遷移: 非アクティブタブは `<li><a onclick=JSFsubmit><span>n枚目</span></a></li>`。`a.click()` で遷移可。**管理情報を登録するまで各枚タブは無効**

## アセスメント・モジュール（ページ → .do 対応）

| 画面 | .do | 主な構造（構造のみ） |
|---|---|---|
| 管理情報 | MEM091403 | `makeYmd*`(作成日) / `lsLedInsuranceProof`(被保証適用期間sel) / `lsLedStaffMemberBasic`(担当ケアマネsel) |
| P1 フェイスシート | MEM091404 | `acceptanceYmd*`+`acceptanceDivision-01`(受付方法radio5) / `consultationAcceptancePerson` / **`assessmentReasonDivision-01`(理由radio9: 初回/更新/区変/悪化/改善/退院/退所/他)** / 緊急連絡先・相談者ブロック(`emergencyContactPerson*`,`consultationPerson*`) / `consultationRoute` / `planMakeTrustNotificationYmd*` / **`consultationSubjectPersonHimself`(主訴・本人 textarea 最大10行)** / **`consultationSubjectFamily`(主訴・家族)** / **`progressSubject`(最大16行)** / 手帳3種(`disabledPersonNotebook*`,`habilitationNotebook*`,`welfareNotebook*`) / 受給者証radio / **`bedriddenDivision`(障害自立度radio10)** / **`dementiaDivision`(認知症自立度radio9)** / 判定者ブロック×2 / `assessmentEnforcementYmd*`(実施日) |
| P2 家族情報・サービス利用 | MEM091501 | `nursingCircumstancesSubject` / 家族1〜5(`familyN*`,`mainNursingPersonFlagN`,`input-healthN`,`input-noteN`) / `supportOfferPersonSubject`・`supportSubject`・`necessarySupportSubject`・`specialMentionMatterSubject`(各最大9行) / `serviceUseYmd*` / **介護サービス利用 `homeuse01..22`+`homeuseNNfrequency`**（01訪問介護/02訪問入浴/03訪問看護/04訪問リハ/05居宅療養/06通所介護/07通所リハ/08短期生活/09短期療養/10特定施設/11市町村特別/12福祉用具貸与/13福祉用具販売/14住宅改修/15夜間訪問/16認知症通所/17小多機/18グループホーム/19地域特定/20地域特養/21生活支援員/22サロン） |
| P3 サービス利用・住居 | MEM091502 | `homeuse23..34`(+`useServiceNName`/`serviceNUseNumber`) / 入院・入所(`entrance_hospitalization_division`,`institutionName`,住所系) / 制度利用 `seidouse01..24`(+Description) / 住居 `homeStyle*`,`homeStatus*` ほか |
| P4 健康状態 | MEM091503 | `caseOrMedicalHistorySubject` / `height`,`weight` / 歯 `toothCircumstancesFlag-01..04` / **疾患1〜4ブロック**: `diseaseNameN`,`medicineBooleanDivisionN`,`incidenceEpochSubjectN`,`fixedTermCountN-*`,`medicalExamCircumstancesDivisionN`,`medicalInstitutionNameN`,`hospitalDepartmentNameN`,`attendingNameN` |
| P5 基本（身体機能・起居）動作 | MEM091504 | `mobable01..14`(麻痺拘縮等・枝番) / `bodychange*`,`bodygetup*`(起居) / `prepare*`,`transport*`,`bodywash*`,`hearwash*`,`bathing*`,`bloodclean*`（実施状況系5択構造） |
| P6 生活機能（食事・排泄） | MEM091508 | `lifefunction01..13` / `mealplace-*` / `piss-*` / `eathelp*`（食事援助の現状/希望/計画系） 計145欄 |
| P7 認知機能・精神行動障害 | MEM091506 | `lifefunction14..31` / `familyInfoSubject` / `assistancePresentConditionFamilySubject`・`...ServiceSubject`(援助の現状) / **`assistanceHopePersonHimselfSubject`・`assistanceHopeFamilySubject`(援助の希望)** / **`assistancePlanSubject`(援助計画)** |
| P8 社会生活力 | MEM091507 | `rd51..59` / 交流 `Activism-*` / `emergencyContactSubject` / IADL系ブロック（`cashManagement*`,`shopping*`,`cooking*`,`societyLifePreparation*`,`fixedTermConsultation*` 各 家族実施/サービス実施/希望/決定/計画 flag構造） |
| P9 医療・健康関係 | （.do要再確認※） | `treatmentSubjectflag1..9` / `specialInteractionFlag1..3` / 医療処置系ブロック（`measurement*`,`drugManagement*`,`drugUse*`,`havingMedicalExamAssist*`,`rehab*` 各 実施/希望/決定/計画 flag構造） 計138欄 |
| P10 全体のまとめ | MEM091509 | **`summarySubject`(まとめ textarea 最大26行×全角54文字)** / `safetyNecessity`(安全確保の必要性radio) / `transferNecessity`(権利擁護の必要性radio) / `docCondition`(作成状態) |
| P11 1日のスケジュール | MEM091530 | 時間帯行リスト `parentId:N:` プレフィックス × {`oneselftDoneSubject`(本人がしていること)/`familyDoneSubject`(家族実施)/`servicePlantDoneSubject`(サービス実施)/`needSupportFlag`(要援)/`planFlag`(計画)} 計169欄 |

※P9 の .do は取得時に直前ページの値が残った可能性があるため、アダプタ実装時に再確認する。

## CareNote AI → カイポケ 初期マッピング（アセスメント）

| CareNote AI（AssessmentDraft） | カイポケ欄 | 備考 |
|---|---|---|
| assessmentReason | P1 `assessmentReasonDivision-01` | radio（初回/更新/区変/悪化/改善/退院/退所/他）→ 値の対応表が必要 |
| mainComplaints（本人） | P1 `consultationSubjectPersonHimself` | 最大10行制限 |
| mainComplaints（家族） | P1 `consultationSubjectFamily` | 〃 |
| lifeHistory | P1 `progressSubject`（最大16行）※ラベル文言は実装時に確認 | |
| currentServices | P2 `homeuse01..22`＋frequency / P3 `seidouse*` | テキスト→チェック群の変換は人手確認前提（Step2では転記支援に留める判断も） |
| overview | **P10 `summarySubject`** | 最大26行×全角54文字 ≒ 約1,400字 |
| identifiedIssues / strengths | P10 `summarySubject` 内に整形して含める or P7 `assistancePlanSubject` | 様式上、専用欄なし |
| domains（14項目） | P4〜P9 の各観点欄に分散 | 完全自動は過剰。**Step2の現実解: P1主訴系＋P10まとめ＋P7援助希望/計画のテキスト欄を自動入力し、チェック群は転記支援パネルで人が確認** |
| itemsToConfirm | （対応欄なし） | 拡張のサイドパネルに表示して人が処理 |

## ケアプラン・モジュール（パス: `/business/care_plan/care/...`）

### 第1表（居宅サービス計画書(1)） MEM091701.do
| 欄 | プログラム名 | 型 | CareNote AI 対応 |
|---|---|---|---|
| 作成年月日 | `makeYmd*` ＋ `firstTimeFlag`/`introductionFlag`/`continuationFlag`(初回/紹介/継続chk) | sel×4+chk | — |
| 被保険者適用期間 | `lsLedInsuranceProof` | sel | — |
| 計画作成者氏名 | `staffMemberId` | text | — |
| 計画作成(変更)日 | `inHomeServicePlanMakeYmd*` | sel×4 | — |
| 初回計画作成日 | `firstTimeInHomeServicePlanMakeYmd*` | sel×4 | — |
| **利用者及び家族の意向を踏まえた課題分析の結果** | **`userLifeSubject`** | textarea | **`assessmentSummary`** ✅ |
| 介護認定審査会の意見及びサービスの種類の指定 | （textarea・name難読化） | textarea | （対象外。初期値「特になし」） |
| **総合的な援助の方針** | （textarea・name難読化） | textarea | **`comprehensivePolicy`** ✅ |
| 生活援助中心型の算定理由 | （chk×3＋text・name難読化） | chk+text | — |
| 説明・同意日 | `descriptionAgreementDayYmd*` | sel×4 | — |

- ⭐ **重要発見**: 各テキスト欄の隣に**カイポケ純正の「難形・例文選択」「難形登録」ボタン**がある
  ＝定型文の差し込み機能を製品自身が持つ＝**外部からの自動入力に文化的抵抗が小さい**。
- 一部の textarea/chk は `name` が Base64 難読化されていた（同一画面でも難読化されない `userLifeSubject` 等と混在）。
  → アダプタは **name優先・ダメなら見出しラベル（th文言）からの近接探索** の二段構えにする。

### 第2表（居宅サービス計画書(2)） — 未取得
- 第1表画面内のタブ「居宅サービス計画書(2)」はクリックで切替不可。
  **第1表を登録(保存)してからでないと第2表が開けない**仕様と推定（アセスメントの管理情報→各ページと同じパターン）。
- 次回、第1表を保存した状態で第2表（ニーズ/長期・短期目標/期間/サービス内容/サービス種別/頻度/担当者）の構造を取得する。

## アダプタ設計への示唆

1. **テキストエリア中心の半自動入力が最有効**（主訴・経過・まとめ・援助希望/計画）。チェック/ラジオの海（P5,P6,P8,P9）は人の判断領域として残す。
2. 文字量制御: 生成時に「最大◯行×全角◯文字」制約を渡す必要 → 生成オプションに `lengthHint` を追加する。
3. 値の書込は `document.getElementsByName('form:xxx')` → `value` 設定＋`input`/`change` イベント発火（JSF互換）。
4. 入力後の**保存は必ず人間**（SPEC F7）。拡張は「流し込み→ハイライト表示→人が登録ボタン」まで。

---
*次回取得予定: ケアプラン第1表・第2表、第4表（担当者会議）、第5表（支援経過）、モニタリングの各編集画面。*
