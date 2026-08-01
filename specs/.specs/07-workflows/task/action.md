# TASK-CASH-SHIFT-CLOSURE

## Objetivo

Implementar el cierre explícito de turnos de caja antes del cierre diario, con recuperación administrativa auditable para turnos abandonados o terminales inaccesibles.

## Estado

- [x] Persistir modo y motivo de cierre administrativo.
- [x] Exponer `PATCH /cash-shifts/:id/close` para cierre normal y administrativo.
- [x] Recalcular resumen diario, efectivo contado y diferencias desde los turnos.
- [x] Mostrar turnos abiertos y captura de efectivo contado por turno.
- [x] Bloquear visualmente "Cerrar jornada" mientras existan turnos abiertos.
- [x] Mapear códigos API a mensajes operativos.
- [x] Documentar el procedimiento administrativo.
- [x] Ejecutar validación completa en un entorno con dependencias instaladas.
