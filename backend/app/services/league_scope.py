"""Shared logic for scoping fixtures/predictions to a league's chosen competitions
and (for Champions League) chosen team subset.

`Fixture.competition` is NOT reliably the exact `COMPETITIONS[code]` string — the
live-score poller's fallback path (`fetch_live_matches` -> `_parse_match` with no
`competition_override`) stores football-data.org's raw `competition.name` for
fixtures discovered that way, and `upsert_fixtures` never rewrites `competition`
on update once a row exists. `FixtureCreate.competition` is also free text an
admin can type anything into. So competition matching here uses keyword
substring matching (`Fixture.competition.contains(keyword)`), never exact
equality — see COMPETITION_KEYWORDS below.

This module is imported by `app.routers.leagues`, `app.routers.fixtures`, and
`app.routers.ucl` — for scoping fixtures/predictions to a league's chosen
competitions, and (in `app.routers.fixtures`) for grouping fixtures by
competition code when deciding which competitions are currently "active" for
`POST /fixtures/recalculate-recent`. `app.database`'s startup no longer runs
any backfill for this column at all — a NULL/unset `League.competitions` is
now a permanent, meaningful "not yet configured" state, not something to be
silently derived or defaulted. Do not reimplement this matching logic
anywhere else.
"""

# Maps every `COMPETITIONS` code (see app.services.football_api) to a short,
# distinctive substring that appears in that competition's real name. Must
# cover every key in COMPETITIONS — a partial mapping would silently defeat
# scoping for the missing competitions (they'd fall into the fail-open branch
# below and leak into every league unconditionally).
# Verified: all 8 keywords are mutually non-overlapping substrings of each other.
COMPETITION_KEYWORDS: dict[str, str] = {
    "WC": "World Cup",
    "CL": "Champions League",
    "PL": "Premier League",
    "BL1": "Bundesliga",
    "SA": "Serie A",
    "PD": "La Liga",
    "FL1": "Ligue 1",
    "EC": "European Championship",  # not "UEFA ..." — keep it just the distinctive part
}


def match_competition_code(competition: str | None) -> str | None:
    """Return the COMPETITIONS code whose keyword appears in `competition`, or
    None if no known keyword matches (an unrecognized/free-text competition
    name — callers should treat this as fail-open, not excluded)."""
    if not competition:
        return None
    for code, keyword in COMPETITION_KEYWORDS.items():
        if keyword in competition:
            return code
    return None


def parse_competitions(value: str | None) -> set[str]:
    """Parse a League.competitions comma-joined column value into a set of codes."""
    if not value:
        return set()
    return {c.strip() for c in value.split(",") if c.strip()}


def parse_ucl_teams(value: str | None) -> set[str] | None:
    """Parse a League.ucl_teams comma-joined column value. None means unrestricted."""
    if value is None:
        return None
    teams = {t.strip() for t in value.split(",") if t.strip()}
    return teams if teams else None


def fixture_in_league_scope(
    fixture,
    competition_codes: set[str],
    ucl_teams: set[str] | None,
) -> bool:
    """Return True if `fixture` is in scope for a league with the given
    `competition_codes` (the league's own `League.competitions`, parsed) and
    `ucl_teams` (the league's own `League.ucl_teams`, parsed; None = unrestricted
    CL, only meaningful when "CL" is in `competition_codes` in the first place).

    Critical: `ucl_teams=None` must NOT be read as "this league has unrestricted
    CL scope" unless "CL" is actually in `competition_codes` for this league —
    a league that never selected CL always has `ucl_teams=None` too (it's simply
    unset), and must contribute nothing to CL scope regardless. Gating on
    "CL" in competition_codes BEFORE looking at ucl_teams is what makes this
    correct across leagues, rather than relying on ucl_teams being NULL only for
    that reason.
    """
    code = match_competition_code(fixture.competition)

    # Fail-open: a competition string matching none of our known keywords (e.g.
    # an admin-typed arbitrary name) is treated as in scope for every league —
    # excluding it would only ever break something that used to work.
    if code is None:
        return True

    if code not in competition_codes:
        return False

    if code == "CL":
        if ucl_teams is None:
            return True
        return fixture.home_team in ucl_teams and fixture.away_team in ucl_teams

    return True
