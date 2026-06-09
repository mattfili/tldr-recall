// FilterPanel — the Library filter bar. Ported from tldr-web/prototype.jsx FilterPanel.
//
// ADR-0001 filter model: dimensions AND together, values within a dimension OR
// (multi-select chips). The four dimensions:
//  - Type     (content_type; the prototype's "Source"/"sources" group, RENAMED to Type/types)
//  - Edition  (has-appearance-in; edition keys, from GET /editions)
//  - Category (has-appearance-in; category slugs, from GET /categories in CAT_ORDER)
//  - Starred only (the stub user's starred Content)
//
// No App context in this codebase: filter state lives in App and is threaded down as props.
// Uses the existing rc-chip class (recall.css is BYTE-IDENTICAL — never edited); the only
// responsiveness is via the `mob` prop (tighter gutters), matching TopBar/EditorialView.

import type { CategoryRef, Edition, LibraryFilters } from "../types";
import { Ico } from "./atoms";

// Chip values unchanged from the prototype; only the group LABEL is "Type" and the dim "types".
const TYPE_CHIPS: [string, string][] = [
  ["article", "Articles"],
  ["repo", "GitHub"],
  ["paper", "Papers"],
  ["substack", "Substack"],
  ["website", "Sites"],
];

type Dim = "types" | "editions" | "categories";

export function FilterPanel({
  editions,
  categories,
  filters,
  onToggleVal,
  onToggleStarred,
  onClear,
  filterCount,
  mob = false,
}: {
  editions: Edition[];
  categories: CategoryRef[];
  filters: LibraryFilters;
  onToggleVal: (dim: Dim, val: string) => void;
  onToggleStarred: () => void;
  onClear: () => void;
  filterCount: number;
  mob?: boolean;
}) {
  const Group = ({ label, keys, dim }: { label: string; keys: [string, string][]; dim: Dim }) => (
    <div style={{ minWidth: 0 }}>
      <div
        className="mono"
        style={{
          fontSize: 10.5,
          color: "var(--ink-4)",
          letterSpacing: ".05em",
          marginBottom: 9,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
        {keys.map(([val, txt]) => {
          const on = filters[dim].includes(val);
          return (
            <button
              key={val}
              className={"rc-chip" + (on ? " on accent" : "")}
              style={{ fontSize: 12.5, padding: "5px 12px" }}
              onClick={() => onToggleVal(dim, val)}
            >
              {txt}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div style={{ borderTop: "1px solid var(--line)", background: "var(--surface)" }}>
      <div
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          // Match TopBar gutters: 14 on mobile, 28 on desktop. flexWrap stacks the groups.
          padding: mob ? "20px 14px" : "20px 28px",
          display: "flex",
          gap: mob ? 24 : 40,
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        <Group label="Edition" dim="editions" keys={editions.map((e) => [e.key, e.name])} />
        <Group label="Type" dim="types" keys={TYPE_CHIPS} />
        <Group label="Category" dim="categories" keys={categories.map((c) => [c.slug, c.label])} />
        <div
          style={{
            marginLeft: mob ? 0 : "auto",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <button
            className={"rc-chip" + (filters.starredOnly ? " on" : "")}
            style={{ fontSize: 12.5, padding: "6px 13px" }}
            onClick={onToggleStarred}
          >
            <Ico name="star" s={14} /> Starred only
          </button>
          {filterCount > 0 && (
            <button
              onClick={onClear}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                font: "inherit",
                fontSize: 12.5,
                fontWeight: 600,
                color: "var(--accent)",
              }}
            >
              Clear all
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
