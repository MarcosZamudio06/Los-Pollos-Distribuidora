\set ON_ERROR_STOP on

-- Cutover progress by operational location.
SELECT
  location."code" AS "locationCode",
  location."name" AS "locationName",
  COUNT(terminal."id") AS "totalTerminals",
  COUNT(terminal."id") FILTER (WHERE terminal."deviceId" LIKE 'legacy:%') AS "pendingTerminals",
  COUNT(terminal."id") FILTER (WHERE terminal."deviceId" NOT LIKE 'legacy:%') AS "linkedTerminals"
FROM "OperationalLocation" location
LEFT JOIN "CashTerminal" terminal ON terminal."operationalLocationId" = location."id"
GROUP BY location."id", location."code", location."name"
HAVING COUNT(terminal."id") > 0
ORDER BY location."name";

-- Actionable inventory. Any returned row remains blocked for opening shifts.
SELECT
  terminal."id" AS "terminalId",
  location."code" AS "locationCode",
  location."name" AS "locationName",
  terminal."code" AS "terminalCode",
  terminal."name" AS "terminalName",
  terminal."isActive",
  terminal."deviceId",
  terminal."updatedAt"
FROM "CashTerminal" terminal
JOIN "OperationalLocation" location ON location."id" = terminal."operationalLocationId"
WHERE terminal."deviceId" LIKE 'legacy:%'
ORDER BY location."name", terminal."code";
