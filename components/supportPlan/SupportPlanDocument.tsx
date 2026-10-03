import { Fragment } from "react";
import {
  type Pair,
  SUPPORT_PLAN_A_CHAPTERS,
  SUPPORT_PLAN_A_INTROS,
  type SupportPlanAView,
} from "@/lib/supportPlan/format";

/**
 * 就労A型の個別支援計画書を、事業所の様式（表紙・目次・10章）どおりに描く部品。
 *
 * なぜあるか: 営業チームの依頼（2026-10-03）の「様式に忠実に準拠」を、印刷画面と PDF で同じ形で出すため。
 * 何を描くか: lib/supportPlan/format.ts の buildSupportPlanAView が作った値だけを描く（ここで値を作らない）。
 * 見た目: components/supportPlan/printCss.ts（SUPPORT_PLAN_PRINT_CSS）。ページ組みは Paged.js が行う
 *   （目次のページ番号・右上の章名・下のページ番号）。この部品はページ組みの前の HTML を出すだけ。
 * 何と繋がるか: 試験で PDF を作る道具 scripts/supportPlanA.itest.ts。
 */
export default function SupportPlanDocument({ view }: { view: SupportPlanAView }) {
  const chapter = (n: number) => (
    <h2 className="sec" id={`s${n}`}>
      {SUPPORT_PLAN_A_CHAPTERS[n - 1]}
    </h2>
  );
  const intro = (n: number) =>
    SUPPORT_PLAN_A_INTROS[n] ? <div className="intro">{SUPPORT_PLAN_A_INTROS[n]}</div> : null;
  const kv = (rows: readonly Pair[], wide = false) => (
    <table className={wide ? "kv2 wide" : "kv2"}>
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <th>{label}</th>
            <td className="lines">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  const lined = (rows: { label: string; lines: string[] }[]) => (
    <table className="kv2">
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <th>{r.label}</th>
            <td>
              {r.lines.map((line, i) => (
                <Fragment key={line}>
                  {i > 0 ? <br /> : null}
                  {line}
                </Fragment>
              ))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const goalCard = (goal: SupportPlanAView["shortTerms"][number]) => (
    <div className="goal" key={goal.heading}>
      <h4>{goal.heading}</h4>
      {kv(goal.rows, true)}
    </div>
  );

  return (
    <>
      <section className="cover">
        <div className="kind">{view.cover.kind}</div>
        <h1>{view.cover.title}</h1>
        <div className="who">{view.cover.who}</div>
        <div className="box">
          {view.cover.rows.map(([label, value]) => (
            <div className="row" key={label}>
              <span>{label}</span>
              <span className="v">{value}</span>
            </div>
          ))}
        </div>
        <div className="foot">
          {view.cover.foot.map((line, i) => (
            <Fragment key={line}>
              {i > 0 ? <br /> : null}
              {line}
            </Fragment>
          ))}
        </div>
      </section>

      <h2 className="toc-title sec">目次</h2>
      <ul className="toc">
        {SUPPORT_PLAN_A_CHAPTERS.map((title, i) => (
          <li key={title}>
            <a href={`#s${i + 1}`}>{title}</a>
          </li>
        ))}
      </ul>

      {chapter(1)}
      <table className="kv4">
        <tbody>
          {view.basic.rows.map(([l1, v1, l2, v2]) => (
            <tr key={l1}>
              <th>{l1}</th>
              <td>{v1}</td>
              <th>{l2}</th>
              <td>{v2}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="note">{view.basic.note}</div>

      {chapter(2)}
      {intro(2)}
      {kv(view.intentions)}

      {chapter(3)}
      {intro(3)}
      {view.needs.map((group) => (
        <div className="keep" key={group.title}>
          <h3>{group.title}</h3>
          <table className="needs">
            <thead>
              <tr>
                <th>課題</th>
                <th>本人のニーズ・支援の方向性</th>
              </tr>
            </thead>
            <tbody>
              {group.rows.map((row) => (
                <tr key={row.key}>
                  <td>{row.issue}</td>
                  <td>{row.direction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {chapter(4)}
      {intro(4)}
      {kv(view.policy)}

      {chapter(5)}
      {intro(5)}
      {kv(view.longTerm)}

      <div className="keep">
        {chapter(6)}
        {intro(6)}
        {goalCard(view.shortTerms[0])}
      </div>
      {view.shortTerms.slice(1).map(goalCard)}

      {chapter(7)}
      {lined(view.service)}

      {chapter(8)}
      {intro(8)}
      {lined(view.liaison)}

      {chapter(9)}
      <table className="kv2">
        <tbody>
          <tr>
            <th>モニタリングの時期</th>
            <td>{view.monitoring.timing}</td>
          </tr>
          <tr>
            <th>モニタリングの方法</th>
            <td>
              <ul className="dots">
                {view.monitoring.methods.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </td>
          </tr>
          <tr>
            <th>計画見直しの基準</th>
            <td>{view.monitoring.criteria}</td>
          </tr>
        </tbody>
      </table>
      <div className="note">{view.monitoring.note}</div>

      {chapter(10)}
      {lined(view.consent)}
      <div className="source">{view.source}</div>
    </>
  );
}
