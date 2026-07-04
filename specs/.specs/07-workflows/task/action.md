### TASK-073 — Implementar evidencia, cobros y liquidación de ruta backend

Estado inicial: `PENDING`

Depende de:

- TASK-043
- TASK-070

Objetivo:

Implementar evidencia de entrega, cobros en ruta, incidencias, devoluciones y liquidación de ruta.

Reglas:

- Evidencia puede incluir foto, firma, geolocalización o nota; obligatoriedad exacta queda pendiente de negocio.
- Registrar cobros en ruta solo cuando exista saldo por cobrar y la política lo permita.
- Para MVP, cada pago de ruta aplica a una sola cuenta por cobrar mediante `Payment.accountReceivableId` requerido.
- Liquidación compara pedidos entregados, devoluciones, incidencias y dinero cobrado.
- Devoluciones o rechazos que afecten stock deben generar trazabilidad y movimiento de inventario cuando corresponda.

---
- Toda UI agregada debe de ser en correcto y perfecto en español. NO en Inglés
- Leer parcialmente estos specs, solo buscando entidades, relaciones, enums, constraints o reglas relacionadas con cuentas por cobrar y pagos:
- No leer roadmap, OpenSpec archive, UI completa, testing global, specs que no han sido especificados por la task, ni arquitectura completa salvo que una validación falle por información no visible en los specs requeridos.