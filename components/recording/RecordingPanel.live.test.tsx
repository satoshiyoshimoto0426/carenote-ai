// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 録音パネルを**実際に動かして**確かめる。
 *
 * なぜ必要か（2026-09-17 の独立審査 critical 6件）:
 *   純粋ロジックのテストも、描いた HTML のテストも全部緑だったのに、
 *   ①「録音を止めました」と出しながらマイクを掴んだままだった
 *   ②マイクが外れると毎秒 122 回も止めて始め直す暴走に入り、8分ぶんが黙って消えた
 *   ③やり直しが0ミリ秒で3連打になり、同じ会議音声を3回続けて外へ送っていた
 *   ── どれも**動かさないと見えない**壊れ方だった。ここだけは本物を動かして見張る。
 *
 * 偽物にするのはブラウザの部品（MediaRecorder・マイク・通信）だけで、
 * パネル本体と lib/recording 配下は本物をそのまま使う。
 */

// jsdom は起動に十数秒かかる。他のテストと同時に走ると待ち時間が伸びるので広めに取る
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/**
 * 溜まっている非同期処理を出し切る。
 * 1回だけだと、偽の通信が返す約束が act の外に取り残され、負荷が高いときだけ結果が変わる
 * （並列実行で5件落ちた・2026-09-17）。何回か回して落ち着かせる。
 */
const flush = async () => {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
};

/** 偽の MediaRecorder。止めた回数・始めた回数を数える。 */
class FakeRecorder {
  static instances: FakeRecorder[] = [];
  static isTypeSupported = () => true;
  state: "inactive" | "recording" | "paused" = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  starts = 0;
  stops = 0;
  /** true なら音が1つも来ない（マイクが外れた・OSでミュート） */
  static silent = false;

  constructor(
    readonly stream: FakeStream,
    readonly options: { mimeType: string },
  ) {
    FakeRecorder.instances.push(this);
  }
  start() {
    this.starts += 1;
    this.state = "recording";
  }
  /**
   * 本物と同じく、stop() を呼んだ時点では state だけが inactive になり、最後のかたまりと止まった知らせは
   * **あとから**届く（ブラウザの仕様。本物の Chrome で記録: stop → 0.1秒後に最後の data → onstop）。
   * 以前はその場で届けていたため、「終えた直後に片付けて、それまで録った音声を捨てる」壊れ方が試験で見えなかった
   * （2026-10-26 試行版で営業の方が報告・30秒録って送られたのは最後の1秒の断片だけだった）。
   */
  stop() {
    this.stops += 1;
    this.state = "inactive";
    setTimeout(() => {
      if (!FakeRecorder.silent) this.ondataavailable?.({ data: new Blob(["x".repeat(1000)]) });
      this.onstop?.();
    }, FakeRecorder.STOP_DELAY_MS);
  }
  /** 止めてから知らせが届くまで（本物の Chrome の記録で約0.1秒） */
  static STOP_DELAY_MS = 100;
  pause() {
    this.state = "paused";
  }
  resume() {
    this.state = "recording";
  }
  /** 1秒ぶんの音が届いたことにする */
  feed(bytes = 1000) {
    if (FakeRecorder.silent) return;
    this.ondataavailable?.({ data: new Blob(["x".repeat(bytes)]) });
  }
}

class FakeTrack {
  stopped = 0;
  stop() {
    this.stopped += 1;
  }
}
class FakeStream {
  tracks = [new FakeTrack()];
  getTracks() {
    return this.tracks;
  }
}

let root: Root | null = null;
let container: HTMLDivElement;
let streams: FakeStream[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("NEXT_PUBLIC_CARENOTE_RECORDING", "on");
  FakeRecorder.instances = [];
  FakeRecorder.silent = false;
  streams = [];
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  // navigator を丸ごと差し替えると jsdom の内部を壊すので、マイクの口だけ足す
  Object.defineProperty(globalThis.navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: async () => {
        const s = new FakeStream();
        streams.push(s);
        return s;
      },
    },
  });
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

/** パネルを描いて、録音を始めるところまで進める。 */
async function startRecording(fetchImpl: typeof fetch) {
  vi.stubGlobal("fetch", fetchImpl);
  const { default: RecordingPanel } = await import("./RecordingPanel");
  root = createRoot(container);
  await act(async () => {
    root?.render(<RecordingPanel onTranscript={() => {}} />);
  });
  // 同意のチェックを入れる
  const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (!checkbox) throw new Error("同意のチェックが見つかりません");
  await act(async () => {
    checkbox.click();
  });
  const startButton = [...container.querySelectorAll("button")].find(
    (b) => b.textContent === "録音を始める",
  );
  if (!startButton) throw new Error("「録音を始める」が見つかりません");
  await act(async () => {
    startButton.click();
  });
  await flush();
  return FakeRecorder.instances[0];
}

/**
 * 分ぶん時間を進める（1分ごとに音を流し込む）。
 * 1秒ずつ進めると描画が千回を超えて待ち受け側が無反応になるので、まとめて進める。
 */
async function advanceMinutes(minutes: number) {
  for (let i = 0; i < minutes; i++) {
    await act(async () => {
      FakeRecorder.instances[FakeRecorder.instances.length - 1]?.feed(1_200_000);
      vi.advanceTimersByTime(60_000);
    });
    await flush();
    await flush();
  }
}

const text = () => container.textContent ?? "";

/** 画面のボタンを文字で探して押す。 */
async function press(label: string) {
  const button = [...container.querySelectorAll("button")].find((b) => b.textContent === label);
  if (!button) throw new Error(`「${label}」が見つかりません`);
  await act(async () => {
    button.click();
  });
  await flush();
}

/** 送られた音声を受け取って、文字を返す偽の通信。 */
function recordSends(sent: Blob[]) {
  return (async (_url: string, init: RequestInit) => {
    const file = (init.body as FormData).get("file");
    if (file instanceof Blob) sent.push(file);
    return new Response(JSON.stringify({ text: "本人から相談。" }), { status: 200 });
  }) as unknown as typeof fetch;
}

/** 1秒ごとに 4000 バイトの音を、seconds 秒ぶん流し込む。 */
async function speak(rec: FakeRecorder, seconds: number) {
  for (let i = 0; i < seconds; i++) {
    await act(async () => {
      rec.feed(4000);
      vi.advanceTimersByTime(1000);
    });
  }
}

/** 止まった知らせ（あとから届く）を出し切る。 */
async function deliverStop() {
  await act(async () => {
    vi.advanceTimersByTime(FakeRecorder.STOP_DELAY_MS + 50);
  });
  await flush();
  await flush();
}

describe("動かして確かめる: 録音パネル", () => {
  it("「録音を止めました」と出たら、録音もマイクも本当に止まっている", async () => {
    // 毎回 500 で失敗させる → 3本諦めたところで止まるはず
    const rec = await startRecording(
      (async () => new Response("boom", { status: 500 })) as unknown as typeof fetch,
    );
    expect(rec.state).toBe("recording");

    await advanceMinutes(20); // 20分ぶん（区切り4本ぶん）

    expect(text()).toContain("録音を止めました");
    // ここが審査で壊れていた所: 画面に出るだけで、実物は動き続けていた
    for (const r of FakeRecorder.instances) expect(r.state).toBe("inactive");
    expect(streams[0]?.tracks[0]?.stopped).toBeGreaterThan(0);
  });

  it("止まったあと、送れなかった区切りは番号で知らされる（黙って消えない）", async () => {
    await startRecording(
      (async () => new Response("boom", { status: 500 })) as unknown as typeof fetch,
    );
    await advanceMinutes(20);
    expect(text()).toMatch(/本目が文字になりませんでした/);
  });

  it("マイクから音が来なくなっても、毎秒の作り直しで暴走しない", async () => {
    await startRecording(
      (async () =>
        new Response(JSON.stringify({ text: "ok" }), { status: 200 })) as unknown as typeof fetch,
    );
    await advanceMinutes(6); // まず6分ぶん録る（1本は成立する）
    const before = FakeRecorder.instances.reduce((n, r) => n + r.stops, 0);

    FakeRecorder.silent = true; // ここでマイクが外れる
    await advanceMinutes(8); // 無音のまま8分

    const after = FakeRecorder.instances.reduce((n, r) => n + r.stops, 0);
    // 5分区切りなので、8分なら増えるのは1〜2回のはず（毎秒なら480回になる）
    expect(after - before).toBeLessThan(5);
    expect(text()).toContain("音が入っていません");
  });

  it("やり直しは間を空ける（同じ音声を0ミリ秒で連打しない）", async () => {
    const at: number[] = [];
    await startRecording((async () => {
      at.push(Date.now());
      return new Response("boom", { status: 500 });
    }) as unknown as typeof fetch);

    await advanceMinutes(8); // 区切り1本ぶん＋やり直し

    expect(at.length).toBeGreaterThanOrEqual(2);
    const gaps = at.slice(1).map((t, i) => t - at[i]);
    // 0ミリ秒の連打をしていない（審査では 0, 0, 0 だった）
    expect(Math.max(...gaps)).toBeGreaterThan(0);
  });

  it("短い録音を「録音を終える」で止めると、録った音声がまるごと1本で送られる（最後の1秒だけにならない）", async () => {
    const sent: Blob[] = [];
    const rec = await startRecording(recordSends(sent));
    await speak(rec, 30);

    await press("録音を終える");
    await deliverStop();

    // 2026-10-26 の壊れ方: 終えた直後に片付けて30秒ぶんを捨て、最後の1秒（1000バイト）だけを送っていた
    expect(sent).toHaveLength(1);
    expect(sent[0]?.size).toBe(30 * 4000 + 1000);
    expect(text()).not.toMatch(/本目が文字になりませんでした/);
    // 送り終えたら、マイクを離して待機に戻る
    expect(streams[0]?.tracks[0]?.stopped).toBeGreaterThan(0);
    expect(text()).toContain("録音を始める");
  });

  it("一時停止してから終えても、それまでの音声がまるごと送られる", async () => {
    const sent: Blob[] = [];
    const rec = await startRecording(recordSends(sent));
    await speak(rec, 20);
    await press("一時停止");

    await press("録音を終える");
    await deliverStop();

    expect(sent).toHaveLength(1);
    expect(sent[0]?.size).toBe(20 * 4000 + 1000);
    expect(text()).toContain("録音を始める");
  });

  it("止まりきるまでは「録音を始める」に戻らない（止めている途中で次の録音を始めさせない）", async () => {
    const rec = await startRecording(recordSends([]));
    await speak(rec, 5);

    await press("録音を終える");
    // まだ止まった知らせが届いていない
    expect(text()).not.toContain("録音を始める");
    await deliverStop();
    expect(text()).toContain("録音を始める");
  });

  it("区切りを作り直している途中で終えても、その区切りが送られ、録音は始め直さない", async () => {
    const sent: Blob[] = [];
    const rec = await startRecording(recordSends(sent));
    // 5分目で区切りの作り直しが始まる（止まった知らせはまだ届いていない）
    await speak(rec, 300);
    expect(rec.stops).toBe(1);
    expect(rec.state).toBe("inactive");

    await press("録音を終える");
    await deliverStop();

    expect(sent).toHaveLength(1);
    expect(sent[0]?.size).toBe(300 * 4000 + 1000);
    expect(rec.starts).toBe(1); // 終えたあとで始め直していない
    expect(streams[0]?.tracks[0]?.stopped).toBeGreaterThan(0);
    expect(text()).toContain("録音を始める");
  });

  it("録音の部品が自分で止まっていた（マイクが外れた等）ときも、録れていた分を送って待機に戻る", async () => {
    const sent: Blob[] = [];
    const rec = await startRecording(recordSends(sent));
    await speak(rec, 10);
    // ブラウザが自分で録音を止めた（最後のかたまりを渡して止まる）
    await act(async () => {
      rec.state = "inactive";
      rec.ondataavailable?.({ data: new Blob(["x".repeat(1000)]) });
      rec.onstop?.();
    });

    await press("録音を終える");
    await deliverStop();

    expect(sent).toHaveLength(1);
    expect(sent[0]?.size).toBe(10 * 4000 + 1000);
    expect(text()).toContain("録音を始める");
  });

  it("うまくいけば、文字が呼び出し側へ渡る", async () => {
    const got: string[] = [];
    vi.stubGlobal(
      "fetch",
      (async () =>
        new Response(JSON.stringify({ text: "本人から相談。" }), {
          status: 200,
        })) as unknown as typeof fetch,
    );
    const { default: RecordingPanel } = await import("./RecordingPanel");
    root = createRoot(container);
    await act(async () => {
      root?.render(<RecordingPanel onTranscript={(t) => got.push(t)} />);
    });
    const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
    await act(async () => checkbox?.click());
    const startButton = [...container.querySelectorAll("button")].find(
      (b) => b.textContent === "録音を始める",
    );
    await act(async () => startButton?.click());
    await flush();
    await advanceMinutes(6);
    expect(got).toContain("本人から相談。");
  });
});
