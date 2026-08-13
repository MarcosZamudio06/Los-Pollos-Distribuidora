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

### Decisión: pendiente

No existe todavía un proveedor aprobado de style/tiles para el renderer
productivo. Photon queda definido únicamente como proveedor inicial del puerto
de geocodificación; no resuelve estilos ni tiles y no debe tratarse como tal.

La decisión debe evaluarse antes de instalar infraestructura o habilitar un
renderer productivo. El proveedor elegido MUST cumplir, como mínimo, con:

- cobertura operativa de México;
- compatibilidad con el renderer aprobado y un `style.json` completo;
- sprites y glyphs disponibles y versionables;
- atribución visible de OpenStreetMap y de las demás fuentes aplicables;
- licencia compatible con uso empresarial y términos documentados;
- versionado de datasets y estilos;
- caché y rendimiento aceptables en dispositivos móviles;
- endpoint público controlado o same-origin, sin exponer secretos;
- healthcheck y smoke test para style, sprites, glyphs y tiles;
- posibilidad de sustituirse sin modificar el dominio ni los contratos de rutas.

No se debe elegir un proveedor por defecto ni instalar servidores, datasets,
tiles o estilos hasta registrar la decisión, la licencia, la atribución, el
modelo de operación y la política de fallback. Mientras la decisión siga
pendiente, el gate de renderer productivo permanece bloqueado y la captura
manual/lista textual es la alternativa válida.
