// M0 proof-of-wiring screen. Fetches GET /health on mount and renders
// status / db / embedder / version with loading + error states.
// This is NOT the real UI (that's #3 — recall.css port + three views).
// Styling is intentionally minimal inline CSS; do not port recall.css yet.

import { useEffect, useState } from "react";
import { getHealth, API_BASE_URL } from "./api/client";
import type { Health } from "./types";
import { platform } from "./platform";

type LoadState =
  | { kind: "loading" }
  | { kind: "ok"; health: Health }
  | { kind: "error"; message: string };

const styles = {
  page: {
    fontFamily: "system-ui, sans-serif",
    maxWidth: 560,
    margin: "48px auto",
    padding: "0 16px",
    color: "#1a1a1a",
  },
  card: {
    border: "1px solid #ddd",
    borderRadius: 8,
    padding: 20,
    background: "#fff",
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    padding: "8px 0",
    borderBottom: "1px solid #f0f0f0",
    fontSize: 14,
  },
  key: { color: "#666" },
  mono: { fontFamily: "ui-monospace, monospace" },
} as const;

function isOk(db: string): boolean {
  return db === "ok";
}

function HealthPanel({ health }: { health: Health }) {
  return (
    <div style={styles.card}>
      <div style={styles.row}>
        <span style={styles.key}>status</span>
        <span style={styles.mono}>{health.status}</span>
      </div>
      <div style={styles.row}>
        <span style={styles.key}>db</span>
        <span style={{ ...styles.mono, color: isOk(health.db) ? "#137a3f" : "#b00020" }}>
          {health.db}
        </span>
      </div>
      <div style={styles.row}>
        <span style={styles.key}>embedder</span>
        <span style={styles.mono}>{health.embedder}</span>
      </div>
      <div style={{ ...styles.row, borderBottom: "none" }}>
        <span style={styles.key}>version</span>
        <span style={styles.mono}>{health.version}</span>
      </div>
    </div>
  );
}

export default function App() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    getHealth()
      .then((health) => {
        if (!cancelled) setState({ kind: "ok", health });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setState({ kind: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main style={styles.page}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Recall</h1>
      <p style={{ color: "#666", marginTop: 0, fontSize: 14 }}>
        M0 health check — client &rarr; API &rarr; DB. Backend:{" "}
        <span style={styles.mono}>{API_BASE_URL}</span>{" "}
        ({platform.isDesktop ? "desktop" : "web"})
      </p>

      {state.kind === "loading" && <p>Checking backend health&hellip;</p>}

      {state.kind === "error" && (
        <div style={{ ...styles.card, borderColor: "#b00020", color: "#b00020" }}>
          <strong>Could not reach backend.</strong>
          <p style={{ ...styles.mono, fontSize: 13, marginBottom: 0 }}>{state.message}</p>
          <p style={{ fontSize: 13, color: "#666" }}>
            Is the API running on <span style={styles.mono}>{API_BASE_URL}</span>?
          </p>
        </div>
      )}

      {state.kind === "ok" && <HealthPanel health={state.health} />}
    </main>
  );
}
