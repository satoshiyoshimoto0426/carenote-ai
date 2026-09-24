"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import {
  IconAlert,
  IconChevronRight,
  IconLayers,
  IconLoader,
  IconLock,
  IconPencil,
} from "@/components/ui/icons";
import { btnPrimary, btnSecondary, SectionLabel, TextAction } from "@/components/ui/primitives";
import { clientAttrLine, formatRegisteredDate } from "@/lib/clients/clientList";
import { type DocTypeRow, groupDocumentsByType } from "@/lib/clients/documentRows";
import { DOC_TYPE_LABELS } from "@/lib/create/docTypes";
import type { ClientRecord } from "@/types/client";
import type { CareDocumentRecord } from "@/types/document";
import DocumentPanel, { StatusBadge } from "./DocumentPanel";
import RelatedPeople from "./RelatedPeople";
import SavedTranscripts from "./SavedTranscripts";

/** 読み込みの状態。読めなかったことを「書類が無い」に見せないよう、3つを分けて持つ。 */
type PaneState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; client: ClientRecord; documents: CareDocumentRecord[] };

/** 通信そのものが失敗したとき（サーバーの文が無いとき）の文。 */
const NETWORK_ERROR = "読み込みに失敗しました。通信環境を確かめて、もう一度お試しください。";

/** つくる（/create）へ、利用者（と書類の種類）を URL で渡す。受け取って画面に反映するのは計画 C2。 */
function createHref(clientId: string, type?: string): string {
  const params = new URLSearchParams({ client: clientId });
  if (type) params.set("type", type);
  return `/create?${params.toString()}`;
}

/** 書類を開く URL（この区画のまま、その書類の承認の操作と中身を出す）。 */
function openHref(clientId: string, docId: string): string {
  return `/clients/${encodeURIComponent(clientId)}?${new URLSearchParams({ doc: docId }).toString()}`;
}

/** 書類の種類の名前（利用者の画面の名前）。万一 5種類に無い種類なら、その種類の文字をそのまま出す。 */
function docLabel(docType: string): string {
  return DOC_TYPE_LABELS[docType as keyof typeof DOC_TYPE_LABELS]?.saved ?? docType;
}

/**
 * 利用者の区画（/clients/{id} の右の区画の中身・A案「作業台」アートボード A-clients ── 2026-09-24 A6 ＝ 計画 U3b）。
 *
 * 並び: 頭（記号〔等幅 30px〕・（仮名）・「仮名表示中」・属性・緑の「つくる」）→ 書類 → 関係者名簿 → 残した文字起こし。
 * - 書類は**種類ごとに1行**（lib/create/docTypes.ts の DOC_ORDER の順）: いちばん新しい版の状態の札（下書き／承認済み）・
 *   保存した日（等幅・日本時間）・「開く」。まだ無い種類は「まだありません」と「つくる」（/create?client={id}&type={種類}）。
 *   古い版は「以前の版（n）」の中に並べ、**どの版も開ける**（振り分けは lib/clients/documentRows.ts）。
 * - 「開く」は ?doc={書類の id}。この区画のまま、その書類の承認（G4）の操作と中身（components/clients/DocumentPanel.tsx）を出す。
 *   区画の幅は components/clients/ClientsLayout.tsx が ?doc= を見て 640px に広げる（書類の表示は幅が要る）。
 * - 「一式まとめて」は /rescue?client={id}（救済モード。利用者を受け取って保存先に選ぶのは後の段 ── 計画 C9）。
 *
 * 緑の主ボタンは1画面に1つ: ふだんは頭の「つくる」。下書きの書類を開いているあいだは DocumentPanel の「承認する」が主ボタンに
 * なるので、「つくる」を脇のボタンの見た目にする。
 * 実名を描かない: 利用者の記録（ClientRecord）は氏名を持たず、頭と書類の行は記号・属性・日付だけ。家族などの実名は
 * 関係者名簿（components/clients/RelatedPeople.tsx）の中だけで、この区画は行を押して開いたときだけ出る（勝手に選ばない ──
 * ClientsLayout.tsx）。書類は作った職員の分だけが届く（lib/db/documents.ts の created_by）ので、それを画面にも書く。
 *
 * @param clientId 開く利用者の id（URL の /clients/{id}）。
 * @param docId 開いている書類の id（URL の ?doc=。無ければ null ＝書類の一覧）。
 * 読む API: GET /api/clients/{id}（{ client, documents } ── app/api/clients/[id]/route.ts）。
 * 呼ぶ所: app/(dashboard)/clients/[id]/page.tsx。テスト: components/clients/ClientPane.test.tsx。
 */
export default function ClientPane({
  clientId,
  docId,
}: {
  clientId: string;
  docId: string | null;
}) {
  const [state, setState] = useState<PaneState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let resp: Response;
      try {
        resp = await fetch(`/api/clients/${encodeURIComponent(clientId)}`);
      } catch {
        if (!cancelled) setState({ status: "error", message: NETWORK_ERROR });
        return;
      }
      const data = (await resp.json().catch(() => null)) as {
        client?: ClientRecord;
        documents?: unknown;
        error?: string;
      } | null;
      if (cancelled) return;
      if (!resp.ok || !data?.client || !Array.isArray(data.documents)) {
        setState({ status: "error", message: data?.error || "読み込みに失敗しました" });
        return;
      }
      setState({
        status: "ready",
        client: data.client,
        documents: data.documents as CareDocumentRecord[],
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (state.status === "loading") {
    return (
      <div className="client-pane">
        <p className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <IconLoader size={15} className="animate-spin" />
          読み込み中…
        </p>
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="client-pane">
        <p role="alert" className="flex items-start gap-2 text-sm text-[var(--clay)]">
          <IconAlert size={15} className="mt-0.5 shrink-0" />
          {state.message}
        </p>
        <Link
          href="/clients"
          className="mt-3 inline-flex min-h-11 items-center text-sm text-[var(--green)] hover:underline md:min-h-0"
        >
          利用者一覧へ
        </Link>
      </div>
    );
  }

  const { client, documents } = state;
  // 承認・取消が通ったら、サーバーが返した書類で同じ行を差し替える（開いたまま状態の札と操作が変わる）
  const replaceDocument = (updated: CareDocumentRecord) => {
    setState((cur) =>
      cur.status === "ready"
        ? {
            ...cur,
            documents: cur.documents.map((doc) => (doc.id === updated.id ? updated : doc)),
          }
        : cur,
    );
  };
  const openDoc = docId ? (documents.find((doc) => doc.id === docId) ?? null) : null;
  // 下書きを開いているあいだは「承認する」が主ボタン（緑は1画面に1つ）
  const approvingDraft = openDoc?.status === "draft";

  return (
    <div className="client-pane">
      <header className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h2 className="client-pane-code">
              {client.code}様<span className="client-pane-kana">（仮名）</span>
            </h2>
            <span className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--green-line)] bg-[var(--green-soft)] px-2.5 py-1 text-xs text-[var(--green)]">
              <IconLock size={13} />
              仮名表示中
            </span>
          </div>
          <ClientAttributes client={client} />
        </div>
        <Link
          href={createHref(client.id)}
          className={`${approvingDraft ? btnSecondary : btnPrimary} shrink-0 whitespace-nowrap`}
        >
          <IconPencil size={15} />
          つくる
        </Link>
      </header>

      {docId ? (
        <OpenedDocument clientId={client.id} doc={openDoc} onChange={replaceDocument} />
      ) : (
        <>
          <DocumentList clientId={client.id} documents={documents} />
          <div className="mt-8">
            <RelatedPeople clientId={client.id} clientCode={client.code} />
          </div>
          <div className="mt-8 empty:hidden">
            <SavedTranscripts clientId={client.id} />
          </div>
        </>
      )}
    </div>
  );
}

/** 属性の1行（「91歳・男性・要介護3・長女と同居」）。何も無ければ「（属性未設定）」を淡い色で。 */
function ClientAttributes({ client }: { client: ClientRecord }) {
  const line = clientAttrLine(client);
  return line ? (
    <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--ink-2)]">{line}</p>
  ) : (
    <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--muted)]">（属性未設定）</p>
  );
}

/**
 * 「書類」のまとまり: 種類ごとに1行・以前の版・「一式まとめて」。
 * 書類は作った職員の分だけが届くので、それを見出しの下に書く（同僚が作った書類が「まだありません」に見えるため）。
 */
function DocumentList({
  clientId,
  documents,
}: {
  clientId: string;
  documents: CareDocumentRecord[];
}) {
  const headingId = useId();
  const { rows, others } = groupDocumentsByType(documents);
  return (
    <section aria-labelledby={headingId} className="mt-7">
      <SectionLabel id={headingId}>書類</SectionLabel>
      <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
        ここに出る書類は、自分が保存したものだけです
      </p>
      <ul className="mt-1.5">
        {rows.map((row) => (
          <DocTypeRowItem key={row.type} clientId={clientId} row={row} />
        ))}
        {others.map((doc) => (
          <li key={doc.id} className="client-pane-row">
            <span className="min-w-0 flex-1">{docLabel(doc.docType)}</span>
            <DocVersion clientId={clientId} doc={doc} label={docLabel(doc.docType)} />
          </li>
        ))}
      </ul>
      {documents.length === 0 ? (
        <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--muted)]">
          まだ書類がありません。「つくる」の「一式まとめて」から作って保存できます。
        </p>
      ) : null}
      <p className="mt-3">
        <TextAction href={`/rescue?${new URLSearchParams({ client: clientId }).toString()}`}>
          <IconLayers size={14} />
          一式まとめて
        </TextAction>
      </p>
    </section>
  );
}

/** 書類の種類1つぶんの行（いちばん新しい版、または「まだありません」＋「つくる」）と、その下の「以前の版（n）」。 */
function DocTypeRowItem({ clientId, row }: { clientId: string; row: DocTypeRow }) {
  const label = DOC_TYPE_LABELS[row.type].saved;
  return (
    <li>
      <div className="client-pane-row">
        <span className="min-w-0 flex-1">{label}</span>
        {row.latest ? (
          <DocVersion clientId={clientId} doc={row.latest} label={label} />
        ) : (
          <>
            <span className="text-[12.5px] text-[var(--muted)]">まだありません</span>
            <TextAction href={createHref(clientId, row.type)} className="client-pane-action">
              つくる<span className="sr-only">（{label}）</span>
            </TextAction>
          </>
        )}
      </div>
      {row.older.length > 0 ? (
        <details className="client-doc-older">
          <summary>
            <IconChevronRight size={13} />
            {/* 文字は1つの箱に入れる（summary は flex なので、箱が分かれると「（ 2 ）」のように間が空く） */}
            <span>
              以前の版（<span className="tnum">{row.older.length}</span>）
              <span className="sr-only">{label}</span>
            </span>
          </summary>
          <ul>
            {row.older.map((doc) => (
              <li key={doc.id} className="client-pane-row">
                <span className="min-w-0 flex-1" />
                <DocVersion clientId={clientId} doc={doc} label={label} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </li>
  );
}

/** 1つの版の、状態の札・保存した日・「開く」（行の右側）。 */
function DocVersion({
  clientId,
  doc,
  label,
}: {
  clientId: string;
  doc: CareDocumentRecord;
  label: string;
}) {
  const date = formatRegisteredDate(doc.createdAt);
  return (
    <>
      <StatusBadge doc={doc} compact />
      {date ? <span className="client-pane-date">{date}</span> : null}
      <TextAction href={openHref(clientId, doc.id)} className="client-pane-action">
        開く
        <span className="sr-only">
          （{label}
          {date ? `・${date}` : ""}）
        </span>
      </TextAction>
    </>
  );
}

/**
 * 開いた書類（?doc=）: 一覧へ戻る・書類の名前・状態の札・保存した日・承認の操作と中身（DocumentPanel）。
 * id が一覧に無い（消した・別の職員の書類・打ち間違い）ときは、開けなかったことを文字で出す。
 */
function OpenedDocument({
  clientId,
  doc,
  onChange,
}: {
  clientId: string;
  doc: CareDocumentRecord | null;
  onChange: (updated: CareDocumentRecord) => void;
}) {
  const date = doc ? formatRegisteredDate(doc.createdAt) : null;
  return (
    <div className="mt-7">
      <TextAction href={`/clients/${encodeURIComponent(clientId)}`}>書類の一覧へ戻る</TextAction>
      {doc ? (
        <>
          <h3 className="mt-2 text-[15px] font-bold leading-snug text-[var(--ink)]">
            {docLabel(doc.docType)}
          </h3>
          <p className="mt-1.5 flex items-center gap-2.5">
            <StatusBadge doc={doc} />
            {date ? <span className="client-pane-date">{date}</span> : null}
          </p>
          <div className="client-pane-bleed mt-4">
            <DocumentPanel key={doc.id} doc={doc} onChange={onChange} />
          </div>
        </>
      ) : (
        <p role="alert" className="mt-3 text-[13px] leading-relaxed text-[var(--clay)]">
          この書類を開けませんでした。書類の一覧から開き直してください。
        </p>
      )}
    </div>
  );
}
