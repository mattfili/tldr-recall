"""Stub auth provider (spec §11).

Returns a single fixed stub user. There is no login UI in v1. #2 wires this to the seeded
DB user (the stub id/email will line up with the seeded ``users`` row).
"""

from __future__ import annotations

from recall.auth.base import AuthProvider, User

STUB_USER = User(
    id="00000000-0000-0000-0000-000000000001",
    email=None,
    display_name="Local User",
)


class StubAuthProvider(AuthProvider):
    def current_user(self, request) -> User:  # noqa: ANN001 - Starlette Request, kept loose for now
        return STUB_USER
