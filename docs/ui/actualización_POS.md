# Especificación consolidada de rediseño

## POS empresarial para distribuidora de pollos

Los tokens y contratos reutilizables de componentes se consolidan en `docs/ui/pos-design-system.md`.

---

# 1. Dirección de producto

El POS se diseñará como una **estación transaccional de alta velocidad**, no como un dashboard administrativo.

La operación principal será:

**Escanear → verificar → corregir si es necesario → cobrar → preparar la siguiente venta**

Toda decisión visual o técnica debe reducir:

* Tiempo por venta.
* Errores de cantidad, peso, precio y forma de pago.
* Movimientos innecesarios del cursor.
* Pérdida de foco del escáner.
* Información técnica o administrativa irrelevante para el cajero.

## La interfaz utilizará una apariencia clara, profesional y de alta densidad. Se descarta tanto el diseño basado en tarjetas como una estética oscura tipo terminal. El carrito será el centro operativo y el buscador permanecerá visible y enfocado sin consumir espacio excesivo.

# 2. Arquitectura general del layout

## 2.1 Estructura definitiva

La pantalla se divide en cuatro zonas continuas:

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ 1. Barra operativa                                                        │
├────────────────────────────────────────────────────────────────────────────┤
│ 2. Barra de escaneo y búsqueda                                            │
├───────────────────────────────┬────────────────────────────────────────────┤
│ 3A. Resultados / catálogo     │ 3B. Carrito activo                        │
│                               │                                            │
├───────────────────────────────┴────────────────────────────────────────────┤
│ 4. Dock unificado de cliente, pago, total y cobro                         │
└────────────────────────────────────────────────────────────────────────────┘
```

No se utilizarán tarjetas independientes para sucursal, caja, cajero, cliente, pago, total o confirmación. La separación se realizará mediante:

* Divisores.
* Cambios sutiles de fondo.
* Alineación.
* Jerarquía tipográfica.
* Espaciado consistente.

## 2.2 Dimensiones base

Para un frame de referencia de `1440 × 900 px`:

| Zona             |       Dimensión |
| ---------------- | --------------: |
| Barra operativa  |           52 px |
| Barra de escaneo |           64 px |
| Área de trabajo  | Altura restante |
| Dock de cobro    |          144 px |
| Resultados       |   38% del ancho |
| Carrito          |   62% del ancho |

### Decisión cerrada: dock de 144 px

Se descarta un dock de 96 px porque no ofrece espacio suficiente para cliente, condición, método, pago recibido, cambio, total y estado del CTA. También se descarta un dock superior a 168 px porque reduciría innecesariamente el área del carrito.

---

# 3. Arquitectura de cada zona

## 3.1 Barra operativa

Una sola línea compacta con:

* Sucursal.
* Caja.
* Turno.
* Usuario.
* Estado de conexión.
* Hora.
* Acción `Nueva venta · F9`.

La información estable se presenta en texto neutral. Solo las excepciones reciben color.

```text
Sucursal Alvarado · Caja 03 · Turno 104 · Marcos · ● En línea · 14:32
                                                      [Nueva venta F9]
```

### Reglas

* Sin tarjetas interiores.
* Sin títulos grandes.
* Sin fondos de alerta permanentes.
* `Nueva venta` es una acción neutral, no roja.
* Un cambio de sucursal con carrito activo requiere confirmación.

---

## 3.2 Barra de escaneo y búsqueda

La barra ocupa todo el ancho y mantiene el foco operativo.

Debe aceptar:

* Código de barras.
* SKU.
* Nombre.
* Comandos de teclado.

```text
[icono escáner] Escanea código, SKU o busca producto…          Listo · F2
```

### Comportamiento

1. Un código exacto agrega el producto directamente.
2. Una búsqueda ambigua abre resultados.
3. Después de agregar, editar o cerrar un panel no modal, el foco regresa al buscador.
4. El último producto agregado se muestra como confirmación breve.
5. Un error no borra la consulta hasta que el usuario lo revise.
6. La báscula muestra su estado junto al buscador cuando aplique.

### Decisión cerrada: buscador compacto

No ocupará 40% del peso visual. El escáner necesita presencia y foco, pero el carrito se consulta durante toda la venta y debe conservar más espacio.

---

## 3.3 Resultados y catálogo

Se utilizará una tabla compacta, no tarjetas de producto.

### Columnas

* Producto.
* SKU.
* Unidad.
* Precio.
* Existencia.
* Promoción o excepción.
* Acción.

### Fila base

* Altura: 52 px.
* Nombre: fuente UI.
* SKU, unidad, precio y existencia: fuente monoespaciada cuando corresponda.
* Acción primaria accesible mediante `Enter`.
* Productos sin stock permanecen visibles, pero no se agregan sin autorización.

### Información prohibida

Nunca mostrar:

* IDs internos.
* CUID o UUID.
* Estados técnicos como `DRAFT`.
* Nombres de campos de base de datos.
* Información duplicada de stock.

La exposición de identificadores internos y estados de desarrollo debe corregirse como P0, antes del trabajo visual.

---

## 3.4 Carrito activo

El carrito es la fuente visual de verdad de la operación.

### Encabezado

* Folio provisional.
* Número de partidas.
* Estado de la venta.
* Acciones secundarias autorizadas.

### Columnas

* Producto.
* Unidad o peso.
* Cantidad.
* Precio unitario.
* Descuento.
* Subtotal.
* Acciones.

### Fila base

* Altura: 56 px.
* Scroll interno.
* Encabezado fijo.
* Valores monetarios alineados a la derecha.
* Cantidad editable sin abrir otro formulario.
* Promociones o autorizaciones en una segunda línea discreta.
* Última partida escaneada resaltada brevemente.
* La fila seleccionada muestra controles de edición y eliminación.

### Resumen fijo

En la parte inferior del carrito:

* Subtotal.
* Descuentos.
* Impuestos cuando correspondan.
* Total provisional.

El resumen nunca desaparece durante el scroll.

---

## 3.5 Dock unificado de cobro

El dock sustituye todas las tarjetas inferiores.

### Distribución

| Bloque             | Ancho |
| ------------------ | ----: |
| Cliente y crédito  |   27% |
| Condición y método |   23% |
| Pago y cambio      |   20% |
| Total y CTA        |   30% |

### Cliente

Mostrar:

* Nombre o `Público general`.
* Tipo de cliente.
* Crédito disponible cuando corresponda.
* Bloqueos o restricciones.
* Atajo `F4`.

### Condición y método

Mostrar:

* Contado o crédito.
* Efectivo, tarjeta, transferencia u otro método configurado.
* Atajo `F6`.
* Acceso a pago combinado.

### Pago

Mostrar:

* Importe recibido.
* Importe pendiente.
* Cambio.
* Número de pagos registrados.

### Total y CTA

El total es el dato visualmente más dominante.

El CTA cambia según el estado:

```text
AGREGA PRODUCTOS
CAPTURA EL PESO
SELECCIONA CLIENTE
REGISTRA EL PAGO
COBRAR $451.00 · F8
PROCESANDO…
VENTA REGISTRADA
```

Un botón deshabilitado siempre explica la causa:

```text
REGISTRA EL PAGO
Pendiente: $451.00
```

La propuesta de CTA contextual y estados explícitos se adopta porque guía el flujo y reduce intentos fallidos de cobro.

---

# 4. Jerarquía visual

La jerarquía definitiva será:

1. **Buscador enfocado.**
2. **Contenido del carrito.**
3. **Total y acción de cobro.**
4. **Excepciones que bloquean la operación.**
5. **Resultados de productos.**
6. **Cliente y forma de pago.**
7. **Metadatos de sucursal, caja y usuario.**

## Reglas

* Los estados normales permanecen visualmente silenciosos.
* Los errores y bloqueos destacan.
* El total debe reconocerse mediante visión periférica.
* Los títulos de sección son discretos.
* No se utilizarán mayúsculas con tracking amplio en toda la pantalla.
* El color nunca será el único indicador de estado.

---

# 5. Dirección visual definitiva

## 5.1 Tema

Se utilizará un tema claro de alta densidad:

| Token                 |     Valor |
| --------------------- | --------: |
| Fondo general         | `#F5F6F3` |
| Superficie            | `#FFFFFF` |
| Superficie secundaria | `#EEF1ED` |
| Texto principal       | `#161A18` |
| Texto secundario      | `#59635D` |
| Divisor               | `#D7DDD8` |
| Acción principal      | `#123D32` |
| Acción neutral        | `#1D5FD1` |
| Éxito                 | `#167552` |
| Advertencia           | `#A15C00` |
| Error                 | `#B42318` |
| Foco                  | `#2563EB` |

### Decisión cerrada: tema claro

Se descarta el modo oscuro como dirección principal. Aunque la propuesta oscura ofrece alta densidad y contraste, resulta demasiado cercana a una terminal técnica y puede perder legibilidad en sucursales muy iluminadas. Se conservan de ella las tablas, la disciplina numérica y el uso de monoespaciado, no su estética completa.

## 5.2 Tipografía

* UI general: `Inter` o `Geist Sans`.
* Datos: `JetBrains Mono` o `IBM Plex Mono`.

Usar monoespaciado en:

* Precios.
* Cantidades.
* Pesos.
* SKU.
* Folios.
* Horas.
* Totales.

## 5.3 Densidad

| Componente             |     Altura |
| ---------------------- | ---------: |
| Barra operativa        |      52 px |
| Barra de escaneo       |      64 px |
| Encabezado de tabla    |      36 px |
| Fila de resultados     |      52 px |
| Fila de carrito        |      56 px |
| Input o botón estándar |      44 px |
| CTA de cobro           |      56 px |
| Objetivo táctil mínimo | 44 × 44 px |
| Radio estándar         |       8 px |

### Decisión cerrada: filas de 52–56 px

Se descartan las filas de 28–32 px. Aunque permiten mostrar más registros, reducen precisión táctil, legibilidad y accesibilidad durante jornadas largas.

---

# 6. Flujo operativo del cajero

## 6.1 Venta normal

1. El POS abre con el escáner enfocado.
2. El cajero escanea un producto.
3. El sistema agrega directamente una coincidencia exacta.
4. La nueva partida se resalta en el carrito.
5. Si el producto requiere peso, el sistema obtiene o solicita la lectura.
6. El cajero repite el escaneo.
7. El cliente permanece como `Público general` salvo que se seleccione otro.
8. El cajero abre pago con `F6`.
9. Registra método e importe recibido.
10. El sistema calcula pendiente o cambio.
11. El CTA cambia a `Cobrar $X`.
12. El cajero presiona `F8`.
13. La venta se registra.
14. Se envía el ticket a impresión.
15. El sistema muestra reimpresión sin duplicar la venta.
16. Se prepara una nueva venta y el foco regresa al escáner.

## 6.2 Atajos

```text
F2        Enfocar buscador
F4        Seleccionar cliente
F6        Registrar o editar pago
F8        Cobrar
F9        Nueva venta
Enter     Confirmar selección
+ / -     Modificar cantidad
Delete    Eliminar partida seleccionada
Esc       Cerrar panel o cancelar acción actual
Ctrl + Z  Deshacer última modificación reversible
```

Los atajos deben aparecer junto a su acción, no únicamente en una leyenda general.

---

# 7. Máquina de estados de la venta

El frontend debe representar explícitamente estos estados:

| Estado              | CTA                   |
| ------------------- | --------------------- |
| `EMPTY`             | Agrega productos      |
| `CART_ACTIVE`       | Registra el pago      |
| `WEIGHT_PENDING`    | Captura el peso       |
| `CUSTOMER_REQUIRED` | Selecciona cliente    |
| `CREDIT_BLOCKED`    | Crédito no disponible |
| `PAYMENT_PENDING`   | Pendiente: $X         |
| `READY_TO_CHARGE`   | Cobrar $X             |
| `PROCESSING`        | Procesando…           |
| `SUCCESS`           | Venta registrada      |
| `BLOCKED`           | Resolver incidencia   |

No se calculará el estado visual mediante condiciones dispersas en diferentes componentes. Debe existir una única fuente de verdad del estado transaccional.

---

# 8. Sistema de componentes

## Componentes principales

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

## Componentes auxiliares

* `CustomerPicker`
* `PaymentDrawer`
* `MixedPaymentEditor`
* `WeightCapture`
* `SupervisorAuthorizationDialog`
* `ExceptionBanner`
* `ConfirmationDialog`
* `PrintStatus`
* `Toast`
* `KeyboardShortcut`
* `StatusBadge`

## Reglas

* Las tablas son el componente principal.
* Las cards se reservan para diálogos, paneles flotantes y resúmenes.
* Los modales se utilizan únicamente en acciones irreversibles o con autorización.
* Los procesos rutinarios ocurren inline o mediante drawer.
* Los componentes visuales no contienen reglas de negocio duplicadas.
* Ningún componente inventa datos que no provengan del sistema.

---

# 9. Sistema de estados de componentes

Todos los componentes interactivos deben implementar:

* `default`
* `hover`
* `focus-visible`
* `pressed`
* `disabled`
* `loading`
* `error`
* `warning`
* `success`
* `selected`

Estados operativos adicionales:

* `scanned`
* `modified`
* `authorized`
* `blocked`
* `offline`
* `pending-weight`
* `pending-payment`

## Reglas

* El foco tiene anillo visible de 2 px.
* Los botones deshabilitados muestran motivo.
* Los errores aparecen junto al elemento que los originó.
* Una autorización muestra quién la realizó.
* Una modificación de precio conserva trazabilidad.
* Ningún estado depende exclusivamente de color.
* Los estados de carga no desplazan el layout.

---

# 10. Manejo de excepciones

## Producto sin stock

* Permanece visible.
* La acción de agregar se bloquea.
* Se muestra `Sin stock`.
* Una venta excepcional requiere autorización del supervisor y debe conservar trazabilidad.

## Producto por kilogramo

* El carrito muestra `Peso pendiente` hasta recibir una lectura válida.
* No se permite cobrar con partidas sin peso.
* El peso y el subtotal usan monoespaciado.

## Crédito insuficiente o bloqueado

* La restricción se muestra dentro del dock.
* El CTA indica el problema.
* El cajero puede cambiar a contado.
* Una excepción requiere autorización según las reglas existentes.

## Promoción

* Se aplica automáticamente cuando corresponda.
* La fila muestra nombre o causa de la promoción.
* El resumen refleja el descuento.
* No se obliga al cajero a buscar promociones manualmente.

## Precio modificado

* Requiere permiso.
* Muestra valor original y nuevo.
* Registra al usuario autorizador.
* Permanece identificable hasta cerrar la venta.

## Cambio de sucursal

* Con carrito vacío, el cambio es directo.
* Con carrito activo, se solicita confirmación.
* Confirmar elimina el carrito actual.

## Pérdida de conexión

* Se conserva visualmente el carrito activo.
* Se bloquea la confirmación de la venta.
* Se muestra un estado persistente y textual.
* No se simula una venta completada sin confirmación del backend.

## Pago incompleto

* El dock muestra el importe pendiente.
* El CTA permanece bloqueado.
* Se permite agregar otro método mediante pago combinado.

## Error de impresión

* La venta no se vuelve a registrar.
* Se muestra `Venta registrada · impresión pendiente`.
* Se habilita reimpresión.
* La reimpresión utiliza el folio ya creado.

---

# 11. Accesibilidad

## Requisitos obligatorios

* Operación completa mediante teclado.
* Orden de tabulación igual al flujo visual.
* Foco visible en todo momento.
* Textos y controles con contraste suficiente.
* Objetivos interactivos mínimos de 44 × 44 px.
* Labels persistentes en campos no evidentes.
* Mensajes de error asociados al control.
* Icono y texto para estados críticos.
* Lectura semántica de tablas.
* Totales anunciados cuando cambien.
* Respeto a `prefers-reduced-motion`.
* Zoom de navegador al 150% sin pérdida funcional.
* No depender de hover para mostrar acciones esenciales.

---

# 12. Responsive

## 1280 px o más

* Resultados: 38%.
* Carrito: 62%.
* Dock en una fila.
* Todas las columnas operativas visibles.

## 1024–1279 px

* Resultados: 40%.
* Carrito: 60%.
* Se ocultan metadatos secundarios.
* Dock en dos filas.
* Total y cobrar permanecen visibles.
* Controles táctiles mantienen 44 px.

## Menos de 1024 px

El checkout transaccional completo no estará habilitado.

Se mostrará una vista informativa indicando que el POS operativo requiere una resolución mínima de `1024 × 768 px`. Esta decisión evita ofrecer una experiencia de cobro comprimida y propensa a errores.

---

# 13. Microinteracciones

## Escaneo correcto

* Confirmación visual inmediata.
* Resaltado de la nueva fila: 500 ms.
* Actualización del total: 120–160 ms.
* Retorno automático del foco.
* Sin animaciones de objetos “volando” al carrito.

## Error

* Mensaje inline.
* Resaltado breve del campo.
* Sin movimientos agresivos.
* El valor capturado se conserva.

## Cobro exitoso

* `Procesando…`
* `Venta registrada`
* Confirmación visual máxima de 700 ms.
* Inicio automático de la siguiente venta.

## Reglas

* Hover: 80–100 ms.
* Drawer: 180–220 ms.
* Modal: 140–180 ms.
* Movimiento reducido cuando el sistema lo solicite.
* Audio desactivado por defecto; no forma parte del flujo obligatorio.

---

# 14. Prioridades de diseño y desarrollo

## P0 — Integridad operativa

* Eliminar IDs internos y estados técnicos visibles.
* Corregir cálculos, unidades y subtotales.
* Implementar estado transaccional único.
* Mantener foco del escáner.
* Bloquear cobro con peso, cliente, crédito o pago pendientes.
* Hacer visible la causa de cada bloqueo.
* Implementar navegación crítica por teclado.
* Corregir contraste y estados del CTA.

## P1 — Arquitectura principal

* Implementar las cuatro zonas.
* Sustituir tarjetas por tablas y divisores.
* Crear carrito dominante.
* Crear dock de cobro.
* Implementar cliente, crédito y pagos.
* Soportar kilogramo, pieza y caja.
* Integrar promociones, autorización e impresión.

## P2 — Sistema y calidad

* Consolidar tokens y componentes.
* Implementar responsive desde 1024 px.
* Completar accesibilidad.
* Añadir estados vacíos, loading, error y offline.
* Implementar microinteracciones.
* Agregar pruebas visuales y de teclado.

---

# 17. Verificación de coherencia

Todos los agentes trabajan sobre estas decisiones inmutables:

* Tema claro de alta densidad.
* Sin dashboard de tarjetas.
* Barra operativa de 52 px.
* Escáner de 64 px.
* Workspace 38/62.
* Carrito dominante.
* Dock de 144 px.
* Filas de 52–56 px.
* Inter para UI.
* JetBrains Mono para datos.
* CTA contextual.
* Teclado primero y táctil compatible.
* Checkout mínimo desde 1024 px.
* Estado transaccional centralizado.
* Ningún dato inventado.
* Ningún ID interno visible.

---
