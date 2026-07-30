# Runbook: cutover de terminales POS

## Objetivo

Migrar cierres históricos a `CashTerminal` y `CashShift` sin permitir ventas desde un dispositivo no vinculado y sin dejar terminales heredadas sin seguimiento operativo.

La migración no conoce los identificadores reales de los navegadores históricos. Por diseño crea identidades `legacy:*`; cada estación debe vincularse de forma supervisada antes de abrir turno.

## Ruta rápida

1. Inventariar terminales y estaciones físicas.
2. Ensayar migración, vinculación, venta y rechazo de códigos en staging con copia anonimizada.
3. Respaldar, migrar y desplegar backend y frontend juntos durante mantenimiento.
4. Vincular cada navegador mediante código temporal y repetir el reporte hasta resolver todas las terminales activas `legacy:*`.
5. Retirar mantenimiento solo tras validar una operación controlada por sucursal.

Si cualquier total no coincide o una estación no puede mapearse de forma inequívoca, DETENER el proceso y conservar el bloqueo.

## Responsables

- Responsable técnico: respaldo, migraciones, despliegue, consultas y rollback.
- Responsable operativo: inventario físico y validación de cada caja.
- Administrador ERP: consumo de códigos temporales y reasignaciones.
- Cajero: generación del código desde el navegador que operará la caja.

No ejecutar el cutover sin los cuatro responsables disponibles durante la ventana.

## Precondiciones bloqueantes

- Ventana de mantenimiento aprobada; no deben registrarse ventas durante migración y verificación.
- Respaldo completo verificado y marcador PITR inmediatamente anterior al cutover.
- Copia anonimizada de producción restaurada en staging.
- Build candidato probado en staging contra esa copia.
- Inventario físico con sucursal, caja, navegador, responsable y `terminalIdentifier` histórico.
- Acceso administrativo probado y canal de comunicación con cada caja.
- Plan de rollback aprobado por negocio y responsable de base de datos.

## Inventario previo

Ejecutar sobre la copia de staging y luego sobre producción antes de migrar:

```bash
psql "$DATABASE_URL" --file scripts/database/inventory-pos-terminals-before-cutover.sql
```

Conciliar cada fila con una estación física. Si un `terminalIdentifier` representa más de una estación o no puede identificarse, DETENER el cutover y resolver el mapeo; no crear asociaciones por suposición.

## Ensayo obligatorio en staging

1. Restaurar una copia anonimizada en una base aislada.
2. Ejecutar todas las migraciones, incluida `20260727120000_separate_cash_terminals_shifts` y `20260729220000_add_cash_terminal_cutover`.
3. Desplegar backend y frontend candidatos.
4. Ejecutar el reporte posmigración.
5. Desde un navegador de prueba sin vínculo, seleccionar la sucursal y generar un código temporal.
6. Como `ADMIN`, abrir **Terminales POS**, elegir una terminal `legacy:*` de la misma sucursal y consumir el código.
7. Desde el navegador solicitante, pulsar **Reintentar**, abrir turno y registrar una venta de prueba.
8. Verificar que un segundo uso del código falle y que otra sucursal no pueda consumirlo.
9. Cerrar el turno, conciliar la venta y confirmar que terminal, turno, cajero y dispositivo quedaron sellados.
10. Guardar evidencia del resultado y obtener aprobación técnica y operativa.

## Ejecución en producción

1. Activar mantenimiento y confirmar que no existen escrituras POS en curso.
2. Crear respaldo y marcador PITR; registrar la hora exacta.
3. Ejecutar migraciones con el mecanismo aprobado del despliegue.
4. Desplegar backend y frontend de la misma versión.
5. Ejecutar:

```bash
psql "$DATABASE_URL" --file scripts/database/report-pos-terminal-cutover.sql
```

6. Comparar el total migrado contra el inventario previo.
7. En cada caja, generar un código desde **Turnos y cierre diario**.
8. Como `ADMIN`, vincular el código a la terminal heredada correspondiente.
9. Pedir al cajero que pulse **Reintentar** y confirme terminal, sucursal y nombre antes de abrir turno.
10. Registrar responsable, hora y resultado en el inventario operativo.
11. Repetir el reporte hasta obtener cero terminales `legacy:*` activas pendientes o una excepción documentada y desactivada.
12. Retirar mantenimiento solo después de una venta y cierre de turno controlados por sucursal.

La pantalla **Terminales POS** permite exportar el mismo inventario a CSV para seguimiento.

## Recuperación supervisada

- El código dura 15 minutos, es de un solo uso y solo se almacena como hash.
- Generar un código no habilita ventas ni abre turno.
- Solo `ADMIN` puede consumirlo y únicamente sobre una terminal `legacy:*` de la misma ubicación.
- Si el navegador perdió sus datos después del cutover, usar **Reasignar** con validación presencial; no reutilizar una terminal heredada ni modificar `localStorage` manualmente.
- Nunca desactivar la validación exacta de `deviceId` para resolver una incidencia.

## Criterios de éxito

- El reporte no devuelve terminales activas con `deviceId` `legacy:*` sin excepción aprobada.
- Cada estación inventariada abre exactamente su turno y no puede usar el turno de otra caja.
- Venta, pago y movimiento conservan `cashShiftId`; la venta conserva terminal, cajero, fecha y dispositivo.
- Los códigos vencidos, consumidos y de otra ubicación son rechazados.
- No existen diferencias de caja o inventario ocultas por el cutover.

## Rollback

La migración histórica transforma relaciones y puede convivir con nuevas ventas; NO ejecutar un script `down` ni borrar las tablas creadas.

Si falla antes de retirar mantenimiento y no hubo escrituras operativas:

1. Mantener mantenimiento activo.
2. Detener backend y workers.
3. Restaurar el respaldo o el punto PITR registrado antes del paso de migración.
4. Desplegar la versión anterior de backend y frontend.
5. Ejecutar la verificación de restauración aprobada.
6. Validar una operación controlada antes de reabrir.

Si hubo cualquier escritura después de migrar, no restaurar de forma unilateral. Mantener el POS bloqueado, preservar la base y escalar a reconciliación de ventas, pagos, caja e inventario antes de decidir recuperación o rollback lógico.
