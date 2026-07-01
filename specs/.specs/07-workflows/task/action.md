### TASK-042 — Implementar políticas comerciales y configuración operativa backend
Estado inicial: `PENDING`
Depende de:
- TASK-021
- TASK-034
Specs requeridos:
```text
specs/modules/clientes/spec.md
specs/.specs/02-database/database.md
specs/.specs/02-database/entities.md
specs/.specs/03-api/commercial-policies-api.md
specs/.specs/03-api/operational-config-api.md
```
Objetivo:
Implementar configuración auditable para políticas comerciales y parámetros operativos del MVP.
Restricción:
No crear endpoints hasta que los specs API correspondientes existan y definan rutas exactas.
Reglas:
- Configurar límites de crédito, días de crédito, bloqueo por mora o límite excedido.
- Configurar parámetros operativos permitidos sin cambiar invariantes estructurales.
- No permitir que una configuración desactive inventario por ubicación, cuentas por cobrar para crédito, traspasos como entidad propia ni ticket interno como único comprobante MVP.
- Auditar usuario creador, último modificador y vigencia.