\set ON_ERROR_STOP on

-- Logical terminal inventory derived from historical daily closes.
SELECT
  location."id" AS "operationalLocationId",
  location."code" AS "locationCode",
  location."name" AS "locationName",
  close."terminalIdentifier",
  COUNT(*) AS "historicalCloseCount",
  MIN(close."businessDate") AS "firstBusinessDate",
  MAX(close."businessDate") AS "lastBusinessDate"
FROM "PointOfSaleDailyClose" close
JOIN "OperationalLocation" location ON location."id" = close."operationalLocationId"
GROUP BY location."id", location."code", location."name", close."terminalIdentifier"
ORDER BY location."name", close."terminalIdentifier";
