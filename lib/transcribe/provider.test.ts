import { afterEach, describe, expect, it, vi } from "vitest";
import { appendLanguage, createOpenAiTranscriber, TranscribeError } from "./provider";

describe("言語指定の付け方（公式ガイド 2026-09-11: gpt-transcribe は languages）", () => {
  it("gpt-transcribe 系は languages[]、whisper-1 は language を送る（両方は送らない）", () => {
    const a = new FormData();
    appendLanguage(a, "gpt-transcribe");
    expect(a.getAll("languages[]")).toEqual(["ja"]);
    expect(a.has("language")).toBe(false);

    const b = new FormData();
    appendLanguage(b, "whisper-1");
    expect(b.get("language")).toBe("ja");
    expect(b.has("languages[]")).toBe(false);
  });
});

describe("OpenAI 文字起こしの呼び出し", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("鍵が無ければ null（差し込み口が無効）", () => {
    expect(createOpenAiTranscriber({})).toBeNull();
  });

  it("送信フォームにモデル・言語・形式が入り、返事の text を返す", async () => {
    const seen: FormData[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: FormData }) => {
        seen.push(init.body);
        return new Response(JSON.stringify({ text: "こんにちは" }), { status: 200 });
      }),
    );
    const t = createOpenAiTranscriber({ OPENAI_API_KEY: "k" });
    if (!t) throw new Error("transcriber が null");
    const r = await t.transcribe(new Blob(["x"]), "call.mp3");
    expect(r.text).toBe("こんにちは");
    expect(seen[0].get("model")).toBe("gpt-transcribe");
    expect(seen[0].getAll("languages[]")).toEqual(["ja"]);
    expect(seen[0].get("response_format")).toBe("json");
  });

  it("外部エラーは TranscribeError（職員向けの言い換え）にする", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("rate limited", { status: 429 })),
    );
    const t = createOpenAiTranscriber({ OPENAI_API_KEY: "k" });
    if (!t) throw new Error("transcriber が null");
    await expect(t.transcribe(new Blob(["x"]), "call.mp3")).rejects.toBeInstanceOf(TranscribeError);
  });
});
