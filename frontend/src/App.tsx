// Recall app root (#3 — the real Editorial UI port).
// Owns view + edition state, wires persisted dark-mode prefs, and renders the
// recall.css design system. The app root carries className "rc app" (+" dark")
// so the .rc / .rc.dark CSS variables apply.

import { useState } from "react";
import "./styles/recall.css";
import { useEditions } from "./api/queries";
import { EditorialView } from "./components/EditorialView";
import { PlaceholderView } from "./components/PlaceholderView";
import { TopBar } from "./components/TopBar";
import type { View } from "./components/TopBar";
import { usePrefs } from "./usePrefs";

export default function App() {
  const { prefs, toggleDark, setEdition } = usePrefs();
  const [view, setView] = useState<View>("editorial");

  const editionsQuery = useEditions();
  const editions = editionsQuery.data ?? [];

  const go = (v: View) => {
    setView(v);
    window.scrollTo({ top: 0 });
  };

  const setEditionAndScroll = (key: string) => {
    setEdition(key);
    window.scrollTo({ top: 0 });
  };

  return (
    <div
      className={"rc app" + (prefs.dark ? " dark" : "")}
      style={{ minHeight: "100vh", background: "var(--paper)" }}
    >
      <TopBar view={view} onGo={go} dark={prefs.dark} onToggleDark={toggleDark} />
      <main>
        {view === "editorial" &&
          (editions.length > 0 ? (
            <EditorialView
              editions={editions}
              edition={prefs.edition}
              onSetEdition={setEditionAndScroll}
            />
          ) : editionsQuery.isError ? (
            <div style={{ maxWidth: 1180, margin: "0 auto", padding: "60px 28px", color: "var(--ink-3)" }}>
              Could not reach the backend. Is the API running?
            </div>
          ) : (
            <div style={{ maxWidth: 1180, margin: "0 auto", padding: "60px 28px", color: "var(--ink-4)" }}>
              <span className="rc-spin" style={{ marginRight: 10 }} />
              Loading editions…
            </div>
          ))}
        {view === "library" && (
          <PlaceholderView
            title="Library"
            note="Your saved-content library with filters lands in a later milestone."
          />
        )}
        {view === "search" && (
          <PlaceholderView
            title="Smart search"
            note="Ask your library in plain English — semantic search lands in a later milestone."
          />
        )}
      </main>
    </div>
  );
}
