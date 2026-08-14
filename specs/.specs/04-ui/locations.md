# UI — Alta de sucursales

## Objetivo

Definir la captura administrativa de una sucursal operativa y su vínculo con un
CEDIS, sin convertir el mapa en requisito de la operación ni iniciar flujos de
inventario durante el alta.

Esta especificación corresponde a la Fase 0 del plan de alta de sucursales y
mapas desacoplados; describe el contrato de la UI y no autoriza el renderer.
## Alta de sucursal

Una alta exitosa MUST persistir únicamente una `OperationalLocation` de tipo
`BRANCH` mediante `POST /api/locations`.

Reglas del formulario:

- El nombre es requerido.
- El código es opcional y, si se captura, debe ser único.
- El tipo es implícito, no editable y siempre se envía como `BRANCH`.
- El CEDIS padre es requerido y debe ser un `DISTRIBUTION_CENTER` activo.
- La sucursal debe quedar como hija directa del CEDIS seleccionado.
- La dirección puede capturarse manualmente.
- La latitud y la longitud son opcionales según el contrato actual, pero cuando
  se capturan deben enviarse juntas y respetar sus rangos.
- La API es la autoridad final para jerarquía, unicidad y coordenadas.

La UI no debe crear un CEDIS, usuarios, precios, productos, equivalencias ni
otra ubicación como parte de este formulario.

## Mapa como asistencia opcional

El mapa es un asistente para seleccionar o revisar coordenadas; no es la fuente
de verdad ni un requisito para guardar la sucursal. La captura manual de nombre,
CEDIS, dirección y coordenadas permitidas debe continuar disponible cuando:

- el renderer no carga;
- WebGL no está disponible;
- el proveedor de estilo o tiles no está configurado;
- el geocodificador no responde.

La UI no debe perder los valores manuales por un error del mapa, de búsqueda o
de geocodificación inversa. Una búsqueda o una etiqueta de reversa solo puede
aplicarse después de una selección explícita del usuario y no debe sobrescribir
silenciosamente la dirección editada.

La selección de coordenadas mediante mapa, la búsqueda y la geocodificación
inversa pertenecen a una fase posterior y deben consumirse por puertos
provider-neutral; ningún componente de esta pantalla debe conocer URLs internas
de Photon, OSRM o VROOM.

## Efectos de persistencia y operación

El alta de una sucursal no debe crear ni modificar:

- `InventoryBalance`;
- `InventoryMovement`;
- `InventoryTransfer`;
- `BranchSupplyCycle`;
- reservas, saldos iniciales o movimientos de stock.

La UI no debe llamar endpoints de ciclos CEDIS, suministros, recepciones,
traspasos ni ajustes después de `201 Created`; la disponibilidad de la sucursal
se verifica después mediante los flujos CEDIS y no forma parte del alta.

## Flujo y contratos

Ruta propuesta: `/admin/locations/branches/new`.

Acceso:

- `ADMIN` con permiso `cedis.manage`.
- El catálogo de selección se obtiene de
  `GET /api/locations?type=DISTRIBUTION_CENTER&isActive=true`.
- El alta se envía a `POST /api/locations` con `type: "BRANCH"` y el `parentId`
  del CEDIS seleccionado.
- Después de `201 Created`, se invalidan los catálogos de ubicaciones y se
  confirma la relación mediante `GET /api/locations/:cedisId/branches` cuando
  el flujo lo requiera.

La UI debe traducir al estado operativo correspondiente los errores `400`,
`403`, `404` y `409` definidos por el contrato de ubicaciones. No debe inferir
un CEDIS activo a partir de un resultado de mapa.

## Estados de pantalla

Toda pantalla con datos remotos debe contemplar:

- Loading del catálogo de CEDIS.
- Error y catálogo vacío de CEDIS.
- CEDIS sin selección.
- Captura manual disponible.
- Renderer no disponible; guardado manual habilitado.
- Búsqueda o geocodificación no disponible.
- Coordenadas incompletas o fuera de rango.
- Código duplicado.
- Guardando.
- Alta confirmada.
- Usuario no autorizado.

## Escenarios de aceptación

### Alta válida con captura manual

- GIVEN un `ADMIN` autorizado y un CEDIS `DISTRIBUTION_CENTER` activo
- WHEN captura los datos permitidos y envía el formulario sin depender de un
  mapa
- THEN la UI envía exactamente una ubicación con `type=BRANCH` y el `parentId`
  del CEDIS seleccionado
- AND el backend persiste únicamente esa sucursal

### Mapa no disponible

- GIVEN que el renderer, los tiles o el geocodificador no están disponibles
- WHEN el usuario captura manualmente los datos válidos
- THEN el formulario mantiene habilitado el guardado
- AND la sucursal puede crearse sin una llamada al proveedor cartográfico

### CEDIS inválido

- GIVEN un CEDIS inexistente, inactivo o de tipo distinto
- WHEN el usuario intenta crear una `BRANCH`
- THEN la API rechaza la solicitud
- AND la UI no presenta el alta como confirmada

### Sin efectos de inventario

- GIVEN una solicitud válida para crear una sucursal
- WHEN la API responde `201 Created`
- THEN no existen balances, movimientos, transferencias ni ciclos creados por
  el alta

## Permisos

- `ADMIN`: crear y consultar sucursales conforme a `cedis.manage`.
- `WAREHOUSE`: consultar la relación CEDIS-sucursal dentro de su alcance.
- Otros roles no obtienen acceso de creación por esta pantalla.

## Gate de renderer

La Fase 0 MUST dejar bloqueada la implementación del renderer productivo hasta
que se cumplan ambas condiciones:

1. los specs canónicos no exijan una dependencia obligatoria de React Leaflet o
   Leaflet; y
2. exista un proveedor de style/tiles aprobado con style JSON, sprites, glyphs,
   atribución, licencia, endpoint controlado y smoke test definidos.

Mientras el gate esté bloqueado, la pantalla solo puede avanzar con captura
manual y estados de indisponibilidad. No se deben instalar Leaflet, React
Leaflet, MapLibre, servidores de tiles ni infraestructura de estilos como parte
de esta fase.

## Referencias
- `specs/.specs/03-api/locations-api.md`.
- `specs/.specs/03-api/delivery-api.md`.
- `specs/.specs/04-ui/routes-delivery.md`.
- `specs/modules/routes-delivery/spec.md`.
- `docs/ui/planSucursales.md`.
