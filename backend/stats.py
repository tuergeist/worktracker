"""Derived statistics for putting sessions.

A session result is a list of putt counts per ball, e.g. [1, 2, 1, 3, ...].
We summarise total putts and the distribution of 1-/2-/3-/4+-putts.
"""
from typing import Dict, List

BUCKETS = ["1", "2", "3", "4+"]


def _bucket(putts: int) -> str:
    return str(putts) if putts <= 3 else "4+"


def session_stats(results: List[int]) -> dict:
    num_balls = len(results)
    total = sum(results)
    distribution: Dict[str, int] = {b: 0 for b in BUCKETS}
    for r in results:
        distribution[_bucket(r)] += 1
    return {
        "num_balls": num_balls,
        "total_putts": total,
        "avg_putts_per_ball": round(total / num_balls, 2) if num_balls else 0,
        "distribution": distribution,
        "one_putts": distribution["1"],
    }


def aggregate_stats(sessions: List[dict]) -> dict:
    """Aggregate over several sessions (each already carrying 'stats')."""
    if not sessions:
        return {
            "sessions": 0,
            "best_total_putts": None,
            "avg_total_putts": None,
            "last_total_putts": None,
            "avg_one_putt_pct": None,
            "history": [],
        }

    totals = [s["stats"]["total_putts"] for s in sessions]
    one_putt_pcts = [
        (s["stats"]["one_putts"] / s["stats"]["num_balls"] * 100)
        for s in sessions
        if s["stats"]["num_balls"]
    ]
    # sessions are passed newest-first; history should read oldest->newest
    history = [
        {
            "played_at": s["played_at"],
            "total_putts": s["stats"]["total_putts"],
            "one_putts": s["stats"]["one_putts"],
        }
        for s in reversed(sessions)
    ]
    return {
        "sessions": len(sessions),
        "best_total_putts": min(totals),
        "avg_total_putts": round(sum(totals) / len(totals), 1),
        "last_total_putts": totals[0],  # newest-first
        "avg_one_putt_pct": round(sum(one_putt_pcts) / len(one_putt_pcts), 1),
        "history": history,
    }
