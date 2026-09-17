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
 */
import { useCallback, useMemo, useState } from "react";
import type { NameCandidate } from "@/lib/privacy/candidates";
import {
  buildHighlights,
  type CandidateContext,
  candidateContexts,
  excerpt,
  fieldOfCandidate,
} from "@/lib/privacy/previewNav";

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

  return (
    <div className="animate-fadeIn space-y-4">
      <div className="rounded-[10px] border border-[var(--green-line)] bg-[var(--green-soft)] p-3.5">
        <p className="text-sm font-medium text-[var(--green)]">
          これがAIに送られる文章です。名前と番号は置き換え済みです。
        </p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          {summary.length > 0
            ? `置き換えたもの: ${summary.join("・")}`
            : "置き換えたものはありません"}
        </p>
      </div>

      {highlights.total > 0 && (
        <div className="presend-nav rounded-[10px] border border-[var(--clay)] bg-[var(--clay-soft)] p-3.5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-[var(--clay)]">
              赤い言葉は「名前かもしれないのに消せなかったもの」です（
              <span className="tnum">{highlights.total}</span>か所）。
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => goTo(current === 0 ? highlights.total : current - 1)}
                className="h-8 rounded-[8px] border border-[var(--clay)] px-2.5 text-xs font-medium text-[var(--clay)] transition-colors hover:bg-[var(--clay)] hover:text-white"
              >
                前へ
              </button>
              <span className="tnum min-w-14 text-center text-xs text-[var(--muted)]">
                {current === 0 ? `— / ${highlights.total}` : `${current} / ${highlights.total}`}
              </span>
              <button
                type="button"
                onClick={() => goTo(current + 1)}
                className="h-8 rounded-[8px] border border-[var(--clay)] px-2.5 text-xs font-semibold text-[var(--clay)] transition-colors hover:bg-[var(--clay)] hover:text-white"
              >
                次へ
              </button>
            </div>
          </div>
          <p className="mt-1 text-xs text-[var(--muted)]">
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
          <section
            key={key}
            className="rounded-[10px] border border-[var(--line)] bg-[var(--card)] p-4"
          >
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <h3 className="text-xs font-medium text-[var(--muted)]">
                {FIELD_LABELS[key] ?? key}
              </h3>
              <span className="tnum text-xs text-[var(--faint)]">{field.length}字</span>
              {field.candidateNumbers.length > 0 && (
                <span className="tnum text-xs font-medium text-[var(--clay)]">
                  赤い言葉 {field.candidateNumbers.length}か所
                </span>
              )}
            </div>

            {isOpen ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {field.parts.map((part) =>
                  part.candidateNo === null ? (
                    <span key={`${key}-${part.start}`}>{part.text}</span>
                  ) : (
                    <Mark key={`${key}-${part.start}`} part={part} current={current} />
                  ),
                )}
              </p>
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
                className="mt-2 text-xs font-medium text-[var(--green)] underline underline-offset-2"
              >
                {isOpen ? "この欄を畳む" : `全文を表示する（${field.length}字）`}
              </button>
            )}
          </section>
        );
      })}

      {asking && (
        <div className="rounded-[10px] border border-[var(--clay)] bg-[var(--clay-soft)] p-3.5">
          <p className="text-sm font-medium text-[var(--clay)]">
            まだ全文を開いていない欄が <span className="tnum">{unopened.length}</span>{" "}
            つあります（合計 <span className="tnum">{unopenedChars}</span>字）。
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            赤い言葉はすべて上に出していますが、それ以外の文章は畳んだままです。
            見落としが心配なときは「全文を開く」を押してから送ってください。
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openAll}
              className="h-8 rounded-[8px] border border-[var(--clay)] px-3 text-xs font-semibold text-[var(--clay)] transition-colors hover:bg-[var(--clay)] hover:text-white"
            >
              全文を開く
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className="h-8 rounded-[8px] border border-[var(--line)] px-3 text-xs font-medium text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)]"
            >
              このまま送る
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={onBack}
          disabled={loading}
          className={`${secondaryClass} flex-1`}
        >
          戻って直す
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={loading}
          className={`${primaryClass} flex-1`}
        >
          {loading ? "AIが作成中です…（30秒〜1分ほど）" : "この内容でAIに送る"}
        </button>
      </div>
    </div>
  );
}

/** 赤い言葉ひとつ。いま見ている場所は枠で囲む。 */
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
      className={`rounded px-0.5 font-medium text-[var(--clay)] underline decoration-[var(--clay)] decoration-2 underline-offset-2 ${
        current === part.candidateNo
          ? "bg-[var(--clay-soft)] ring-2 ring-[var(--clay)]"
          : "bg-transparent"
      }`}
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
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--muted)]">
        {excerptText}
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {contexts.map((c) => (
        <li
          key={c.candidateNo}
          className="rounded-[8px] border border-[var(--line)] bg-[var(--surface)] p-2.5 text-sm leading-relaxed"
        >
          <span className="tnum mr-2 text-xs font-semibold text-[var(--clay)]">
            {c.candidateNo}
          </span>
          <span className="text-[var(--muted)]">{c.before}</span>
          <Mark
            part={{ text: c.word, candidateNo: c.candidateNo, reason: c.reason }}
            current={current}
          />
          <span className="text-[var(--muted)]">{c.after}</span>
          {c.reason && <span className="ml-2 text-xs text-[var(--faint)]">（{c.reason}）</span>}
        </li>
      ))}
    </ul>
  );
}
