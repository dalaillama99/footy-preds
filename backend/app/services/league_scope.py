"""Shared logic for scoping fixtures/predictions to a league's chosen competitions
and (for Champions League) chosen team subset.

`Fixture.competition` is NOT reliably the exact `COMPETITIONS[code]` string.
Historically nothing ever corrected it: rows created by the live-score poller's
fallback path (`fetch_live_matches` -> `_parse_match` with no
`competition_override`) hold football-data.org's raw `competition.name` — e.g.
"Primera Division" rather than "La Liga" — and `upsert_fixtures` never rewrote
`competition` on update. That last part is no longer true: a deliberate
`POST /fixtures/sync` now passes `normalize_competition=True`, which rewrites
`competition` to the canonical `COMPETITIONS[code]` string on the update path,
so a re-sync heals those legacy rows. Rows not yet re-synced can still hold a
raw name, and `FixtureCreate.competition` is free text an admin can type
anything into. So competition matching here uses keyword substring matching
(`Fixture.competition.contains(keyword)`), never exact equality — see
COMPETITION_KEYWORDS below.

Unrecognized competition strings do NOT fail open uniformly: see
`fixture_in_league_scope`, which fails open only for admin-created fixtures
(`api_id is None`) and excludes API-sourced ones. That narrowing depends on the
normalization above being in place.

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
# scoping for the missing competitions: they'd fall into the no-code branch
# below and, being API-sourced, vanish from every league entirely.
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
    name — see `fixture_in_league_scope` for how that case is resolved; it is
    no longer a blanket fail-open)."""
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

    CL team-pool matching is "either team," not "both teams": when `ucl_teams`
    is a non-empty set, a fixture is in scope if AT LEAST ONE of
    `fixture.home_team`/`fixture.away_team` is in the pool — the opponent need
    not be selected. E.g. with `ucl_teams={"A", "B"}`, both "A vs C" and "A vs B"
    are in scope; only a fixture with neither side in the pool (e.g. "C vs D")
    is excluded.
    """
    code = match_competition_code(fixture.competition)

    # Narrowed fail-open. A competition string matching none of our keywords is
    # in scope for every league ONLY if the fixture was hand-created by an admin
    # (`api_id is None` — POST /fixtures takes a free-text competition, so there
    # is no code to scope it by and excluding it would break a working feature).
    # An API-sourced fixture whose competition matches no keyword is out of scope
    # for every league: the old blanket fail-open let one league's Champions
    # League pool be bypassed entirely by any unrecognized string. Uses getattr
    # because this function takes fixture-*like* objects, not only Fixture rows.
    if code is None:
        return getattr(fixture, "api_id", None) is None

    if code not in competition_codes:
        return False

    if code == "CL":
        if ucl_teams is None:
            return True
        return fixture.home_team in ucl_teams or fixture.away_team in ucl_teams

    return True
