-- Code-run success per (batch, student).
-- Due  = every coding-type exercise (level_type CODING / BLOCKLY / CHALLENGE / APPBUILDER) in the level_list of
--        a session held for the batch, for each student listed on that held class.
-- OK   = the student has a score_management row with score > 0 for that level since window start
--        (the replica only stores submitted runs; a submitted, scored run = "ran successfully").
WITH {{COMMON}},
sa AS MATERIALIZED (
  SELECT DISTINCT batch_id, sid, username FROM held_attendees WHERE sid IS NOT NULL
),
cl AS MATERIALIZED (
  SELECT DISTINCT s.session_id AS sid, x.level_id
  FROM wizklub.session s
  CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(s.level_list) = 'array' THEN s.level_list ELSE '[]'::jsonb END) x(level_id)
  JOIN wizklub.level lv ON lv.level_id = x.level_id
  WHERE lv.level_type IN ('CODING', 'BLOCKLY', 'CHALLENGE', 'APPBUILDER')
    AND s.session_id IN (SELECT DISTINCT sid FROM sa)
),
due AS MATERIALIZED (
  SELECT DISTINCT sa.batch_id, sa.username, cl.level_id FROM sa JOIN cl ON cl.sid = sa.sid
),
ok AS MATERIALIZED (
  SELECT DISTINCT sm.username, sm.level_id
  FROM wizklub.score_management_fdw sm
  WHERE sm.last_modified >= DATE '{{FROM}}' AND sm.score > 0
    AND sm.level_id IN (SELECT DISTINCT level_id FROM cl)
    AND sm.username IN (SELECT DISTINCT username FROM sa)
)
SELECT due.batch_id, due.username, COUNT(*) AS code_runs_total, COUNT(ok.level_id) AS code_runs_ok
FROM due LEFT JOIN ok ON ok.username = due.username AND ok.level_id = due.level_id
GROUP BY due.batch_id, due.username
