"""Derived statistics for putting sessions.

A session result is a list of putt counts per ball, e.g. [1, 2, 1, 3, ...].
We summarise total putts and the distribution of 1-/2-/3-/4+-putts.
"""
import math
import statistics
from typing import Dict, List

BUCKETS = ["1", "2", "3", "4+"]


def _bucket(putts: int) -> str:
    return str(putts) if putts <= 3 else "4+"


def _ci95(values: List[float], nd: int = 2) -> float | None:
    """95% confidence half-width of the mean; only for >2 samples."""
    n = len(values)
    if n < 3:
        return None
    return round(1.96 * statistics.stdev(values) / math.sqrt(n), nd)


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


def _ppb(s: dict) -> float:
    """Normalised putts per ball for one session (e.g. 11 putts / 10 balls = 1.1)."""
    st = s["stats"]
    return st["total_putts"] / st["num_balls"] if st["num_balls"] else 0.0


def aggregate_stats(sessions: List[dict]) -> dict:
    """Aggregate over several sessions (each already carrying 'stats').

    All metrics are normalised to putts-per-ball so sessions with different
    ball counts are comparable.
    """
    if not sessions:
        return {
            "sessions": 0,
            "best_ppb": None,
            "avg_ppb": None,
            "last_ppb": None,
            "avg_one_putt_pct": None,
            "history": [],
            "daily": [],
        }

    ppbs = [_ppb(s) for s in sessions]  # newest-first
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
            "ppb": round(_ppb(s), 2),
            "one_putts": s["stats"]["one_putts"],
        }
        for s in reversed(sessions)
    ]
    # Chart series: consolidate all sessions of one calendar day into one point
    # (average putts-per-ball, with a 95% CI when >2 sessions that day).
    # Sessions themselves stay separate elsewhere.
    by_day: dict = {}
    for s in sessions:
        by_day.setdefault(s["played_at"][:10], []).append(_ppb(s))
    daily = [
        {"date": day, "avg_ppb": round(sum(v) / len(v), 2),
         "sessions": len(v), "ci": _ci95(v)}
        for day, v in sorted(by_day.items())
    ]
    return {
        "sessions": len(sessions),
        "best_ppb": round(min(ppbs), 2),
        "avg_ppb": round(sum(ppbs) / len(ppbs), 2),
        "last_ppb": round(ppbs[0], 2),  # newest-first
        "avg_one_putt_pct": round(sum(one_putt_pcts) / len(one_putt_pcts), 1),
        "history": history,
        "daily": daily,  # per-day consolidated chart series (putts per ball)
    }


def club_stats(shots: List[dict]) -> dict:
    """Aggregate range shots for one club.

    Each shot carries carry_m, drift_m (signed: - left, + right) and tags.
    Shots are passed newest-first.
    """
    if not shots:
        return {
            "shots": 0,
            "avg_carry": None,
            "max_carry": None,
            "min_carry": None,
            "avg_drift": None,
            "avg_abs_drift": None,
            "tag_counts": {},
            "carry_trend": [],
            "history": [],
        }

    carries = [s["carry_m"] for s in shots]
    drifts = [s["drift_m"] for s in shots]
    tag_counts: dict = {}
    for s in shots:
        for t in s["tags"]:
            tag_counts[t] = tag_counts.get(t, 0) + 1

    # Carry trend: average carry per calendar day, ascending (oldest first).
    by_day: dict = {}
    for s in shots:
        day = s["played_at"][:10]  # "YYYY-MM-DD" (UTC-naive, see project-context)
        by_day.setdefault(day, []).append(s["carry_m"])
    carry_trend = [
        {"date": day, "avg_carry": round(sum(v) / len(v), 1),
         "shots": len(v), "ci": _ci95(v, 1)}
        for day, v in sorted(by_day.items())
    ]

    n = len(shots)
    return {
        "shots": n,
        "avg_carry": round(sum(carries) / n, 1),
        "max_carry": max(carries),
        "min_carry": min(carries),
        "avg_drift": round(sum(drifts) / n, 1),          # signed bias
        "avg_abs_drift": round(sum(abs(d) for d in drifts) / n, 1),  # dispersion
        "tag_counts": tag_counts,
        "carry_trend": carry_trend,  # ascending by day
        "history": shots,  # newest-first; frontend renders recent ones
    }
