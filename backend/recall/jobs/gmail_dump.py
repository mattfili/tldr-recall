"""Gmail → ``.eml`` exporter (spec §6.8, issue #20).

Byte acquisition only: get raw RFC822 messages into ``GMAIL_EXPORT_DIR`` so the M4
``GmailExportSource`` has a corpus to parse. Parsing never cares how the files arrived.

Two paths, both writing into the same folder:

* ``mbox_split`` — one-time history backfill from a Google Takeout mbox.
* ``gmail_dump`` — incremental/rerunnable pull via the Gmail API (``format=raw``),
  one file per message named by Gmail message id (stable ``issue.source_ref``).

Both are rerun-safe: existing files are skipped, so reruns only add new issues.

Operator-run with the operator's own Gmail credentials. The OAuth client secret and the
cached token live OUTSIDE the repo (default ``~/.recall/``); the backend never stores
Gmail credentials. IMAP (``imaplib`` + app password) is a viable manual alternative if
you'd rather not create a Google Cloud OAuth client — it is not implemented here.
"""

from __future__ import annotations

import base64
import hashlib
import mailbox
import re
from email.message import Message
from pathlib import Path

from recall.config import settings

TLDR_SENDER = "tldrnewsletter.com"
DEFAULT_QUERY = f"from:{TLDR_SENDER} newer_than:2y"
GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]

DEFAULT_CREDENTIALS_PATH = Path.home() / ".recall" / "gmail_credentials.json"
DEFAULT_TOKEN_PATH = Path.home() / ".recall" / "gmail_token.json"

# config.py resolves the repo-root .env the same way (backend/recall/ -> repo root).
_REPO_ROOT = Path(__file__).resolve().parents[3]


def default_export_dir() -> Path:
    """``GMAIL_EXPORT_DIR``, resolved against the repo root when relative.

    The setting defaults to ``./samples``; anchoring it to the repo root keeps the job
    CWD-independent (it is run via ``uv run`` from either the repo root or backend/).
    """
    configured = Path(settings.gmail_export_dir)
    return configured if configured.is_absolute() else _REPO_ROOT / configured


def _eml_name(msg: Message) -> str:
    """Stable filename for an mbox message: sanitized Message-ID, else content hash."""
    msg_id = (msg.get("Message-ID") or "").strip().strip("<>")
    if msg_id:
        return re.sub(r"[^A-Za-z0-9._@-]", "_", msg_id) + ".eml"
    return hashlib.sha256(msg.as_bytes()).hexdigest()[:24] + ".eml"


def mbox_split(
    mbox_path: str | Path,
    dest_dir: str | Path,
    sender_filter: str | None = TLDR_SENDER,
) -> dict[str, int]:
    """Split a Takeout mbox into per-message ``.eml`` files under ``dest_dir``.

    Messages whose From header does not contain ``sender_filter`` are dropped
    (pass ``None`` to keep everything). Rerun-safe: existing files are skipped.
    """
    dest = Path(dest_dir)
    dest.mkdir(parents=True, exist_ok=True)
    counts = {"written": 0, "skipped_existing": 0, "filtered_out": 0}
    for msg in mailbox.mbox(str(mbox_path)):
        if sender_filter and sender_filter not in (msg.get("From") or ""):
            counts["filtered_out"] += 1
            continue
        target = dest / _eml_name(msg)
        if target.exists():
            counts["skipped_existing"] += 1
            continue
        target.write_bytes(msg.as_bytes())
        counts["written"] += 1
    return counts


def _build_service(credentials_path: Path, token_path: Path):
    """OAuth installed-app flow with a cached token; returns a Gmail API service.

    The google deps are an optional dependency group — this job is the only consumer,
    and CI never needs them.
    """
    try:
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
        from google_auth_oauthlib.flow import InstalledAppFlow
        from googleapiclient.discovery import build
    except ImportError as exc:  # pragma: no cover - exercised only without the group
        raise SystemExit(
            "Google API deps are not installed. Run: uv sync --group gmail "
            "(then: uv run recall gmail-dump)"
        ) from exc

    creds = None
    if token_path.exists():
        creds = Credentials.from_authorized_user_file(str(token_path), GMAIL_SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not credentials_path.exists():
                raise SystemExit(
                    f"OAuth client file not found at {credentials_path}. In Google Cloud "
                    "Console create a 'Desktop app' OAuth client (Gmail API enabled), "
                    "download its JSON there, and rerun. Credentials never enter the repo."
                )
            flow = InstalledAppFlow.from_client_secrets_file(str(credentials_path), GMAIL_SCOPES)
            creds = flow.run_local_server(port=0)
        token_path.parent.mkdir(parents=True, exist_ok=True)
        token_path.write_text(creds.to_json())
    return build("gmail", "v1", credentials=creds)


def gmail_dump(
    dest_dir: str | Path,
    query: str = DEFAULT_QUERY,
    credentials_path: Path = DEFAULT_CREDENTIALS_PATH,
    token_path: Path = DEFAULT_TOKEN_PATH,
    service=None,
) -> dict[str, int]:
    """Pull raw messages matching ``query`` into ``dest_dir`` as ``<message-id>.eml``.

    ``format=raw`` returns the full RFC822 bytes, so the files carry the real anchor
    hrefs M4's URL resolution needs. Rerun-safe: already-fetched ids are skipped
    without refetching. ``service`` is injectable for tests.
    """
    if service is None:  # pragma: no cover - network path
        service = _build_service(credentials_path, token_path)
    dest = Path(dest_dir)
    dest.mkdir(parents=True, exist_ok=True)
    counts = {"written": 0, "skipped_existing": 0}
    messages = service.users().messages()
    page_token = None
    while True:
        resp = messages.list(userId="me", q=query, pageToken=page_token).execute()
        for m in resp.get("messages", []):
            target = dest / f"{m['id']}.eml"
            if target.exists():
                counts["skipped_existing"] += 1
                continue
            raw = messages.get(userId="me", id=m["id"], format="raw").execute()
            target.write_bytes(base64.urlsafe_b64decode(raw["raw"]))
            counts["written"] += 1
        page_token = resp.get("nextPageToken")
        if not page_token:
            return counts
