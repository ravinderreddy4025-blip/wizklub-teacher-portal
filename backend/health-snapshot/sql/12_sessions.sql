-- Session names + content type (v_session_type) for class rows that only exist in the schedule.
SELECT st.session_id, TRIM(st.name) AS name, st.ctype
FROM wizklub.v_session_type st
WHERE st.session_id IN (
  SELECT DISTINCT NULLIF(occ->'session_list'->>0, '')
  FROM wizklub.batch_schedule_fdw bs
  JOIN wizklub.batch_details bd ON bd.batch_id = bs.batch_id AND bd.start_date >= DATE '{{FROM}}'
  CROSS JOIN LATERAL json_array_elements(bs.schedule_details) occ
)
