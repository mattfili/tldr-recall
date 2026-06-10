"""URL resolution: raw tracking link -> (resolved_url, domain) (spec §6.4, issue #23).

INGESTION-ONLY: this module performs network I/O and must never be imported from
request-serving paths (``recall.api``, ``recall.search``).

Resolution order, every outcome cached in ``url_resolutions`` keyed on the raw URL:

1. **Cache** — repeated calls (successes AND failures) never re-fetch. Each network
   resolution registers as a click in TLDR's analytics, so one-fetch-ever per distinct
   link is etiquette, not just speed (grilled 2026-06-10). A cached failure is permanent
   by design; the ``ok`` flag leaves room for a future retry job without schema change.
2. **Embedded-destination decode (no network)** — TLDR tracking links embed the
   destination URL-encoded in a path segment (``/CL0/https%3A%2F%2F...``) or a query
   param value. The first decoded value that parses as a full http(s) URL wins.
3. **Network fallback** — HEAD with redirects + strict timeout; retried once as GET when
   HEAD is rejected (405/4xx with no redirect chain). The final response URL wins.
4. **Degradation** — ANY failure (timeout, connection error, terminal 4xx/5xx with no
   redirect chain) returns the raw URL + best-effort domain. ``resolve_url`` never raises.
"""

from __future__ import annotations

import re
from urllib.parse import parse_qsl, unquote, urlparse

import httpx

from recall.repositories import UrlResolutionRepository

#: Strict per-request timeout (seconds) — politeness over completeness.
RESOLVE_TIMEOUT_SECONDS = 5.0

_HTTP_URL_RE = re.compile(r"^https?://", re.IGNORECASE)


def _domain(url: str) -> str | None:
    """Best-effort lowercased hostname with a leading ``www.`` stripped."""
    host = (urlparse(url).hostname or "").lower().lstrip(".")
    host = host.removeprefix("www.")
    return host or None


def _embedded_destination(raw_url: str) -> str | None:
    """Decode a destination URL embedded in the link itself — NO network.

    Checks every path segment and query-param value, URL-decoded; the first candidate
    that is a valid absolute http(s) URL (scheme + netloc after re-parsing) wins.
    """
    parsed = urlparse(raw_url)
    candidates = [unquote(seg) for seg in parsed.path.split("/")]
    # parse_qsl already URL-decodes the values — no second unquote (it would corrupt
    # destinations that legitimately contain %25 etc.).
    candidates += [value for _key, value in parse_qsl(parsed.query)]
    for candidate in candidates:
        candidate = candidate.strip()
        if not _HTTP_URL_RE.match(candidate):
            continue
        reparsed = urlparse(candidate)
        if reparsed.scheme in ("http", "https") and reparsed.netloc:
            return candidate
    return None


def _fetch_final_url(raw_url: str, client: httpx.Client) -> str:
    """Follow redirects to the final URL. HEAD first, one GET retry for HEAD-hostile hosts.

    Raises on failure (the caller degrades); a terminal 4xx/5xx counts as success only if
    a redirect chain emerged (the final URL is still the destination we wanted).
    """
    response = None
    for method in ("HEAD", "GET"):
        response = client.request(method, raw_url, follow_redirects=True)
        if response.status_code < 400:
            return str(response.url)
        if response.history:  # redirect chain emerged; final URL is the destination
            return str(response.url)
    raise httpx.HTTPStatusError(
        f"terminal {response.status_code} with no redirect chain",
        request=response.request,
        response=response,
    )


def resolve_url(
    raw_url: str,
    *,
    repo: UrlResolutionRepository,
    client: httpx.Client | None = None,
) -> tuple[str, str | None]:
    """Resolve ``raw_url`` to ``(resolved_url, domain)``. Never raises.

    Every outcome is persisted through ``repo`` (flush only — the caller owns the
    transaction/commit). ``client`` is the injection seam for tests; when None, one is
    built lazily ONLY if the network step is reached (the decode path never opens a
    connection).
    """
    cached = repo.get(raw_url)
    if cached is not None:
        return cached.resolved_url, cached.domain

    destination = _embedded_destination(raw_url)
    if destination is not None:
        domain = _domain(destination)
        repo.record(raw_url=raw_url, resolved_url=destination, domain=domain, ok=True)
        return destination, domain

    owns_client = client is None
    try:
        if owns_client:
            client = httpx.Client(timeout=httpx.Timeout(RESOLVE_TIMEOUT_SECONDS))
        final_url = _fetch_final_url(raw_url, client)
        domain = _domain(final_url)
        repo.record(raw_url=raw_url, resolved_url=final_url, domain=domain, ok=True)
        return final_url, domain
    except Exception:
        domain = _domain(raw_url)
        repo.record(raw_url=raw_url, resolved_url=raw_url, domain=domain, ok=False)
        return raw_url, domain
    finally:
        if owns_client and client is not None:
            client.close()
