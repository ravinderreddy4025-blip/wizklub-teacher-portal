-- Roster = batch.attendees (v_batch_roster) + student profile/login from wizklub_users_fdw.
WITH r AS MATERIALIZED (
  SELECT DISTINCT batch_id, TRIM(username) AS username
  FROM wizklub.v_batch_roster
  WHERE start_date >= DATE '{{FROM}}' AND NULLIF(TRIM(username), '') IS NOT NULL
)
SELECT r.batch_id, r.username, u.name, u.grade, u.last_login
FROM r
LEFT JOIN wizklub.wizklub_users_fdw u ON u.username = r.username
ORDER BY r.batch_id, r.username
