# Recuperación de la base productiva

La base productiva vive fuera de Docker Compose. El proveedor administrado o el
clúster externo es responsable de réplica, failover, respaldos y archivado de
WAL; este repositorio define cómo aceptar y comprobar esas capacidades.

## Bloqueo de salida

No liberar producción sin evidencia vigente de todos estos controles:

| Control | Criterio mínimo |
|---|---|
| Alta disponibilidad | Réplica en otra zona y failover probado |
| PITR | WAL continuo con RPO de 5 minutos o menor |
| Respaldo completo | Automático, cifrado y fuera del primario |
| Retención | 35 días o la política legal superior aplicable |
| Monitoreo | Alertas por fallo, antigüedad y replication lag |
| Recuperación | RTO de 60 minutos o menor |
| Restore drill | Trimestral, aislado y con evidencia conservada |

## Restore drill trimestral

1. Seleccionar una hora objetivo que contenga ventas, pagos e inventario
   conocidos para poder reconciliarlos.
2. Pedir al proveedor una restauración PITR en una instancia aislada y en una
   base cuyo nombre termine en `_restore_drill`.
3. Restringir la red de la instancia al operador del drill. Nunca conectar el
   backend productivo ni ejecutar migraciones sobre ella.
4. Ejecutar la verificación estructural:

   ```bash
   RESTORE_DATABASE_URL='postgresql://...?sslmode=verify-full' \
     ./scripts/database/verify-restored-database.sh
   ```

5. Reconciliar con evidencia de negocio al menos una venta, un pago, un
   movimiento de inventario y un movimiento de caja anteriores a la hora
   objetivo.
6. Registrar hora objetivo, hora de inicio, hora disponible, resultado, conteos
   y responsable. El tiempo total debe cumplir el RTO.
7. Eliminar la instancia aislada y sus credenciales al cerrar el drill.

## Incidente real

1. Detener escrituras o aislar el primario comprometido.
2. Declarar la hora objetivo según la última transacción válida y el RPO.
3. Restaurar a una instancia nueva; no sobrescribir el origen.
4. Ejecutar el verificador y la reconciliación de negocio.
5. Cambiar `DATABASE_URL`, rotar credenciales y reanudar tráfico gradualmente.
6. Conservar logs, línea de tiempo y evidencia para el análisis posterior.

Un respaldo exitoso no demuestra recuperabilidad. Solo un restore drill
completado y reconciliado proporciona esa evidencia.
