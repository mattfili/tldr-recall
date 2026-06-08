// Category section header — typographic, uppercase mono label.
// Ported from tldr-web/prototype.jsx SectionHead.

import type { CategoryRef } from "../types";

export function SectionHead({ category }: { category: CategoryRef }) {
  return (
    <div style={{ margin: "40px 0 2px", paddingBottom: 8, borderBottom: "1.5px solid var(--ink)" }}>
      <h2
        className="mono"
        style={{
          margin: 0,
          fontSize: 13.5,
          fontWeight: 600,
          letterSpacing: ".1em",
          textTransform: "uppercase",
          color: "var(--ink)",
        }}
      >
        {category.label}
      </h2>
    </div>
  );
}
