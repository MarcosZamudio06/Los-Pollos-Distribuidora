# Especificación de Despliegue

## Objetivo

Permitir ejecución local y despliegue productivo mediante Docker.

## Servicios

- frontend
- backend
- postgres
- photon
- osrm
- vroom
- tileserver
- nginx

## Puertos sugeridos

| Servicio   | Puerto interno | Puerto externo |
| ---------- | -------------: | -------------: |
| Frontend   |           3000 | `127.0.0.1:3000` |
| Backend    |           4000 | no host port |
| PostgreSQL |           5432 | no host port |
| Photon     |           2322 | no host port |
| OSRM       |           5000 | no host port |
| VROOM      |           3000 | no host port |
| TileServer |           8080 | no host port |
| Caddy/Nginx host gateway | 80/443 | 80/443 |

## Ambientes

- development
- staging
- production

## Reglas

- No guardar `.env` en repositorio.
- Mantener `.env.example`.
- Usar variables de entorno.
- La base de datos debe tener volumen persistente.
- Las migraciones deben ejecutarse una sola vez por release antes del rollout de
  nuevas réplicas. No pueden ejecutarse en el comando de arranque del backend.
- Si falla una migración, el rollout se bloquea y las réplicas ya saludables
  permanecen atendiendo tráfico. La corrección o resolución se ejecuta como una
  operación explícita antes de reintentar el despliegue.
- `docker-compose.yml` mantiene el perfil local/dev; `docker-compose.production.yml`
  implementa el contrato single-host de Arquitectura A.
- Producción debe ejecutar PostgreSQL/PostGIS, Photon, OSRM, VROOM, TileServer,
  backend y frontend en una misma red privada Docker. Las URLs de base de datos
  y proveedores son DNS internos, no endpoints administrados externos.
- El volumen productivo de PostgreSQL no sustituye los respaldos. La operación
  debe demostrar restauración del volumen y documentar el riesgo de no tener
  alta disponibilidad dentro del single-host.

## Durabilidad productiva

Antes de liberar el ERP/POS, la operación PostgreSQL del single-host debe
demostrar:

- respaldos completos y archivado de WAL para PITR cuando el host lo soporte;
- respaldos cifrados fuera del servidor;
- retención mínima de 35 días, sujeta a la política legal aplicable;
- alertas por fallo o antigüedad del respaldo, archivado WAL y espacio de disco;
- restore drill trimestral en una base aislada;
- RPO máximo de 5 minutos y RTO máximo de 60 minutos, aprobados por negocio.

La ausencia de evidencia de respaldo/restauración bloquea producción. El script
`scripts/database/verify-restored-database.sh` valida la estructura y las tablas
críticas después de restaurar un respaldo o un punto temporal en una base cuyo
nombre termine en `_restore_drill`.

La migración de terminales y turnos POS requiere ejecutar íntegramente
`docs/runbooks/pos-terminal-cutover.md`, incluida la prueba en staging con copia
anonimizada, inventario previo, reporte posmigración y rollback aprobado.

## Endurecimiento HTTP

- Nginx debe enviar `X-Forwarded-For`, `X-Forwarded-Proto` y un
  `X-Request-ID` generado por el proxy.
- El backend debe confiar únicamente en la cantidad configurada de proxies y no
  debe usar una confianza global en cualquier origen.
- El límite de payload de Nginx debe coincidir con el límite del backend.
- Swagger debe responder 404 en producción.
- CORS debe usar una allowlist validada y nunca combinar credenciales con `*`.
- El rate limiting en memoria solo está aprobado para una réplica backend. Un
  despliegue horizontal requiere almacenamiento compartido aprobado.

## Salud y apagado

- `GET /api/health/live` solo verifica que el proceso HTTP responde.
- `GET /api/health/startup` responde satisfactoriamente únicamente después del
  bootstrap de NestJS.
- `GET /api/health/ready` requiere bootstrap concluido, una consulta mínima a
  PostgreSQL y que la instancia no esté drenando.
- Las tres rutas son públicas, no exponen detalles internos y están fuera del
  rate limiting para que la infraestructura pueda monitorizarlas.
- El backend debe habilitar `app.enableShutdownHooks(['SIGTERM', 'SIGINT'])`.
  Al recibir una señal, la instancia deja de estar lista antes de cerrar el
  servidor HTTP y la conexión Prisma se libera al final del apagado.
- La infraestructura debe retirar la instancia del balanceador mediante la
  readiness probe antes de agotar el período de terminación.

## Migraciones compatibles

Los cambios de esquema productivos siguen expand/contract:

1. Expandir con estructuras compatibles y sin eliminar lectores existentes.
2. Desplegar código compatible con el esquema previo y el expandido.
3. Ejecutar backfills idempotentes y por lotes fuera del arranque.
4. Verificar adopción y eliminar estructuras obsoletas en una release posterior.

No se permiten renames, drops, backfills masivos ni índices bloqueantes en la
misma release que introduce código dependiente del nuevo esquema.
