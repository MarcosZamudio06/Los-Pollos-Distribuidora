<<<<<<< Updated upstream
┌──────────────────────────────────────────────────────────────┐
│ Sucursal | Caja abierta | Cajero | Conexión | Nueva venta │
├───────────────────────┬──────────────────────────────────────┤
│ Buscar / escanear │ Carrito │
│ │ Producto | Cant. | Precio | Importe │
│ Categorías │ │
│ Productos frecuentes │ │
│ Resultados │ │
├───────────────────────┴──────────────────────────────────────┤
│ Cliente | Contado/Crédito | Pago | Total | CONFIRMAR F8 │
└──────────────────────────────────────────────────────────────┘
=======
Realiza únicamente los siguientes cambios en la interfaz del POS. No modifiques ninguna otra funcionalidad, layout o lógica de negocio.

## Objetivos

### 1. Reubicar el botón "Confirmar venta"
- Elimina el botón de su ubicación actual en la esquina inferior izquierda.
- Colócalo al extremo derecho del encabezado, inmediatamente después del bloque de Totales (Subtotal / Total).
- Debe alinearse verticalmente con la tarjeta de totales para que ambos formen una sola sección visual.

### 2. Rediseñar el botón
Rediseña el botón para que sea el principal Call To Action (CTA) de toda la pantalla.

Requisitos:

- Debe ocupar toda la altura disponible del encabezado, llegando hasta la parte inferior del footer superior (es decir, un botón alto, no un botón tradicional).
- Debe tener aproximadamente entre 220 y 260 px de ancho.
- Bordes redondeados de 12-16 px.
- Fondo verde oscuro consistente con la identidad visual del sistema.
- Texto blanco.
- Icono de carrito o check a la izquierda.
- Texto principal:
  Confirmar venta
- Debajo, en una tipografía menor:
  F8
- Agregar estados visuales:
  - hover con ligero incremento de brillo
  - active con ligera reducción de escala
  - disabled con opacidad reducida

El botón debe transmitir claramente que es la acción principal de la pantalla.

### 3. Eliminar la franja verde inferior
Actualmente existe una mancha/franja verde que invade toda la parte inferior del POS.

Debe eliminarse completamente.

La parte inferior debe quedar limpia, utilizando el mismo fondo blanco o gris claro del resto de la interfaz, sin overlays, fondos residuales ni elementos que sobresalgan.

## Restricciones

- NO agregar el bloque "Selecciona ubicación".
- NO modificar Cliente.
- NO modificar Condición.
- NO modificar Pago.
- NO modificar Totales.
- NO cambiar atajos de teclado.
- NO alterar la lógica de negocio.
- NO modificar estilos que no estén relacionados con este cambio.

## Criterios de aceptación

- El botón queda inmediatamente a la derecha del bloque de Totales.
- El botón ocupa toda la altura del encabezado y se percibe como el CTA principal.
- La franja verde inferior desaparece completamente.
- El resto del diseño permanece exactamente igual.
- No se introducen regresiones visuales ni funcionales.
>>>>>>> Stashed changes
