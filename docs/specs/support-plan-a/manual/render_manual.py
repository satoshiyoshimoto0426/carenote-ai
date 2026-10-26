"""就労A型の計画書の使い方マニュアル（manual.html）から、配布用の PDF と「画面で読む版」を作る道具。

なぜこの形か:
  試行版の URL は公開のリポジトリに書かない決まり（docs/specs/support-plan-a/DEPLOY.md §3・tests/noRealDeploymentUrl.test.ts）。
  manual.html には差し込み口だけを置き、ここで --url を差し込む（差し込んだものはリポジトリの外にだけ書く）。
  1つの元から2つの形を作るので、文言を直すのは manual.html の1か所だけで済む。
    ・PDF（--out）: 画面で読む版だけの見た目（<style id="screen-only">）を外し、Paged.js（ページ組み・ページ番号）を足して、
      Chrome で組み終わるのを待ってから印刷する。
    ・画面で読む版（--web-out）: claude.ai の Artifact に載せる形。Artifact は公開時に <html>・<head>・<body> を自分で付けるので、
      それらの札を外した本文と図（img/）をフォルダに書き出す（2026-10-23 吉本さんの依頼「仲間に見せる」）。

使い方（carenote-ai の根で）:
  python docs/specs/support-plan-a/manual/render_manual.py --url https://<試行版の URL> --out <出力.pdf> --web-out <フォルダ>

要るもの: PDF には Python の playwright（Chrome を channel="chrome" で使う）と pymupdf（ページ数の確認）。
"""

import argparse
import pathlib
import re
import shutil
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
PLACEHOLDER = "{{PILOT_URL}}"
SCREEN_ONLY = re.compile(r'<style id="screen-only">.*?</style>\n', re.S)
PAGED_JS = (
    '<script>window.PagedConfig = { auto: true, after: () => '
    '{ document.documentElement.dataset.paged = "done"; } };</script>\n'
    '<script src="https://cdn.jsdelivr.net/npm/pagedjs@0.4.3/dist/paged.polyfill.min.js"></script>\n'
)
# Artifact が公開時に付ける骨組みと重なる札（外さないと <html> が二重になる）
SKELETON_TAGS = re.compile(r'<!doctype html>\n|<html lang="ja">\n|</html>\n?|<head>\n|</head>\n|<body>\n|</body>\n|<meta charset="utf-8">\n')


def pdf_html(html: str) -> str:
    """PDF 用: 画面で読む版だけの見た目を外し、Paged.js を足す。外す所が見つからなければ止める（PDF の見た目が変わるのを防ぐ）。"""
    html, n = SCREEN_ONLY.subn("", html)
    if n != 1:
        raise SystemExit(f'manual.html の <style id="screen-only"> が1つではありません（{n} 個）')
    if html.count("</head>") != 1:
        raise SystemExit("manual.html の </head> が1つではありません")
    return html.replace("</head>", PAGED_JS + "</head>")


def web_html(html: str) -> str:
    """画面で読む版: Artifact の骨組みと重なる札を外す。"""
    out = SKELETON_TAGS.sub("", html)
    if "<html" in out or "<body" in out or "<head" in out:
        raise SystemExit("manual.html の骨組みの札が外しきれていません（render_manual.py の SKELETON_TAGS を直す）")
    return out


def render_pdf(html: str, out: pathlib.Path) -> None:
    import fitz
    from playwright.sync_api import sync_playwright

    work = pathlib.Path(tempfile.mkdtemp(prefix="spa-manual-"))
    try:
        shutil.copytree(HERE / "img", work / "img")
        src = work / "manual.html"
        src.write_text(pdf_html(html), encoding="utf-8")
        with sync_playwright() as p:
            browser = p.chromium.launch(channel="chrome")
            page = browser.new_page(color_scheme="light")
            page.goto(src.as_uri(), wait_until="networkidle")
            page.wait_for_function("document.documentElement.dataset.paged === 'done'", timeout=60000)
            page.wait_for_timeout(500)
            page.pdf(path=str(out), prefer_css_page_size=True, print_background=True)
            browser.close()
        print(f"PDF {len(fitz.open(str(out)))} ページ -> {out}")
    finally:
        shutil.rmtree(work, ignore_errors=True)


def main() -> None:
    ap = argparse.ArgumentParser(description="使い方マニュアルを PDF と画面で読む版にする")
    ap.add_argument("--url", required=True, help="試行版の URL（出力にだけ入れる）")
    ap.add_argument("--out", help="出力する PDF のパス")
    ap.add_argument("--web-out", help="画面で読む版を書き出すフォルダ（manual-web.html と img/）")
    args = ap.parse_args()
    if not args.out and not args.web_out:
        ap.error("--out か --web-out のどちらかを指定してください")

    html = (HERE / "manual.html").read_text(encoding="utf-8")
    if PLACEHOLDER not in html:
        raise SystemExit("manual.html に URL の差し込み口がありません")
    html = html.replace(PLACEHOLDER, args.url.rstrip("/"))

    if args.out:
        render_pdf(html, pathlib.Path(args.out).resolve())
    if args.web_out:
        web = pathlib.Path(args.web_out).resolve()
        web.mkdir(parents=True, exist_ok=True)
        shutil.copytree(HERE / "img", web / "img", dirs_exist_ok=True)
        (web / "manual-web.html").write_text(web_html(html), encoding="utf-8")
        print(f"画面で読む版 -> {web / 'manual-web.html'}")


if __name__ == "__main__":
    main()
