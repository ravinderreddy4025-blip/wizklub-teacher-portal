-- Freshness of each replica source (max change timestamp), IST.
SELECT 'batch_info_fdw' AS source, (to_timestamp(MAX(last_modified) / 1000.0) AT TIME ZONE 'Asia/Kolkata')::text AS max_ts FROM wizklub.batch_info_fdw
UNION ALL SELECT 'batch_schedule_fdw', MAX(last_modified)::text FROM wizklub.batch_schedule_fdw
UNION ALL SELECT 'batch', MAX(last_modified)::text FROM wizklub.batch
UNION ALL SELECT 'score_management_fdw', MAX(last_modified)::text FROM wizklub.score_management_fdw
UNION ALL SELECT 'session_log_fdw', MAX(last_modified)::text FROM wizklub.session_log_fdw
UNION ALL SELECT 'wizklub_users_fdw.last_login', (to_timestamp(MAX(last_login) / 1000.0) AT TIME ZONE 'Asia/Kolkata')::text FROM wizklub.wizklub_users_fdw
