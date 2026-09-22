-- Principal feedback per school — runs on Metabase DB 16 (prod; feedback_school is empty in growth-poc).
-- Rating logic copied from card 1915 (PF C1): any "Not satisfied" answer => not satisfied.
WITH f AS (
  SELECT fs.school_id,
    (SELECT e.value->>'value' FROM jsonb_array_elements(fs.feedbacks) e WHERE e.value->>'question_id' = '35fd5df5-9ea2-4270-8201-f2cead8a77b9' LIMIT 1) AS q1,
    (SELECT e.value->>'value' FROM jsonb_array_elements(fs.feedbacks) e WHERE e.value->>'question_id' = '9872043a-b19d-4c50-8b63-5286f5295396' LIMIT 1) AS q2,
    (SELECT e.value->>'value' FROM jsonb_array_elements(fs.feedbacks) e WHERE e.value->>'question_id' = '4eccbebf-7ed0-4818-a062-74978f504756' LIMIT 1) AS q3,
    (SELECT e.value->>'value' FROM jsonb_array_elements(fs.feedbacks) e WHERE e.value->>'question_id' = '5d9fca75-13d5-434f-a61e-9ab2be2147ad' LIMIT 1) AS q4,
    COALESCE(NULLIF(TRIM(fs.feedback_by), ''),
      (SELECT e.value->>'value' FROM jsonb_array_elements(fs.feedbacks) e WHERE e.value->>'question_id' = '0f26d4b8-ecde-4cf7-ab41-ee50b385d6cb' LIMIT 1), '') AS by_name
  FROM wizklub.feedback_school fs
  WHERE fs.form_id = '6a2107db-67af-46c6-9004-3a78772ca17f'
    AND lower(trim(COALESCE(fs.school_id, ''))) NOT IN ('vivekanada', 'vivekananda')
)
SELECT school_id, COUNT(*) AS responses,
  COUNT(*) FILTER (WHERE 'Not satisfied' IN (q1, q2, q4)
                      OR '3' IN (q3::jsonb->>'1', q3::jsonb->>'2', q3::jsonb->>'3', q3::jsonb->>'4')) AS not_satisfied
FROM f
WHERE lower(trim(by_name)) <> 'ravinder reddy'
GROUP BY school_id
