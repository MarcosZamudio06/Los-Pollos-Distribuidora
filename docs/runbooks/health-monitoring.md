# Health monitoring del VPS productivo

Este flujo es deliberadamente ligero: un script del host, un timer de
systemd y journald. No instala Prometheus, Grafana ni un agente obligatorio.
El monitor no ejecuta refreshes GIS ni backups; únicamente observa y alerta.

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
minutos. Para cambiar la frecuencia, edite el override del timer (`systemctl
edit pollos-distribuidor-monitor.timer`) y ajuste `OnUnitActiveSec`; no cambie
la frecuencia desde el backend.

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
| `MONITOR_BACKUP_MAX_AGE_HOURS` | 24 | edad máxima de resultado B2 validado |
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

El monitor lee los resultados no secretos generados por el flujo existente:

- `MONITOR_BACKUP_RESULT_DIR`: busca el último JSON con `status=validated`.
  Ausencia, fallo o antigüedad mayor a `MONITOR_BACKUP_MAX_AGE_HOURS` es una
  alerta crítica. No duplica la subida a B2.
- `MONITOR_RESTORE_RESULT_DIR`: comprueba `status=passed` y `cleanup=passed`
  del último restore drill; ausencia o drill fallido también se alerta.
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
