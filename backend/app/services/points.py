def calculate_points(
    pred_home: int,
    pred_away: int,
    actual_home: int,
    actual_away: int,
    duration: str | None = None,
    home_penalties: int | None = None,
    away_penalties: int | None = None,
    pred_pen_winner: str | None = None,
) -> float:
    def score_result(h: int, a: int) -> str:
        if h > a: return "home"
        if a > h: return "away"
        return "draw"

    # For penalty shootout matches the decisive result is who won on pens, not the AET draw
    if duration == "PENALTY_SHOOTOUT" and home_penalties is not None and away_penalties is not None:
        actual_result = "home" if home_penalties > away_penalties else "away"
    else:
        actual_result = score_result(actual_home, actual_away)

    pred_result = score_result(pred_home, pred_away)

    # Exact AET score
    if pred_home == actual_home and pred_away == actual_away:
        points = 3.0
        if duration == "PENALTY_SHOOTOUT" and pred_pen_winner is not None and home_penalties is not None:
            pen_winner = "home" if home_penalties > away_penalties else "away"
            if pred_pen_winner == pen_winner:
                points += 1.0
        return points

    points = 0.0

    if pred_result == actual_result:
        points += 1.0
        if abs(pred_home - pred_away) == abs(actual_home - actual_away):
            points += 0.5

    if pred_home + pred_away == actual_home + actual_away:
        points += 0.25

    return points
