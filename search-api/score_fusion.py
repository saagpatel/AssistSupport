#!/usr/bin/env python3
"""Score fusion helpers for the surviving adaptive hybrid search path."""

from typing import List, Tuple


class ScoreFusion:
    """Adaptive score fusion for the live search runtime."""

    @staticmethod
    def weighted_combination(
        bm25_results: List[Tuple[str, float]],
        vector_results: List[Tuple[str, float]],
        bm25_weight: float = 0.3,
        vector_weight: float = 0.6,
    ) -> List[Tuple[str, float]]:
        """
        Weighted Combination of BM25 and vector scores.
        Score(d) = bm25_weight * norm(bm25) + vector_weight * norm(vector)

        All scores normalized to [0, 1]
        """
        if not bm25_results:
            bm25_max = 1.0
            bm25_dict = {}
        else:
            bm25_max = max(s for _, s in bm25_results) if bm25_results else 1.0
            bm25_dict = {
                article_id: max(0.0, min(1.0, score / max(bm25_max, 0.01)))
                for article_id, score in bm25_results
            }

        if not vector_results:
            vector_dict = {}
        else:
            vector_dict = {
                article_id: min(1.0, max(0.0, score))
                for article_id, score in vector_results
            }

        all_ids = set(bm25_dict.keys()) | set(vector_dict.keys())
        combined = {}

        for article_id in all_ids:
            bm25_norm = bm25_dict.get(article_id, 0.0)
            vector_norm = vector_dict.get(article_id, 0.0)

            score = (bm25_weight * bm25_norm) + (vector_weight * vector_norm)
            combined[article_id] = score

        ranked = sorted(combined.items(), key=lambda x: x[1], reverse=True)
        return ranked

    @staticmethod
    def adaptive_fusion(
        bm25_results: List[Tuple[str, float]],
        vector_results: List[Tuple[str, float]],
        query_type: str,
    ) -> List[Tuple[str, float]]:
        """
        Adaptive Fusion Based on Query Intent

        Adjust weights based on detected query type:
        - Policy: favor vector (semantic understanding of "am I allowed" queries)
        - Procedure: balance both (steps need semantic + keyword matching)
        - Reference: boost vector (semantic understanding critical)
        - Unknown: balanced with slight vector preference
        """
        weights = {
            "policy": {"bm25": 0.35, "vector": 0.65},
            "procedure": {"bm25": 0.40, "vector": 0.60},
            "reference": {"bm25": 0.20, "vector": 0.80},
            "unknown": {"bm25": 0.30, "vector": 0.70},
        }

        w = weights.get(query_type, weights["unknown"])

        return ScoreFusion.weighted_combination(
            bm25_results,
            vector_results,
            bm25_weight=w["bm25"],
            vector_weight=w["vector"],
        )
