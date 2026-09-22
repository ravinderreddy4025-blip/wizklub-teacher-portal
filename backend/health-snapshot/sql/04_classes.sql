-- Latest batch_info row per (batch, occurrence) for AY batches, any status, with session name + type.
WITH {{COMMON}},
latest AS (
  SELECT * FROM (
    SELECT bi.batch_id, bi.occurrence_id, bi.scheduled_date, bi.status, bi.completion_type,
           NULLIF(TRIM(BOTH '[]"'' ' FROM bi.session_id), '') AS sid,
           ROW_NUMBER() OVER (PARTITION BY bi.batch_id, bi.occurrence_id ORDER BY COALESCE(bi.last_modified, 0) DESC) AS rn
    FROM wizklub.batch_info_fdw bi
    JOIN ay_batches ab ON ab.batch_id = bi.batch_id
    WHERE NULLIF(bi.occurrence_id, '') IS NOT NULL
  ) x WHERE rn = 1
)
SELECT l.batch_id, l.occurrence_id, l.scheduled_date AS scheduled_ms, l.status, l.completion_type,
       l.sid AS session_id, TRIM(s.name) AS session_name, st.ctype
FROM latest l
LEFT JOIN wizklub.session s ON s.session_id = l.sid
LEFT JOIN wizklub.v_session_type st ON st.session_id = l.sid
