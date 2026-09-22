-- Assessment attempts (score_management_fdw) for roster students since window start.
-- Assessment = session name contains "assessment" (incl. typo "assesment"): Assessment - I, Mid-Year, Final,
-- product assessments. Excludes Pre-Assessment Revision, Practice Tests, Prodigy and CORE Battery diagnostics.
-- pct follows dashboard 32 card 1245: LEAST(SUM(score) / session.max_score * 100, 100).
WITH r AS MATERIALIZED (
  SELECT DISTINCT TRIM(username) AS username FROM wizklub.v_batch_roster
  WHERE start_date >= DATE '{{FROM}}' AND NULLIF(TRIM(username), '') IS NOT NULL
),
a AS MATERIALIZED (
  SELECT session_id, TRIM(name) AS name, max_score FROM wizklub.session
  WHERE name ~* 'assess?ment' AND name !~* 'revision|pre[- ]?assess|practice'
)
SELECT sm.username, sm.session_id, a.name, a.max_score,
       SUM(COALESCE(sm.score, 0)) AS score,
       (MAX(sm.last_modified) AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date::text AS date,
       COUNT(*) AS answers
FROM wizklub.score_management_fdw sm
JOIN a ON a.session_id = sm.session_id
JOIN r ON r.username = sm.username
WHERE sm.last_modified >= DATE '{{FROM}}'
GROUP BY sm.username, sm.session_id, a.name, a.max_score
