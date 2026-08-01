# Arquitectura transaccional del POS

## Decisión

El POS es una estación de captura y cobro de alta velocidad. Su camino normal es `escanear -> corregir sólo si hace falta -> cobrar -> siguiente venta`. Esta arquitectura sustituye el layout sugerido de `sales-pos.md` para la superficie de caja; no modifica las reglas de venta, inventario, crédito ni documentos de ese spec.

La venta se confirma con una sola acción cuando el estado está listo. El sistema conserva idempotencia y muestra sus validaciones en contexto, por lo que no presenta una segunda pantalla de revisión antes de enviar la venta.

## Superficie obligatoria

El checkout de escritorio requiere un viewport mínimo de `1024 x 768 px`. Por debajo de ese tamaño se informa el requisito; no se comprime el cobro.

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Barra operativa: ubicación, caja, turno, usuario, conexión, hora, F9      │ 52 px
├────────────────────────────────────────────────────────────────────────────┤
│ Escáner y búsqueda: código, SKU o nombre; estado de lectura; F2            │ 64 px
├───────────────────────────────┬────────────────────────────────────────────┤
│ Resultados y catálogo (38 %)  │ Carrito activo (62 %)                      │
│ tabla con scroll interno       │ tabla, resumen fijo y captura inline       │
├───────────────────────────────┴────────────────────────────────────────────┤
│ Dock: cliente | condición | pagos | total y acción                           │ 144 px
└────────────────────────────────────────────────────────────────────────────┘
```

| Zona            | Regla de operación                                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Barra operativa | Una línea de 52 px. Muestra ubicación, terminal, turno abierto, cajero, conexión, hora y `Nueva venta · F9`. La ubicación es de solo lectura para `SELLER`.                          |
| Escáner         | Conserva el foco por defecto. Resuelve código de barras, después SKU y por último nombre. Un resultado exacto ejecuta su acción sin abrir una pantalla.                              |
| Resultados      | Tabla compacta, no tarjetas: producto, SKU, unidad, precio, existencia local, promoción/excepción y acción. La existencia siempre pertenece a la ubicación operativa.                |
| Carrito         | Zona dominante. Tabla de 56 px por fila, encabezado y resumen fijos, importes a la derecha y edición de cantidad en el renglón activo.                                               |
| Dock            | Una sola superficie de 144 px: cliente/crédito 27 %, condición/método 23 %, pagos/cambio 20 % y total/CTA 30 %. En 1024-1279 px se divide en dos renglones sin ocultar total ni CTA. |

La barra operativa no usa tarjetas interiores ni títulos. El buscador tampoco comparte espacio con catálogo, filtros o teclado numérico. El teclado numérico aparece sólo bajo demanda para captura táctil; nunca reserva área permanente.

## Auditoría del POS actual

| Hallazgo                                                                                                    | Resolución de arquitectura                                                                                             |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| La cabecera actual tiene título, metadatos y un segundo aviso de caja; supera la altura operativa objetivo. | Una sola barra de 52 px. El estado de caja sólo se expande ante bloqueo.                                               |
| Catálogo y carrito se reparten 50/50, con resultados en tarjetas.                                           | Workspace fijo 38/62 y resultados tabulares.                                                                           |
| El teclado numérico ocupa una sección constante aun cuando no se captura cantidad.                          | Captura inline; keypad contextual sólo al solicitarlo.                                                                 |
| Documento, canal y solicitud administrativa ocupan un bloque expandible antes del cobro.                    | Valores derivados o por defecto; sólo se exponen en un panel secundario cuando el caso exige modificarlos.             |
| `F8` abre un modal de revisión y la respuesta abre otro modal de éxito.                                     | `F8` envía directamente desde `READY_TO_CHARGE`; el resultado es una franja no bloqueante y el foco vuelve al escáner. |
| La impresión se presenta como una pantalla posterior a la venta.                                            | La impresión es un estado posterior independiente; reintentar impresión nunca reintenta la venta.                      |

## Máquina de estados

`PosTransactionState` es la única fuente de verdad para el CTA, el foco y los bloqueos. Los errores de conexión e impresión son estados ortogonales: no sustituyen el estado de la captura.

| Estado primario     | Entrada                                                                                | Salida permitida                                                                         | CTA y foco                                                         |
| ------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `EMPTY`             | Carrito vacío.                                                                         | Lectura o selección de producto.                                                         | `AGREGA PRODUCTOS`; escáner.                                       |
| `CART_ACTIVE`       | Hay partidas válidas y no existe requisito pendiente.                                  | Captura de pago, cliente o más productos.                                                | `REGISTRA EL PAGO` para contado; escáner.                          |
| `WEIGHT_PENDING`    | Se resolvió un producto por kg sin peso válido.                                        | Capturar peso positivo o eliminar partida.                                               | `CAPTURA EL PESO`; input de peso de la fila.                       |
| `CUSTOMER_REQUIRED` | Crédito o solicitud administrativa sin cliente válido.                                 | Seleccionar cliente o volver a contado si aplica.                                        | `SELECCIONA CLIENTE`; selector de cliente.                         |
| `CREDIT_REVIEW`     | Cliente con advertencia o bloqueo de crédito.                                          | Continuar si sólo hay advertencia, cambiar condición o solicitar autorización permitida. | Mensaje específico; control que resuelve la causa.                 |
| `PAYMENT_PENDING`   | Contado sin total liquidado o pago inválido.                                           | Registrar, corregir o añadir otro pago.                                                  | `REGISTRA EL PAGO`; método o importe pendiente.                    |
| `READY_TO_CHARGE`   | Partidas válidas, ubicación/sesión requerida, cliente, crédito y pagos cumplen reglas. | Confirmar venta.                                                                         | `COBRAR $X · F8`; el CTA.                                          |
| `SUBMITTING`        | Se ejecutó el envío con `Idempotency-Key`.                                             | Respuesta confirmada, error recuperable o verificación de resultado desconocido.         | `PROCESANDO...`; no cambia el foco ni permite doble envío.         |
| `REGISTERED`        | Backend confirmó la venta.                                                             | Nueva captura o reimpresión.                                                             | Franja `Venta registrada · folio`; escáner al limpiar el borrador. |
| `BLOCKED`           | Falta sesión, conexión, stock, permiso o existe una regla no resoluble en UI.          | Resolver la causa y recalcular el estado.                                                | Expone causa y acción disponible; foco en esa acción.              |

Precedencia para determinar el estado visible: conexión/sesión/ubicación bloqueantes, peso pendiente, cliente requerido, revisión de crédito, pago pendiente, listo para cobro. Cada transición debe ser reducible desde los datos de la transacción; ningún componente calcula por separado si puede cobrar.

Estados posteriores:

| Estado          | Comportamiento                                                                                                 |
| --------------- | -------------------------------------------------------------------------------------------------------------- |
| `PRINT_PENDING` | La venta ya existe. Se solicita el documento por su referencia sin bloquear la siguiente venta.                |
| `PRINT_READY`   | Se habilita `Imprimir` o `Reimprimir` con el folio confirmado.                                                 |
| `PRINT_FAILED`  | Se muestra `Venta registrada · impresión pendiente`; la única repetición permitida es la de impresión.         |
| `OFFLINE`       | Se conserva el borrador, se bloquea el envío y se anuncia la pérdida de conexión. Nunca se simula éxito local. |

## Navegación de teclado y foco

| Tecla                   | Acción                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| `F2`                    | Enfoca el escáner/buscador.                                                                             |
| `F4`                    | Abre o enfoca el selector de cliente.                                                                   |
| `F6`                    | Enfoca el primer pago incompleto; si no hay pagos, crea la primera fila de pago con el saldo pendiente. |
| `F7`                    | Enfoca la condición comercial para cambiar entre contado y crédito.                                     |
| `F8`                    | Envía sólo desde `READY_TO_CHARGE`; no abre confirmación adicional.                                     |
| `F9`                    | Inicia una venta. Con borrador con cambios, solicita confirmación de descarte.                          |
| `Enter`                 | Resuelve lectura exacta, agrega el resultado seleccionado o confirma el valor inline activo.            |
| `ArrowUp` / `ArrowDown` | Recorre resultados o filas del carrito según el foco actual.                                            |
| `+` / `-`               | Incrementa o reduce la cantidad de la partida de piezas/caja activa dentro de sus límites.              |
| `Delete`                | Quita la partida activa después de devolver el foco a la fila anterior o al escáner.                    |
| `Esc`                   | Cierra un panel secundario y retorna al escáner; no descarta el borrador.                               |

Después de una lectura exacta de pieza/caja, de guardar una cantidad válida o de cerrar un panel no bloqueante, el foco retorna al escáner. Después de un error, permanece en el control que debe corregirse. El orden de tabulación sigue barra operativa, escáner, resultados, carrito y dock.

## Flujos de unidad

### Kilogramos

1. La lectura exacta crea o activa una partida con `Peso pendiente`; no precarga un kilogramo.
2. El foco pasa al peso inline de esa fila.
3. El operador captura un valor decimal positivo dentro de la disponibilidad local y confirma con `Enter`.
4. El subtotal se recalcula, la partida queda válida y el foco retorna al escáner.
5. No se puede llegar a `READY_TO_CHARGE` con una partida `WEIGHT_PENDING`.

La báscula del MVP es captura manual. La UI puede informar ese modo, pero no representa una lectura, conexión o sincronización de hardware inexistente.

### Piezas

1. La lectura exacta añade una pieza o incrementa la partida existente.
2. La cantidad se mantiene entera, positiva y limitada por existencia local.
3. La edición directa de la fila acepta sólo enteros; el CTA refleja cualquier violación de stock.

### Caja

El contrato actual sólo define `KG`, `PIECE` y `KG_AND_PIECE`; no hay unidad `CAJA`, equivalencia, precio ni movimiento de inventario por caja. Por tanto, no existe un flujo liberable de caja y el POS no debe convertir cajas a piezas o kilos por su cuenta.

Antes de habilitarlo, el spec de inventario y el contrato de ventas deben definir como mínimo la unidad canónica, contenido o equivalencia por producto/presentación, precio aplicable, redondeo y movimiento de inventario. Con ese contrato, el flujo será equivalente a piezas: lectura exacta incrementa una caja, edición entera y validación contra disponibilidad expresada en caja o conversión autorizada por backend.

## Pago, crédito y promociones

| Caso              | Flujo mínimo                                                                                                                                                                                                                                                                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contado           | El dock inicia con el método predeterminado y el importe pendiente. `CASH_SALE` requiere que la suma aplicada sea exactamente el total.                                                                                                                                                                                             |
| Efectivo          | `F6` crea la primera fila con el saldo pendiente y enfoca `Efectivo entregado`. `Importe exacto` y las denominaciones `$50`, `$100`, `$200`, `$500` y `$1,000` sustituyen ese valor sin confirmar la venta. El cambio se calcula desde datos capturados, no aumenta el total aplicado y recibe jerarquía visual cuando es positivo. |
| Pago combinado    | `Agregar pago` incorpora una segunda fila con el saldo restante. Cada fila exige método, importe positivo y evidencia requerida. La suma no supera el total.                                                                                                                                                                        |
| Crédito           | Cambiar a crédito exige cliente válido y muestra disponible, saldo vencido y motivo de restricción en el dock. Puede tener cero o más abonos iniciales. Cobranza posterior no ocurre en POS.                                                                                                                                        |
| Crédito bloqueado | El cajero puede volver a contado. Sólo `ADMIN`, cuando la política lo permita, puede abrir la autorización con motivo auditable; no existe un bypass local.                                                                                                                                                                         |
| Promoción         | El backend determina la promoción o descuento autorizado. La fila muestra causa e importe; el operador no busca ni aplica promociones manualmente.                                                                                                                                                                                  |

## Excepciones y decisiones que sí justifican interrupción

| Situación                                                                       | Tratamiento                                                                                                                                                   |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nueva venta con captura, cambio de ubicación con carrito o descarte de borrador | Confirmación corta porque destruye captura local.                                                                                                             |
| Autorización de excepción de crédito, precio, stock o descuento                 | Panel o diálogo de autorización con identidad, motivo y resultado auditable. No se usa para el cobro ordinario.                                               |
| Producto sin stock                                                              | Visible en resultados, no agregable. La excepción sigue la autorización de negocio; nunca se inventa stock.                                                   |
| Sesión de caja ausente                                                          | El dock bloquea contado y efectivo con enlace a apertura de caja.                                                                                             |
| Conexión perdida                                                                | Conserva borrador y bloquea envío. Si el resultado de una solicitud es incierto, consulta por la misma clave de idempotencia antes de reintentar.             |
| Error de impresión                                                              | No modifica venta, inventario ni pagos. Presenta reimpresión por el documento existente.                                                                      |
| Documento, canal o folio                                                        | Se derivan o usan el valor predeterminado. Su edición vive en un panel secundario y no bloquea el camino estándar salvo que el contrato del caso lo requiera. |

No son modales de la venta normal: configuración documental, selección de método de pago, pago combinado, captura de peso, éxito de venta, ticket o estado de impresión. El ticket se abre sólo a petición explícita después de confirmar; la franja de resultado conserva la acción de reimprimir sin detener la próxima captura.

## Componentes y validación

```text
PosShell
├── OperationalBar
├── ScanCommandBar
├── Workspace
│   ├── ProductResultsTable
│   └── CartPanel
│       ├── CartTable
│       └── CartSummary
└── CheckoutDock
    ├── CustomerSummary
    ├── PaymentCondition
    ├── PaymentSummary
    └── CheckoutAction
```

`PosTransactionState` pertenece al contenedor de la transacción. Los componentes reciben estado, datos y eventos, pero no reimplementan las reglas de crédito, disponibilidad, pagos ni autorización.

La implementación se acepta cuando:

- La barra, escáner, workspace y dock cumplen 52/64/38-62/144 px en escritorio.
- El carrito domina visualmente, conserva resumen al hacer scroll y no hay tarjetas de resultados.
- Un lector compatible con teclado completa una venta de contado mediante `F2`, lecturas, `F6` y `F8` sin modal de revisión.
- `F6` crea y enfoca un pago en efectivo cuando no existe ninguno; los accesos rápidos no permiten efectivo menor al monto aplicado y dejan el CTA como siguiente foco.
- KG bloquea el cobro hasta contar con peso válido; PZA conserva enteros y disponibilidad local.
- El peso manual válido se confirma como capturado sin representar estabilidad o conexión de una báscula inexistente.
- Crédito, pago combinado, promoción, autorización, pérdida de conexión e impresión siguen los estados descritos sin duplicar ventas.
- La confirmación posterior a una venta permanece visible hasta que el cajero elige `Reimprimir`, `Nueva venta`, `Ir al historial` o `Cerrar ventana`; nunca desaparece por un temporizador no visible.
- Sólo descarte destructivo y autorización pueden interrumpir con confirmación/modal.
- Los cambios de unidades siguen los contratos canónicos; `CAJA` permanece bloqueada hasta definirlos.
