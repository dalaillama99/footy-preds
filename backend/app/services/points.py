def calculate_points(pred_home: int, pred_away: int, actual_home: int, actual_away: int) -> float:
    if pred_home == actual_home and pred_away == actual_away:
        return 3.0

    points = 0.0

    def result(h: int, a: int) -> str:
        if h > a:
            return "home"
        if a > h:
            return "away"
        return "draw"

    pred_result = result(pred_home, pred_away)
    actual_result = result(actual_home, actual_away)

    if pred_result == actual_result:
        points += 1.0
        if abs(pred_home - pred_away) == abs(actual_home - actual_away):
            points += 0.5

    if pred_home + pred_away == actual_home + actual_away:
        points += 0.25

    return points
