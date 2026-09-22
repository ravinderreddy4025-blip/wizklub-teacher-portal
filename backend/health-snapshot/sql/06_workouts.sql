-- Workout submission per (batch, held session, attendee) — logic copied from dashboard 29 card 235:
-- submitted = latest session_log status COMPLETED, OR all levels of the session scored (score_management
-- since window start) after the last session_log touch.
WITH {{COMMON}},
sa AS MATERIALIZED (
  SELECT DISTINCT batch_id, sid AS session_id, username FROM held_attendees WHERE sid IS NOT NULL
),
latest_sl AS MATERIALIZED (
  SELECT DISTINCT ON (sa.username, sa.session_id) sa.username, sa.session_id,
         UPPER(TRIM(sl.status)) AS status, sl.last_modified
  FROM (SELECT DISTINCT username, session_id FROM sa) sa
  JOIN wizklub.session_log_fdw sl ON sl.username = sa.username AND sl.session_id = sa.session_id
  ORDER BY sa.username, sa.session_id, sl.last_modified DESC NULLS LAST
),
sm AS MATERIALIZED (
  SELECT sm.username, sm.session_id, COUNT(DISTINCT sm.level_id) AS levels_done, MAX(sm.last_modified) AS sm_last
  FROM (SELECT DISTINCT username, session_id FROM sa) sa
  JOIN wizklub.score_management_fdw sm ON sm.username = sa.username AND sm.session_id = sa.session_id
  WHERE sm.last_modified >= DATE '{{FROM}}'
  GROUP BY sm.username, sm.session_id
),
se AS (
  SELECT s.session_id,
         CASE WHEN jsonb_typeof(s.level_list) = 'array' THEN jsonb_array_length(s.level_list) ELSE 0 END AS expected_levels,
         COALESCE(NULLIF(LOWER(REGEXP_REPLACE(TRIM(COALESCE(s.name, '')), '\s*-\s*', '-', 'g')), ''), s.session_id) AS topic_key
  FROM wizklub.session s
  WHERE s.session_id IN (SELECT DISTINCT session_id FROM sa)
)
SELECT sa.batch_id, sa.session_id, sa.username,
       COALESCE(se.topic_key, sa.session_id) AS topic_key,
       vt.ctype,
       COALESCE(se.expected_levels, 0) AS expected_levels,
       COALESCE(sm.levels_done, 0) AS levels_done,
       (COALESCE(sl.status, '') = 'COMPLETED'
         OR (COALESCE(sm.levels_done, 0) >= COALESCE(se.expected_levels, 0) AND COALESCE(se.expected_levels, 0) > 0
             AND (sl.last_modified IS NULL OR sm.sm_last > sl.last_modified))) AS submitted
FROM sa
LEFT JOIN latest_sl sl ON sl.username = sa.username AND sl.session_id = sa.session_id
LEFT JOIN sm ON sm.username = sa.username AND sm.session_id = sa.session_id
LEFT JOIN se ON se.session_id = sa.session_id
LEFT JOIN wizklub.v_session_type vt ON vt.session_id = sa.session_id
