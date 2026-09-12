import { describe, expect, it } from "vitest";
import { isBlobUrl, MAX_SOURCE_DOCS, parseSourceDocs, safeExtension } from "./sourceDocs";

const BLOB = "https://abc123.private.blob.vercel-storage.com/intake/1.pdf";

describe("SSRF 許可リスト: isBlobUrl", () => {
  it("自前の非公開ストア（https・*.private.blob.vercel-storage.com）だけを許す", () => {
    expect(isBlobUrl(BLOB)).toBe(true);
    expect(isBlobUrl("https://x.private.blob.vercel-storage.com/a.png")).toBe(true);
    // 公開ストアは受け付けない（D6: 原本を公開の場所に置かない）
    expect(isBlobUrl("https://x.public.blob.vercel-storage.com/a.png")).toBe(false);
  });

  it("他ホスト・http・ホスト名の偽装・壊れた URL は拒否する", () => {
    expect(isBlobUrl("https://evil.example.com/a.pdf")).toBe(false);
    expect(isBlobUrl("http://abc.private.blob.vercel-storage.com/a.pdf")).toBe(false);
    expect(isBlobUrl("https://blob.vercel-storage.com.evil.com/a.pdf")).toBe(false);
    expect(isBlobUrl("https://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isBlobUrl("not a url")).toBe(false);
  });
});

describe("提供書類の取り出し: parseSourceDocs", () => {
  it("無ければ空配列、配列でなければ null", () => {
    expect(parseSourceDocs(undefined)).toEqual([]);
    expect(parseSourceDocs(null)).toEqual([]);
    expect(parseSourceDocs("x")).toBeNull();
  });

  it("許可外ホスト・不正な形式・件数超過は null（400）", () => {
    expect(parseSourceDocs([{ name: "a.pdf", url: "https://evil.example.com/a.pdf" }])).toBeNull();
    expect(parseSourceDocs([{ name: "a.txt", url: BLOB, contentType: "text/plain" }])).toBeNull();
    expect(parseSourceDocs([{ name: "a.exe", url: BLOB }])).toBeNull();
    const many = Array.from({ length: MAX_SOURCE_DOCS + 1 }, () => ({ name: "a.pdf", url: BLOB }));
    expect(parseSourceDocs(many)).toBeNull();
  });

  it("PDF は拡張子から補完し、画像は contentType が要る。種別は許可リスト外なら「その他」", () => {
    expect(
      parseSourceDocs([
        { name: "a.pdf", url: BLOB },
        { name: "b.jpg", url: BLOB, contentType: "image/jpeg", docType: "主治医意見書" },
        { name: "c.png", url: BLOB, contentType: "image/png", docType: "なんでも" },
      ]),
    ).toEqual([
      { name: "a.pdf", url: BLOB, contentType: "application/pdf", docType: "その他" },
      { name: "b.jpg", url: BLOB, contentType: "image/jpeg", docType: "主治医意見書" },
      { name: "c.png", url: BLOB, contentType: "image/png", docType: "その他" },
    ]);
  });
});

describe("safeExtension: 一時保管先の名前に元ファイル名を出さない", () => {
  it("拡張子だけを小文字英数字で返し、無ければ bin", () => {
    expect(safeExtension("山田花子_主治医意見書.PDF")).toBe("pdf");
    expect(safeExtension("写真.jpeg")).toBe("jpeg");
    expect(safeExtension("noext")).toBe("bin");
    expect(safeExtension("a.b.c.png")).toBe("png");
  });
});
