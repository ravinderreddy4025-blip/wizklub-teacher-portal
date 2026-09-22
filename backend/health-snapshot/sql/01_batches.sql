-- One row per AY batch (any state/type). Region + school-name overrides copied from dashboard 24 card 190.
SELECT
  bd.batch_id, bd.name AS batch_name, bd.grade, bd.school_id,
  COALESCE(CASE bd.school_id WHEN 'moha0005' THEN 'Sri Chaitanya-Mohali' WHEN 'poll0002' THEN 'Sri Chaitanya-Pollachi'
                             WHEN 'beng0071' THEN 'Sri Chaitanya-Rampura' WHEN 'hyde0119' THEN 'Sri Chaitanya-Nagole Metro CBSE' END,
           NULLIF(TRIM(s.name), ''), bd.school_name) AS school_name,
  COALESCE(CASE
    WHEN bd.school_id = 'moha0005' THEN 'Punjab'
    WHEN bd.school_id = 'poll0002' THEN 'Tamil Nadu'
    WHEN bd.school_id = 'beng0071' THEN 'Bengaluru'
    WHEN bd.school_id = 'hyde0119' THEN 'Telangana'
    WHEN rc.region_name LIKE 'IL School%' THEN 'IL School'
    WHEN COALESCE(NULLIF(TRIM(s.name), ''), bd.school_name) IN ('Beverly Hills Shalini School','Cauvery Public School','Jaipur Xaviers School',
      'Luxor World School','Pt Uma Dutt Public School','Radha Krishna Public School','Railways Higher Secondary School','Seven Hills School',
      'Shidiswa Samvarddhan Gurukul School','Sri Saraswathi Public School','St. Arnold Central School','St. Soldier''s School','Suraj Public School',
      'The Future Foundation School','Vivekananda CBSE School','Vivekananda Higher Secondary School','Vivekananda Vidyalaya') THEN 'IL School'
    ELSE rc.region_name END, 'Unknown Region') AS region,
  NULLIF(TRIM(bd.instructor), '') AS instructor,
  iu.name AS instructor_name,
  bd.start_date::date::text AS start_date,
  bd.batch_state, bd.batch_type, bd.batch_category,
  s.bussiness->>'b_mode' AS b_mode,
  CASE WHEN jsonb_typeof(bd.attendees) = 'array' THEN jsonb_array_length(bd.attendees) ELSE 0 END AS roster_size
FROM wizklub.batch_details bd
LEFT JOIN wizklub.schools s ON s.school_id = bd.school_id
LEFT JOIN wizklub.region_config rc ON rc.region_id = s.region_id
LEFT JOIN wizklub.wizklub_users_fdw iu ON iu.username = bd.instructor
WHERE bd.start_date >= DATE '{{FROM}}'
ORDER BY bd.batch_id
