# Criterios de aceptación: CEDIS-sucursal

Cada criterio es verificable como prueba unitaria, de contrato o E2E.

- [ ] **AC-01 Unicidad:** Dado un ciclo no cancelado para sucursal y fecha, cuando se crea otro, entonces la API devuelve `BRANCH_SUPPLY_CYCLE_ALREADY_EXISTS`.
- [ ] **AC-02 Concurrencia:** Dadas dos creaciones simultáneas, PostgreSQL conserva un solo ciclo no cancelado.
- [ ] **AC-03 Ubicaciones:** Una ubicación inactiva, un tipo incompatible o CEDIS igual a sucursal rechaza la operación sin escritura.
- [ ] **AC-04 Alcance:** `WAREHOUSE` solo consulta/muta ciclos cuyo CEDIS sea su ubicación; `SELLER` solo consulta su sucursal.
- [ ] **AC-05 Suministros:** Un suministro creado por el ciclo siempre usa CEDIS como origen y sucursal como destino.
- [ ] **AC-06 Devoluciones:** Una devolución creada por el ciclo siempre usa sucursal como origen y CEDIS como destino.
- [ ] **AC-07 Multiplicidad:** Un ciclo admite varios suministros y varias devoluciones, y cada traspaso solo se vincula una vez.
- [ ] **AC-08 Fuente de inventario:** Crear/vincular un ciclo no crea `InventoryBalance` ni `InventoryMovement`.
- [ ] **AC-09 Confirmación:** Confirmar una partida genera un `TRANSFER_OUT` y un `TRANSFER_IN` con cantidades iguales.
- [ ] **AC-10 Idempotencia:** Repetir la misma clave y payload no duplica ciclo, vínculo ni movimientos; cambiar payload devuelve conflicto.
- [ ] **AC-11 Integridad:** Faltan movimientos, hay cantidades distintas o hay producto distinto: el cierre queda bloqueado.
- [ ] **AC-12 Pendientes:** Un `DRAFT`, `REQUESTED` o `IN_TRANSIT` vinculado bloquea validación/cierre.
- [ ] **AC-13 Suministro mínimo:** Sin suministro confirmado, la jornada no puede cerrar.
- [ ] **AC-14 Cierre único:** Abrir el ciclo no crea un segundo `PointOfSaleDailyClose`; reutiliza o enlaza el único cierre permitido.
- [ ] **AC-15 Invalidación:** Confirmar/cancelar un traspaso vinculado invalida la validación del cierre `DRAFT` y aumenta su versión.
- [ ] **AC-16 Finalización:** Cerrar un cierre elegible cambia ciclo y cierre atómicamente a `COMPLETED`/`CLOSED`.
- [ ] **AC-17 Reapertura:** Reabrir un cierre `CLOSED` devuelve ciclo a `ACTIVE` con auditoría existente conservada.
- [ ] **AC-18 Cancelación:** El ciclo solo se cancela con motivo, sin cierre activo ni transferencias pendientes; no revierte inventario.
- [ ] **AC-19 No doble conteo:** Una devolución participa una sola vez como salida `TRANSFER_OUT` en la conciliación del cierre.
- [ ] **AC-20 No paralelismo:** No existen conteos, diferencias, saldos, snapshots ni cierre alternativos del ciclo.
- [ ] **AC-21 Reportes:** Dashboard y detalle respetan alcance, frescura y ocultamiento de información sensible.
- [ ] **AC-22 UI:** La pantalla CEDIS muestra loading, error, empty, success, unauthorized y conflict; el cierre mantiene un único botón de cierre.
- [ ] **AC-23 Migración:** El backfill usa solo un mapa aprobado, es repetible, reporta ambigüedades y no modifica inventario histórico.
