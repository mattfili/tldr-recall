"""``user_issue_state`` — per-(reader, ISSUE) read/unread fact (ADR-0002).

Read/unread is a property of an ISSUE, not a Content: a newsletter is skimmed, not triaged
article-by-article. A row exists after the reader first VIEWS an issue (the frontend fires
``PUT /issues/{id}/read`` on display). It reuses the shared ``read_state`` Postgres ENUM (the
type is NOT recreated here — see ``models/enums.py``). Default ``unread``; there is no un-read
transition in v1 (mark-on-view only flips unread -> read).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from recall.models.base import Base, timestamptz, uuid_pk
from recall.models.enums import ReadState, read_state_enum


class UserIssueState(Base):
    __tablename__ = "user_issue_state"
    __table_args__ = (
        UniqueConstraint("user_id", "issue_id", name="uq_user_issue_state_user_issue"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    # FKs restrict by default (mirrors user_content_state's choice in 0001).
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    issue_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("issues.id"), nullable=False)
    read_state: Mapped[ReadState] = mapped_column(
        read_state_enum, nullable=False, server_default=text("'unread'")
    )
    updated_at: Mapped[datetime] = mapped_column(
        timestamptz(), nullable=False, server_default=text("now()")
    )
