"""Penalty/AET parsing against the EXACT football-data.org single-match response.

Replicates GET /matches/552096 (UCL final, PSG 1-1 Arsenal, PSG win 4-3 on pens) —
the single-match endpoint that 'refresh from API' uses. Asserts the stored score is
the AET score (1-1) and the shootout is kept separately as 4-3 (not folded into 5-4
and not 3-3).

Run: python -m tests.test_penalty_parse   (from the backend/ dir)
or with pytest if installed.
"""
from app.services.football_api import _parse_match

# Verbatim `score` block from GET /matches/552096.
UCL_FINAL_SCORE = {
    "winner": "HOME_TEAM",
    "duration": "PENALTY_SHOOTOUT",
    "fullTime": {"home": 5, "away": 4},
    "halfTime": {"home": 0, "away": 1},
    "regularTime": {"home": 1, "away": 1},
    "extraTime": {"home": 0, "away": 0},
    "penalties": {"home": 4, "away": 3},
}


def _match(score):
    return {
        "id": 552096,
        "utcDate": "2026-05-31T19:00:00Z",
        "status": "FINISHED",
        "matchday": None,
        "stage": "FINAL",
        "group": None,
        "competition": {"name": "UEFA Champions League"},
        "homeTeam": {"name": "Paris Saint-Germain FC", "crest": None},
        "awayTeam": {"name": "Arsenal FC", "crest": None},
        "score": score,
    }


def test_ucl_final_penalty_parse():
    parsed = _parse_match(_match(UCL_FINAL_SCORE))
    assert parsed["home_score"] == 1, f"home_score={parsed['home_score']}"
    assert parsed["away_score"] == 1, f"away_score={parsed['away_score']}"
    assert parsed["home_penalties"] == 4, f"home_penalties={parsed['home_penalties']}"
    assert parsed["away_penalties"] == 3, f"away_penalties={parsed['away_penalties']}"
    assert parsed["duration"] == "PENALTY_SHOOTOUT"


if __name__ == "__main__":
    test_ucl_final_penalty_parse()
    print("test_ucl_final_penalty_parse PASSED")
