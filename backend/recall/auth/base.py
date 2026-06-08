"""AuthProvider portability seam (spec §11).

Auth is stubbed in v1 behind this protocol so dropping in real auth (OAuth/JWT) later is
an interface swap with no schema change. ``User`` is a lightweight pydantic model for now.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from pydantic import BaseModel


class User(BaseModel):
    id: str
    email: str | None = None
    display_name: str | None = None


@runtime_checkable
class AuthProvider(Protocol):
    def current_user(self, request) -> User: ...  # noqa: ANN001 - Starlette Request, kept loose for now
