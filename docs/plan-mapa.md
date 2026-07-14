# Plan por fases — Optimización geoespacial de Reparto/Rutas

  ## Resumen

  Extender el módulo existente de Reparto sin crear un flujo paralelo: cada parada corresponderá a una venta confirmada, conservará inventario/
  cobranza/evidencia/liquidación y será visible únicamente para el repartidor asignado.

  Flujo objetivo:

  1. ADMIN selecciona origen, repartidor y ventas elegibles.
  2. Photon localiza o corrige cada dirección sobre el mapa.
  3. VROOM ordena las entregas, iniciando y terminando en el origen.
  4. OSRM calcula el trazado vial definitivo, distancia y duración.
  5. ADMIN revisa el resultado y crea la ruta.
  6. DRIVER visualiza el mismo mapa y secuencia desde /my-routes.

  Photon soporta búsqueda incremental, geocodificación inversa y respuestas GeoJSON; VROOM usa coordenadas [longitud, latitud]; OSRM puede
  devolver el recorrido completo como GeoJSON. Photon (https://github.com/komoot/photon/blob/master/docs/api-v1.md), VROOM
  (https://github.com/VROOM-Project/vroom/blob/master/docs/API.md), OSRM (https://project-osrm.org/docs/v26.4.0/http).

  ## Fases lineales de implementación

  ### Fase 1 — Especificaciones y contratos canónicos

  - Actualizar primero los specs de rutas, API y UI con coordenadas, secuencia optimizada, geometría, métricas y comportamiento ante fallos.
  - Documentar que solo participan ventas confirmadas no canceladas y todavía no asignadas.
  - Establecer que el objetivo inicial es minimizar tiempo de conducción para un solo repartidor, con salida y regreso al origen.
  - Dejar fuera del primer alcance GPS en vivo, navegación giro a giro, funcionamiento offline, capacidades, ventanas horarias y optimización
    simultánea de varios vehículos.

  - Gate: contratos revisados y sin contradicciones con ROUTE_STOCK, cobranza, evidencia o liquidación.

  ### Fase 2 — Infraestructura geoespacial

  - Sustituir PostgreSQL por postgis/postgis:16-3.5-alpine y habilitar CREATE EXTENSION postgis; PostGIS aporta tipos espaciales e índices GiST.
    PostGIS (https://postgis.net/documentation/getting_started/), imagen oficial (https://github.com/postgis/docker-postgis).

  - Incorporar Photon, OSRM y VROOM como servicios internos de Docker Compose, sin puertos públicos:
      - Photon 2322, con datos de México y prioridad geográfica alrededor del origen.
      - OSRM 5000, perfil driving y dataset versionado de México.
      - VROOM 3000, conectado al OSRM interno.

  - Crear scripts reproducibles para descargar, preparar y actualizar datos OSM fuera del arranque normal de la aplicación.
  - Configurar health checks, volúmenes persistentes y variables PHOTON_URL, OSRM_URL, VROOM_URL y MAP_DATA_VERSION.
  - Gate: PostGIS, Photon, OSRM y VROOM saludables y comunicándose únicamente por la red interna.

  ### Fase 3 — Persistencia y backend con TDD estricto

  - Agregar coordenadas decimales a ubicaciones operativas y pedidos; generar columnas PostGIS geography(Point,4326) e índices GiST desde esas
    coordenadas.

  - Extender DeliveryOrder con stopSequence, coordenadas, dirección normalizada, referencia Photon y métricas del tramo.
  - Extender DeliveryRoute con estado de optimización, geometría GeoJSON, columna PostGIS LineString, distancia, duración, fecha de optimización,
    perfil y versión del dataset.

  - Crear DeliveryRoutePlanDraft, propiedad del ADMIN, con entrada validada, resultado calculado, hash, expiración de 30 minutos, consumo único y
    ruta creada.

  - Mantener campos geográficos opcionales para registros históricos; las rutas antiguas continuarán funcionando en modo textual.
  - Implementar adaptadores NestJS separados para Photon, VROOM y OSRM usando fetch con AbortController, timeouts configurables y errores 503 sin
    persistencia parcial.

  - Pipeline:
      1. Validar origen, DRIVER activo, ventas y coordenadas.
      2. Enviar trabajos a VROOM con el mismo origen como inicio y final.
      3. Rechazar con 422 cualquier parada no asignable.
      4. Solicitar a OSRM el trayecto ordenado con geometries=geojson&overview=full.
      5. Guardar un borrador temporal.
      6. Al confirmar, revalidar concurrencia y consumir el borrador en una transacción.

  - Gate: migración, contratos, servicios y pruebas backend verdes antes de comenzar UI.

  ### Fase 4 — Planificador administrativo

  - Sustituir el modal actual de creación por una página dedicada /delivery-routes/new.
  - Instalar React Leaflet, Leaflet y sus tipos; utilizar GeoJSON directamente para evitar decodificadores adicionales. React Leaflet
    (https://react-leaflet.js.org/docs/start-installation/).

  - Diseñar una “mesa de despacho” empresarial:
      - Panel lateral con nombre, fecha, origen, repartidor y ventas elegibles.
      - Mapa dominante con marcadores numerados, origen diferenciado y recorrido rojo/dorado.
      - Lista y mapa sincronizados; la lista seguirá siendo accesible por teclado y lectores de pantalla.

  - Obtener repartidores y ubicaciones desde las APIs existentes, nunca mediante IDs escritos manualmente.
  - Para cada venta:
      - Proponer la dirección del cliente.
      - Buscar alternativas con Photon.
      - Permitir colocar o arrastrar el marcador.
      - No sobrescribir silenciosamente la dirección comercial original.

  - “Calcular ruta” crea el borrador; cualquier cambio posterior invalida el resultado y exige recalcular.
  - “Crear y asignar” consume el borrador con confirmación e idempotencia.
  - Adaptar AssignOrdersModal: las rutas geoespaciales solo aceptarán nuevas entregas mediante un plan combinado y reoptimizado.
  - Gate: creación completa desde navegador, incluyendo una ruta de una parada y otra de varias paradas.

  ### Fase 5 — Experiencia del repartidor

  - Integrar en /my-routes el mapa de la ruta seleccionada, geometría persistida y marcadores numerados.
  - Mostrar secuencia operativa, dirección, cliente, estado, distancia y duración estimada.
  - Mantener las acciones existentes de entrega, evidencia, incidencia y cobranza.
  - El DRIVER solo podrá obtener geometría y pedidos de sus propias rutas; ADMIN conserva detalle completo.
  - No solicitar ubicación del dispositivo ni recalcular por desvíos en esta versión.
  - Gate: el repartidor ve exactamente la misma secuencia y trazado aprobados por ADMIN.

  ### Fase 6 — Observabilidad, compatibilidad y despliegue

  - Registrar latencia, timeout y resultado por proveedor sin escribir direcciones completas en logs.
  - Exponer estado técnico agregado para PostGIS, Photon, VROOM, OSRM y antigüedad del dataset.
  - Mantener fallback textual para rutas históricas; nunca inventar una línea recta cuando falta geometría.
  - Desplegar primero infraestructura y migración compatible, después backend y finalmente frontend.
  - Ejecutar un smoke test con datos reales controlados de Veracruz–Boca del Río–Alvarado antes de habilitar la página.
  - Versionar y renovar mensualmente los datos OSM; cada ruta conserva la versión utilizada.

  ## Cambios públicos de API y datos

  - GET /api/delivery-route-planning/eligible-sales: ventas confirmadas, no canceladas y sin otra ruta; incluye cliente, dirección sugerida y
    cuenta por cobrar.

  - GET /api/geocoding/search y /reverse: proxy ADMIN hacia Photon, limitado a México y con respuesta normalizada.
  - POST /api/delivery-route-plans: crea la optimización temporal y devuelve:
      - id, expiresAt;
      - orderedStops[];
      - geometry GeoJSON;
      - distanceMeters, durationSeconds.

  - POST /api/delivery-routes: acepta routePlanId; lo consume una sola vez y crea ruta/pedidos atómicamente. Un reintento con la misma clave
    idempotente devuelve la ruta ya creada.

  - POST /api/delivery-routes/:id/orders: para rutas geoespaciales exigirá un plan que incluya paradas anteriores y nuevas; el body legado
    continuará solo para rutas históricas no geoespaciales.

  - Los GET existentes agregarán mapAvailable, geometría, métricas, secuencia y coordenadas sin eliminar campos actuales.

  ## Pruebas y aceptación

  - Base de datos: extensión PostGIS, columnas generadas, índices GiST, restricciones de coordenadas y migración de datos históricos.
  - Backend: orden VROOM, formato [lon,lat], recorrido cerrado, parada única, direcciones ambiguas, parada inalcanzable, timeout, borrador
    expirado, consumo duplicado y venta asignada concurrentemente.

  - Seguridad: ADMIN puede planificar; DRIVER solo consulta rutas propias; servicios geográficos nunca quedan expuestos directamente.
  - Frontend: selección de ventas, búsqueda Photon, pin manual, arrastre, invalidación del preview, trazado GeoJSON, confirmación y estados de
    error.

  - Browser QA: escritorio, tablet y móvil; foco, teclado, contraste, redimensionamiento del mapa y lista utilizable sin depender visualmente del
    mapa.

  - Aceptación final: una ruta creada con varias ventas debe regresar al origen, mostrar secuencia/distancia/duración y verse idéntica en la
    cuenta del repartidor; un fallo externo no debe crear registros parciales.

  ## Supuestos

  - Photon será el geocodificador self-hosted.
  - La cobertura inicial será México, con sesgo de búsqueda hacia Veracruz.
  - Cada parada corresponde a una venta confirmada.
  - La ruta siempre regresa a la ubicación operativa de origen.
  - La primera versión maneja un vehículo/repartidor por optimización.
  - El mapa del repartidor es planificado y estático, sin GPS en vivo.
  - La URL de tiles será configurable. Los tiles públicos de OSM podrán usarse en desarrollo con atribución visible, pero producción deberá usar
    un proveedor OSM autorizado o infraestructura propia porque el servicio público no ofrece SLA ni permite uso intensivo. Política de tiles OSM
    (https://operations.osmfoundation.org/policies/tiles/).

  ## Key Learnings:

  1. El mapa debe extender el contrato actual de pedidos confirmados, no crear paradas desconectadas de inventario, cobranza y liquidación.
  2. La optimización debe permanecer bajo control del backend mediante borradores consumibles; confiar geometría o secuencia enviadas libremente
     por el cliente rompería la trazabilidad.