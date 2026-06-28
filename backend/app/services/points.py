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

    is_penalty = duration == "PENALTY_SHOOTOUT" and home_penalties is not None and away_penalties is not None

    # For penalty shootouts the AET result is always a draw; who wins pens is tracked separately
    if is_penalty:
        actual_result = "draw"
    else:
        actual_result = score_result(actual_home, actual_away)

    pred_result = score_result(pred_home, pred_away)

    pen_correct = False
    if is_penalty and pred_pen_winner is not None:
        pen_winner_actual = "home" if home_penalties > away_penalties else "away"
        pen_correct = pred_pen_winner == pen_winner_actual

    # Exact AET score
    if pred_home == actual_home and pred_away == actual_away:
        points = 3.0
        if pen_correct:
            points += 1.0  # perfect penalty prediction: 4 pts total
        return points

    points = 0.0

    if pred_result == actual_result:
        points += 1.5
        if abs(pred_home - pred_away) == abs(actual_home - actual_away):
            points += 0.5
        if pen_correct:
            points += 0.5  # correct draw result + correct pen winner

    if pred_home + pred_away == actual_home + actual_away:
        points += 0.25

    return points
