# カイポケ転記 手順仕様書（CareNote AI 設計資料）

> 作成日：2026-09-11　対象：カイポケ 居宅介護支援（アセスメント／居宅サービス計画書）
> 根拠：2026-09-09〜10 にブラウザ操作型のAIが**テスト利用者**のデータで実際に転記・登録した際のDOM調査と実行結果（吉本さんが別セッションで実施。原文の利用者名は本書では「テスト利用者」に置換）。
> 位置づけ：[KAIPOKE-DOM.md](KAIPOKE-DOM.md)（拡張のアダプタが参照する正本）を**11ページ分＋第2表の画面往復**まで広げる設計材料。
> 取り込み状況（2026-09-11）：§2 正規化・§3 keyup 同期・§5-2 文字数上限・§5-6 再ログイン検知は `extension/src/adapters/kaipoke.js` に実装済。11ページの欄マッピング拡張と第2表の階層入力は未着手（CareNote 側の下書き構造の拡張が先）。

## 凡例

- TA = textarea、TX = テキスト入力、RD = ラジオ、CK = チェックボックス、SEL = セレクト
- 「行×字」は画面に表示される「最大N行(幅全角M文字)」のガイド値（サーバ側で検証されるのは一部のみ、§5）
- ラジオの値は 01, 02…の文字列。「未選択」は 00（ページ11の一部と第1表以外は共通）
- 各ページの「作成状態」ラジオは 01=作成中, 02=作成済
- `form:j_id_jsp_…` で始まる名前はJSFの自動生成名。デプロイで変わる可能性があるため、位置やラベルからの特定にフォールバックできる実装にすること

## 1. アセスメント 11ページ分のフォーム名と制限

### 共通事項
- URL：`/kaipokebiz/business/assessment/MEM0915xx.do?conversationContext=N`（ページによりxxが変わる。conversationContext はセッション内の会話番号で、同一セッション中は固定）
- ページ切替：タブリンク「1枚目」〜「11枚目」（href="#"、JSで遷移）。**未登録のまま切り替えると入力は消える**
- 登録ボタン：`<a><img alt="登録する"></a>`。登録成功時は本文に「入力内容を登録しました」が出る。失敗時は赤枠で `（Error No：XXX_nnnn）` 形式のメッセージ
- 値の投入方法：`element.value = …` の後に input / change イベントを dispatch すれば保存される（ページ2〜11で確認済み）。行数カウンタ（「0行 / 最大N行」）は keyup 連動のため更新されないが、保存には影響しない

### 1枚目：フェイスシート（既存入力のため変更なし。読み取ったフィールド名のみ）

| 欄 | 名前 | 型・制限 |
|---|---|---|
| 受付日 | form:acceptanceYmdEra/Year/Month/Day | SEL（Era: 4=平成 5=令和） |
| 受付区分 | form:acceptanceDivision-01 | RD（01=訪問…） |
| 相談受付者 | form:consultationAcceptancePerson | TX |
| アセスメントの理由 | form:assessmentReasonDivision-01 | RD（06=退院 を確認） |
| 緊急連絡先 | form:emergencyContactPersonFullName-01（氏名）, -02（性別 1=男 2=女）, …Age, …Connection, …Address, …TelephoneNumber, …CellphoneNumber | TX/RD |
| 相談者 | form:consultationPersonFullName-01/-02, consultationPersonAge/Connection/Address/TelephoneNumber/CellphoneNumber | 同上 |
| 相談経路 | form:consultationRoute | TX |
| 計画作成依頼届出日 | form:planMakeTrustNotificationYmdEra/Year/Month/Day | SEL |
| 相談内容（本人） | form:consultationSubjectPersonHimself | TA 10行×26字 |
| 相談内容（家族） | form:consultationSubjectFamily | TA 4行×26字 |
| これまでの生活の経過 | form:progressSubject | TA 16行×26字 |
| 利用者負担段階 | form:userBurdenStepDivision | RD（04 を確認） |
| 身障手帳 | form:disabledPersonNotebookDivision（01有 02無）, …GradeSeed-01/-02 | RD/SEL |
| 療育手帳 | form:habilitationNotebookDivision | RD |
| 精神手帳 | form:welfareNotebookDivision, …GradeClass | RD/SEL |
| 障害福祉受給者証 | form:barrierReceivingPaymentsPersonProofBooleanDivision | RD |
| 自立支援医療 | form:independenceReceivingPaymentsPersonProofBooleanDivision | RD |
| 寝たきり度 | form:bedriddenDivision, …VerdictPersonFullName, …VerdictAgencyName, …VerdictYmdEra/Year/Month/Day | RD/TX/SEL |
| 認知症自立度 | form:dementiaDivision, …VerdictPersonFullName/AgencyName/YmdEra… | 同上 |

### 2枚目：家族情報・サービス利用（MEM091501）

| 欄 | 名前 | 型・制限 |
|---|---|---|
| 家族の介護の状況・問題点 | form:nursingCircumstancesSubject | TA 14行×35字 |
| 家族N（N=1〜5）主介護者 | form:mainNursingPersonFlagN | CK |
| 家族N 氏名 | form:familyNNameGender-1 | TX max40 |
| 家族N 性別 | form:familyNNameGender-2 | RD 1=男 2=女 0=未選択 |
| 家族N 続柄 | form:familyNRelation | TX max5 |
| 家族N 同別居 | form:familyNhouse | RD 01同居 02別居 |
| 家族N 職の有無 | form:familyNjob | RD 01有 02無 |
| 家族N 健康状態等 | form:input-healthN | TX max60 |
| 家族N 特記事項 | form:input-noteN | TX max1000 |
| インフォーマル：支援提供者 | form:supportOfferPersonSubject | TA 9行×8字 |
| 活用している支援内容 | form:supportSubject | TA 9行×16字 |
| 受けたい支援 | form:necessarySupportSubject | TA 9行×16字 |
| 特記事項 | form:specialMentionMatterSubject | TA 9行×16字 |
| サービス利用状況 年月日 | form:serviceUseYmdEra/Year/Month/Day | SEL |
| 在宅サービス（訪問介護〜特定施設、市町村特別給付、福祉用具貸与…） | form:homeuse01〜form:homeuse22 | CK |
| 各回数・品目数 | form:homeuseNNfrequency | TX max3（14=住宅改修は無し） |
| 住宅改修 有無 | form:rd_homeuse14 | RD 01有 02無 |
| 作成状態 | form:docCondition | RD |

homeuse番号：01訪問介護 02訪問入浴 03訪問看護 04訪問リハ 05居宅療養管理指導 06通所介護 07通所リハ 08短期入所生活 09短期入所療養 10特定施設 11市町村特別給付 12福祉用具貸与 13特定福祉用具販売 14住宅改修 15夜間対応型 16認知症対応型通所 17小規模多機能 18認知症GH（19〜22は地域密着型特定施設／地域密着型特養／生活支援員／サロン）

### 3枚目：サービス利用・住居

| 欄 | 名前 | 型・制限 |
|---|---|---|
| 訪問食事〜ガイドヘルパー | form:homeuse23〜29 CK、form:service23UseNumber〜29 | TX max3 |
| 身障/補装具 | form:homeuse30, form:useService30Name | TX max40 |
| その他4行 | form:homeuse31〜34, form:useService31Name〜34Name（TA 2行×16字）, form:service31UseNumber〜34 | |
| 直近の入所・入院 | form:entrance_hospitalization_division | RD 01特養 02老健 03療養型 04GH 05特定施設 06医療機関(療養病床) 07医療機関(療養病床以外) 08その他 |
| 施設名 | form:institutionName | TX max40 |
| 〒 | form:postcode | TX（ハイフン無し7桁で保存OK） |
| 都道府県 | form:prefecturesCd | SEL（27=大阪府） |
| 市区町村／町名番地／建物 | form:cityName(40) / form:townName(40) / form:buildingName(60) | TX |
| TEL | form:hospitalTal | TX |
| 年金 老齢/障害/遺族 | form:seidouse01/02/03 CK ＋ form:seidouse01/02/03Description | TX max40 |
| 恩給〜日常生活自立支援事業 | form:seidouse04〜09 | CK |
| 成年後見制度 | form:seidouse10 CK ＋ form:seidouse10Description（成年後見人等 40）、seidouse11後見 12保佐 13補助 | |
| 健康保険 | form:seidouse_14（国保、アンダースコア注意）, 15協会けんぽ 16組合 17日雇 18国公共済 19地方共済 20私学 21船員 form:seidouse2x（後期高齢者医療） | CK |
| 労災 | form:seidouse22 ＋ form:seidouse22Description(20) | |
| 老人保健事業 | form:seidouse23健康手帳 24健康診査 | CK |
| 住宅 | form:homeStyle01（01戸建 02集合）、form:homeStyle02-1（01賃貸 02所有 03給与 04公営 05その他）＋homeStyle02-2(20) | |
| 居室 ア | form:homeStatus01（01専用居室あり 02なし） | |
| 居室 イ | form:homeStatus02-1（01 1階 02 2階 03その他）＋homeStatus02-2(max3 階数)、EV form:homeStatus02-3（01有 02無） | |
| 居室 ウ | form:homeStatus03-1（01布団 02ベッド 03その他）、homeStatus03-3（01固定式 02ギャッチ 03電動 ※初期値01）、homeStatus03-4(20) | |
| 陽あたり/暖房/冷房 | form:homeStatus04（01良 02普通 03悪）/ 05 / 06（01あり 02なし） | |
| トイレ | form:homeWC01-1（01洋式 02和式 03その他）＋homeWC01-2(20)、homeWC02手すり、homeWC03段差 | |
| 移動手段 室外 | form:moveInhouse01-1（01使用 02不使用）、moveInhouse02_01車いす _02電動 _03杖 _04歩行器 _05その他、moveInhouse01-2(20) | ※名前は Inhouse だが画面上は「室外」 |
| 浴室 | form:homeBath01有無、homeBath02手すり、homeBath03段差 | |
| 移動手段 室内 | form:moveOuthouse-1、moveOuthouse02_01〜05、moveOuthouse-2(20) | ※名前は Outhouse だが画面上は「室内」 |
| 諸設備 | form:homeFacil01洗濯機 02湯沸器 03冷蔵庫 | RD |
| 特記事項 | form:specialMentionMatterSubject | TA 5行×57字 |
| 作成状態 | form:assessment3pageMakeStateDivision | RD |

### 4枚目：健康状態

| 欄 | 名前 | 型・制限 |
|---|---|---|
| 既往歴・現症 | form:caseOrMedicalHistorySubject | TA 8行×29字 |
| 身長/体重 | form:height / form:weight | TX max5（小数OK） |
| 歯の状況 | form:toothCircumstancesFlag-01歯あり -02歯なし -03総入れ歯 -04局部義歯 | CK |
| 特記事項（上） | form:specialMentionMatterSubject1 | TA 7行×58字 |
| 病名N（N=1〜4） | form:diseaseNameN | TX |
| 薬の有無 | form:medicineBooleanDivisionN | RD 01有 02無 |
| 発症時期 | form:incidenceEpochSubjectN | TX |
| 受診頻度 | form:fixedTermCountN-01（01定期 02不定期）、-02（02週 03月）、-03回数 TX max5 | |
| 受診状況 | form:medicalExamCircumstancesDivisionN | RD 01通院 02往診 |
| 医療機関/診療科/主治医/TEL | form:medicalInstitutionNameN(40) / form:hospitalDepartmentNameN(40) / form:attendingNameN / form:medicalExamHospitalTelephoneNumberN | TX |
| 受診方法留意点 | form:havingMedicalExamMethodSubjectN | TA 2行×12字 |
| 往診可能な医療機関 | form:doctorsVisitPossibleMedicalInstitutionName-01（02無 01有 の順で並ぶ）、-02名称(40)、-03TEL | |
| 緊急入院 | form:emergencyHospitalizationPossibleMedicalInstitutionName-01/-02/-03 | 同上 |
| 薬局 | form:prescriptionPharmacyName-01/-02/-03 | 同上 |
| 特記・配慮すべき課題 | form:specialMentionMatterSubject2 | TA 6行×58字 |
| 作成状態 | form:assessment4pageMakeStateDivision | RD |

### 5枚目：基本（身体機能・起居）動作

| 欄 | 名前 | 値 |
|---|---|---|
| 1-1 麻痺 | form:mobable01_01ない _02左上肢 _03右上肢 _04左下肢 _05右下肢 _06その他 | CK |
| 1-2 拘縮 | form:mobable02_01ない _02肩 _03股 _04膝 _05その他 | CK |
| 1-3〜1-13 | form:mobable03〜mobable13 | RD 01〜（認定調査票の選択肢順。00=未選択） |
| 1-14 関節の動き | form:mobable14_01ない _02肩 _03肘 _04股 _05膝 _06足 _07その他 | CK |
| 体位変換介助 | form:bodychange01（01実施 02時々 03なし=初期値）、bodychange02_01サービス実施 03_01希望 04_01判断 05_01計画 | |
| 起居介助 | form:bodygetup01〜05_01 同構成、リハビリ必要性 form:bodygetup06（01あり 02なし） | |
| 特記（体位変換・起居） | form:specialMentionMatterSubject1 | TA 9行×33字 |
| 入浴 6項目 | form:prepare01準備 / transport01移乗移動 / bodywash01洗身 / hearwash01洗髪 / bathing01清拭部分浴 / bloodclean01褥瘡（各 …02_01〜05_01） | |
| 移乗移動 現状/計画 | form:transport06（01なし 02見守りのみ 03介助あり）/ form:transport07（01不要 02見守り必要 03介助必要） | |
| 洗身 現状/計画 | form:bodywash06 / form:bodywash07 | 同上 |
| 特記（入浴） | form:specialMentionMatterSubject2 | TA 11行×33字 |
| 視聴覚 | form:communication01_01眼鏡 _02コンタクト _03補聴器、自由記述 form:communication-5, -6（TX 20） | |
| 電話/言語障害/支援機器 | form:communication-2 / -3 / -4（01あり 02なし） | |
| 特記（コミュニケーション） | form:specialMentionMatterSubject3 | TA 11行×33字 |
| 作成状態 | form:assessment5pageMakeStateDivision | |

### 6枚目：生活機能（食事・排泄）

| 欄 | 名前 | 値 |
|---|---|---|
| 2-1〜2-13 | form:lifefunction01〜13 | RD |
| 食事場所 | form:mealplace-01（01食堂 02居室ベッド上 03布団上 04その他居室内 05その他）＋mealplace-01_05_opt | |
| 食堂までの段差 | form:mealplace-02 | 01あり 02なし |
| 咀嚼 | form:mealplace-03 | 01問題なし 02噛みにくい 03時々噛みにくい 04とても噛みにくい 05問題あり |
| 食事の内容 | form:mealplace-04_01一般食 _02糖尿食(+_02_optkcal) _03高血圧食(+_03_optg) _04抗潰瘍食 _05その他(+_05_opt) | CK |
| 尿意/便意 | form:piss-01 / form:piss-02 | 01ある 02ときどき 03ない |
| 食事：移乗/移動/摂取介助 | form:bodychange01 / form:bodygetup01 / form:eathelp01（各 02_01〜05_01）※名前は5枚目と同じだが別ページ | |
| 主食 現状/計画 | form:eathelp05_opt__01〜05（普通食/粥/経口栄養/経管/その他＋eathelp05_opt__05_opt）/ form:eathelp06_01〜05 | CK |
| 副食 現状/計画 | form:eathelp07_01〜04 / form:eathelp08_01〜04 | CK |
| 摂取介助 現状/計画 | form:eathelp09_01見守り _02介助 / form:eathelp10_01見守り必要 _02介助必要 | CK |
| 特記（食事） | form:specialMentionMatterSubject1 | TA 13行×22字 |
| 排泄8項目 | form:prepare01, transport01, urination01, defecation01, cleanmouth01, facewash01, cosmetic01, dressing01 | |
| 排尿 現状/計画 | form:urination06(01なし 02見守り 03介助) ＋ urination06_04トイレ _05P _06尿収器 _07導尿 _08おむつ / form:urination07(01不要 02見守り 03介助) ＋ urination07_04〜_08 | |
| 排便 現状/計画 | form:defecation06 ＋ _04トイレ _05P _06差し込み _07おむつ _08摘便 _09浣腸 _10人工肛門 / form:defecation07 ＋ _04〜_10 | |
| 特記（排泄） | form:specialMentionMatterSubject2 | TA 3行×39字 |
| 外出 移送介助 | form:goout01（＋goout02_01〜05_01） | |
| 特記（外出） | form:specialMentionMatterSubject3 | TA 5行×35字 |
| 作成状態 | form:docCondition | |

### 7枚目：認知機能・精神行動障害

| 欄 | 名前 | 値 |
|---|---|---|
| 3-1〜3-10 | form:lifefunction01〜10 | RD（3-1は01〜04、他は01/02または01〜03） |
| 4-1〜4-21 | form:lifefunction11〜31 | RD 01ない 02ときどき 03ある |
| 家族等からの情報と観察 | form:familyInfoSubject | TA 21行×32字 |
| 援助の現状（家族） | form:assistancePresentConditionFamilySubject | TA 9行×16字 |
| 援助の現状（サービス） | form:assistancePresentConditionServiceSubject | TA 9行×16字 |
| 援助の希望（本人） | form:assistanceHopePersonHimselfSubject | TA 10行×32字 |
| 援助の希望（家族） | form:assistanceHopeFamilySubject | TA 6行×32字 |
| 援助の計画 | form:assistancePlanSubject | TA 10行×32字 |
| 特記 | form:specialMentionMatterSubject | TA 5行×34字 |
| 作成状態 | form:assessment7pageMakeStateDivision | |

### 8枚目：社会生活力

| 欄 | 名前 | 値 |
|---|---|---|
| 5-1〜5-9 | form:rd51〜form:rd59 | RD |
| 交流（家族/近隣/友人） | form:Activism-FamilyIntercourseDivision, …NeighbourhoodIntercourseDivision, …FriendIntercourseDivision（01あり 02なし）＋ 各 …Subject（TX max40） | |
| 緊急連絡・見守りの方法 | form:emergencyContactSubject | TA 画面上「2行×20字」だが**サーバ検証は改行込み合計40文字**（§5-2） |
| 援助項目14種 | `<key>FamilyEnforcementDivision`（01実施 02時々 03なし）、`<key>ServiceEnforcementFlag`、`<key>EnforcementHopeFlag`、`<key>DecisionFlag`、`<key>PlanFlag` | key = cashManagement, shopping, cooking, societyLifePreparation, fixedTermConsultation, documentMakeActingAsAgent, leisureActivitySupport, transportAssist, amanuensisRead, advisor(話し相手), safetyConfirmation, emergencyContact, familyContact, societyActivitySupport |
| 例外 移送・外出介助 | Division は form:transportAssistFamilyEnforcementDivision だが、フラグは form:transportAssistedSrviceEnforcementFlag（Srvice のタイポ）, form:transportAssistedEnforcementHopeFlag, form:transportAssistedDecisionFlag, form:transportAssistedPlanFlag | 命名不統一 |
| 特記 | form:specialMentionMatterSubject | TA 16行×57字 |
| 作成状態 | form:assessment8pageMakeStateDivision | |

### 9枚目：医療・健康関係

| 欄 | 名前 | 値 |
|---|---|---|
| 処置内容1〜9 | form:treatmentSubjectflag1〜9 | CK |
| 特別な対応10〜12 | form:specialInteractionFlag1〜3 | CK |
| 援助6項目 | key = measurement, drugManagement, drugUse, havingMedicalExamAssist, rehab, medicalCareTreatment（8枚目と同じ5要素構成） | |
| 特記 | form:specialMentionMatterSubject | TA 13行×24字 |
| 現状/計画 21項目 | form:medicalCareHealthPresentConditionFlagN / form:medicalCareHealthPlanFlagN（N=1〜21、1バイタル 2病状観察 3内服薬 …21褥瘡管理） | CK。自由記述欄はない |
| 屋外歩行 | form:outdoorsWalkDivision | 01自立 02介助があれば 03していない |
| 車いす | form:wheelchairUseDivision | 01用いていない 02自分で 03他人が |
| 補助具 | form:walkAdapterUnusedFlag, form:outdoorsUseFlag, form:indoorUseFlag | CK |
| 食事行為/栄養状態 | form:mealActDivision / form:nutritionStateDivision | 01/02 |
| 栄養留意点 | form:nutritionHeedPointSubject | TX max80 |
| 状態14項目 | form:currentStateFlag1〜14（1尿失禁 2転倒骨折 3移動能力低下 4褥瘡 5心肺機能低下 6閉じこもり 7意欲低下 8徘徊 9低栄養 10摂取嚥下 11脱水 12易感染性 13疼痛 14その他）＋form:currentStateOthersSubject(20) | CK |
| 対処方針 | form:dealWithObjectiveSubject | TX max80 |
| 見通し | form:lifeFunctionMaintenanceFlag1期待できる 2期待できない 3不明 | CK |
| 医学的管理 | form:necessaryServiceFlag1〜11（1訪問診療 2訪問看護 3看護職員相談 4訪問歯科診療 5訪問薬剤 6訪問リハ 7短期入所療養 8訪問歯科衛生 9訪問栄養 10通所リハ 11その他）＋form:othersMedicalCareServiceSubject(20) | CK |
| 留意事項 | form:hp1-heedPointMatterDivision1血圧 / hp2-…2移動 / hp3-…3摂食 / hp4-…4運動 / hp5-…5嚥下（00未選択 01あり 02特になし=初期値）＋ form:hpN-heedPointMatterSubjectN(20)、その他 form:heedPointMatterOthersSubject(20) | |
| 感染症 | form:infection-BooleanDivision（02無 01有 03不明 00）＋form:infection-Subject(20) | |
| 作成状態 | form:assessment9pageMakeStateDivision | |

### 10枚目：全体のまとめ

| 欄 | 名前 | 値 |
|---|---|---|
| まとめ内容 | form:summarySubject | TA 26行×54字 |
| 安全確保への対応 | form:safetyNecessity | RD true/false（01/02ではない） |
| 権利擁護への対応 | form:transferNecessity | RD true/false |
| 作成状態 | form:docCondition | |

### 11枚目：1日のスケジュール
- 行は `form:parentId:N:…`（N=0〜23）。N→時刻の対応は 0=4時, 1=5時 … 20=24時, 21=1時, 22=2時, 23=3時
- 各行のフィールド：生活リズム記号1/2：`form:parentId:N:j_id_jsp_1564470422_145` / `…_147`（SEL：01排便 02食事 03起床 04排尿 05入浴 06就寝）※自動生成名／本人が自分でしていること：`form:parentId:N:oneselftDoneSubject`（TA 2行×12字、oneselft のタイポそのまま）／家族実施：`form:parentId:N:familyDoneSubject`（TA 2行×10字）／サービス実施：`form:parentId:N:servicePlantDoneSubject`（TA 2行×10字）／要援助：`form:parentId:N:needSupportFlag`、計画：`form:parentId:N:planFlag`（CK）／作成状態：`form:docCondition`

## 2. 使えない文字と置換

| 文字 | 結果 | 置換 |
|---|---|---|
| 〜（U+301C 波ダッシュ） | 保存エラー VAL_0206「利用できない文字が含まれています。(〜)」。4枚目既往歴で発生 | 文章中は「から」、期間表記は ～（U+FF5E 全角チルダ）。第2表の期間欄 R8.07.10～R8.09.30 はFF5Eで保存成功 |
| ①〜⑦ 丸数字 | 未検証（VAL_0206のメッセージにはなかった）。機種依存文字のため予防的に置換 | (1)〜(7) |
| 全角スペース連続・大量空白 | 第1表画面の注意書きに「大量の空白はレイアウトが崩れる。改行はEnterキーで」 | 改行は \n を使う |

実装指針：生成文をカイポケに送る前に 〜→～／丸数字→(n) の正規化を必ず通す（`normalizeForKaipoke`）。ローマ数字（Ⅰ〜Ⅳ）や㎡などの機種依存文字も同様に疑わしいので、生成プロンプト側で使用禁止にするのが確実。

## 3. onkeyup 同期（隠しフィールド）が必要だった欄

| 画面 | 欄 | 仕組み | 対処 |
|---|---|---|---|
| 第2表 サービス事業所 新規追加 | form:othersPlantName（その他 事業所名） | `onkeyup="changeValue(this,'form:hidOthersPlantName')"`。サーバは隠し form:hidOthersPlantName の値で検証するため、value を直接セットしても「サービス事業所のその他を入力して下さい（MEM_0917_0004）」になる。type 操作（IME入力）でも keyup が飛ばず同じエラーになった | 値セット後に `changeValue(el,'form:hidOthersPlantName')` を明示的に呼ぶ（または keyup イベントを dispatch） |
| 同画面 | form:othersFrequencyName（頻度 その他）、form:periodSubject | 同方式の可能性あり（onkeyup 属性があれば eval する汎用処理で通した。periodSubject は単純セットで保存成功） | 汎用対策：onkeyup 属性に changeValue を含むテキスト欄は、セット後にその属性をそのまま実行する |
| 第2表 サービス種別 新規追加 | form:arbitraryServiceName（任意サービス名） | 単純セット＋input/changeで保存成功（隠しフィールド無しの模様） | — |
| アセスメント 1〜11枚目 | 全テキスト欄 | 隠しフィールド同期なし。value セット＋input/change dispatch で保存成功 | — |

## 4. 第2表（居宅サービス計画書(2)）の画面往復手順

### 画面構成
- 一覧画面：MEM091703.do（初期）。登録後は MEM091705（ニーズ）/091707（長期）/091709（短期）/091721（サービス内容）/091725（種別）/091723（事業所）と番号が変わるが、いずれも同じ一覧画面
- 一覧はニーズ→長期目標→短期目標→サービス内容→種別→事業所の6階層ネスト表。各階層の末尾に「+項目を追加」リンクがあり、1階層追加するごとに別画面に遷移して登録し、一覧に戻る
- 「+項目を追加」リンクは全て同じテキスト・同じ href="#"。DOM順は「内側の階層が先」（事業所→種別→サービス内容→短期→長期→ニーズ）で、行が増えると順序が変わる。今回はリンクの画面上X座標で列を判定した（ニーズ<250px、長期<400、短期<650、サービス内容<740、種別<850、事業所≧850。幅1272pxのウィンドウ基準）。Y座標で「どの親行の下か」を判定
- 各追加画面の登録ボタンは2種類ある：ニーズ／長期／短期／サービス内容／種別：`<input type="image" name="form:accept" alt="登録する">`／事業所：`<a><img alt="登録する"></a>`（input ではない）
- JSから `.click()` すると遷移中にツールがタイムアウトし値が失われるケースがあったため、座標クリック（実クリック）で押す

### 手順（1サービス行を追加するのに3画面）
- (0) ニーズ（初回のみ）：一覧の最下段「+項目を追加」（ニーズ列）→「解決すべき課題（ニーズ）新規追加」画面（MEM091704）→ textarea（唯一の textarea）にニーズ文 → form:accept → 一覧へ
- (0') 長期目標：ニーズ行の長期目標列「+項目を追加」→ form:longTimePeriodMarkSubject（TA）、期間 form:longTimePeriodMarkStartYmdEra/Year/Month/Day、…EndYmdEra/Year/Month/Day（SEL、初期値は当月1日〜月末）→ 登録
- (0'') 短期目標：form:shortTermMarkSubject、期間 form:shortTermMarkYmd-1Era/Year/Month/Day（開始）、…Ymd-2…（終了）→ 登録
- (1) サービス内容：短期目標行のサービス内容列「+項目を追加」→ form:assistanceSubjectServiceSubject（TA）→ form:accept → 一覧へ（URLは MEM091721）
- (2) サービス種別：種別列「+項目を追加」→ ※1 保険給付対象（○印）：`<input type="checkbox">`（自動生成名 form:j_id_jsp_978755385_126。画面内唯一のチェックボックス）→ 介護保険サービスなら ON／service_category（RD）：01=介護サービス、02=任意サービス、00=未選択／介護サービスのとき form:serviceKindInternalId（SEL）：主な値 1居宅介護支援 2訪問介護 4訪問看護 5訪問リハ 7通所介護 8通所リハ 14福祉用具 18予訪問看護 19予訪問リハ 22予通所リハ（全49件）／任意サービスのとき form:arbitraryServiceName（TX）：「本人」「家族」「医療機関（主治医）」など → form:accept → 一覧へ（MEM091725）
- (3) サービス事業所・頻度・期間：事業所列「+項目を追加」→ provider_category（RD）：01=取引先、02=その他、00／取引先のとき form:idCompanyDto（SEL）：値は `"<id>,<bool>"` 形式（bool は自社事業所フラグと推定）。option テキストは `【訪問看護】（事業所番号）　事業所名` 形式（事業所番号で検索可能）／その他のとき form:othersPlantName（TX）＋ `changeValue(el,'form:hidOthersPlantName')` を呼ぶ／頻度 HINDO_KBN（RD）：01＝「N（日/週/月）にM回」：form:frequencyScheduleDivision（01日 02週 03月）＋form:count（TX）、02＝定期：form:frequencyFixedTermDivision（01毎日 02毎週 03随時 04必要時）、03＝その他：form:othersFrequencyName（TX、「3か月に1回」など）。ラジオを選ぶまで対応する入力欄は disabled／期間 form:periodSubject（TA）：自由記述「R8.07.10～R8.09.30」→ `<a><img alt="登録する">` をクリック → 一覧へ（MEM091723）
- (4) 同じサービス内容に2つ目の事業所／同じ短期目標に2つ目のサービス内容を足す場合は、該当行の直下にある「+項目を追加」を使う（階層が保たれる）
- (5) 全行終了後、一覧下部の「登録する」（`<input type="image" name="frmMEM091704:accept">`）で第2表全体を登録。作成状態は一覧画面に表示のみで、この画面にラジオは無い

### 第1表（参考）
URL MEM091701.do。form:makeYmdEra/Year/Month/Day（作成年月日）、form:firstTimeFlag/introductionFlag/continuationFlag（初回/紹介/継続 CK）、form:lsLedInsuranceProof（被保険者証 SEL）、form:staffMemberId（作成者 TX）、form:inHomeServicePlanMakeYmd*（作成(変更)日）、form:firstTimeInHomeServicePlanMakeYmd*（初回作成日 ※初期値が本日になるので要修正）、form:userLifeSubject（意向を踏まえた課題分析）、form:nursingCertificationJudgingBoardOpinionSubject（審査会意見）、form:syntheticAssistanceObjectiveSubject（総合的な援助の方針）、form:estimationReasonFlag1〜3＋form:estimationReasonOthersSubject、form:descriptionAgreementDayYmd*（説明・同意日）、form:inHomeServicePlanMakeStateDivision。登録は `<input type="image">`。textarea に行数制限表示なし

### 第3表（週間サービス計画表・未完了）
- 新規：MEM092801.do（form:makeYmd*, form:lsLedInsuranceProof, form:staffMemberId, 作成状態RD）→ 登録で編集画面 MEM092802/092803
- 「サービス追加ページへ」は goService('') → AJAX(form:serviceAct) → openPopup() → popup_open('/kaipokebiz/business/care_plan/care/MEM092804.do?conversationContext=N') で別ウィンドウを開く。自動操作のタブグループ外に開くため捕捉できず。対処：同じURLを新しいタブで直接開けばフォームは表示された
- ポップアップのフォーム：form:insuranceDivision（01保険内 02保険外）、form:serviceKind（2訪問介護 7通所介護 64地域密着通所 14福祉用具貸与 3訪問入浴 4訪問看護 5訪問リハ 8通所リハ 6居宅療養 9短期生活 10短期療養 32GH 30認知症通所 37定期巡回）、form:servicePlant（種類選択後にAJAXで一覧ロード。値は `"<id>_another"` 形式）、サービス内容（事業所選択後にAJAXでコード一覧をロード）、form:unit（単位数）、form:startHour/startMinute1（十の位）/startMinute2（一の位）、endHour/endMinute1/endMinute2、提供日 form:supportDay01（毎週型）＋form:weekType（01毎週 02奇数週 03偶数週）＋form:checkedDays（01日〜07土）、または form:supportDay02（第N曜日型）、保存ボタン「保存する」
- 未解決：事業所選択後のAJAXでタブのレンダラが応答不能になり中断。第3表は当面手入力、または保存後に window.opener.refresh() 相当が呼ばれる前提で直接タブ操作を再検証する必要あり

## 5. 登録時に出たエラーと回避策

| # | 画面 | エラー | 原因 | 回避策 |
|---|---|---|---|---|
| 1 | アセスメント4枚目 | 既往歴・現症…に利用できない文字が含まれています。(〜)(Error No: VAL_0206) | 波ダッシュ U+301C | 「から」に置換。他欄の丸数字も同時に (n) 化。エラー時、他の入力値は保持されているので該当欄だけ直して再登録でよい |
| 2 | アセスメント8枚目 | 緊急連絡・見守りの方法は40文字以内で入力して下さい。（Error No：VAL_0006） | 画面表示は「2行×20字」だが検証は改行を含む総文字数40。42文字→NG、40文字（改行込み）→NG、30文字→OK | 行×字の積より少なめ（−2〜3文字）に収める。CareNote側で「幅×行数−行数」を上限にすると安全（`measureText` に実装） |
| 3 | 第2表 事業所追加 | サービス事業所のその他を入力して下さい。(ErrorNo：MEM_0917_0004) | 隠しフィールド未同期（§3） | changeValue() を呼ぶ／keyup を dispatch（`writeField` に実装） |
| 4 | 第2表 長期目標 | JSで form:accept.click() した際にツールがタイムアウトし、戻ると入力が空 | 遷移中のJS実行競合 | 値セットはJS、登録ボタンは実クリック（座標 or ref）。座標はボタンを scrollIntoView({block:'center'}) 後に取得 |
| 5 | 第2表 一覧 | 8枚目/9枚目でチェックボックス名を推測してセット→ MISSING form:transportAssistDecisionFlag | 命名タイポ（Assisted/Srvice） | セット結果を必ず戻り値で検証し、MISSING時は名前一覧を取得して再照合 |
| 6 | 全画面 | DOMに「長時間操作が無かった為、再度ユーザー認証が必要です」の再ログインフォームが常駐（非表示） | 30分無操作でセッション切れ→登録時に表示される | 自動化はパスワードを扱わないため、表示されたら停止してユーザーに再ログインを依頼する（`isReloginRequired` に実装）。長い転記は途中で登録を挟み、1ページ5分以内を目安に |
| 7 | 第3表 | 「サービス追加ページへ」を押しても画面が変わらない／isLoadingPopup が true のまま | 別ウィンドウ起動＋ポップアップブロック | §4 第3表の通り URL直接オープン。2回目以降は isLoadingPopup=false に戻す |
| 8 | 第3表 ポップアップ | 事業所選択後、Page.captureScreenshot が30秒タイムアウト（レンダラ停止） | AJAX後の重い描画と推定 | 未解決。待機時間を延ばす／スクリーンショットを取らずにDOMだけ読む等を次回検証 |
| 9 | 全画面 | ページ番号タブのクリック（要素ref）で遷移しないことがあった | 要素refの陳腐化 | 座標クリックまたは JS で a.click() に切替。遷移後はタイトル（P,N：…）で到達確認 |
| 10 | 一部JS | [BLOCKED: Cookie/query string data] で関数ソースや href が読めない | 自動化ツール側のマスキング（conversationContext= を含む文字列） | 文字列から ?… 以降を除去してから返す |

## 6. 実装に向けた要点（まとめ）

- 文言生成→正規化→投入→検証 の4段で組む。正規化（§2）と文字数上限（§5-2）はCareNote側で完結できる
- アセスメント11ページは「名前→値」のマップだけで投入できる（§1）。自動生成名（j_id_jsp_*）は11枚目と第2表種別のチェックボックスのみ。ここはラベル位置からのフォールバックを用意する
- 第2表は階層ごとの画面往復（§4）。1サービス行あたり3往復、今回は3ニーズ×計11行で約45画面。行の親子関係をリンクの座標で判定しているので、実装では「直前に登録した行のID（URLの遷移先や行DOM）」を使う方が堅い
- 登録ボタンは「input image」と「a>img」の2種類、押下は実クリック（§5-4）
- セッション切れと第3表ポップアップは人手介入前提で設計する（§5-6, 7, 8）

## 7. CareNote AI への取り込み方針（2026-09-11・Claude 追記）

- **方式は既存のブラウザ拡張を維持**する（職員が自分でログインした画面で、職員がボタンを押した時だけ動く）。Playwright 等でパスワードを持たせて自動ログインする方式は、カイポケ規約「ID等を第三者に利用させない」と衝突しやすく、守秘義務の説明も難しくなるため採らない。本書の発見（フォーム名・制限・画面遷移）はアダプタにそのまま移せる
- 段階1・2（読み取り・文案生成）は CareNote の守備範囲＝実装済（OCR統合・救済モード）。「憶測項目のフラグ」は itemsToConfirm に加えて欄ごとの `is_inferred` を持たせる改善を次段で行う
- 段階3（アセスメント11ページ）は本書 §1 のマップを FIELD_MAPS へ広げる。CareNote の下書き構造（AssessmentDraft）にない欄は、まず「コピー貼り付け」で出す
- 段階4（第2表）は §4 の往復手順を「1行ずつ・人が登録」で半自動化する。第3表は当面手入力
