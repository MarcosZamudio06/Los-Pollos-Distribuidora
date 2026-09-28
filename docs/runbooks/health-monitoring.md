# Health monitoring del VPS productivo

Este flujo es deliberadamente ligero: un script del host, un timer de
systemd y journald. No instala Prometheus, Grafana ni un agente obligatorio.
El monitor no ejecuta refreshes GIS ni backups; únicamente observa y alerta.
Para la automatización de backups y su instalación, consulta
[`production-recovery-set-backup.md`](production-recovery-set-backup.md).

## Contrato HTTP

El backend expone tres probes públicos a través del frontend/Caddy:

- `GET /api/health/live`: liveness del proceso NestJS. No consulta la base.
- `GET /api/health/ready`: readiness core. Requiere bootstrap completo y
  `SELECT 1` contra PostgreSQL; una caída de Photon, OSRM, VROOM, TileServer u
  Object Storage no cambia este resultado.
- `GET /api/health/dependencies`: diagnóstico estructurado de PostgreSQL,
  Photon, OSRM, VROOM, TileServer y Object Storage. Cada probe tiene timeout
  corto (`HEALTH_DEPENDENCY_TIMEOUT_MS`, 5 segundos por defecto y máximo 5).
  El resultado es `ok` cuando todo está arriba, `degraded` cuando falla una
  dependencia no-core y `error` cuando PostgreSQL falla. Los campos de cada
  dependencia sólo contienen estado, latencia y un motivo genérico; nunca
  contienen URLs internas, credenciales, buckets ni stack traces.

El healthcheck Docker del backend usa únicamente `/api/health/ready`. Por eso
un fallo GIS no impide iniciar el backend ni derriba POS/inventario, aunque las
funciones de geocoding/routing/mapas pueden quedar degradadas.

## Instalación en Ubuntu

1. Instalar/actualizar el checkout en `/opt/pollos-distribuidor` y comprobar que
   `scripts/monitoring/monitor-production.py` es ejecutable.
2. Crear el archivo root-only `/etc/pollos-distribuidor/monitoring.env` con
   valores operativos. No registrar tokens ni poner secretos en el repositorio.
3. Copiar los ejemplos versionados:

   ```bash
   sudo install -m 0644 docs/runbooks/systemd/pollos-distribuidor-monitor.service \
     /etc/systemd/system/pollos-distribuidor-monitor.service
   sudo install -m 0644 docs/runbooks/systemd/pollos-distribuidor-monitor.timer \
     /etc/systemd/system/pollos-distribuidor-monitor.timer
   sudo systemctl daemon-reload
   sudo systemctl enable --now pollos-distribuidor-monitor.timer
   ```

El timer ejecuta una revisión dos minutos después del boot y luego cada cinco
minutos por reloj UTC. `Persistent=true` recupera una ejecución de calendario
perdida durante la indisponibilidad del host. Para cambiar la frecuencia, edite
el override del timer (`systemctl edit pollos-distribuidor-monitor.timer`) y
ajuste `OnCalendar`; no cambie la frecuencia desde el backend.

## Variables y thresholds

Los defaults iniciales para el VPS de 200 GB son:

| Variable | Default | Significado |
| --- | ---: | --- |
| `MONITOR_DISK_WARN_PERCENT` | 80 | alerta de filesystem |
| `MONITOR_DISK_CRITICAL_PERCENT` | 90 | condición crítica de filesystem |
| `MONITOR_INODE_WARN_PERCENT` / `CRITICAL` | 80 / 90 | agotamiento de inodos |
| `MONITOR_MEMORY_WARN_PERCENT` / `CRITICAL` | 85 / 95 | memoria del host |
| `MONITOR_CPU_WARN_PERCENT` | 85 | CPU de contenedor |
| `MONITOR_CPU_WARN_DURATION_SECONDS` | 900 | CPU sostenida antes de alertar |
| `MONITOR_RESTART_WARN_COUNT` | 3 | reinicios acumulados del contenedor |
| `BACKUP_RPO_HOURS` | 24 | deadline real del RPO; crítico al llegar a esta edad |
| `MONITOR_BACKUP_RPO_WARNING_LEAD_HOURS` | 3 | warning antes del RPO; con RPO 24 h, alerta a las 21 h |
| `MONITOR_BACKUP_SCHEDULE_MAX_AGE_MINUTES` | 1231 | edad máxima esperable del punto previo antes de validar el siguiente recovery set |
| `MONITOR_RECOVERY_SET_MODE` | `single-company` | inventario local o multiempresa |
| `MONITOR_RECOVERY_SET_RESULT_ROOT` | `/var/lib/pollos-distribuidor` | raíz de resultados privados por empresa |
| `MONITOR_BACKUP_LOCAL_PATH` | vacío | ruta de backup local; se deriva por empresa si queda vacío |
| `BACKUP_MIN_FREE_BYTES` / `OBJECT_STORAGE_MIN_FREE_BYTES` | 1 GiB / 1 GiB | mínimo de espacio libre exigido por los componentes |
| `MONITOR_TENANT_MANIFEST_PATH` | vacío | inventario sin secretos requerido en modo multiempresa |
| `MONITOR_LOCAL_DEPLOYMENT_HOST_REF` | vacío | referencia de este VPS en el inventario multiempresa |
| `MONITOR_BACKUP_DISK_WARN_MULTIPLIER` | 2 | warning por debajo de 2 × `BACKUP_MIN_FREE_BYTES`; crítico debajo del mínimo |
| `MONITOR_BACKUP_FAILED_WARN_COUNT` | 3 | fallos recientes que disparan warning |
| `MONITOR_BACKUP_FAILED_WINDOW_DAYS` | 7 | ventana para contar fallos repetidos |
| `BACKUP_FAILED_KEEP_COUNT` | 1 | límite de evidencia fallida por componente local |
| `MONITOR_RESTORE_DRILL_MAX_AGE_DAYS` | 35 | edad máxima del último drill válido |
| `MONITOR_GIS_MAX_AGE_DAYS` | 31 | edad máxima por manifest activo |

El monitor informa también swap, límites/uso de `docker stats`, OOMKilled,
health status, `RestartCount`, `docker system df`, estado del último refresh y
provenance de cada manifest activo. Los límites de CPU/RAM siguen siendo los
guardrails de Compose; el monitor no provoca carga adicional ni cambia esos
límites.

## Alertas

Cada ejecución imprime una sola línea JSON a stdout, por lo que queda en
journald. Un estado `ok` termina con exit code 0; `warning` o `critical`
terminan con exit code 1. Esto permite conectar el servicio a un colector
externo sin acoplar el despliegue a un proveedor pagado.

`MONITOR_ALERT_WEBHOOK_URL` es opcional. Si está configurado, el monitor envía
únicamente `status`, timestamp y alertas sanitizadas, con timeout propio. Un
fallo del webhook se registra como `ALERT_WEBHOOK_FAILED` y no reemplaza ni
oculta la alerta original. Nunca se imprime la URL del webhook.

Consulta operativa:

```bash
sudo journalctl -u pollos-distribuidor-monitor.service -n 20 --no-pager
sudo systemctl list-timers pollos-distribuidor-monitor.timer
```

## Backup y GIS

El procedimiento operativo completo, incluida la interpretación de resultados,
restore drills y recuperación ante pérdida del VPS, está en el
[runbook de backup y Disaster Recovery](multi-company-backup-restore.md).

El monitor lee los resultados no secretos generados por el flujo existente:

- `MONITOR_RECOVERY_SET_RESULT_ROOT`: para single-company lee únicamente
  `postgres-backups/results/company-recovery/*.json`; en multiempresa lee la
  ruta local por slug. Requiere `status=validated`, identidad correcta, ambos
  componentes en estado `validated`, frontera `backend-quiesce`, retención
  aplicada, limpieza/restauración operativa correcta y claves/checksums de ambos
  manifests con formato válido y scope del mismo slug. Un backup PostgreSQL-only,
  resultado parcial/corrupto o attempt reciente fallido nunca se considera
  protección completa. El monitor no vuelve a consultar B2: consume la evidencia
  local creada después de las verificaciones end-to-end del backup y del drill.
- `BACKUP_RPO_HOURS` es el deadline, no un umbral de warning. La edad medida
  para alertas se calcula desde `recovery_point.write_barrier_at`, no desde
  `finished_at`; el JSON conserva ambos como `recoveryPointAt` y `validatedAt`.
  El campo `ageHours` representa la antigüedad real del recovery point.
  El warning se
  calcula como el más tardío entre el envelope de scheduler y
  `RPO - MONITOR_BACKUP_RPO_WARNING_LEAD_HOURS`; con RPO 24 h alerta a las 21 h.
  Llegar a 24 h sin un recovery set completo validado genera critical. La
  cadencia de backup de 00:00/12:00 UTC, jitter 30 min, precisión 1 min y timeout
  8 h tiene un envelope máximo de 20 h 31 min entre el punto previo y la
  validación del siguiente set. `MONITOR_BACKUP_SCHEDULE_MAX_AGE_MINUTES` debe
  mantenerse sincronizado con ese timer y ser menor que el RPO; esto evita
  alertas durante la demora normal, incluso si el RPO cambia.
- En modo `multi-company`, el monitor filtra el inventario por la referencia
  configurada en `MONITOR_LOCAL_DEPLOYMENT_HOST_REF`. Cada VPS informa solo la
  empresa que realmente puede respaldar desde sus rutas Docker locales; una
  fuente central debe agregar los estados de cada VPS para declarar cobertura
  multiempresa global.
- `MONITOR_BACKUP_LOCAL_PATH`: si se omite, se deriva el directorio real por
  empresa desde `MONITOR_RECOVERY_SET_RESULT_ROOT`; para fijar una ruta en modo
  multiempresa usa `{company}` en el valor. Se informa espacio libre sin imprimir
  la ruta. El monitor alerta si queda menos del mínimo usado por el backup, y
  advierte si fallidos acumulados superan `BACKUP_FAILED_KEEP_COUNT` o se
  alcanzan tres fallos de recovery set en la ventana de siete días.
- Compatibilidad temporal: si `MONITOR_RECOVERY_SET_RESULT_ROOT` aún no está
  configurado y `MONITOR_BACKUP_RESULT_DIR` antiguo sigue en `monitoring.env`,
  el monitor solo busca su subdirectorio `company-recovery/`; no lee resultados
  PostgreSQL-only del directorio padre. Elimina la variable antigua al
  actualizar la configuración.
- `MONITOR_RESTORE_RESULT_DIR`: comprueba el último resultado del tenant. Un
  drill completo requiere `status=passed`, identidad/key del mismo slug,
  `disposable_targets_cleanup=cleaned` y todos los checks en `checks`: identidad
  y archives/manifests, PostgreSQL/PostGIS, Object Storage, referencias de
  storage (incluidos SHA-256/size) y verificadores que apliquen. Un check ausente
  o `not_run` no se presenta como aprobado. En multiempresa la ruta se deriva a
  `<root>/<company>/postgres-backups/restore-drills`; si se configura una ruta
  explícita, debe contener `{company}`. Resultados ausentes, corruptos o fallidos
  alertan; un drill válido de más de 35 días genera warning.
- `MONITOR_MAP_DATA_DIR`: valida `manifest.json` de Photon, OSRM y rendering,
  checksum/provenance, artefactos no vacíos y antigüedad. También lee el último
  `refreshes/*/refresh.json` y alerta `FAILED`, `ROLLED_BACK` o estados
  incompletos. Nunca lanza `refresh-monthly.sh` automáticamente.

Un manifest activo inválido se trata como crítico porque no permite demostrar
qué dataset está sirviendo el consumidor. Una antigüedad GIS es warning y debe
revisarse contra el dataset real de México antes de fijar un SLA definitivo.

## Pruebas seguras

Ejecutar manualmente con una variable de estado temporal para no escribir en
`/var/lib`:

```bash
MONITOR_STATE_FILE=/tmp/pollos-monitor-state.json \
  ./scripts/monitoring/monitor-production.py
python3 scripts/monitoring/test-monitor-production.py
```

Para simular backup/GIS stale, use directorios fixture en `/tmp` con JSON y
manifests pequeños; no toque `/srv/pollos-distribuidor/maps` ni los volúmenes
Docker activos. Para simular una dependencia GIS caída, detenga únicamente el
servicio en una ventana controlada o use un endpoint de prueba; el readiness
core debe seguir respondiendo mientras PostgreSQL siga saludable. No use
`docker compose down -v`.

## Instalación/operación de systemd

El servicio corre en el host, no dentro del backend ni de Docker. Requiere el
socket Docker para inspección y el mismo `production.env` usado por Compose.
Revise `journalctl` después de instalarlo y antes de declararlo operativo.
