"""Search repository — the raw-SQL arms of unified hybrid search (#7, spec §8, ADR-0001/0003).

This is the ONLY place the two search arms touch the database. Per the repository CONTRACT,
raw ``text()`` SQL is allowed here (the FTS ``tsquery`` and the pgvector cosine operator have no
ergonomic ORM form); the search SERVICE orchestrates these returning-id-list methods and never
queries the ORM itself.

Both arms apply the SAME HARD FILTERS in-SQL (strong-type include, negated-type exclude, edition
has-appearance-in, starred, negated-topic exclude) so the two ranked candidate universes match —
RRF over them stays correct and pagination is stable. The methods return ORDERED ``content.id``
lists ONLY; the service fuses + assembles.

HARD FILTERS (mirror ``ContentRepository.list_library``'s EXISTS/IN building):
* strong type  -> ``content_type = ANY(CAST(:types AS content_type[]))``
* exclude type -> ``NOT (content_type = ANY(CAST(:ex AS content_type[])))``
* edition      -> EXISTS over appearances->issues->editions (``edition.key = ANY(:eds)``)
* starred      -> EXISTS over user_content_state (the reader's starred row)
* topic exclude-> ``NOT (search_tsv @@ websearch_to_tsquery('english', :term))`` per negated term

EMPTY-QUERY RULE: a type-only query (e.g. "github repos") has an empty ``cleaned_query``; the FTS
arm then SKIPS the ``@@`` predicate and orders by ``content.id`` so the filtered set still
returns (rank is 0 for every row). ``websearch_to_tsquery`` is used so multi-word topic phrases
parse safely (it never raises on free text, unlike ``to_tsquery``).
"""

from __future__ import annotations

import uuid

from sqlalchemy import String, bindparam, text
from sqlalchemy.dialects.postgresql import ARRAY

from recall.repositories.base import Repository

_TSCONFIG = "pg_catalog.english"


class SearchRepository(Repository):
    """Holds the FTS + pgvector arms. Returns ordered ``content.id`` lists; no assembly here."""

    def _filter_clauses(
        self,
        *,
        types_strong: set[str],
        exclude_types: set[str],
        editions: set[str],
        starred: bool,
        topic_excludes: list[str],
        user_id: uuid.UUID,
        params: dict[str, object],
    ) -> list[str]:
        """Build the shared hard-filter WHERE fragments + populate ``params`` (mutated).

        ``c`` is the alias for the ``content`` table in both arms' SQL.
        """
        clauses: list[str] = []

        if types_strong:
            clauses.append("c.content_type = ANY(CAST(:f_types AS content_type[]))")
            params["f_types"] = sorted(types_strong)

        if exclude_types:
            clauses.append("NOT (c.content_type = ANY(CAST(:f_extypes AS content_type[])))")
            params["f_extypes"] = sorted(exclude_types)

        if editions:
            clauses.append(
                "EXISTS (SELECT 1 FROM content_appearances ca "
                "JOIN issues i ON i.id = ca.issue_id "
                "JOIN editions e ON e.id = i.edition_id "
                "WHERE ca.content_id = c.id AND e.key = ANY(:f_eds))"
            )
            params["f_eds"] = sorted(editions)

        if starred:
            clauses.append(
                "EXISTS (SELECT 1 FROM user_content_state s "
                "WHERE s.content_id = c.id AND s.user_id = :f_uid AND s.starred IS TRUE)"
            )
            params["f_uid"] = str(user_id)

        for idx, term in enumerate(topic_excludes):
            key = f"f_ex_topic_{idx}"
            clauses.append(
                f"NOT (c.search_tsv @@ websearch_to_tsquery('{_TSCONFIG}', :{key}))"
            )
            params[key] = term

        return clauses

    @staticmethod
    def _array_bindparams(params: dict[str, object]) -> list[bindparam]:
        """Declare ARRAY(String) typing for the list-valued binds present in ``params``."""
        binds: list[bindparam] = []
        for name in ("f_types", "f_extypes", "f_eds"):
            if name in params:
                binds.append(bindparam(name, type_=ARRAY(String)))
        return binds

    def fts_search(
        self,
        *,
        cleaned_query: str,
        types_strong: set[str],
        exclude_types: set[str],
        editions: set[str],
        starred: bool,
        topic_excludes: list[str],
        user_id: uuid.UUID,
        limit: int,
    ) -> list[uuid.UUID]:
        """Lexical arm: ``websearch_to_tsquery`` @@ ``search_tsv`` ranked by ``ts_rank_cd``.

        Returns ordered ``content.id``. An empty ``cleaned_query`` skips the ``@@`` predicate and
        orders by id so type-only queries still return the filtered set.
        """
        params: dict[str, object] = {"lim": limit}
        clauses = self._filter_clauses(
            types_strong=types_strong,
            exclude_types=exclude_types,
            editions=editions,
            starred=starred,
            topic_excludes=topic_excludes,
            user_id=user_id,
            params=params,
        )

        cleaned = cleaned_query.strip()
        if cleaned:
            params["q"] = cleaned
            clauses.append(f"c.search_tsv @@ websearch_to_tsquery('{_TSCONFIG}', :q)")
            order_by = (
                f"ts_rank_cd(c.search_tsv, websearch_to_tsquery('{_TSCONFIG}', :q)) DESC, "
                "c.id ASC"
            )
        else:
            # No topic terms (type-only query): no rank signal, just the filtered set in stable
            # id order so RRF has a deterministic single arm.
            order_by = "c.id ASC"

        where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
        sql = text(
            f"SELECT c.id FROM content c{where} ORDER BY {order_by} LIMIT :lim"
        ).bindparams(*self._array_bindparams(params))

        rows = self.session.execute(sql, params).scalars().all()
        return list(rows)

    def vector_search(
        self,
        *,
        qvec: list[float],
        active_model: str,
        types_strong: set[str],
        exclude_types: set[str],
        editions: set[str],
        starred: bool,
        topic_excludes: list[str],
        user_id: uuid.UUID,
        limit: int,
    ) -> list[uuid.UUID]:
        """Vector arm: pgvector cosine (``<=>``) over the ACTIVE model's ``combined`` embeddings.

        Applies the SAME hard filters as ``fts_search`` so both arms see the same candidate
        universe. Returns ordered ``content.id`` (nearest first). ``qvec`` is bound as a vector
        literal cast (``CAST(:qvec AS vector)``).
        """
        params: dict[str, object] = {
            "model": active_model,
            "qvec": "[" + ",".join(repr(float(x)) for x in qvec) + "]",
            "lim": limit,
        }
        clauses = self._filter_clauses(
            types_strong=types_strong,
            exclude_types=exclude_types,
            editions=editions,
            starred=starred,
            topic_excludes=topic_excludes,
            user_id=user_id,
            params=params,
        )
        clauses.insert(0, "ce.kind = 'combined'")
        clauses.insert(1, "ce.model = :model")
        where = " WHERE " + " AND ".join(clauses)

        sql = text(
            "SELECT c.id FROM content c "
            "JOIN content_embeddings ce ON ce.content_id = c.id"
            f"{where} "
            "ORDER BY ce.embedding <=> CAST(:qvec AS vector) ASC LIMIT :lim"
        ).bindparams(*self._array_bindparams(params))

        rows = self.session.execute(sql, params).scalars().all()
        return list(rows)
