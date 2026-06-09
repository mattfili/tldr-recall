// Recall app root (#3 Editorial + #4 Library).
// Owns view + edition state, the Library filter state (+ filter panel open), wires persisted
// prefs (dark mode + density), and renders the recall.css design system. The app root carries
// className "rc app" (+" dark") so the .rc / .rc.dark CSS variables apply.

import { useCallback, useMemo, useState } from "react";
import "./styles/recall.css";
import { useCategories, useEditions } from "./api/queries";
import { EditorialView } from "./components/EditorialView";
import { LibraryView } from "./components/LibraryView";
import { PlaceholderView } from "./components/PlaceholderView";
import { TopBar } from "./components/TopBar";
import type { View } from "./components/TopBar";
import type { LibraryFilters } from "./types";
import { useMobile } from "./useMobile";
import { usePrefs } from "./usePrefs";

const EMPTY_FILTERS: LibraryFilters = {
  types: [],
  editions: [],
  categories: [],
  starredOnly: false,
};

type Dim = "types" | "editions" | "categories";

export default function App() {
  const { prefs, toggleDark, setEdition, setDensity } = usePrefs();
  const [view, setView] = useState<View>("editorial");
  const mob = useMobile();

  // Library filter state lives here (the prototype kept it in App context).
  const [filters, setFilters] = useState<LibraryFilters>(EMPTY_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);

  const editionsQuery = useEditions();
  const editionsData = editionsQuery.data;
  const editions = useMemo(() => editionsData ?? [], [editionsData]);
  const categoriesQuery = useCategories();
  const categoriesData = categoriesQuery.data;
  const categories = useMemo(() => categoriesData ?? [], [categoriesData]);

  const filterCount =
    filters.types.length +
    filters.editions.length +
    filters.categories.length +
    (filters.starredOnly ? 1 : 0);

  const go = (v: View) => {
    setView(v);
    window.scrollTo({ top: 0 });
  };

  const setEditionAndScroll = (key: string) => {
    setEdition(key);
    window.scrollTo({ top: 0 });
  };

  // Filter icon: open the FilterPanel; if not already on Library, switch to it too
  // (preserves the old "filter routes to library" behavior AND opens the panel).
  const onToggleFilter = useCallback(() => {
    setFilterOpen((open) => {
      const next = !open;
      if (next && view !== "library") {
        setView("library");
        window.scrollTo({ top: 0 });
      }
      return next;
    });
  }, [view]);

  const toggleFilterVal = useCallback((dim: Dim, val: string) => {
    setFilters((f) => {
      const cur = f[dim];
      const next = cur.includes(val) ? cur.filter((v) => v !== val) : [...cur, val];
      return { ...f, [dim]: next };
    });
  }, []);

  const toggleStarredOnly = useCallback(
    () => setFilters((f) => ({ ...f, starredOnly: !f.starredOnly })),
    [],
  );

  const clearFilters = useCallback(() => setFilters(EMPTY_FILTERS), []);

  const filterPanelProps = useMemo(
    () => ({
      editions,
      categories,
      filters,
      onToggleVal: toggleFilterVal,
      onToggleStarred: toggleStarredOnly,
      onClear: clearFilters,
    }),
    [editions, categories, filters, toggleFilterVal, toggleStarredOnly, clearFilters],
  );

  return (
    <div
      className={"rc app" + (prefs.dark ? " dark" : "")}
      style={{ minHeight: "100vh", background: "var(--paper)" }}
    >
      <TopBar
        view={view}
        onGo={go}
        dark={prefs.dark}
        onToggleDark={toggleDark}
        filterOpen={filterOpen}
        onToggleFilter={onToggleFilter}
        filterCount={filterCount}
        filterPanelProps={filterPanelProps}
        mob={mob}
      />
      <main>
        {view === "editorial" &&
          (editions.length > 0 ? (
            <EditorialView
              editions={editions}
              edition={prefs.edition}
              onSetEdition={setEditionAndScroll}
              mob={mob}
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
          <LibraryView
            filters={filters}
            density={prefs.density}
            onSetDensity={setDensity}
            onClearFilters={clearFilters}
            filterCount={filterCount}
            mob={mob}
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
