"use client";

import { useState } from "react";
import { IconChevronRight, IconHelpCircle } from "@/components/ui/icons";
import { Card, SectionTitle } from "@/components/ui/primitives";
import type { ManualFaq } from "@/lib/manual/content";

/**
 * 使い方ページの「よくある質問」（開閉する一覧）。
 *
 * なぜ切り出すか: 開閉に useState が要るのはここだけ。ページ全体を "use client" にすると
 * 本文145手順ぶんの描画までブラウザ側に回るため、対話が要る部分だけをこのファイルに閉じる
 * （carenote-ai/CLAUDE.md「"use client" は最小限」）。
 */
export default function FaqAccordion({ faq }: { faq: ManualFaq[] }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[var(--muted)]">
          <IconHelpCircle size={17} />
        </span>
        <SectionTitle>よくある質問</SectionTitle>
      </div>
      <div className="divide-y divide-[var(--line-soft)]">
        {faq.map((item) => {
          const isOpen = open === item.q;
          return (
            <div key={item.q}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : item.q)}
                aria-expanded={isOpen}
                className="flex w-full items-start gap-2 py-3 text-left text-sm font-medium text-[var(--ink)] hover:text-[var(--green)]"
              >
                <span
                  className={`mt-0.5 flex-shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`}
                  aria-hidden="true"
                >
                  <IconChevronRight size={15} />
                </span>
                {item.q}
              </button>
              {isOpen ? (
                <p className="pb-3 pl-[23px] text-sm leading-relaxed text-[var(--muted)]">
                  {item.a}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
