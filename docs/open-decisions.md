## Decisiones abiertas actuales

Mantener visibles hasta que el negocio confirme:

- Modelo final sucursal-almacen: jerarquia, ubicaciones independientes o mixto.
- Regla exacta para decidir ubicacion de descuento en ventas complejas.
- Equivalencias oficiales kilo-pieza por producto.
- Política exacta de redondeo para kilos, piezas y equivalencias no monetarias.
- Tolerancias de merma, diferencia de peso, devolucion y rechazo parcial.
- Requisito offline para experiencia movil de repartidores.
- Evidencia obligatoria de entrega.
- Profundidad futura de CFDI sin implementarlo en MVP.
- Alcance exacto de politicas comerciales por cliente, tipo, ubicacion o combinacion.
- Catalogo final de metodos de pago y bancos.
- Politica de folios por sucursal, punto de venta o ruta.
- Manejo de canastillas de clientes.

## Decisiones cerradas

- Las terminales de caja son entidades persistentes administradas y cada una se vincula a un `deviceId` registrado. Los turnos son independientes del cierre diario consolidado de sucursal.

## Proveedor de estilos y tiles para mapas

### Decisión: CERRADA / APROBADA

El renderer productivo aprobado es MapLibre GL JS con cartografía self-hosted:

- **Tile server:** TileServer GL `v5.6.0`, pinned y sin puerto publicado al host
  en producción.
- **Dataset:** snapshot de México de Geofabrik. La preparación registra URL de
  origen, snapshot/versión, fecha y SHA-256 en `.map-data/rendering/manifest.json`.
- **Generación:** Planetiler `v0.10.2`, pinned, con el perfil OpenMapTiles.
- **Salida:** `mexico.pmtiles` (PMTiles es el formato operativo servido por
  TileServer GL).
- **Schema:** OpenMapTiles `v3.16`.
- **Style:** OSM Bright en commit
  `563b249f7ae71528b1f1e327cb9c019d0dda4c50`, con sprites y glyphs preparados
  desde revisiones fijas.
- **Fonts:** OpenMapTiles fonts `v2.0`, descargadas por el flujo explícito de
  preparación y no durante el arranque de Docker.
- **Same-origin:** el browser solicita `/maps/styles/operations/style.json` y
  recursos derivados desde `/maps/**`; Nginx hace reverse proxy a la red
  interna. Photon, OSRM, VROOM y `tileserver:8080` no llegan al browser.
- **Atribución mínima visible:** `© OpenMapTiles © OpenStreetMap contributors`.
- **Licencias:** se conservan notices y licencias de Geofabrik/OSM,
  OpenMapTiles, OSM Bright, Planetiler, TileServer GL y fonts en
  `docker/maps/licenses/` y en el manifest de despliegue.
- **Fallback:** si el style, sprites, glyphs, tiles o WebGL fallan, no se usa
  `tile.openstreetmap.org` en producción; la captura manual/textual permanece
  disponible.

El backend solo mantiene los adaptadores privados de Photon, OSRM y VROOM y un
estado agregado opcional de `MapTiles` (`up`/`down` y `latencyMs`). No existe una
segunda configuración backend de style URL.
