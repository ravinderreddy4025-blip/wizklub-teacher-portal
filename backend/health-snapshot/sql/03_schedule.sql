-- Planned occurrences (batch_schedule_fdw.schedule_details, epoch-ms dates).
WITH {{COMMON}}
SELECT DISTINCT bs.batch_id,
       occ->>'occurrence_id' AS occurrence_id,
       (occ->>'scheduled_date')::bigint AS scheduled_ms,
       NULLIF(occ->'session_list'->>0, '') AS session_id,
       COALESCE((occ->>'extra_class')::boolean, false) AS is_extra
FROM wizklub.batch_schedule_fdw bs
JOIN ay_batches ab ON ab.batch_id = bs.batch_id
CROSS JOIN LATERAL json_array_elements(bs.schedule_details) occ
