"use client";

/**
 * メモ欄（＋その下の「録音ファイルから文字にする」入口）。
 *
 * なぜ切り出したか:
 *   録音の入口はもともと支援経過（第5表）の枝の中にだけ書かれていて、他の帳票では使えなかった。
 *   アセスメント・担当者会議・モニタリングにも同じ入口を出すにあたり、枝ごとに同じ40行を
 *   貼ると4か所に散る。文字起こしの行き先だけが違うので、**どの欄へ足すか**を引数で受け取る形にした。
 *   仕様: docs/specs/recording-pipeline.md R1。
 *
 * 何と繋がるか:
 *   使う側 = app/(dashboard)/create/page.tsx（4つの帳票タブ）
 *   文字にする処理 = 同ページの transcribeFile → /api/transcribe
 *   受け入れ判定 = lib/transcribe/validate.ts（形式と大きさ。送る前に手元で弾く）
 *
 * ここで音声は一切持たない。File を親へ渡すだけで、保存もしない。
 */
import type { ReactNode } from "react";
import SaveTranscriptBar from "@/components/create/SaveTranscriptBar";
import RecordingPanel from "@/components/recording/RecordingPanel";
import { btnSecondary, inlineFieldClass, textareaClass } from "@/components/ui/primitives";
import type { TranscriptKind } from "@/lib/privacy/transcriptInput";
import { AUDIO_MAX_BYTES } from "@/lib/transcribe/validate";

/**
 * 欄の名前。A案のアートボードの「会議のメモ」と同じ小見出しの見た目（globals.css の .section-label ──
 * 12px の太字・字間 0.06em・--ink-2）。必須マーク（Req）を並べるため、SectionLabel ではなく手書きの label にする。
 */
const labelClass = "section-label mb-2 block";

/** 必須マーク（clay） */
function Req() {
  return <span className="text-[var(--clay)]"> *</span>;
}

/**
 * メモ欄に「録音から文字にする」入口を付けるときに渡すもの（つくるの entryFor が作る）。
 * 文字にした結果をどの欄へ足すかを、欄ごとに持たせるための形（docs/specs/recording-pipeline.md R1）。
 */
export interface TranscribeEntry {
  /** いま文字にしている最中か（ボタンを押せなくする） */
  busy: boolean;
  /** 選ばれた音声ファイル。親が /api/transcribe へ送り、結果をこの欄へ足す */
  onPick: (file: File) => void;
  /** 文字になった文章をこの欄へ足す（画面内の録音が区切りごとに呼ぶ） */
  onText: (text: string) => void;
  /** 保存するときの種類（アセスメント・担当者会議…）。渡すと「記録として残す」が出る */
  saveKind?: TranscriptKind;
}

/** メモ欄（NotesField）に渡すもの。label と required は欄の名前と必須の印、transcribe は録音の入口。 */
export interface NotesFieldProps {
  id: string;
  label: ReactNode;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  /** 録音ファイルの入口。渡さなければ出さない（前回プランの欄など、音声が関係ない欄） */
  transcribe?: TranscribeEntry;
}

/**
 * メモ欄1つ（欄の名前・複数行の入力欄・録音ファイルの入口・画面内の録音・記録として残す欄）。
 * 使う所: app/(dashboard)/create/page.tsx（書類の種類ごとの欄）。見た目は A案（R1）の小見出しと 14.5px の本文。
 */
export default function NotesField({
  id,
  label,
  required = false,
  value,
  onChange,
  rows = 10,
  placeholder,
  transcribe,
}: NotesFieldProps) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
        {required ? <Req /> : null}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className={`${textareaClass} resize-y`}
      />
      {transcribe ? (
        <>
          <AudioEntry id={id} entry={transcribe} />
          {/* 画面内の録音。表示スイッチが入っていなければ何も出ない（R5 が済むまで既定オフ） */}
          <RecordingPanel onTranscript={transcribe.onText} disabled={transcribe.busy} />
          {/* 文字起こしを利用者の記録として残す（押したときだけ・R4） */}
          {transcribe.saveKind && (
            <SaveTranscriptBar
              text={value}
              kind={transcribe.saveKind}
              inputClass={inlineFieldClass}
              secondaryClass={btnSecondary}
            />
          )}
        </>
      ) : null}
    </div>
  );
}

/** 音声を選ぶだけの小さな入口。音声はここに残らず、親へ渡してすぐ手放す。 */
function AudioEntry({ id, entry }: { id: string; entry: TranscribeEntry }) {
  const inputId = `${id}-audio`;
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs leading-[1.7] text-[var(--muted)]">
      <label
        htmlFor={inputId}
        className={`${btnSecondary} cursor-pointer ${entry.busy ? "pointer-events-none opacity-60" : ""}`}
      >
        {entry.busy ? "文字にしています…（1〜2分）" : "録音ファイルから文字にする"}
      </label>
      <input
        id={inputId}
        type="file"
        accept=".mp3,.mp4,.mpeg,.mpga,.m4a,.wav,.webm,audio/*"
        className="hidden"
        disabled={entry.busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) entry.onPick(file);
          // 同じファイルをもう一度選べるように空にする
          e.target.value = "";
        }}
      />
      <span>
        1つのファイルは{Math.floor(AUDIO_MAX_BYTES / 1024 / 1024)}
        MBまで（ふつうの音質で4〜5分ぶん）。長い録音は短く分けるか、録音アプリの音質を下げてください。
        音声は保存せず、文字にしたあと通常の「送る前に確認」を通ります。
      </span>
    </div>
  );
}
