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
