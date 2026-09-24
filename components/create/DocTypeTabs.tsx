"use client";

import type { KeyboardEvent } from "react";
import { DOC_ORDER, DOC_TYPE_LABELS } from "@/lib/create/docTypes";
import type { CareDocumentType } from "@/types/document";

/**
 * タブ（role="tab"）の id。中身の側（role="tabpanel"）が aria-labelledby で「どのタブの中身か」を指すのに使う。
 * 使う所: app/(dashboard)/create/page.tsx（中身の区画）と、この下の DocTypeTabs。
 */
export function docTabId(type: CareDocumentType): string {
  return `doc-tab-${type}`;
}

/** 矢印キーで移る先のタブの位置。Home / End は端へ、左右は端で反対側へ回る。移らないキーは null。 */
function nextIndex(key: string, current: number, count: number): number | null {
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "ArrowRight") return (current + 1) % count;
  if (key === "ArrowLeft") return (current - 1 + count) % count;
  return null;
}

/**
 * つくるの「書類の種類」の文字のタブ（A案のアートボード Main.dc.html の左の区画の頭）。
 *
 * なぜ存在するか: 以前は5つの大きなアイコン付きのボタンを白いカードに並べていた（カードを積んだ見た目）。
 * A案では文字だけのタブにし、選んだタブを太字＋下の 2px の線で示す（見た目は app/globals.css の .doc-tab）。
 * 並び順と名前は lib/create/docTypes.ts の DOC_ORDER / DOC_TYPE_LABELS.tab が正本で、ここでは1文字も変えない
 * （マニュアル・撮影の道具 tools/shoot-plans.mjs が「担当者会議（第4表）」などの文字でボタンを探す）。
 *
 * 押したときの動きは呼ぶ側の onSelect（つくるの switchDocType）そのまま ── 以前のボタンと同じ。
 * キーボード: タブの並びに入るのは選んでいるタブだけ（Tab キー1回で並びを抜けられる）。並びの中は ←/→（端で反対側へ）と
 * Home / End で移り、Enter / スペースで選ぶ（矢印で移るだけでは選ばない ── 選ぶと結果の下書きが消えるので、
 * 通り過ぎただけで消えないようにする）。
 * 一式まとめて（救済モード）へのリンクはこの並びの外に置く（タブの並びの中にリンクを入れるのは読み上げの決まりに反する
 * ── 計画の指摘 2026-09-23）。
 *
 * @param value いま選んでいる書類の種類
 * @param onSelect タブを押したときに呼ぶ（引数は押したタブの種類）
 * @param panelId タブの中身の要素の id（aria-controls）
 * テスト: app/(dashboard)/create/page.test.tsx。
 */
export default function DocTypeTabs({
  value,
  onSelect,
  panelId,
}: {
  value: CareDocumentType;
  onSelect: (type: CareDocumentType) => void;
  panelId: string;
}) {
  const moveFocus = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = nextIndex(e.key, index, DOC_ORDER.length);
    if (next === null) return;
    e.preventDefault();
    document.getElementById(docTabId(DOC_ORDER[next]))?.focus();
  };

  return (
    <div role="tablist" aria-label="書類の種類" className="doc-tabs">
      {DOC_ORDER.map((type, index) => {
        const selected = type === value;
        const label = DOC_TYPE_LABELS[type].tab;
        return (
          <button
            key={type}
            id={docTabId(type)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            data-label={label}
            onClick={() => onSelect(type)}
            onKeyDown={(e) => moveFocus(e, index)}
            className="doc-tab"
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
