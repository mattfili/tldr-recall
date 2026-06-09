"""Category API schema (spec §9).

``GET /categories`` returns a plain list of ``{slug, label, hue}`` — the same shape as
``CategoryRef``, exported under its own name for clarity in the endpoint signature.
"""

from __future__ import annotations

from recall.schemas.common import CategoryRef

# GET /categories returns [Category] where Category == {slug, label, hue}.
Category = CategoryRef

__all__ = ["Category"]
