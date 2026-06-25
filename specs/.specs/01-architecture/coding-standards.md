# Estándares de Código

## Reglas generales

- Usar TypeScript en frontend y backend.
- No usar JavaScript para archivos de aplicación.
- No usar `any` salvo justificación documentada.
- Mantener archivos menores a 300 líneas cuando sea posible.
- Mantener funciones menores a 40 líneas cuando sea posible.
- Usar nombres claros y consistentes.
- Evitar duplicación de código.
- Validar datos de entrada en backend.
- Manejar errores explícitamente.
- No dejar `console.log` en producción.

## Backend

- Usar DTOs para entradas.
- Usar class-validator para validación.
- Usar services para lógica de negocio.
- Usar repositories o Prisma service para acceso a datos.
- Controllers solo deben coordinar request/response.
- Usar guards para autenticación y autorización.
- Usar transacciones para ventas y compras.
- No exponer contraseña, hash ni tokens sensibles.

## Frontend

- Componentes pequeños y reutilizables.
- No poner llamadas HTTP directamente dentro de componentes grandes.
- Usar hooks para lógica reutilizable.
- Usar TanStack Query para datos remotos.
- Usar formularios con validación.
- Mostrar estados de carga, error y vacío.
- No duplicar componentes de tabla, modal, botón o input.

## Naming

- Carpetas: kebab-case.
- Componentes React: PascalCase.
- Hooks: useNombre.
- Variables: camelCase.
- DTOs backend: CreateProductDto, UpdateProductDto.
- Servicios: ProductsService.
- Controladores: ProductsController.

## Commits sugeridos

Formato:

```text
tipo(modulo): descripción breve
```

Ejemplos:

```text
feat(inventario): agregar CRUD de productos
fix(ventas): validar stock insuficiente
docs(specs): actualizar reglas de negocio
```
