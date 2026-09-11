/**
 * 文字起こしサービスへの差し込み口（第3段・docs/specs/call-pipeline.md）。
 *
 * なぜ存在するか:
 *   吉本さん決定 D1「文字起こしは外部サービスへ送る」（2026-09-09）。採用は OpenAI の文字起こし API
 *   （既定で学習に使わない・音声の文字起こしは監視ログも保持「なし」＝公式のデータ管理ページで確認 2026-09-11）。
 *   他社へ切り替えられるよう、呼び出し側は Transcriber だけを知る。
 *   音声はメモリ上で転送するだけで保存しない（非保持原則）。ログには大きさと所要時間しか出さない。
 */
import { explainTranscribeError } from "./validate";

export interface TranscribeResult {
  text: string;
}

export interface Transcriber {
  transcribe(file: Blob, filename: string): Promise<TranscribeResult>;
}

/** 職員に見せてよいメッセージを持つエラー（原文は message に含めない） */
export class TranscribeError extends Error {
  readonly status: number;
  constructor(status: number, publicMessage: string) {
    super(publicMessage);
    this.name = "TranscribeError";
    this.status = status;
  }
}

const OPENAI_URL = "https://api.openai.com/v1/audio/transcriptions";
/** 公式ガイドが一般用途に推奨するモデル（2026-09-09 確認）。環境変数で上書き可 */
const DEFAULT_MODEL = "gpt-transcribe";

/**
 * 言語指定の付け方はモデルで違う（公式ガイド 2026-09-11 確認）:
 * gpt-transcribe 系は `languages`（複数・単数の language を置き換える。両方送らない）、
 * whisper-1 は従来の `language`（単数）。
 */
export function appendLanguage(form: FormData, model: string): void {
  if (model.startsWith("gpt-")) {
    form.append("languages[]", "ja");
  } else {
    form.append("language", "ja");
  }
}

export function createOpenAiTranscriber(
  env: Record<string, string | undefined> = process.env,
): Transcriber | null {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const model = env.TRANSCRIBE_MODEL || DEFAULT_MODEL;

  return {
    async transcribe(file, filename) {
      const form = new FormData();
      form.append("file", file, filename);
      form.append("model", model);
      appendLanguage(form, model);
      form.append("response_format", "json");

      const started = Date.now();
      const res = await fetch(OPENAI_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });
      const body = await res.text();
      console.info("[transcribe] done", {
        status: res.status,
        bytes: file.size,
        ms: Date.now() - started,
      });
      if (!res.ok) {
        console.error("[transcribe] provider error:", res.status, body.slice(0, 300));
        throw new TranscribeError(res.status, explainTranscribeError(res.status, body));
      }
      let parsed: { text?: unknown };
      try {
        parsed = JSON.parse(body);
      } catch {
        throw new TranscribeError(502, "文字起こしの結果を読み取れませんでした。");
      }
      if (typeof parsed.text !== "string") {
        throw new TranscribeError(502, "文字起こしの結果が空でした。");
      }
      return { text: parsed.text };
    },
  };
}
