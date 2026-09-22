-- Shared CTEs, injected by build_snapshot.py wherever {{COMMON}} appears.
-- {{FROM}} = window start (2026-04-01), {{AS_OF_MS}} = end of data_as_of day (IST) in epoch-ms.
ay_batches AS MATERIALIZED (
  SELECT bd.batch_id
  FROM wizklub.batch_details bd
  WHERE bd.start_date >= DATE '{{FROM}}'
),
held_occ AS MATERIALIZED (
  -- latest batch_info row per (batch, occurrence) that was actually held (card 235 rule)
  SELECT * FROM (
    SELECT bi.batch_id, bi.occurrence_id, bi.scheduled_date, bi.status, bi.completion_type, bi.attendees,
           NULLIF(TRIM(BOTH '[]"'' ' FROM bi.session_id), '') AS sid,
           ROW_NUMBER() OVER (PARTITION BY bi.batch_id, bi.occurrence_id ORDER BY COALESCE(bi.last_modified, 0) DESC) AS rn
    FROM wizklub.batch_info_fdw bi
    JOIN ay_batches ab ON ab.batch_id = bi.batch_id
    WHERE NULLIF(bi.occurrence_id, '') IS NOT NULL
  ) x
  WHERE rn = 1
    AND (status IN ('COMPLETED', 'PARTIAL') OR completion_type IN ('FULL', 'PARTIAL'))
    AND COALESCE(status, '') <> 'CANCELLED'
    AND scheduled_date > 0 AND scheduled_date <= {{AS_OF_MS}}
),
held_attendees AS MATERIALIZED (
  SELECT DISTINCT h.batch_id, h.occurrence_id, h.sid, TRIM(att->>'username') AS username,
         COALESCE((att->>'present_flag')::boolean, false) AS present
  FROM held_occ h
  CROSS JOIN LATERAL json_array_elements(CASE WHEN json_typeof(h.attendees) = 'array' THEN h.attendees ELSE '[]'::json END) att
  WHERE NULLIF(TRIM(att->>'username'), '') IS NOT NULL
)
