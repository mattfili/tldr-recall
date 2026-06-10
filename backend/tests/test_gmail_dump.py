"""Gmail export job (§6.8, issue #20): mbox split + API dump write/skip logic.

Pure filesystem tests — no network, no DB, no google deps (the API path is exercised
through an injected fake service).
"""

from __future__ import annotations

import base64
import mailbox
from email.message import EmailMessage

from recall.jobs.gmail_dump import gmail_dump, mbox_split


def _message(from_: str, subject: str, msg_id: str | None) -> EmailMessage:
    msg = EmailMessage()
    msg["From"] = from_
    msg["Subject"] = subject
    if msg_id:
        msg["Message-ID"] = msg_id
    msg.set_content(f"body of {subject}")
    return msg


def _make_mbox(path, messages) -> None:
    box = mailbox.mbox(str(path))
    for msg in messages:
        box.add(msg)
    box.flush()
    box.close()


class _Exec:
    def __init__(self, payload):
        self._payload = payload

    def execute(self):
        return self._payload


class _FakeMessages:
    """Mimics service.users().messages() with paginated list and raw get."""

    def __init__(self, pages, raw_by_id):
        self._pages = pages
        self._raw_by_id = raw_by_id
        self.get_calls = []

    def list(self, userId, q, pageToken=None):
        return _Exec(self._pages[0 if pageToken is None else int(pageToken)])

    def get(self, userId, id, format):
        self.get_calls.append(id)
        encoded = base64.urlsafe_b64encode(self._raw_by_id[id]).decode()
        return _Exec({"raw": encoded})


class _FakeService:
    def __init__(self, messages):
        self._messages = messages

    def users(self):
        return self

    def messages(self):
        return self._messages


def test_mbox_split_filters_writes_and_reruns_safely(tmp_path):
    mbox_path = tmp_path / "takeout.mbox"
    dest = tmp_path / "samples"
    _make_mbox(
        mbox_path,
        [
            _message("TLDR <dan@tldrnewsletter.com>", "TLDR 2026-06-01", "<a1@mail.gmail.com>"),
            _message("TLDR AI <ai@tldrnewsletter.com>", "TLDR AI 06-01", "<a2@mail.gmail.com>"),
            _message("Other <news@example.com>", "Not TLDR", "<b1@mail.example.com>"),
        ],
    )

    counts = mbox_split(mbox_path, dest)
    assert counts == {"written": 2, "skipped_existing": 0, "filtered_out": 1}
    written = sorted(p.name for p in dest.glob("*.eml"))
    assert written == ["a1@mail.gmail.com.eml", "a2@mail.gmail.com.eml"]
    # Files are valid RFC822 with the original headers intact.
    assert b"Subject: TLDR 2026-06-01" in (dest / "a1@mail.gmail.com.eml").read_bytes()

    # Rerun: nothing rewritten, nothing duplicated.
    counts = mbox_split(mbox_path, dest)
    assert counts == {"written": 0, "skipped_existing": 2, "filtered_out": 1}

    # No filter keeps everything (only the third message is new).
    counts = mbox_split(mbox_path, dest, sender_filter=None)
    assert counts["written"] == 1
    assert len(list(dest.glob("*.eml"))) == 3


def test_mbox_split_hashes_name_when_message_id_missing(tmp_path):
    mbox_path = tmp_path / "takeout.mbox"
    dest = tmp_path / "samples"
    _make_mbox(mbox_path, [_message("x@tldrnewsletter.com", "no id", None)])

    assert mbox_split(mbox_path, dest)["written"] == 1
    (only,) = dest.glob("*.eml")
    # 24-hex-char content digest + .eml
    assert len(only.stem) == 24
    assert all(c in "0123456789abcdef" for c in only.stem)


def test_gmail_dump_paginates_writes_by_id_and_skips_on_rerun(tmp_path):
    dest = tmp_path / "samples"
    raw = {"id-a": b"raw bytes a", "id-b": b"raw bytes b", "id-c": b"raw bytes c"}
    pages = [
        {"messages": [{"id": "id-a"}, {"id": "id-b"}], "nextPageToken": "1"},
        {"messages": [{"id": "id-c"}]},
    ]
    fake = _FakeMessages(pages, raw)

    counts = gmail_dump(dest, service=_FakeService(fake))
    assert counts == {"written": 3, "skipped_existing": 0}
    assert (dest / "id-b.eml").read_bytes() == b"raw bytes b"
    assert fake.get_calls == ["id-a", "id-b", "id-c"]

    # Rerun: every id already on disk -> no refetch of message bodies.
    counts = gmail_dump(dest, service=_FakeService(fake))
    assert counts == {"written": 0, "skipped_existing": 3}
    assert fake.get_calls == ["id-a", "id-b", "id-c"]
