"use client";

/**
 * 送る前に見る画面（docs/specs/call-pipeline.md 第2段）。
 * /api/preview が返した「AIに送る紙」をそのまま表示し、名前っぽいのに消せなかった言葉を赤く示す。
 * ここでは書き換えない。職員が「戻って直す」か「この内容で送る」を押す。
 *
 * 2026-09-17 の作り直し（docs/specs/recording-pipeline.md R2）:
 *   録音から起こした会議の文章は1〜2万字になる。全文を1つの塊で出していたので、
 *   誰も読まないまま「この内容で送る」を押すことになり、**最後の関門が形だけ**になっていた。
 *   ①長い欄は畳む ②赤い言葉に通し番号を振り「次へ」で1か所ずつ送る、の2つを足した。
 *   畳んだ欄に入っている番号へ飛ぶときは、その欄を自動で開く（隠れたまま飛ばさない）。
 *
 * 同日の独立審査で見つかった**畳み方の誤り**を直した:
 *   最初は「先頭400字だけ出す」形にしたが、それだと**赤い言葉が1つも画面に出ない**。
 *   隠してよいのは読み飛ばせる地の文であって、確かめるべき赤い言葉ではない。
 *   畳んだ欄では「赤い言葉＋その前後」を全部並べ、地の文だけを隠す形に改めた。
 *   さらに、全文を一度も開いていない欄が残ったまま送ろうとしたら、送る前に知らせる。
 *
 * 2026-09-23 の検収で足したこと:
 *   「なぜ赤いか」（敬称の前／施設名の可能性）は、畳んだ欄では各行の末尾に文字で出ていたが、
 *   開いた欄では <mark title> のふきだしにしか無く、タッチ端末の職員には届いていなかった。
 *   開いた欄も本文の下に言葉ごとの理由を文字で並べる（本文には差し込まない ── redWordReasons）。
 *   理由の文字は、読める濃さ（--muted・白地で 7.9:1）にそろえた（--faint は 3.8:1 で足りない）。
 */
import { useCallback, useMemo, useState } from "react";
import type { NameCandidate } from "@/lib/privacy/candidates";
import {
  buildHighlights,
  type CandidateContext,
  candidateContexts,
  excerpt,
  fieldOfCandidate,
  type RedWordReason,
  redWordReasons,
} from "@/lib/privacy/previewNav";

/**
 * /api/preview が返す「AIに送る紙」: 黒塗りした欄の文章（fields ── /api/generate と同じ関数で作る）・置き換えた種類と件数（findings ── 原文は持たない）・
 * 名前かもしれないのに消せなかった言葉（candidates ── 欄ごと）。つくる（app/(dashboard)/create/page.tsx）が受け取って渡す。
 */
export interface PreviewData {
  fields: Record<string, string>;
  findings: { names: number; patterns: { kind: string; count: number }[] };
  candidates: Record<string, NameCandidate[]>;
}

const FIELD_LABELS: Record<string, string> = {
  clientInfo: "利用者の基本情報",
  assessmentNotes: "面談メモ",
  previousPlanSummary: "前回のケアプラン",
  monitoringNotes: "最新の状況・モニタリングメモ",
  meetingNotes: "サービス担当者会議のメモ",
  supportNotes: "支援の対応メモ",
};

/** 画面に出す欄の順。赤い言葉の通し番号もこの順に振る。 */
const FIELD_ORDER = Object.keys(FIELD_LABELS);

const KIND_LABELS: Record<string, string> = {
  phone: "電話番号",
  postal: "郵便番号",
  email: "メール",
  address: "住所",
  birthdate: "生年月日",
  number: "番号",
};

interface Props {
  data: PreviewData;
  loading: boolean;
  onBack: () => void;
  onConfirm: () => void;
  primaryClass: string;
  secondaryClass: string;
}

/**
 * 送る前に見る画面（黒塗りで消せなかった名前を、職員が目で止める最後の関門）。
 * onBack =「戻って直す」、onConfirm =「この内容でAIに送る」（全文を開いていない欄があれば一度だけ知らせてから）。
 * primaryClass / secondaryClass はボタンの見た目（呼ぶ側の btnPrimary / btnSecondary）。
 * 使う側 = app/(dashboard)/create/page.tsx。赤い言葉の組み立ては lib/privacy/previewNav.ts、
 * 既定の見た目の検査は PreSendPreview.test.tsx（安全テストの一覧 tools/safety-tests.json に名指し）。
 */
export default function PreSendPreview({
  data,
  loading,
  onBack,
  onConfirm,
  primaryClass,
  secondaryClass,
}: Props) {
  // /api/preview が返した順ではなく、画面の並び順に揃える（番号と見た目を一致させる）
  const order = useMemo(
    () => [
      ...FIELD_ORDER.filter((k) => k in data.fields),
      ...Object.keys(data.fields).filter((k) => !FIELD_ORDER.includes(k)),
    ],
    [data.fields],
  );
  // 2万字の本文を正規表現で切り分ける処理。押すたびにやり直すと画面が固まるので覚えておく
  const highlights = useMemo(
    () => buildHighlights(order, data.fields, data.candidates),
    [order, data.fields, data.candidates],
  );
  const [current, setCurrent] = useState(0);
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  /** 全文を見ていない欄が残ったまま送ろうとしたときに出す確認 */
  const [asking, setAsking] = useState(false);

  /** まだ一度も全文を開いていない長い欄 */
  const unopened = order.filter((k) => highlights.byField[k]?.long && !opened[k]);
  const unopenedChars = unopened.reduce((n, k) => n + (highlights.byField[k]?.length ?? 0), 0);

  const openAll = () => {
    setOpened(Object.fromEntries(order.map((k) => [k, true])));
    setAsking(false);
  };

  /** 送る前に「見ていない欄」が残っていたら、一度だけ知らせる（止めはしない） */
  const handleConfirm = () => {
    if (unopened.length > 0 && !asking) {
      setAsking(true);
      return;
    }
    onConfirm();
  };

  const summary = [
    data.findings.names > 0 ? `名前 ${data.findings.names}件` : null,
    ...data.findings.patterns.map((p) => `${KIND_LABELS[p.kind] ?? p.kind} ${p.count}件`),
  ].filter(Boolean);

  /** 通し番号へ移動する。畳んだ欄に入っていれば先に開く（隠れたまま飛ばさない）。 */
  const goTo = useCallback(
    (next: number) => {
      if (highlights.total === 0) return;
      const n = ((next - 1 + highlights.total) % highlights.total) + 1;
      const field = fieldOfCandidate(highlights, n);
      if (field) setOpened((prev) => ({ ...prev, [field]: true }));
      setCurrent(n);
      // 欄を開くと高さが変わるので、描画が済んでから寄せる
      requestAnimationFrame(() => {
        document
          .getElementById(`cand-${n}`)
          ?.scrollIntoView({ block: "center", behavior: "smooth" });
      });
    },
    [highlights],
  );

  /*
   * A案（R1・2026-09-24）の見た目: 角の丸い箱を積むのをやめ、見出しの帯 → 「前へ／次へ」の帯 → 欄 を 1px の線で区切る。
   * 赤い言葉だけを赤（--red-word ── 吉本さん決定 2026-09-23）にし、全文を開いていない欄の知らせは注意の黄色にした。
   * 文字・数え方・畳み方・押したときの動き・テストが見る形（presend-nav のクラス、`<span class="tnum">N</span>か所`、
   * `N字</span>`、畳んだ欄の理由の文字）は以前のまま。
   *
   * 見出しの「緑の帯」（.presend-head）と「前へ／次へ」の「赤い枠」（.presend-nav）は残す（R1 の検証 2026-09-24）。
   * 使い方（lib/manual/content.ts:135・429・433・477・1165 と公開中の public/manual/）が、この2つの色で
   * 「送る前の画面かどうか」「赤い言葉が残っているかどうか」を見分けさせている。とくに FAQ の
   * 「赤い枠が出ていなければ、そのまま送って構いません」は、枠が無くなると赤い言葉があっても送ってよいと読める。
   * 見た目は app/globals.css、消えていないことは app/globals.test.ts と PreSendPreview.test.tsx が見張る。
   */
  return (
    <div className="animate-fadeIn">
      <div className="presend-head">
        <p className="text-[14px] font-bold leading-[1.6] text-[var(--green)]">
          これがAIに送られる文章です。名前と番号は置き換え済みです。
        </p>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          {summary.length > 0
            ? `置き換えたもの: ${summary.join("・")}`
            : "置き換えたものはありません"}
        </p>
      </div>

      {highlights.total > 0 && (
        <div className="presend-nav">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p className="text-[13px] font-medium leading-[1.7] text-[var(--red-word)]">
              赤い言葉は「名前かもしれないのに消せなかったもの」です（
              <span className="tnum">{highlights.total}</span>か所）。
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => goTo(current === 0 ? highlights.total : current - 1)}
                className={secondaryClass}
              >
                前へ
              </button>
              <span className="mono tnum min-w-14 text-center text-xs text-[var(--muted)]">
                {current === 0 ? `— / ${highlights.total}` : `${current} / ${highlights.total}`}
              </span>
              <button type="button" onClick={() => goTo(current + 1)} className={secondaryClass}>
                次へ
              </button>
            </div>
          </div>
          <p className="mt-1.5 text-xs leading-[1.8] text-[var(--ink-2)]">
            「次へ」で1か所ずつ確かめられます。家族や他事業所の方の名前なら「戻って直す」で言い換えてください（例:「長女」「担当ケアマネ」）。
            施設名や一般の言葉なら、そのまま送って構いません。
          </p>
        </div>
      )}

      {order.map((key) => {
        const field = highlights.byField[key];
        if (!field) return null;
        const isOpen = opened[key] ?? !field.long;
        return (
          <section key={key} className="border-b border-[var(--line-inner)] py-4">
            <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="section-label">{FIELD_LABELS[key] ?? key}</h3>
              <span className="tnum text-xs text-[var(--muted)]">{field.length}字</span>
              {field.candidateNumbers.length > 0 && (
                <span className="tnum text-xs font-medium text-[var(--red-word)]">
                  赤い言葉 {field.candidateNumbers.length}か所
                </span>
              )}
            </div>

            {isOpen ? (
              <>
                <p className="whitespace-pre-wrap text-[15px] leading-[1.95] text-[var(--ink)]">
                  {field.parts.map((part) =>
                    part.candidateNo === null ? (
                      <span key={`${key}-${part.start}`}>{part.text}</span>
                    ) : (
                      <Mark key={`${key}-${part.start}`} part={part} current={current} />
                    ),
                  )}
                </p>
                <OpenFieldReasons reasons={redWordReasons(field)} />
              </>
            ) : (
              <CollapsedField
                contexts={candidateContexts(field)}
                excerptText={excerpt(field.parts.map((p) => p.text).join(""))}
                current={current}
              />
            )}

            {field.long && (
              <button
                type="button"
                onClick={() => setOpened((prev) => ({ ...prev, [key]: !isOpen }))}
                className="mt-2 inline-flex items-center text-xs font-medium text-[var(--green)] underline underline-offset-2 max-md:min-h-11"
              >
                {isOpen ? "この欄を畳む" : `全文を表示する（${field.length}字）`}
              </button>
            )}
          </section>
        );
      })}

      {asking && (
        <div className="mt-4 border border-[var(--amber-line)] bg-[var(--amber-soft)] px-4 py-3">
          <p className="text-[13.5px] font-medium text-[var(--amber)]">
            まだ全文を開いていない欄が <span className="tnum">{unopened.length}</span>{" "}
            つあります（合計 <span className="tnum">{unopenedChars}</span>字）。
          </p>
          <p className="mt-1 text-xs leading-[1.8] text-[var(--ink-2)]">
            赤い言葉はすべて上に出していますが、それ以外の文章は畳んだままです。
            見落としが心配なときは「全文を開く」を押してから送ってください。
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button type="button" onClick={openAll} className={secondaryClass}>
              全文を開く
            </button>
            <button type="button" onClick={onConfirm} disabled={loading} className={secondaryClass}>
              このまま送る
            </button>
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button type="button" onClick={onBack} disabled={loading} className={secondaryClass}>
          戻って直す
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={loading}
          className={`${primaryClass} ml-auto`}
        >
          {loading ? "AIが作成中です…（30秒〜1分ほど）" : "この内容でAIに送る"}
        </button>
      </div>
    </div>
  );
}

/** 赤い言葉ひとつ。いま見ている場所は枠で囲む（見た目は globals.css の .red-word）。 */
function Mark({
  part,
  current,
}: {
  part: { text: string; candidateNo: number | null; reason?: string };
  current: number;
}) {
  return (
    <mark
      id={`cand-${part.candidateNo}`}
      title={part.reason}
      data-current={current === part.candidateNo ? "true" : undefined}
      className="red-word"
    >
      {part.text}
    </mark>
  );
}

/**
 * 畳んだ欄。**赤い言葉は1つ残らず前後ごと出し**、地の文だけを隠す。
 * 逆（先頭だけ出して赤を隠す）にすると、最後の関門から警告が消える。
 */
function CollapsedField({
  contexts,
  excerptText,
  current,
}: {
  contexts: CandidateContext[];
  excerptText: string;
  current: number;
}) {
  if (contexts.length === 0) {
    return (
      <p className="whitespace-pre-wrap text-[14.5px] leading-[1.9] text-[var(--muted)]">
        {excerptText}
      </p>
    );
  }
  return (
    <ul>
      {contexts.map((c) => (
        <li
          key={c.candidateNo}
          className="border-b border-[var(--line-faint)] py-2.5 text-[14.5px] leading-[1.95] last:border-b-0"
        >
          <span className="mono tnum mr-2 text-xs font-medium text-[var(--red-word)]">
            {c.candidateNo}
          </span>
          <span className="text-[var(--muted)]">{c.before}</span>
          <Mark
            part={{ text: c.word, candidateNo: c.candidateNo, reason: c.reason }}
            current={current}
          />
          <span className="text-[var(--muted)]">{c.after}</span>
          {c.reason && <ReasonText reason={c.reason} className="ml-2" />}
        </li>
      ))}
    </ul>
  );
}

/**
 * 開いた欄の下に並べる「なぜ赤いか」。ふきだし（title）はタッチ端末で出ないので、文字で出す。
 * 本文には差し込まない（「佐藤（敬称の前）さん」のように送る文章が読みにくくなり、画面と送る文章がずれる）。
 */
function OpenFieldReasons({ reasons }: { reasons: RedWordReason[] }) {
  if (reasons.length === 0) return null;
  return (
    <div className="mt-3 border-t border-[var(--line)] pt-2">
      <p className="text-xs font-medium text-[var(--muted)]">なぜ赤いか</p>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {reasons.map((r) => (
          <li key={r.word}>
            <span className="font-medium text-[var(--ink)]">{r.word}</span>
            <ReasonText reason={r.reason} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 赤い言葉の理由「（敬称の前）」。畳んだ欄と開いた欄で、同じ書き方・読める濃さ（--muted）にそろえる。 */
function ReasonText({ reason, className = "" }: { reason: string; className?: string }) {
  return <span className={`text-xs text-[var(--muted)] ${className}`}>（{reason}）</span>;
}
