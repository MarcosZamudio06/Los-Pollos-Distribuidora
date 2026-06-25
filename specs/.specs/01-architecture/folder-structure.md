# Estructura de Carpetas

## Raíz

```text
pollo-distribucion/
  .specs/
  modules/
  frontend/
  backend/
  shared/
  docker/
  docs/
  scripts/
  .gitignore
  docker-compose.yml
  package.json
  README.md
```

## Frontend

```text
frontend/
  public/
  src/
    app/
      App.tsx
      router.tsx
      providers.tsx
    assets/
    components/
      ui/
      layout/
      forms/
      tables/
    features/
      auth/
      dashboard/
      inventario/
      ubicaciones/
      ventas/
      compras/
      clientes/
      cobranza/
      rutas-reparto/
      chofer/
      reportes/
    hooks/
    lib/
      api.ts
      queryClient.ts
    services/
    types/
    utils/
    styles/
    main.tsx
  package.json
  vite.config.ts
  tsconfig.json
```

## Backend

```text
backend/
  prisma/
    schema.prisma
    migrations/
    seed.ts
  src/
    common/
      decorators/
      filters/
      guards/
      interceptors/
      pipes/
      utils/
    config/
      env.validation.ts
      app.config.ts
      database.config.ts
    database/
      prisma.service.ts
      prisma.module.ts
    modules/
      auth/
      users/
      roles/
      products/
      inventory/
      locations/
      customers/
      accounts-receivable/
      payments/
      suppliers/
      purchases/
      sales/
      sales-documents/
      billing-requests/
      delivery-routes/
      driver-mobile/
      commercial-policies/
      operational-config/
      reports/
    app.module.ts
    main.ts
  test/
  package.json
  tsconfig.json
```

## Shared

```text
shared/
  types/
    auth.ts
    product.ts
    sale.ts
    customer.ts
    inventory-location.ts
    accounts-receivable.ts
    payments.ts
    commercial-policies.ts
    operational-config.ts
    delivery.ts
  constants/
    roles.ts
    sale-status.ts
    payment-methods.ts
    delivery-status.ts
```

## Mapeo de módulos por alcance de negocio

| Alcance | Frontend | Backend | Nota |
|---------|----------|---------|------|
| Inventario por ubicación | `features/inventario/`, `features/ubicaciones/` | `modules/inventory/`, `modules/locations/` | Debe soportar stock por ubicación operativa. |
| Sucursales y almacenes | `features/ubicaciones/` | `modules/locations/` | El modelo final sucursal-almacén sigue abierto; usar ubicación operativa como abstracción hasta decidir. |
| Clientes mayoristas | `features/clientes/` | `modules/customers/` | Debe contemplar tipo de cliente, condiciones comerciales y crédito. |
| Cuentas por cobrar | `features/cobranza/` | `modules/accounts-receivable/` | Debe manejar saldos, vencimientos, pagos y bloqueo de crédito. |
| Pagos y cobranza | `features/cobranza/` | `modules/payments/`, `modules/accounts-receivable/` | Los pagos son registros trazables asociados a cuentas por cobrar, cliente, usuario y, si aplica, ruta o liquidación. |
| Políticas comerciales | `features/clientes/` o configuración administrativa futura | `modules/commercial-policies/` | Debe manejar límites, días de crédito, listas de precio y reglas comerciales sin alterar invariantes del dominio. |
| Configuración operativa | Configuración administrativa futura | `modules/operational-config/` | Debe manejar parámetros operativos auditables; no debe crear endpoints ni UI sin specs específicos. |
| Reparto y rutas | `features/rutas-reparto/` | `modules/delivery-routes/` | Debe cubrir asignación, estados, incidencias y liquidación. |
| Experiencia móvil de chofer | `features/chofer/` | `modules/driver-mobile/`, `modules/delivery-routes/` | Puede implementarse como app móvil, PWA o web móvil; offline queda pendiente. |
| Reportes casi en tiempo real | `features/reportes/`, `features/dashboard/` | `modules/reports/` | Latencia máxima de 60 segundos en condiciones normales. |
| Ticket interno | `features/ventas/` | `modules/sales-documents/`, `modules/sales/` | No equivale a CFDI ni factura fiscal. |
| Solicitud administrativa de factura | `features/ventas/`, `features/clientes/` | `modules/billing-requests/`, `modules/sales/` | No es CFDI ni documento operativo de venta. |

## Decisiones pendientes que pueden modificar estructura

- Si la experiencia móvil de choferes se implementa como aplicación nativa fuera de `frontend/`, este documento debe actualizarse antes de crear carpetas nuevas.
- Si el modelo final separa sucursales y almacenes como módulos independientes, `modules/locations/` puede dividirse solo después de actualizar arquitectura y base de datos.
- Si una fase futura agrega CFDI/SAT real, puede requerirse un módulo fiscal separado; no debe crearse para el MVP sin actualización de specs.
- Si configuración administrativa requiere pantallas o endpoints, deben existir specs explícitos en `.specs/03-api/` y `.specs/04-ui/` antes de implementarlos.

## Gobierno documental de módulos

Nombres canónicos de specs de módulo:

- `specs/modules/inventory/spec.md`
- `specs/modules/sales/spec.md`
- `specs/modules/sales-documents/spec.md`
- `specs/modules/billing-requests/spec.md`
- `specs/modules/reports/spec.md`
- `specs/modules/routes-delivery/spec.md`

Aliases deprecated:

- `specs/modules/facturacion/spec.md`
- `specs/modules/inventario/spec.md`
- `specs/modules/ventas/spec.md`
- `specs/modules/reportes/spec.md`
- `specs/modules/routes/spec.md`
- `specs/modules/rutas-reparto/spec.md`

Regla:

- El roadmap, los prompts y cualquier nueva actualización deben referenciar únicamente los nombres canónicos.

## Regla

No crear carpetas nuevas fuera de esta estructura sin actualizar este documento.
