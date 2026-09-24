"use client";

/**
 * 画面の中で録音し、区切りごとに文字にしてメモ欄へ足す（docs/specs/recording-pipeline.md R3）。
 *
 * なぜこの作りか:
 *   ①**区切って録る** ── 1回に送れるのは4MBまで。60分の会議を1本で送ることはできないので、
 *     5分（または3MB）ごとに区切り、録りながら1本ずつ文字にしていく。
 *     区切りは MediaRecorder を止めて始め直して作る。止めずに切った断片は単独では
 *     音声ファイルとして成立せず、文字起こしに送れないため。
 *   ②**音声はどこにも保存しない** ── 区切りはメモリの中だけに置き、文字になったら手放す。
 *     端末のディスク（IndexedDB 等）には書かない。黒塗りが原理的にかけられない音声を
 *     共用パソコンに残さないため（2026-09-17 の設計審査で fatal と判定された方式を避けている）。
 *   ③**録らない自由を残す** ── 雑談や他の利用者の話になったら一時停止できる。
 *     録らなければ外に出ない。どんな技術的対策よりこれがよく効く。
 *
 * 何と繋がるか:
 *   決めごと = lib/recording/config.ts（区切りの大きさ・長さ・停止条件）
 *   状態     = lib/recording/segments.ts（やり直す／諦める／録音ごと止める）
 *   形式     = lib/recording/mimeType.ts（録れる形式と送れる形式を合わせる）
 *   送り先   = /api/transcribe（1人1時間30回の制限あり）
 *   足す先   = 呼び出し側が渡す onTranscript（＝メモ欄。このあと黒塗り→人の確認を通る）
 *
 * ⚠ 表示は既定で切ってある（NEXT_PUBLIC_CARENOTE_RECORDING=on のときだけ出る）。
 *   事業所への説明書の改訂（R5）が済むまで現場に出さないことを、約束ではなく仕組みで担保する。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { IconMic } from "@/components/ui/icons";
import { btnSecondary } from "@/components/ui/primitives";
import {
  MAX_ATTEMPTS,
  maxSegmentMs,
  SEGMENT_MAX_BYTES,
  TOTAL_MAX_MS,
} from "@/lib/recording/config";
import { pickRecordingType, segmentFileName } from "@/lib/recording/mimeType";
import {
  gapIndexes,
  initialQueue,
  isPermanentFailure,
  nextWaiting,
  progress,
  type QueueState,
  reduceQueue,
} from "@/lib/recording/segments";

/**
 * 音が1つも届かないまま、この時間が過ぎたら「音が入っていません」と知らせる。
 * 区切りの空振り（5分ごと）を待つと気づくのが遅すぎる ── 会議が10分ぶん失われてから出ても手遅れ。
 */
const SILENT_AFTER_MS = 30_000;

/** やり直しの前に空ける時間（1回目・2回目・3回目以降）。0ミリ秒の連打を防ぐ。 */
const RETRY_WAIT_MS = [2000, 8000, 20000];

/** 表示スイッチ。R5（説明書の改訂）が済むまでは出さない。 */
export const RECORDING_ENABLED = process.env.NEXT_PUBLIC_CARENOTE_RECORDING === "on";

interface Props {
  /** 文字になった区切りを足す先（メモ欄） */
  onTranscript: (text: string) => void;
  /** ほかの処理が動いている間は始められない */
  disabled?: boolean;
}

type Phase = "idle" | "recording" | "paused" | "finishing";

const mmss = (ms: number) => {
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

export default function RecordingPanel({ onTranscript, disabled = false }: Props) {
  const [told, setTold] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [queue, setQueue] = useState<QueueState>(initialQueue);
  const [error, setError] = useState<string | null>(null);

  /** 区切りの音声。送り終えたら必ず消す（メモリにも残さない） */
  const blobs = useRef(new Map<number, Blob>());
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const bytes = useRef(0);
  const segmentStart = useRef(0);
  const startedAt = useRef(0);
  const sending = useRef(false);
  const stopping = useRef(false);
  /** 最後に音が届いた時刻（マイクが外れた・OSでミュートされたのを早く気づくため） */
  const lastDataAt = useRef(0);
  const [silent, setSilent] = useState(false);
  /** やり直しの待ち時間が明ける時刻。0 ならすぐ送ってよい */
  const [retryAt, setRetryAt] = useState(0);

  const type =
    typeof window === "undefined"
      ? null
      : pickRecordingType((t) => MediaRecorder.isTypeSupported(t));

  /** マイクを離し、残った音声をすべて捨てる。 */
  const releaseAll = useCallback(() => {
    for (const track of stream.current?.getTracks() ?? []) track.stop();
    stream.current = null;
    recorder.current = null;
    chunks.current = [];
    blobs.current.clear();
  }, []);

  useEffect(() => releaseAll, [releaseAll]);

  /** 溜まった音声を1本の区切りとして確定する。 */
  const closeSegment = useCallback(() => {
    // 音が1つも来ていなくても**必ず期限を進める**。進めないと期限切れのままになり、
    // タイマーが毎秒 rotate() を呼び続ける（独立審査 2026-09-17: マイクが外れた8分間、
    // 画面は「録音中」のまま122回も止めて始め直し、会議は1文字も残らなかった）。
    segmentStart.current = Date.now();
    if (chunks.current.length === 0 || !type) return;
    const blob = new Blob(chunks.current, { type: type.mimeType });
    chunks.current = [];
    bytes.current = 0;
    setQueue((q) => {
      const next = reduceQueue(q, { type: "add", bytes: blob.size });
      blobs.current.set(next.segments.length, blob);
      return next;
    });
  }, [type]);

  /** 録音を止めずに区切りだけ作り直す（止めて始め直さないと、単独で送れる音声にならない）。 */
  const rotate = useCallback(() => {
    const rec = recorder.current;
    if (!rec || rec.state === "inactive") return;
    rec.onstop = () => {
      closeSegment();
      if (!stopping.current && recorder.current) recorder.current.start(1000);
    };
    rec.stop();
  }, [closeSegment]);

  /** 録音を始める。 */
  const start = async () => {
    setError(null);
    if (!type) {
      setError(
        "このブラウザでは録音できません。Windows の Chrome でお試しいただくか、録音ファイルを選んでください。",
      );
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = media;
      const rec = new MediaRecorder(media, { mimeType: type.mimeType, audioBitsPerSecond: 32_000 });
      rec.ondataavailable = (e) => {
        if (e.data.size === 0) return;
        chunks.current.push(e.data);
        bytes.current += e.data.size;
        lastDataAt.current = Date.now();
      };
      recorder.current = rec;
      stopping.current = false;
      startedAt.current = Date.now();
      segmentStart.current = Date.now();
      lastDataAt.current = Date.now();
      setSilent(false);
      rec.start(1000);
      setPhase("recording");
    } catch {
      setError("マイクを使えませんでした。ブラウザの許可を確認してください。");
      releaseAll();
    }
  };

  const pause = () => {
    recorder.current?.pause();
    setPhase("paused");
  };

  const resume = () => {
    recorder.current?.resume();
    setPhase("recording");
  };

  /** 録音を終える。最後の区切りも送ってから、マイクを離す。 */
  const finish = useCallback(
    (reason?: string) => {
      stopping.current = true;
      const rec = recorder.current;
      if (rec && rec.state !== "inactive") {
        rec.onstop = () => {
          closeSegment();
          for (const track of stream.current?.getTracks() ?? []) track.stop();
          stream.current = null;
          recorder.current = null;
        };
        rec.stop();
      }
      setPhase("finishing");
      if (reason) setQueue((q) => reduceQueue(q, { type: "stop", reason }));
    },
    [closeSegment],
  );

  /** 時間で区切る／全体の上限で止める。 */
  useEffect(() => {
    if (phase !== "recording") return;
    const id = setInterval(() => {
      setElapsed(Date.now() - startedAt.current);
      setSilent(Date.now() - lastDataAt.current > SILENT_AFTER_MS);
      if (Date.now() - startedAt.current >= TOTAL_MAX_MS) {
        finish(`${Math.round(TOTAL_MAX_MS / 60000)}分の上限に達したので録音を止めました。`);
        return;
      }
      if (
        bytes.current >= SEGMENT_MAX_BYTES ||
        Date.now() - segmentStart.current >= maxSegmentMs()
      ) {
        rotate();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [phase, rotate, finish]);

  /** 溜まった区切りを1本ずつ送る。 */
  useEffect(() => {
    if (sending.current) return;
    // やり直しの前に必ず間を空ける。空けないと同じ会議音声を0ミリ秒で3回続けて外へ送る
    // （独立審査 2026-09-17: やり直し3回の時刻が 0, 0, 0 ミリ秒だった）。
    if (retryAt > Date.now()) {
      const id = setTimeout(() => setRetryAt(0), retryAt - Date.now());
      return () => clearTimeout(id);
    }
    const target = nextWaiting(queue);
    if (!target) return;
    const blob = blobs.current.get(target.index);
    if (!blob || !type) return;

    sending.current = true;
    setQueue((q) => reduceQueue(q, { type: "sending", index: target.index }));

    (async () => {
      try {
        const form = new FormData();
        form.append("file", blob, segmentFileName(target.index, type.extension));
        const res = await fetch("/api/transcribe", { method: "POST", body: form });
        const raw = await res.text();
        let data: { text?: unknown; error?: unknown } = {};
        try {
          data = JSON.parse(raw) as typeof data;
        } catch {
          throw Object.assign(new Error(`文字にできませんでした（${res.status}）`), {
            status: res.status,
          });
        }
        if (!res.ok) {
          throw Object.assign(
            new Error(
              typeof data.error === "string"
                ? data.error
                : `文字にできませんでした（${res.status}）`,
            ),
            { status: res.status },
          );
        }
        const text = String(data.text ?? "").trim();
        if (text) onTranscript(text);
        blobs.current.delete(target.index); // ここで音声を手放す
        setQueue((q) => reduceQueue(q, { type: "done", index: target.index }));
      } catch (e) {
        const status = (e as { status?: number }).status ?? 0;
        const permanent = isPermanentFailure(status);
        const message = e instanceof Error ? e.message : "文字にできませんでした";
        if (permanent || target.attempts + 1 >= MAX_ATTEMPTS) blobs.current.delete(target.index);
        else
          setRetryAt(
            Date.now() + RETRY_WAIT_MS[Math.min(target.attempts, RETRY_WAIT_MS.length - 1)],
          );
        setQueue((q) =>
          reduceQueue(q, { type: "failed", index: target.index, error: message, permanent }),
        );
      } finally {
        sending.current = false;
      }
    })();
  }, [queue, onTranscript, type, retryAt]);

  /**
   * 「録音を止めました」が立ったら、**実際に**止める。
   *
   * 独立審査 2026-09-17 critical: 画面に「録音を止めました」と出しながら、MediaRecorder は
   * recording のまま・マイクも掴んだまま・時計も進み続けていた。止めた印を立てるだけで、
   * それを受け取って実行する側が居なかった。
   */
  useEffect(() => {
    if (!queue.stopped) return;
    if (phase === "recording" || phase === "paused") finish();
  }, [queue.stopped, phase, finish]);

  /** 全部さばき終えたら待機に戻す。 */
  useEffect(() => {
    if (phase !== "finishing") return;
    const p = progress(queue);
    // 止まったときは pending が減らないことがあるので、止めた印でも抜ける
    if ((p.pending === 0 || queue.stopped) && !sending.current) {
      setPhase("idle");
      setElapsed(0);
      releaseAll();
    }
  }, [phase, queue, releaseAll]);

  if (!RECORDING_ENABLED) return null;

  const p = progress(queue);
  const gaps = gapIndexes(queue);
  const canStart = told && !disabled && phase === "idle";

  return (
    // A案（R1・2026-09-24）: 角を丸めた箱をやめ、上に 1px の線を引いた区切りにした（アートボード Main.dc.html の録音の帯）。
    // 文字・並び順（説明 → 同意のチェック → ボタン）・押せる条件は以前のまま（同意のチェックは帯の中で最初の checkbox）。
    <div className="mt-4 border-t border-[var(--line-inner)] pt-3.5">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-[var(--mic-soft)] text-[var(--green)]"
        >
          <IconMic size={15} />
        </span>
        <p className="section-label">この画面で録音する</p>
      </div>

      {phase === "idle" && (
        <>
          <p className="mt-2 text-xs leading-[1.8] text-[var(--muted)]">
            {Math.round(maxSegmentMs() / 60000)}
            分ごとに区切って、録りながら文字にします。音声は保存しません
            （文字にしたら消えます）。雑談になったら一時停止してください ──
            録らなければ外に出ません。
          </p>
          <label className="mt-2.5 flex cursor-pointer items-start gap-2 text-xs leading-[1.8] text-[var(--ink)]">
            <input
              type="checkbox"
              checked={told}
              onChange={(e) => setTold(e.target.checked)}
              className="mt-[3px] size-[15px] shrink-0 accent-[var(--green)]"
            />
            <span>
              その場にいる全員に、記録を作るために録音することを伝えました
              （議事録にも「録音して記録を作成」と残します）。
            </span>
          </label>
        </>
      )}

      {(phase === "recording" || phase === "paused") && (
        <p className="mt-2 text-xs text-[var(--muted)]">
          <span className="mono tnum text-[13px] font-medium text-[var(--ink)]">
            {mmss(elapsed)}
          </span>
          {phase === "paused" ? "（一時停止中 ── いまは録っていません）" : " 録音中"}
          {p.total > 0 && (
            <>
              {" / "}
              文字にした区切り <span className="tnum">{p.done}</span>/
              <span className="tnum">{p.total}</span>
            </>
          )}
        </p>
      )}

      {phase === "finishing" && (
        <p className="mt-2 text-xs text-[var(--muted)]">
          残りを文字にしています… <span className="tnum">{p.done}</span>/
          <span className="tnum">{p.total}</span>
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {phase === "idle" && (
          <button type="button" onClick={start} disabled={!canStart} className={btnSecondary}>
            録音を始める
          </button>
        )}
        {phase === "recording" && (
          <>
            <button type="button" onClick={pause} className={btnSecondary}>
              一時停止
            </button>
            <button type="button" onClick={() => finish()} className={btnSecondary}>
              録音を終える
            </button>
          </>
        )}
        {phase === "paused" && (
          <>
            <button type="button" onClick={resume} className={btnSecondary}>
              録音を再開
            </button>
            <button type="button" onClick={() => finish()} className={btnSecondary}>
              録音を終える
            </button>
          </>
        )}
      </div>

      {silent && (phase === "recording" || phase === "paused") && (
        <p className="mt-2 text-xs font-medium text-[var(--clay)]">
          音が入っていません。マイクが外れていないか、パソコンの音量設定を確かめてください
          （このままでは録っても文字になりません）。
        </p>
      )}
      {queue.stopped && (
        <p className="mt-2 text-xs font-medium text-[var(--clay)]">{queue.stopped}</p>
      )}
      {gaps.length > 0 && (
        <p className="mt-2 text-xs font-medium text-[var(--clay)]">
          {gaps.join("・")}本目が文字になりませんでした。その時間の内容は手で書き足してください。
        </p>
      )}
      {error && <p className="mt-2 text-xs font-medium text-[var(--clay)]">{error}</p>}
    </div>
  );
}
