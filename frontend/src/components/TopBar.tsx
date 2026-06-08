// Top bar — present on every view. Ported from tldr-web/prototype.jsx TopBar.
// #3 scope: Editorial is the real view; Library/Search route to placeholders.
// The account 'user' icon opens a non-functional Account stub panel.

import { useEffect, useRef, useState } from "react";
import { Ico, Logo } from "./atoms";
import type { IcoName } from "./atoms";

export type View = "editorial" | "library" | "search";

function IconBtn({
  name,
  on = false,
  onClick,
  title,
}: {
  name: IcoName;
  on?: boolean;
  onClick?: () => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        position: "relative",
        width: 38,
        height: 38,
        borderRadius: 9,
        border: "1px solid " + (on ? "var(--ink)" : "transparent"),
        background: on ? "var(--ink)" : "transparent",
        color: on ? "var(--paper)" : "var(--ink-2)",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "background .12s, color .12s, border-color .12s",
      }}
      onMouseEnter={(e) => {
        if (!on) e.currentTarget.style.background = "var(--surface-2)";
      }}
      onMouseLeave={(e) => {
        if (!on) e.currentTarget.style.background = "transparent";
      }}
    >
      <Ico name={name} s={19} />
    </button>
  );
}

// Non-functional account panel (admin/account wiring is out of scope for #3).
function AccountPanel({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const off = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!ref.current?.contains(t) && !t?.closest("[data-account-btn]")) onClose();
    };
    document.addEventListener("pointerdown", off, true);
    return () => document.removeEventListener("pointerdown", off, true);
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        top: "100%",
        right: 28,
        marginTop: 6,
        zIndex: 30,
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r-md)",
        boxShadow: "var(--shadow-lg)",
        padding: 16,
        minWidth: 240,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 12 }}>
        <span
          style={{
            width: 38,
            height: 38,
            borderRadius: 999,
            background: "var(--surface-2)",
            border: "1px solid var(--line)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--ink-3)",
            flex: "none",
          }}
        >
          <Ico name="user" s={20} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: "var(--ink)" }}>Reader</div>
          <div
            className="mono"
            style={{ fontSize: 11.5, color: "var(--ink-4)", whiteSpace: "nowrap" }}
          >
            stub user
          </div>
        </div>
      </div>
      <div
        style={{
          fontSize: 13,
          color: "var(--ink-3)",
          lineHeight: 1.5,
          borderTop: "1px solid var(--line-2)",
          paddingTop: 12,
        }}
      >
        Account &amp; admin are coming soon.
      </div>
    </div>
  );
}

export function TopBar({
  view,
  onGo,
  dark,
  onToggleDark,
  mob = false,
}: {
  view: View;
  onGo: (v: View) => void;
  dark: boolean;
  onToggleDark: () => void;
  mob?: boolean;
}) {
  const [accountOpen, setAccountOpen] = useState(false);

  const Tab = ({ id, label }: { id: View; label: string }) => (
    <button
      onClick={() => onGo(id)}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        font: "inherit",
        padding: "6px 2px",
        fontSize: 14.5,
        fontWeight: 600,
        letterSpacing: "-0.01em",
        position: "relative",
        color: view === id ? "var(--ink)" : "var(--ink-3)",
        transition: "color .12s",
      }}
    >
      {label}
      <span
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: -19,
          height: 2,
          borderRadius: 2,
          background: view === id ? "var(--ink)" : "transparent",
        }}
      />
    </button>
  );

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        background: "color-mix(in oklch, var(--paper) 86%, transparent)",
        backdropFilter: "saturate(1.4) blur(10px)",
        borderBottom: "1px solid var(--line)",
      }}
    >
      <div
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          height: 60,
          // Tighter gutters on mobile so the nav + icons fit without overflow.
          padding: mob ? "0 14px" : "0 28px",
          display: "flex",
          alignItems: "center",
          gap: mob ? 14 : 26,
        }}
      >
        <button
          onClick={() => onGo("editorial")}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          {/* mobile: drop the TL;DR mark, keep just the "Recall" wordmark */}
          <Logo size={17} mark={!mob} />
        </button>
        <nav style={{ display: "flex", gap: mob ? 14 : 22 }}>
          <Tab id="editorial" label="Editorial" />
          <Tab id="library" label="Library" />
        </nav>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <IconBtn
            name="search"
            title="Smart search"
            on={view === "search"}
            onClick={() => onGo("search")}
          />
          <IconBtn name="filter" title="Filters" onClick={() => onGo("library")} />
          {/* divider hides on mobile (search/filter/theme stay) */}
          {!mob && (
            <div style={{ width: 1, height: 22, background: "var(--line)", margin: "0 6px" }} />
          )}
          <IconBtn name={dark ? "sun" : "moon"} title="Toggle theme" onClick={onToggleDark} />
          {/* account icon hides on mobile to save space — folds into a menu in the
              real build (flagged in the design handoff) */}
          {!mob && (
            <span data-account-btn style={{ display: "inline-flex" }}>
              <IconBtn
                name="user"
                title="Account & admin"
                on={accountOpen}
                onClick={() => setAccountOpen((o) => !o)}
              />
            </span>
          )}
        </div>
      </div>
      {accountOpen && <AccountPanel onClose={() => setAccountOpen(false)} />}
    </header>
  );
}
