-- Prodigy Test strands: % of answered questions scored > 0 per strand (tags prodigy:<bank>-<strand><n> in level).
WITH r AS MATERIALIZED (
  SELECT DISTINCT TRIM(username) AS username FROM wizklub.v_batch_roster
  WHERE start_date >= DATE '{{FROM}}' AND NULLIF(TRIM(username), '') IS NOT NULL
)
SELECT sm.username, substring(t.tag from '^prodigy:[A-Z]-([A-Z])') AS strand,
       COUNT(*) AS answered, COUNT(*) FILTER (WHERE sm.score > 0) AS correct
FROM wizklub.score_management_fdw sm
JOIN r ON r.username = sm.username
JOIN wizklub.session_topic st ON st.topic_id = sm.topic_id AND st.report_type = 'PRODIGY_REPORT'
JOIN wizklub.level l ON l.level_id = sm.level_id
CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(l.tags) = 'array' THEN l.tags ELSE '[]'::jsonb END) t(tag)
WHERE t.tag ~ '^prodigy:[A-Z]-[A-Z]'
GROUP BY 1, 2
