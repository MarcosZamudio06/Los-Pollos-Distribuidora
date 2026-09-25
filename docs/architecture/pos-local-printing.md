# Arquitectura de impresión local del POS

El POS conserva la impresión del navegador y añade una frontera preparada para
un agente local. React solo solicita un trabajo normalizado; no conoce USB,
WebUSB, ESC/POS, redes de impresoras ni modelos concretos.

## Ruta rápida

1. La venta se registra normalmente y obtiene su `SaleDocument`.
2. El endpoint existente `GET /sales/:saleId/documents/:documentId/print`
   devuelve el documento reconstruido desde sus snapshots.
3. El ERP convierte esos datos en un `PrintJob` con lista blanca de campos.
4. `BROWSER` conserva `window.print()`; `LOCAL_AGENT` queda detrás de un
   puerto inyectable.
5. Si el agente no existe o falla, el navegador recibe la solicitud y la
   venta no se repite ni se bloquea.

## Decisión de arquitectura

| Frontera | Responsabilidad | Fuera de alcance actual |
| --- | --- | --- |
| `TicketModal` | Mostrar el documento y emitir la intención de imprimir | Elegir una impresora o construir bytes ESC/POS |
| `PosPrinter` | Seleccionar `BROWSER` o `LOCAL_AGENT` y aplicar fallback | Descubrir hardware automáticamente |
| `PrintJob` | Transportar una representación documental estable | HTML, JSX, tokens o secretos |
| Agente local futuro | Convertir el trabajo a ESC/POS, USB/LAN, corte, ancho y healthcheck | Lógica de ventas, inventario, pagos o snapshots |
| `SaleDocument` | Autoridad documental para impresión y reimpresión | Completar datos desde el catálogo actual |

## Contrato `PrintJob`

La implementación vive en
`frontend/src/features/ventas/printing/posPrinter.ts`.

```ts
type PrintJob = {
  jobId: string;
  documentId: string;
  documentType: "SCALE_TICKET" | "SIMPLE_NOTE" | "LARGE_NOTE" | "INTERNAL_RECEIPT";
  templateVersion: number;
  printerProfile: string;
  payload: PrintJobPayload;
};
```

`payload` es una lista blanca de datos documentales: folio, fecha, ubicación,
cliente, partidas, importes, pagos persistidos, leyenda y evidencia de báscula
cuando exista. No se acepta un objeto arbitrario, HTML, una función, un token de
sesión o credenciales.

`printerProfile` es un identificador lógico. No define todavía 58/80 mm, marca,
modelo o conexión; esas decisiones pertenecen al agente cuando exista un
requisito real de terminal.

## Fuentes históricas y reimpresión

- Una reimpresión usa el `documentId` exacto y la respuesta del endpoint de
  impresión de `SaleDocument`.
- `documentType`, `templateVersion`, `customerSnapshot`, `productSnapshot` y
  `priceSnapshot` permanecen como autoridad histórica.
- El frontend no consulta el cliente, producto o precio actual para completar
  el trabajo.
- La vista provisional posterior al registro solo conserva el fallback actual
  del navegador; no autoriza enviar datos incompletos al agente local.
- El endpoint y `TicketModal` se mantienen.

## Estados del POS

| Estado | Significado |
| --- | --- |
| **Impresora no configurada** | No existe un agente local configurado. El fallback de navegador sigue disponible; no implica hardware disponible. |
| **Impresora disponible** | El agente local respondió explícitamente con estado disponible. |
| **Impresora sin conexión** | El agente existe, pero su healthcheck falló o reportó desconexión. |

El estado no se infiere desde la presencia de una API, una interfaz USB o un
perfil lógico. La implementación base muestra **Impresora no configurada**;
ningún driver se simula.

## Errores y fallback

- La ausencia del agente selecciona `BROWSER` desde el runtime.
- Un error de impresión del agente intenta una sola vez `BROWSER` y devuelve
  el resultado como fallback.
- Si también falla el navegador, se expone un error estable de impresión; la
  venta, pagos, inventario y folio no se modifican.
- Un `PrintJob` sin `documentId`, tipo válido o versión positiva se rechaza
  antes de enviarse al agente.
- Registrar una venta no espera ni depende de la impresión.

## Agente local futuro

La única integración permitida para la siguiente fase es implementar el puerto
`LocalAgentPort`:

```ts
type LocalAgentPort = {
  getStatus(): Promise<"AVAILABLE" | "OFFLINE">;
  print(job: PrintJob): Promise<void>;
};
```

Ese adaptador podrá hablar con un servicio instalado en la terminal. Debe
mantener el contrato de trabajo normalizado y no puede recibir HTML arbitrario,
secretos ni reglas de negocio. ESC/POS, USB/LAN, corte, ancho de papel y
diagnóstico de impresora se implementarán dentro del agente, no en React ni en
`SalesPosPage`.

## Validación

La cobertura base está en
`frontend/src/features/ventas/printing/posPrinter.test.tsx`:

- fallback BROWSER sin agente;
- envío exclusivo del trabajo normalizado al agente;
- fallback BROWSER cuando el agente falla;
- estado offline cuando falla el healthcheck;
- error estable cuando ambos caminos fallan;
- validación de referencia documental y tipo;
- etiquetas de los tres estados del POS.

No se afirma disponibilidad física ni se prueba un modelo de impresora porque
todavía no existe un requisito de hardware aprobado.
