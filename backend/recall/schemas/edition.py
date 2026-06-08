"""Edition API schema (spec §9).

``GET /editions`` returns a plain list of ``{key, name}`` — the same shape as ``EditionRef``,
exported under its own name for clarity in the endpoint signature.
"""

from __future__ import annotations

from recall.schemas.common import EditionRef

# GET /editions returns [Edition] where Edition == {key, name}.
Edition = EditionRef

__all__ = ["Edition"]
