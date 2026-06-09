"""RRF fusion + type-boost unit tests (#7). Pure — synthetic id lists, no DB."""

from __future__ import annotations

import pytest

from recall.search.fusion import apply_type_boost, rrf


def test_rrf_sums_reciprocal_ranks_1_based() -> None:
    k = 60
    result = rrf(["a", "b"], ["a", "c"], k)
    # 'a' is rank 1 in BOTH arms -> 1/(k+1) + 1/(k+1)
    assert result.entries["a"].fused_score == pytest.approx(2.0 / (k + 1))
    assert result.entries["a"].lexical_rank == 1
    assert result.entries["a"].vector_rank == 1
    # 'b' only lexical rank 2; 'c' only vector rank 2
    assert result.entries["b"].fused_score == pytest.approx(1.0 / (k + 2))
    assert result.entries["b"].vector_rank is None
    assert result.entries["c"].lexical_rank is None


def test_id_in_both_arms_outranks_id_in_one() -> None:
    result = rrf(["a", "x"], ["a", "y"], 60)
    ordered = result.ordered_ids()
    # 'a' (both arms) must be first.
    assert ordered[0] == "a"
    assert result.entries["a"].fused_score > result.entries["x"].fused_score


def test_single_list_degraded_case_still_ranks() -> None:
    # Degraded mode: vector arm empty -> RRF fuses ONE list, ranks by lexical order.
    result = rrf(["a", "b", "c"], [], 60)
    assert result.ordered_ids() == ["a", "b", "c"]
    assert all(result.entries[i].vector_rank is None for i in ["a", "b", "c"])
    assert result.entries["a"].matched_via == ["lexical"]


def test_ordering_total_order_breaks_ties_by_id() -> None:
    # Two ids at identical rank in single arms -> equal score -> id ASC tie-break.
    result = rrf(["b"], ["a"], 60)
    assert result.entries["a"].fused_score == result.entries["b"].fused_score
    assert result.ordered_ids() == ["a", "b"]


def test_apply_type_boost_only_boosts_weak_type_ids() -> None:
    result = rrf(["a", "b", "c"], [], 60)
    before = {i: result.entries[i].fused_score for i in ["a", "b", "c"]}
    # 'a' is a substack (weak type) -> boosted; 'b','c' are repos -> untouched.
    type_by_id = {"a": "substack", "b": "repo", "c": "repo"}
    apply_type_boost(result, type_by_id, {"substack"}, weight=0.1)
    assert result.entries["a"].fused_score == pytest.approx(before["a"] + 0.1)
    assert result.entries["a"].type_boost == pytest.approx(0.1)
    assert result.entries["b"].fused_score == pytest.approx(before["b"])
    assert result.entries["b"].type_boost is None
    assert "type_boost" in result.entries["a"].matched_via


def test_apply_type_boost_can_change_order() -> None:
    # 'b' starts ahead of 'a'; a big weak-type boost on 'a' flips them.
    result = rrf(["b", "a"], [], 60)
    assert result.ordered_ids() == ["b", "a"]
    apply_type_boost(result, {"a": "substack", "b": "repo"}, {"substack"}, weight=1.0)
    assert result.ordered_ids() == ["a", "b"]


def test_apply_type_boost_noop_when_no_weak_types() -> None:
    result = rrf(["a", "b"], [], 60)
    before = result.entries["a"].fused_score
    apply_type_boost(result, {"a": "substack"}, set(), weight=0.1)
    assert result.entries["a"].fused_score == pytest.approx(before)
