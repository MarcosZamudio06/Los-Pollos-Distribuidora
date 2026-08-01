# Sistema de Diseño POS

El POS usa un lenguaje visual de alta densidad para operar ventas rápidas con luz ambiental alta. La interfaz prioriza escáner, carrito, total y acción de cobro; las superficies se organizan mediante tablas, rieles y divisores, nunca mediante tarjetas como estructura de pantalla.

## Uso rápido

1. Aplicar tokens semánticos, no valores hexadecimales directos.
2. Construir la superficie con divisores y la escala de 8 px.
3. Elegir el estado del componente desde `PosTransactionState` y exponer su causa textual.

## Tokens

### Color

| Token                     | Valor     | Uso                                                    |
| ------------------------- | --------- | ------------------------------------------------------ |
| `--pos-porcelain`         | `#F5F6F3` | Fondo general y filas alternas muy sutiles.            |
| `--pos-surface`           | `#FFFFFF` | Barra operativa, escáner, tablas y dock.               |
| `--pos-surface-secondary` | `#EEF1ED` | Encabezados de tabla y controles pasivos.              |
| `--pos-steel`             | `#D7DDD8` | Divisores, bordes y separadores funcionales.           |
| `--pos-ink`               | `#161A18` | Texto principal y datos de alta prioridad.             |
| `--pos-muted`             | `#59635D` | Etiquetas, metadatos y ayuda secundaria.               |
| `--pos-action`            | `#123D32` | Acción principal disponible, incluido cobro.           |
| `--pos-neutral`           | `#1D5FD1` | Acción no destructiva y foco de navegación secundaria. |
| `--pos-success`           | `#167552` | Confirmación, disponibilidad y venta registrada.       |
| `--pos-warning`           | `#A15C00` | Advertencia que permite continuar con atención.        |
| `--pos-error`             | `#B42318` | Error, bloqueo o acción destructiva.                   |
| `--pos-focus`             | `#2563EB` | Anillo de foco visible.                                |

El color comunica prioridad, pero nunca es el único indicador. Todo estado crítico incluye texto y, cuando aplique, icono.

### Tipografía

| Rol   | Familia                                      | Uso                                                       |
| ----- | -------------------------------------------- | --------------------------------------------------------- |
| UI    | `Inter`, `ui-sans-serif`, `system-ui`        | Labels, nombres de producto, acciones y mensajes.         |
| Datos | `JetBrains Mono`, `IBM Plex Mono`, monospace | Importes, cantidades, kilos, SKU, folios, hora y totales. |

Usar sentence case en la interfaz. Las mayúsculas sólo identifican etiquetas breves de tabla o metadatos, con tracking máximo de `0.1em`.

### Espaciado y geometría

La unidad base es `8 px`. No introducir valores de layout ajenos a esta escala salvo el anillo de foco de 2 px.

| Token            | Valor | Uso                                                   |
| ---------------- | ----- | ----------------------------------------------------- |
| `space-1`        | 8 px  | Separación interna mínima.                            |
| `space-2`        | 16 px | Padding de controles y separación común.              |
| `space-3`        | 24 px | Separación entre grupos operativos.                   |
| `space-4`        | 32 px | Padding de drawer y modal.                            |
| `space-5`        | 40 px | Separación de bloques mayores.                        |
| `space-6`        | 48 px | Vacío de estados sin resultados.                      |
| `space-8`        | 64 px | Barra de escáner y separación excepcional.            |
| `radius-control` | 8 px  | Inputs, botones, badges y pequeños paneles flotantes. |
| `radius-surface` | 0 px  | Barras, tablas y zonas principales.                   |
| `focus-ring`     | 2 px  | Anillo `--pos-focus`, con offset de 2 px.             |

### Alturas

| Elemento               |     Altura |
| ---------------------- | ---------: |
| Barra operativa        |      52 px |
| Barra de escáner       |      64 px |
| Input y botón estándar |      44 px |
| CTA de cobro           |      56 px |
| Encabezado de tabla    |      36 px |
| Fila de resultados     |      52 px |
| Fila de carrito        |      56 px |
| Dock de cobro          |     144 px |
| Objetivo táctil mínimo | 44 x 44 px |

## Superficie y composición

La estación POS tiene cuatro zonas continuas: barra operativa de 52 px, escáner de 64 px, workspace 38/62 y dock de 144 px. En `1280 px` o más, el dock ocupa una fila. Entre `1024 px` y `1279 px`, usa dos filas sin ocultar total ni CTA. No se ofrece checkout bajo `1024 x 768 px`.

Reglas de superficie:

- Usar borde de 1 px `--pos-steel` para separar regiones y filas.
- Reservar sombras para drawer, modal y toast. Las tablas, dock y barras no llevan sombra.
- Mantener scroll interno en resultados y carrito; el resumen del carrito y el dock no desaparecen.
- No presentar IDs, UUID, CUID, estados técnicos, campos de base de datos ni disponibilidad global.
- Las cards sólo se permiten dentro de modal, drawer o resumen flotante; nunca para organizar la venta.

## Estados comunes

| Estado          | Tratamiento visual y de interacción                                                         |
| --------------- | ------------------------------------------------------------------------------------------- |
| `default`       | Superficie clara, borde `--pos-steel`, texto `--pos-ink`.                                   |
| `hover`         | Cambio de fondo a `--pos-surface-secondary`; nunca revela una acción esencial.              |
| `focus-visible` | Anillo de 2 px `--pos-focus` y offset de 2 px.                                              |
| `pressed`       | Fondo un nivel más oscuro, sin desplazar layout.                                            |
| `disabled`      | Opacidad reducida, cursor no interactivo y causa visible si bloquea la venta.               |
| `loading`       | Mantiene tamaño, bloquea repetición y muestra verbo en progreso.                            |
| `error`         | Texto `--pos-error`, mensaje junto al origen y corrección explícita.                        |
| `warning`       | Texto `--pos-warning`, conserva acción si la política lo permite.                           |
| `success`       | Texto `--pos-success`, confirma sin detener la siguiente operación.                         |
| `scanned`       | Resalta la fila añadida durante 500 ms y retorna el foco al escáner.                        |
| `modified`      | Marca la fila con leyenda de cambio y conserva valor anterior cuando requiere trazabilidad. |
| `authorized`    | Muestra autorización, usuario y motivo auditables en segunda línea.                         |
| `blocked`       | Deshabilita la acción afectada y enfoca o enlaza la resolución.                             |

Los estados `offline`, `pending-weight` y `pending-payment` usan el mismo contrato de `blocked`: causa textual, acción de resolución y ningún éxito simulado.

## Especificaciones de componentes

### Botones

| Variante    | Apariencia                                            | Uso                                               |
| ----------- | ----------------------------------------------------- | ------------------------------------------------- |
| Primario    | Fondo `--pos-action`, texto blanco, 56 px para cobro. | `Cobrar $X · F8` cuando la venta está lista.      |
| Secundario  | Borde `--pos-ink`, fondo blanco.                      | Acciones operativas reversibles.                  |
| Neutral     | Texto `--pos-neutral`, sin superficie destacada.      | Nueva venta, navegación y consulta.               |
| Destructivo | Fondo o texto `--pos-error`.                          | Eliminar partida o anular en un flujo autorizado. |
| Icono       | Área mínima de 44 x 44 px, label accesible.           | Pantalla completa, eliminar, reimpresión.         |

El CTA no dice genéricamente `Confirmar`. Deriva del estado: `Agrega productos`, `Captura el peso`, `Selecciona cliente`, `Registra el pago`, `Cobrar $X · F8` o `Procesando...`.

### Inputs y selectores

- Altura de 44 px, radio de 8 px, label persistente y valor en Inter.
- Campos de dinero, cantidad, peso, SKU y folio usan `--pos-mono`.
- Error debajo del campo, vinculado programáticamente al control.
- La lectura del escáner conserva el foco por defecto y no borra una consulta con error.
- Para kilos se permiten decimales; para piezas sólo enteros.

### Cobro en efectivo

El pago en efectivo prioriza una sola captura y mantiene el total, el importe recibido y el cambio dentro del mismo campo visual.

| Control                                 | Comportamiento                                                                                                  |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `Importe exacto`                        | Usa el saldo pendiente como importe recibido y recalcula el cambio en la misma interacción.                     |
| `$50`, `$100`, `$200`, `$500`, `$1,000` | Sustituye el importe del campo activo por la denominación elegida; no acumula pulsaciones ni confirma el cobro. |
| Captura manual                          | Permite cualquier importe válido y permanece disponible junto a los accesos rápidos.                            |
| Cambio                                  | Se actualiza de inmediato, usa `--pos-mono` y nunca depende sólo de color.                                      |

Las denominaciones sólo aparecen para efectivo. En pago combinado actúan sobre la línea de efectivo activa y usan su saldo pendiente. Después de seleccionar una denominación, el foco avanza a la acción de cobro; al cancelar o completar la venta, vuelve al escáner.

Un cambio que supere el umbral aprobado por negocio se muestra con tratamiento `warning` y requiere confirmación explícita, pero no se debe inventar un umbral en frontend ni bloquear la operación sin una política canónica.

### Tablas y filas

| Elemento            | Contrato                                                                                                        |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| Tabla de resultados | Encabezado de 36 px; fila de 52 px; columnas Producto, SKU, Unidad, Precio, Existencia, excepción y acción.     |
| Carrito             | Encabezado de 36 px; fila de 56 px; columnas Producto, Unidad/cantidad, Precio, Descuento, Subtotal y acciones. |
| Datos numéricos     | Alineación derecha y `--pos-mono`.                                                                              |
| Selección           | Línea de 3 px o fondo secundario; no depende sólo de color.                                                     |
| Sin stock           | La fila permanece visible; `Agregar` queda bloqueado con texto `Sin stock`.                                     |

### Badges

Los badges son etiquetas de estado, no contenedores. Usan radio de 8 px, padding horizontal de 8 px y texto de 12 px.

| Tipo        | Color           | Ejemplo                                 |
| ----------- | --------------- | --------------------------------------- |
| Éxito       | `--pos-success` | `En línea`, `Autorizado`.               |
| Advertencia | `--pos-warning` | `Bajo stock`, `Advertencia de crédito`. |
| Error       | `--pos-error`   | `Sin stock`, `Crédito bloqueado`.       |
| Neutro      | `--pos-muted`   | Unidad, estado informativo o metadato.  |

### Drawers y modales

| Componente              | Cuándo usarlo                                                    | Contrato                                                                                   |
| ----------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Drawer                  | Cliente, pago combinado, documento o configuración no rutinaria. | Se desliza en 180-220 ms, conserva borrador y devuelve foco al invocador.                  |
| Modal                   | Descarte irreversible o autorización.                            | Sólo una decisión bloqueante, título de acción, consecuencia, cancelar y acción explícita. |
| Diálogo de autorización | Excepción de precio, crédito, stock o descuento.                 | Requiere identidad autorizadora, motivo y resultado auditable.                             |

No usar modal para registrar una venta, seleccionar método de pago, capturar peso, mostrar éxito ni abrir el ticket. Esas acciones ocurren inline, en drawer o como estado posterior no bloqueante.

### Alertas y toasts

| Elemento            | Uso                                                                             | Persistencia                                        |
| ------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------- |
| Alerta inline       | Error de validación, sesión de caja ausente, conexión perdida o pago pendiente. | Permanece hasta resolver la causa.                  |
| Banner de excepción | Restricción que afecta el flujo completo.                                       | Visible mientras el estado sea relevante.           |
| Toast               | Confirmación breve de escaneo, guardado o actualización no crítica.             | No bloquea foco ni layout.                          |
| Estado de impresión | `Venta registrada · impresión pendiente` y reimpresión.                         | Persiste hasta obtener documento o abandonar vista. |

### Atajos

Los atajos se muestran junto a la acción, en `--pos-mono` a 12 px. No viven sólo en una leyenda global.

| Atajo     | Acción                                 |
| --------- | -------------------------------------- |
| `F2`      | Escáner/buscador.                      |
| `F4`      | Cliente.                               |
| `F6`      | Pago.                                  |
| `F7`      | Condición comercial.                   |
| `F8`      | Cobrar desde estado listo.             |
| `F9`      | Nueva venta.                           |
| `Enter`   | Confirmar selección o valor inline.    |
| `+` / `-` | Ajustar cantidad de la partida activa. |
| `Delete`  | Quitar partida activa.                 |
| `Esc`     | Cerrar panel sin descartar borrador.   |

## Evolución de producto

Esta sección define dirección de producto, no amplía por sí sola el contrato del MVP. Toda capacidad marcada como `Requiere spec` debe actualizar primero los specs canónicos de negocio, permisos, datos, API y auditoría.

### Alcance y prioridad

| Capacidad                                                 | Prioridad propuesta | Estado documental                                                     |
| --------------------------------------------------------- | ------------------- | --------------------------------------------------------------------- |
| Importe exacto, denominaciones, autofoco y cambio visible | P0                  | Compatible con el flujo actual; requiere criterios de aceptación.     |
| Sonido opcional de escaneo                                | P1                  | Preferencia local por terminal; desactivado por defecto.              |
| Roles operativos y autorización mediante PIN              | P1                  | Requiere spec; `CASHIER` sigue fuera del MVP y como decisión abierta. |
| Segunda pantalla para cliente                             | P1                  | Requiere spec e integración de dispositivo.                           |
| Telemetría productiva del POS                             | P1                  | Requiere contrato de eventos, privacidad y backend de observabilidad. |
| Integración de báscula y confirmación de peso estable     | P2                  | Fuera del MVP; no simular estado de hardware en captura manual.       |
| Emisión, timbrado y cancelación de CFDI                   | P2                  | Fuera del MVP; proceso posterior y desacoplado de la venta.           |

### Roles y capacidades

Los roles propuestos representan responsabilidades operativas, pero no deben agregarse como etiquetas aisladas. Primero se define una matriz de capacidades por ubicación, turno y acción; después se asignan estas capacidades a los roles.

| Rol propuesto   | Responsabilidad principal                                  | Límite recomendado                                      |
| --------------- | ---------------------------------------------------------- | ------------------------------------------------------- |
| `CASHIER`       | Venta, cobro y operación de su caja y turno.               | Sin excepciones comerciales ni anulaciones por defecto. |
| `SUPERVISOR`    | Autorizar excepciones durante la operación.                | Sólo dentro de ubicaciones y turnos asignados.          |
| `STORE_MANAGER` | Operar y supervisar una sucursal, sus cajas y diferencias. | Sin acceso administrativo global por defecto.           |

`ADMIN` conserva administración global y `SELLER` permanece vigente hasta que negocio apruebe la separación de responsabilidades. La migración debe evitar que un cambio de nombre altere silenciosamente permisos existentes.

### Autorización de supervisor

Descuento, crédito excepcional, reimpresión, cancelación, devolución y apertura de cajón sin venta son candidatas a autorización sensible. Cada acción debe aprobarse por separado en los specs: compartir el mismo diálogo no implica compartir la misma política.

Flujo propuesto:

1. El operador inicia la acción y ve su impacto antes de continuar.
2. El sistema solicita motivo cuando la política de esa acción lo requiera.
3. El supervisor captura un PIN en un diálogo que no expone identidad ni credenciales previas.
4. El backend valida usuario activo, capacidad, ubicación, turno, dispositivo y límites aplicables.
5. Una aprobación autoriza una sola acción, tiene vigencia breve y no eleva la sesión completa del operador.
6. El resultado registra operador, autorizador, motivo, valores anterior y nuevo, venta o turno, terminal y fecha.

El PIN nunca se valida sólo en frontend, ni se persiste en texto, ni aparece en logs, ni se reutiliza como credencial general. El servicio debe limitar intentos y reportar bloqueos sin revelar si un PIN pertenece a una persona concreta.

### Escaneo y peso

- El escáner recupera foco después de agregar, corregir, cerrar un panel o terminar una venta, excepto cuando el usuario mantiene otro campo en edición.
- El sonido de escaneo es opcional por terminal, está desactivado por defecto y distingue éxito de error. Siempre acompaña una confirmación visual y se silencia con una sola acción.
- La captura manual de peso sólo comunica `Peso capturado` o su validación; no muestra `Peso estable` porque no recibe estabilidad de un dispositivo.
- Una futura báscula integrada debe mostrar `Conectando`, `Inestable`, `Estable` y `Error`, además del peso y la antigüedad de la lectura. Sólo `Estable` habilita su aceptación automática.

### Pantalla para cliente

La segunda pantalla es una proyección de sólo lectura del estado confirmado por el POS. Su desconexión no bloquea escaneo, cobro ni registro de venta; el operador recibe un estado discreto y accionable.

Durante la venta muestra:

- Producto, cantidad y unidad.
- Precio unitario, descuento y subtotal por partida.
- Descuentos y total acumulados.
- Efectivo recibido y cambio cuando correspondan.

Después de la venta muestra folio interno, total, cambio y mensaje de cierre durante un tiempo configurable, y después vuelve al estado de bienvenida. No expone crédito disponible, datos fiscales, información administrativa, IDs internos ni controles operativos.

### Preparación fiscal

El ticket, las notas internas y la `BillingRequest` actual no son CFDI. La preparación fiscal futura debe preservar esta separación y no convertir una solicitud administrativa en factura fiscal por cambio de nombre.

Cuando negocio apruebe el alcance fiscal mexicano se requerirán, como mínimo:

- Catálogo versionado de impuestos y snapshots fiscales por partida.
- Entidad legal emisora compatible con la sucursal y la fecha de venta.
- Perfil fiscal validado del cliente.
- Solicitud de factura originada desde el documento interno.
- Timbrado, cancelación, sustitución y relación entre CFDI y documentos internos.
- Estados, reintentos, conciliación y auditoría independientes de la venta.

La venta concluye cuando su transacción operativa queda confirmada. La facturación ocurre después mediante un proceso idempotente y desacoplado; una demora o indisponibilidad de SAT o PAC nunca debe convertir una venta cobrada en fallida.

### Observabilidad en producción

Las marcas del navegador sirven para diagnóstico local, pero no permiten conocer la experiencia real. La instrumentación productiva debe enviar eventos estructurados a un colector, correlacionar frontend y backend con un identificador de operación y evitar nombres, datos fiscales, PIN, códigos completos o información de pago sensible.

| Señal                                | Medición mínima                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------ |
| Escaneo a carrito                    | Duración, resultado y causa de rechazo.                                                    |
| Búsqueda                             | Duración, cantidad de resultados y resultado seleccionado.                                 |
| Confirmación                         | Duración total y por backend, resultado y código de error.                                 |
| Impresión                            | Duración, resultado, reintento y dispositivo anonimizado.                                  |
| Venta fallida                        | Etapa, código estable, conectividad y recuperación.                                        |
| Reintento idempotente                | Operación, replay reconocido y resultado, sin exponer la clave.                            |
| Cambio de precio o descuento         | Tipo de excepción y autorización; nunca el PIN.                                            |
| Error de stock                       | Producto anonimizado, ubicación, etapa y diferencia solicitada.                            |
| Impresora o báscula                  | Estado, transición, antigüedad y terminal anonimizada.                                     |
| Diferencia de caja                   | Presencia, rango y resolución; el importe exacto sólo en sistemas financieros autorizados. |
| Reimpresión, cancelación o anulación | Motivo categorizado, autorización y resultado.                                             |

Los objetivos de servicio se fijan después de obtener una línea base representativa por terminal y ubicación. No se deben convertir umbrales locales de desarrollo en SLO productivos sin volumen, percentiles y ventana de medición aprobados.

## Movimiento y accesibilidad

- Hover: 80-100 ms; drawer: 180-220 ms; modal: 140-180 ms.
- Respetar `prefers-reduced-motion` y desactivar movimientos no esenciales.
- No desplazar contenido al cargar, validar o presentar estado.
- El orden de tabulación sigue barra, escáner, resultados, carrito y dock.
- Operación completa por teclado, zoom al 150 % y contraste suficiente en todos los estados.

## Lista de revisión

- [ ] Todo color usa token semántico del POS.
- [ ] Espaciado y alturas respetan la escala de 8 px.
- [ ] El estado visible tiene texto, no sólo color.
- [ ] Las tablas sustituyen tarjetas para resultados y carrito.
- [ ] El CTA expresa exactamente la siguiente acción transaccional.
- [ ] Drawer y modal sólo aparecen en casos autorizados.
- [ ] Datos internos y estados técnicos no llegan a la interfaz.
- [ ] Los accesos rápidos de efectivo no confirman pagos por accidente.
- [ ] Toda autorización sensible se valida en backend y deja auditoría.
- [ ] La segunda pantalla omite información privada y no bloquea la venta.
- [ ] La telemetría productiva evita credenciales, PII y datos de pago sensibles.
