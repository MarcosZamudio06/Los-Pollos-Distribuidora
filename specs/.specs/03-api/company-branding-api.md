# API — Identidad visual del ERP

La identidad visual se configura por base de datos. Cada deployment aislado
resuelve su propio registro singleton; el modelo no lleva companyId y no usa
OperationalConfig, variables VITE_COMPANY_* ni el manifiesto de tenants.

## GET /api/branding

Acceso público, incluso antes del login. Devuelve únicamente datos visuales y
el token de versión no sensible requerido para concurrencia:

    success: true
    data:
      displayName: ERP
      shortName: null
      logoUrl: null
      logoMimeType: null
      hasLogo: false
      version: 0

Cuando no hay configuración se usa displayName = ERP y un placeholder
genérico. No expone logoObjectKey, updatedByUserId ni credenciales. Las
respuestas incluyen Cache-Control: no-store; si hay logo, logoUrl es una URL
firmada de corta duración compatible con el contrato de Object Storage.

## PUT /api/branding

Requiere rol ADMIN.

Body:

    displayName: North Supply
    shortName: North
    version: 0

displayName es obligatorio, se recorta y admite de 1 a 80 caracteres.
shortName es opcional y admite hasta 32 caracteres. version es obligatorio:
0 crea la configuración y las versiones posteriores usan compare-and-swap.
Un conflicto de versión responde 409.

## POST /api/branding/logo

Requiere rol ADMIN y multipart/form-data con logo y version.
Solo admite PNG, JPEG y WebP hasta 5 MiB; extensión, MIME declarado y firma
binaria deben coincidir. SVG no se admite.

El backend genera el object key y almacena el binario en el Object Storage
S3-compatible existente. PostgreSQL conserva solo el object key privado y MIME;
la respuesta entrega una URL firmada, nunca credenciales. El objeto nuevo se
sube antes de actualizar la configuración. La limpieza del objeto anterior
ocurre después del commit y su fallo no desactiva el logo vigente.

## DELETE /api/branding/logo?version={version}

Requiere rol ADMIN. Elimina la referencia al logo y su MIME de la
configuración, incrementa la versión y luego intenta limpiar el objeto anterior.
No elimina físicamente la fila de configuración.

## Límites de presentación

El frontend consulta esta API en runtime, también en /login; un error conserva
el fallback genérico. La configuración no agrega branding a
SIMPLE_NOTE, LARGE_NOTE, INTERNAL_RECEIPT ni SCALE_TICKET, cuyos snapshots y
presentación siguen genéricos.
