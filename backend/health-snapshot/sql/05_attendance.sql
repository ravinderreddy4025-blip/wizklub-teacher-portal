-- One row per (held class, student listed on it) with present_flag.
WITH {{COMMON}}
SELECT batch_id, occurrence_id, username, present
FROM held_attendees
