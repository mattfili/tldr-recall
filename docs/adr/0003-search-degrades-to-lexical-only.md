# Search degrades to lexical-only when embeddings are absent

Hybrid search (Postgres FTS + pgvector, fused with RRF) needs `content_embeddings` for the active model — but those require the OpenAI key + `embed-backfill`, which arrive after the app is first runnable, and the web-demo default config may have no key at all. Decision: when the active model has **no embeddings (or the embedder is unconfigured), search skips the vector arm and runs lexical-only** — intent parsing, FTS over title+summary+tags+domain, type filter/boost, negation, and edition/starred filters all still work; RRF simply fuses a single list. The vector arm activates with no code change once backfill runs.

## Consequences

- Core search works immediately, in any config; semantic/paraphrase matching is an enhancement that "lights up" once embeddings exist.
- #7's acceptance criterion "both FTS and vector demonstrably contribute" is validated *after* the key + backfill (it inherently requires embeddings present).
- The search service branches on embedding availability per active model, and should make the degraded (lexical-only) mode observable (logs / the debug `match_explanation` if kept) so it isn't mistaken for a ranking bug.
