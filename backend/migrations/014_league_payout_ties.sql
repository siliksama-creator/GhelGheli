-- Fixes silent prize loss when two players finish a league season on the
-- exact same score.
--
-- THE BUG
-- closeActiveSeason() ranks players with DENSE_RANK(), which deliberately
-- gives tied players the SAME rank — that is the correct sporting behaviour.
-- But league_payouts carried UNIQUE (league_season_id, rank) and the insert
-- used ON CONFLICT DO NOTHING. So with a tie for 3rd place:
--     player A -> rank 3 -> row inserted
--     player B -> rank 3 -> conflict -> SILENTLY DROPPED
-- The second player simply never received a payout, with no error anywhere.
-- With integer point totals, ties are not a rare edge case.
--
-- THE FIX
-- The real invariant is "one payout per USER per season", not "one payout per
-- rank". Both tied players legitimately hold rank 3 and both should be paid.
ALTER TABLE league_payouts
  DROP CONSTRAINT IF EXISTS league_payouts_league_season_id_rank_key;

-- Deduplicate any rows a previous close may have produced before adding the
-- correct constraint (no-op on a clean database).
DELETE FROM league_payouts a USING league_payouts b
 WHERE a.ctid < b.ctid
   AND a.league_season_id = b.league_season_id
   AND a.user_id = b.user_id;

ALTER TABLE league_payouts
  ADD CONSTRAINT league_payouts_season_user_key
  UNIQUE (league_season_id, user_id);

-- Ranking queries read by season and order by rank.
CREATE INDEX IF NOT EXISTS idx_league_payouts_season_rank
  ON league_payouts(league_season_id, rank);
