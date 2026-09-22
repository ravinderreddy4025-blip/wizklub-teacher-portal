-- Platform activity: session_log_fdw rows per student per IST day since window start
-- (a row = one session touched; last_modified is the latest touch, so this is a lower bound on activity).
WITH r AS MATERIALIZED (
  SELECT DISTINCT TRIM(username) AS username FROM wizklub.v_batch_roster
  WHERE start_date >= DATE '{{FROM}}' AND NULLIF(TRIM(username), '') IS NOT NULL
)
SELECT sl.username,
       (sl.last_modified AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date::text AS day,
       COUNT(*) AS events,
       MAX(sl.last_modified)::text AS last_at
FROM wizklub.session_log_fdw sl
JOIN r ON r.username = sl.username
WHERE sl.last_modified >= DATE '{{FROM}}'
GROUP BY 1, 2
