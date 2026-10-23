"""就労A型の計画書の使い方マニュアル（manual.html）を PDF にする道具。

なぜこの形か:
  試行版の URL は公開のリポジトリに書かない決まり（docs/specs/support-plan-a/DEPLOY.md §3・tests/noRealDeploymentUrl.test.ts）。
  manual.html には差し込み口 {{PILOT_URL}} だけを置き、PDF にするときに --url で差し込む（差し込んだ HTML は一時フォルダに書き、
  リポジトリには残さない）。ページ組みは Paged.js（目次・ページ番号）なので、Chrome で開いて組み終わるのを待ってから印刷する。

使い方（carenote-ai の根で）:
  python docs/specs/support-plan-a/manual/render_manual.py --url https://<試行版の URL> --out <出力.pdf>

要るもの: Python の playwright（Chrome を channel="chrome" で使う）と pymupdf（ページ数の確認）。
"""

import argparse
import pathlib
import shutil
import tempfile

import fitz
from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent


def main() -> None:
    ap = argparse.ArgumentParser(description="使い方マニュアルを PDF にする")
    ap.add_argument("--url", required=True, help="試行版の URL（PDF にだけ入れる）")
    ap.add_argument("--out", required=True, help="出力する PDF のパス")
    args = ap.parse_args()

    html = (HERE / "manual.html").read_text(encoding="utf-8")
    if "{{PILOT_URL}}" not in html:
        raise SystemExit("manual.html に差し込み口 {{PILOT_URL}} がありません")
    work = pathlib.Path(tempfile.mkdtemp(prefix="spa-manual-"))
    try:
        shutil.copytree(HERE / "img", work / "img")
        src = work / "manual.html"
        src.write_text(html.replace("{{PILOT_URL}}", args.url), encoding="utf-8")
        out = pathlib.Path(args.out).resolve()
        with sync_playwright() as p:
            browser = p.chromium.launch(channel="chrome")
            page = browser.new_page()
            page.goto(src.as_uri(), wait_until="networkidle")
            page.wait_for_function("document.documentElement.dataset.paged === 'done'", timeout=60000)
            page.wait_for_timeout(500)
            page.pdf(path=str(out), prefer_css_page_size=True, print_background=True)
            browser.close()
        doc = fitz.open(str(out))
        print(f"pages {len(doc)} -> {out}")
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    main()
