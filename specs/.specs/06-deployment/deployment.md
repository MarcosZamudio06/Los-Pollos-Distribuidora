# Especificación de Despliegue

## Objetivo

Permitir ejecución local y despliegue productivo mediante Docker.

## Servicios

- frontend
- backend
- postgres
- nginx

## Puertos sugeridos

| Servicio | Puerto interno | Puerto externo |
|---|---:|---:|
| Frontend | 3000 | 3000 |
| Backend | 4000 | 4000 |
| PostgreSQL | 5432 | 5432 |
| Nginx | 80/443 | 80/443 |

## Ambientes

- development
- staging
- production

## Reglas

- No guardar `.env` en repositorio.
- Mantener `.env.example`.
- Usar variables de entorno.
- La base de datos debe tener volumen persistente.
- Las migraciones deben ejecutarse antes de iniciar backend en producción.
- `docker-compose.yml` y su PostgreSQL local son exclusivos de desarrollo.
- Producción debe usar PostgreSQL administrado o un clúster externo; Compose no
  debe administrar la base productiva.
- La conexión productiva a PostgreSQL debe usar TLS.

## Durabilidad productiva

Antes de liberar el ERP/POS, el servicio PostgreSQL debe demostrar:

- réplica en una zona de fallo distinta y failover probado;
- respaldos completos y archivado continuo de WAL para PITR;
- respaldos cifrados fuera del servidor primario;
- retención mínima de 35 días, sujeta a la política legal aplicable;
- alertas por fallo o antigüedad del respaldo y por replication lag;
- restore drill trimestral en una base aislada;
- RPO máximo de 5 minutos y RTO máximo de 60 minutos, aprobados por negocio.

La ausencia de cualquiera de estas evidencias bloquea producción. El script
`scripts/database/verify-restored-database.sh` valida la estructura y las tablas
críticas después de que el proveedor restaure un respaldo o un punto temporal
en una base cuyo nombre termine en `_restore_drill`.

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
