# Procedimiento para turnos abandonados

## Objetivo

Cerrar de forma controlada un `CashShift` cuando el cajero no puede volver a la terminal o la terminal registrada quedó inaccesible, sin ocultar el conteo ni la diferencia.

## Requisitos

- Actor autenticado con `cash_shifts.administrative_close`.
- Identificador del turno y de la sucursal confirmados.
- Conteo físico de efectivo realizado por el responsable operativo.
- Motivo administrativo documentado.

## Procedimiento

1. Abrir el cierre diario y localizar el turno en **Turnos abiertos**.
2. Confirmar terminal, cajero, fecha de negocio y operaciones asociadas.
3. Realizar el conteo físico del efectivo y conservar la evidencia operativa definida por la sucursal.
4. Ejecutar el cierre administrativo con `cashCountedTotal` y `administrativeReason`.
5. Verificar que el turno muestre estado **Cerrado**, conteo y diferencia.
6. Revisar la diferencia como sobrante o faltante; justificarla y autorizarla mediante el flujo normal cuando corresponda.
7. Actualizar y validar el cierre diario.
8. Finalizar la jornada únicamente cuando la lista no tenga turnos abiertos.

## Reglas de control

- No inventar, copiar ni reutilizar el `deviceId` de otra terminal.
- No usar el efectivo esperado como sustituto del efectivo contado.
- No cancelar el turno para ocultar una diferencia.
- No borrar movimientos, pagos, ventas ni evidencia histórica.
- Un cierre administrativo conserva actor, fecha, motivo, conteo y diferencia.
- Si el conteo físico no puede verificarse, mantener el turno abierto y escalar el caso al responsable administrativo.
