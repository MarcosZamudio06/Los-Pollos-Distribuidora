# Guía para Prisma

## Reglas

- Usar Prisma como única capa de acceso a PostgreSQL.
- No escribir SQL crudo salvo que exista justificación documentada.
- Usar migraciones para todo cambio estructural.
- No modificar la base de datos manualmente en producción.
- Usar `prisma.$transaction` para operaciones críticas.

## Transacciones obligatorias

Usar transacciones en:

- Confirmar venta.
- Cancelar venta.
- Confirmar compra.
- Cancelar compra.
- Ajustar inventario.
- Asignar venta a ruta si modifica varios registros.

## Seed inicial

El seed debe crear:

- Roles: ADMIN, SELLER, WAREHOUSE, DRIVER.
- Usuario administrador inicial.
- Categorías base.
- Algunos productos de ejemplo.

## Nombres de modelos

Usar singular en modelos Prisma:

```prisma
model Product {}
model Sale {}
model SaleItem {}
```

## Fechas

Usar:

```prisma
createdAt DateTime @default(now())
updatedAt DateTime @updatedAt
```

## Eliminación lógica

Para entidades maestras usar `isActive`.

Aplica a:

- Product
- Category
- Customer
- Supplier
- User
