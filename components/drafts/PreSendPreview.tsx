"use client";

/**
 * 送る前に見る画面（docs/specs/call-pipeline.md 第2段）。
 * /api/preview が返した「AIに送る紙」をそのまま表示し、名前っぽいのに消せなかった言葉を赤く示す。
 * ここでは書き換えない。職員が「戻って直す」か「この内容で送る」を押す。
 */
import type { NameCandidate } from "@/lib/privacy/candidates";

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
  const totalCandidates = Object.values(data.candidates).reduce((s, c) => s + c.length, 0);
  const summary = [
    data.findings.names > 0 ? `名前 ${data.findings.names}件` : null,
    ...data.findings.patterns.map((p) => `${KIND_LABELS[p.kind] ?? p.kind} ${p.count}件`),
  ].filter(Boolean);

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

      {totalCandidates > 0 && (
        <div className="rounded-[10px] border border-[var(--clay)] bg-[var(--clay-soft)] p-3.5">
          <p className="text-sm font-medium text-[var(--clay)]">
            赤い言葉は「名前かもしれないのに消せなかったもの」です（
            <span className="tnum">{totalCandidates}</span>件）。
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            家族や他事業所の方の名前なら「戻って直す」で言い換えてください（例:「長女」「担当ケアマネ」）。
            施設名や一般の言葉なら、そのまま送って構いません。
          </p>
        </div>
      )}

      {Object.entries(data.fields)
        .filter(([, text]) => text.trim().length > 0)
        .map(([key, text]) => (
          <section
            key={key}
            className="rounded-[10px] border border-[var(--line)] bg-[var(--card)] p-4"
          >
            <h3 className="mb-2 text-xs font-medium text-[var(--muted)]">
              {FIELD_LABELS[key] ?? key}
            </h3>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {highlight(text, data.candidates[key] ?? [])}
            </p>
          </section>
        ))}

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
          onClick={onConfirm}
          disabled={loading}
          className={`${primaryClass} flex-1`}
        >
          {loading ? "AIが作成中です…（30秒〜1分ほど）" : "この内容でAIに送る"}
        </button>
      </div>
    </div>
  );
}

/** 候補の言葉を赤く示す（長い言葉から先に区切り、部分一致の取りこぼしを防ぐ） */
function highlight(text: string, candidates: NameCandidate[]) {
  if (candidates.length === 0) return text;
  const words = [...new Set(candidates.map((c) => c.word))].sort((a, b) => b.length - a.length);
  const re = new RegExp(`(${words.map(escapeRegExp).join("|")})`, "g");
  const reasons = new Map(candidates.map((c) => [c.word, c.reason]));
  // key は文中の文字位置（並び替えが起きない静的な分割なので位置が識別子になる）
  let offset = 0;
  return text.split(re).map((part) => {
    const start = offset;
    offset += part.length;
    return reasons.has(part) ? (
      <mark
        key={`${start}:${part}`}
        title={reasons.get(part)}
        className="rounded bg-transparent px-0.5 font-medium text-[var(--clay)] underline decoration-[var(--clay)] decoration-2 underline-offset-2"
      >
        {part}
      </mark>
    ) : (
      part
    );
  });
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
