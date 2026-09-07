import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.services.points import calculate_points


# ── Penalty shootout scenarios ────────────────────────────────────────────────
# Actual: 1–1 AET, home wins 5–3 on pens

def test_exact_score_correct_pen_winner():
    assert calculate_points(1, 1, 1, 1, duration="PENALTY_SHOOTOUT", home_penalties=5, away_penalties=3, pred_pen_winner="home") == 4.0

def test_exact_score_wrong_pen_winner():
    assert calculate_points(1, 1, 1, 1, duration="PENALTY_SHOOTOUT", home_penalties=5, away_penalties=3, pred_pen_winner="away") == 3.0

def test_exact_score_no_pen_winner():
    assert calculate_points(1, 1, 1, 1, duration="PENALTY_SHOOTOUT", home_penalties=5, away_penalties=3, pred_pen_winner=None) == 3.0

def test_draw_prediction_correct_gd_correct_pen():
    # pred 2–2, actual 1–1: draw ✓, GD 0==0 ✓, pen winner ✓ → 2.5
    assert calculate_points(2, 2, 1, 1, duration="PENALTY_SHOOTOUT", home_penalties=5, away_penalties=3, pred_pen_winner="home") == 2.5

def test_draw_prediction_correct_gd_wrong_pen():
    # pred 2–2, actual 1–1: draw ✓, GD ✓, pen wrong → 2.0
    assert calculate_points(2, 2, 1, 1, duration="PENALTY_SHOOTOUT", home_penalties=5, away_penalties=3, pred_pen_winner="away") == 2.0

def test_draw_prediction_correct_gd_no_pen():
    # pred 2–2, actual 1–1: draw ✓, GD ✓, no pen pred → 2.0
    assert calculate_points(2, 2, 1, 1, duration="PENALTY_SHOOTOUT", home_penalties=5, away_penalties=3, pred_pen_winner=None) == 2.0

def test_non_draw_prediction_in_pen_game():
    # pred 2–1 (home win), actual 1–1, home wins 5–3 → predicted winner correct (+0.5),
    # away tally 1==1 correct (+0.25) → 0.75
    assert calculate_points(2, 1, 1, 1, duration="PENALTY_SHOOTOUT", home_penalties=5, away_penalties=3, pred_pen_winner="home") == 0.75

def test_non_draw_prediction_wrong_result_correct_pen():
    # pred 3–1 (home win), actual 1–1, home wins 5–3 → predicted winner correct (+0.5),
    # away tally 1==1 correct (+0.25) → 0.75
    assert calculate_points(3, 1, 1, 1, duration="PENALTY_SHOOTOUT", home_penalties=5, away_penalties=3, pred_pen_winner="home") == 0.75

def test_non_draw_prediction_wrong_team_wins_pens():
    # pred 2–1 (home win), actual 1–1, away wins pens → predicted winner wrong (+0),
    # away tally 1==1 correct (+0.25) → 0.25
    assert calculate_points(2, 1, 1, 1, duration="PENALTY_SHOOTOUT", home_penalties=3, away_penalties=5, pred_pen_winner=None) == 0.25

def test_non_draw_prediction_correct_team_no_tally_match():
    # pred 3–1 (home), actual 2–2, home wins pens → predicted winner correct (+0.5),
    # neither tally matches (3≠2, 1≠2) → 0.5
    assert calculate_points(3, 1, 2, 2, duration="PENALTY_SHOOTOUT", home_penalties=5, away_penalties=3, pred_pen_winner=None) == 0.5

def test_non_draw_prediction_wrong_team_no_tally_match():
    # pred 3–1 (home), actual 2–2, away wins pens → predicted winner wrong (+0),
    # neither tally matches (3≠2, 1≠2) → 0.0
    assert calculate_points(3, 1, 2, 2, duration="PENALTY_SHOOTOUT", home_penalties=3, away_penalties=5, pred_pen_winner=None) == 0.0

def test_non_draw_prediction_away_correct():
    # pred 0–1 (away win), actual 1–1, away wins pens (3 < 5) → predicted winner correct (+0.5),
    # away tally 1==1 correct (+0.25) → 0.75
    assert calculate_points(0, 1, 1, 1, duration="PENALTY_SHOOTOUT", home_penalties=3, away_penalties=5, pred_pen_winner=None) == 0.75


# ── Non-penalty scenarios (unchanged behaviour) ───────────────────────────────

def test_exact_regular():
    assert calculate_points(2, 1, 2, 1) == 3.0

def test_correct_result_correct_gd():
    # pred 2–1, actual 3–2: result ✓ (home), GD 1==1 ✓ → 2.0
    assert calculate_points(2, 1, 3, 2) == 2.0

def test_correct_result_wrong_gd():
    # pred 3–0 (GD=3) vs actual 2–1 (GD=1): result ✓, GD wrong, neither tally matches (3≠2, 0≠1) → 1.5
    assert calculate_points(3, 0, 2, 1) == 1.5

def test_correct_result_no_bonus():
    # pred 2–0 (GD=2) vs actual 3–0 (GD=3): result ✓, GD wrong, away tally 0==0 ✓ → 1.75
    assert calculate_points(2, 0, 3, 0) == 1.75

def test_wrong_result():
    assert calculate_points(0, 1, 2, 0) == 0.0

def test_no_tally_match_wrong_result():
    # pred 3–0 (home), actual 1–2 (away): wrong result, neither tally matches (3≠1, 0≠2) → 0.0
    assert calculate_points(3, 0, 1, 2) == 0.0

def test_extra_time_exact():
    assert calculate_points(2, 1, 2, 1, duration="EXTRA_TIME") == 3.0


# ── Per-team goal tally bonus (replaces the old "total goals" bonus) ──────────

def test_home_tally_bonus_canonical_example():
    # pred 2–0, actual 2–1: result ✓ (+1.5), GD wrong (2≠1), home tally 2==2 ✓ (+0.25) → 1.75
    assert calculate_points(2, 0, 2, 1) == 1.75

def test_away_tally_bonus_with_wrong_result():
    # pred 1–2 (away win), actual 1–0 (home win): wrong result, home tally 1==1 ✓ → 0.25
    assert calculate_points(1, 2, 1, 0) == 0.25

def test_both_tallies_correct_is_always_exact():
    # matching both tallies is definitionally an exact score → 3.0, never 0.5
    assert calculate_points(1, 1, 1, 1) == 3.0
