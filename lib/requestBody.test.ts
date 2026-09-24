import { describe, expect, it } from "vitest";
import { REQUEST_PARSE_ERROR_MESSAGE, readJsonObject } from "./requestBody";

/**
 * 入口が受け取る本文の読み方（lib/requestBody.ts）の検査。
 *
 * なぜ必要か（2026-09-24 検収の指摘・作り直し計画 S1）:
 *   本文が JSON の `null` だと `await req.json()` は例外を投げずに null を返し、続く `body.clientId` が
 *   TypeError になって、入口は JSON の無い 500 を返していた。ここで「オブジェクトだけ通す」を固定し、
 *   入口ごとの 400 は tests/api/entryErrors.route.test.ts が縛る。
 */

function req(body: string) {
  return new Request("http://localhost/api/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("readJsonObject: オブジェクトだけを通す", () => {
  it("オブジェクトはそのまま返す", async () => {
    await expect(readJsonObject(req('{"clientId":"c1","n":1}'))).resolves.toEqual({
      clientId: "c1",
      n: 1,
    });
  });

  it("空のオブジェクトも返す（欄の有無は入口が確かめる）", async () => {
    await expect(readJsonObject(req("{}"))).resolves.toEqual({});
  });

  it.each([
    ["JSON の null", "null"],
    ["配列", '[{"clientId":"c1"}]'],
    ["空の配列", "[]"],
    ["文字列", '"c1"'],
    ["数値", "42"],
    ["真偽値", "true"],
    ["JSON として読めない", "{not json"],
    ["空の本文", ""],
  ])("%s なら null（例外を投げない）", async (_name, body) => {
    await expect(readJsonObject(req(body))).resolves.toBeNull();
  });

  it("入口が返す言葉は、以前からの「リクエストの解析に失敗しました。」のまま", () => {
    expect(REQUEST_PARSE_ERROR_MESSAGE).toBe("リクエストの解析に失敗しました。");
  });
});
