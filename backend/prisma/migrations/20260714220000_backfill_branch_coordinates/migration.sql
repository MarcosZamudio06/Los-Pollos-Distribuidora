UPDATE "OperationalLocation"
SET
  "latitude" = CASE "code"
    WHEN 'VER' THEN 19.183000
    WHEN 'BDR' THEN 19.106500
    WHEN 'ALV' THEN 18.773500
  END,
  "longitude" = CASE "code"
    WHEN 'VER' THEN -96.134000
    WHEN 'BDR' THEN -96.108000
    WHEN 'ALV' THEN -95.761500
  END
WHERE "code" IN ('VER', 'BDR', 'ALV');
