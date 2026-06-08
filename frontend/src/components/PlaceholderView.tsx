// Placeholder for the Library and Search views. These ship in #4 (Library +
// filters) and #7 (search); in #3 they are non-functional stubs so the TopBar
// nav stays present and navigable.

export function PlaceholderView({ title, note }: { title: string; note: string }) {
  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 28px" }}>
      <div style={{ padding: "60px 0 90px", maxWidth: 600 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em", margin: "0 0 10px" }}>
          {title}
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.55, color: "var(--ink-3)", margin: 0 }}>{note}</p>
      </div>
    </div>
  );
}
