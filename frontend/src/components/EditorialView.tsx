// Editorial — the landing view. Ported from tldr-web/prototype.jsx EditorialView.
//
// Layout: left EDITION RAIL · masthead (big edition name + "DATE · ISSUE #",
// then subtitle/dek) · category SectionHead + ContentItem list, sections in the
// backend's CAT_ORDER (the API already orders IssueDetail.sections that way).
//
// Data: the edition's issues come from GET /issues?edition= (newest first); the
// IssueNav pages through that list by index. The selected issue's full detail is
// GET /issues/{id}. On first paint the latest issue (index 0) renders.

import { useEffect, useMemo, useState } from "react";
import { useIssue, useIssues, useMarkIssueRead } from "../api/queries";
import { formatMastheadDate } from "../format";
import type { Edition } from "../types";
import { ContentItem } from "./ContentItem";
import { IssueNav } from "./IssueNav";
import { SectionHead } from "./SectionHead";

// Catch-up unread marker (ADR-0002). Inline-styled so recall.css stays untouched.
function UnreadDot({ size = 8 }: { size?: number }) {
  return (
    <span
      aria-label="unread"
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        background: "var(--accent)",
        flex: "none",
      }}
    />
  );
}

// Rail order matches shot.png: TLDR, TLDR Founders, TLDR AI.
const RAIL_ORDER = ["tldr", "founders", "ai"];

function orderedEditions(editions: Edition[]): Edition[] {
  const byKey = new Map(editions.map((e) => [e.key, e]));
  const ranked = RAIL_ORDER.map((k) => byKey.get(k)).filter((e): e is Edition => e != null);
  // Append any editions not in the known order, preserving backend order.
  const extra = editions.filter((e) => !RAIL_ORDER.includes(e.key));
  return [...ranked, ...extra];
}

export function EditorialView({
  editions,
  edition,
  onSetEdition,
  mob = false,
}: {
  editions: Edition[];
  edition: string;
  onSetEdition: (key: string) => void;
  mob?: boolean;
}) {
  const railEditions = useMemo(() => orderedEditions(editions), [editions]);

  // The list of this edition's issues, newest first. Drives the IssueNav.
  const issuesQuery = useIssues(edition);
  const issues = issuesQuery.data?.items ?? [];

  // Index into `issues`; 0 == latest. Reset to latest whenever the edition changes.
  const [issueIdx, setIssueIdx] = useState(0);
  useEffect(() => {
    setIssueIdx(0);
  }, [edition]);

  // Clamp the index if the list shrinks (defensive).
  const safeIdx = issues.length ? Math.min(issueIdx, issues.length - 1) : 0;
  const currentSummary = issues[safeIdx];
  const detailQuery = useIssue(currentSummary?.id ?? null);
  const detail = detailQuery.data;

  // Mark-on-view (ADR-0002): fire PUT /issues/{id}/read when an issue is DISPLAYED. The
  // mutation invalidates the issues query so the unread markers refresh. Idempotent, so the
  // StrictMode double-invoke in dev is harmless.
  const markRead = useMarkIssueRead();
  useEffect(() => {
    if (currentSummary?.id) markRead.mutate(currentSummary.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSummary?.id]);

  // Unread markers. The current issue's summary read_state drives the issue-nav dot; the
  // rail dots come from each edition's unread_count on GET /editions (#19) — every edition,
  // not just the selected one — refreshed when useMarkIssueRead settles.
  const currentUnread = currentSummary?.read_state === "unread";

  // IssueNav semantics: "next" = newer (toward index 0), "prev" = older.
  const canNewer = safeIdx > 0;
  const canOlder = issues.length > 0 && safeIdx < issues.length - 1;

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: mob ? "0 14px" : "0 28px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          // mobile stacks: edition pill-row on top, body full-width below
          flexDirection: mob ? "column" : "row",
          gap: mob ? 0 : 60,
          padding: mob ? "20px 0 60px" : "40px 0 90px",
        }}
      >
        {mob ? (
          // mobile: horizontal scrolling pill row above the body
          <nav
            style={{
              display: "flex",
              flexDirection: "row",
              gap: 8,
              overflowX: "auto",
              width: "100%",
              paddingBottom: 6,
              marginBottom: 18,
              WebkitOverflowScrolling: "touch",
            }}
          >
            {railEditions.map((e) => {
              const on = edition === e.key;
              // Cross-edition glance (#19): dot on every edition with unread issues.
              const showDot = e.unread_count > 0;
              return (
                <button
                  key={e.key}
                  onClick={() => onSetEdition(e.key)}
                  className={"rc-chip" + (on ? " accent on" : "")}
                  style={{
                    padding: "7px 15px",
                    fontSize: 14.5,
                    fontWeight: on ? 700 : 600,
                    letterSpacing: "-0.01em",
                    flex: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {e.name}
                  {showDot && <UnreadDot size={7} />}
                </button>
              );
            })}
          </nav>
        ) : (
          // desktop: vertical edition rail — left-aligned with the logo
          <nav
            style={{
              width: 168,
              flex: "none",
              position: "sticky",
              top: 84,
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            {railEditions.map((e) => {
              const on = edition === e.key;
              // Cross-edition glance (#19): dot on every edition with unread issues.
              const showDot = e.unread_count > 0;
              return (
                <button
                  key={e.key}
                  onClick={() => onSetEdition(e.key)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    font: "inherit",
                    textAlign: "left",
                    padding: "8px 0",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    color: on ? "var(--ink)" : "var(--ink-4)",
                    transition: "color .12s",
                  }}
                  onMouseEnter={(ev) => {
                    if (!on) ev.currentTarget.style.color = "var(--ink-2)";
                  }}
                  onMouseLeave={(ev) => {
                    if (!on) ev.currentTarget.style.color = "var(--ink-4)";
                  }}
                >
                  <span
                    style={{
                      fontSize: 17,
                      fontWeight: on ? 700 : 600,
                      letterSpacing: "-0.02em",
                      color: on ? "var(--accent)" : "inherit",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 7,
                    }}
                  >
                    {e.name}
                    {showDot && <UnreadDot size={7} />}
                  </span>
                </button>
              );
            })}
          </nav>
        )}

        {/* body — fixed reading column on desktop, full-width on mobile */}
        <div style={{ width: mob ? "100%" : 668, maxWidth: "100%" }}>
          {detail ? (
            <>
              {/* masthead */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 16,
                  marginBottom: 14,
                }}
              >
                <div
                  className="mono"
                  style={{
                    fontSize: 12.5,
                    color: "var(--ink-4)",
                    letterSpacing: ".06em",
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatMastheadDate(detail.issue.published_at).toUpperCase()}
                  {detail.issue.issue_number ? ` · ISSUE ${detail.issue.issue_number}` : ""}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {currentUnread && <UnreadDot size={8} />}
                  <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <IssueNav
                      dir="prev"
                      disabled={!canOlder}
                      onClick={() => setIssueIdx((i) => i + 1)}
                    />
                    <IssueNav
                      dir="next"
                      disabled={!canNewer}
                      onClick={() => setIssueIdx((i) => Math.max(0, i - 1))}
                    />
                  </div>
                </div>
              </div>
              <h1
                style={{
                  fontSize: mob ? 38 : 50,
                  fontWeight: 800,
                  letterSpacing: "-0.045em",
                  margin: "0 0 16px",
                  lineHeight: 1,
                }}
              >
                {detail.issue.edition.name}
              </h1>
              {detail.issue.subtitle && (
                <p
                  style={{
                    fontSize: 19.5,
                    lineHeight: 1.5,
                    color: "var(--ink-2)",
                    margin: 0,
                    fontWeight: 500,
                    textWrap: "pretty",
                    maxWidth: 600,
                  }}
                >
                  {detail.issue.subtitle}
                </p>
              )}

              {detail.sections.map((section) => (
                <section key={section.category.slug}>
                  <SectionHead category={section.category} />
                  {section.content.map((it) => (
                    <ContentItem key={it.id} it={it} />
                  ))}
                </section>
              ))}
            </>
          ) : detailQuery.isError || issuesQuery.isError ? (
            <div style={{ padding: "60px 0", color: "var(--ink-3)", fontSize: 14.5 }}>
              Could not load this edition.
            </div>
          ) : (
            <div style={{ padding: "60px 0", color: "var(--ink-4)", fontSize: 14.5 }}>
              <span className="rc-spin" style={{ marginRight: 10 }} />
              Loading…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
