# APP CUADERNO DE TRATAMIENTOS - V 2.0

## Contenido del paquete

- `index.html`
- `styles.css`
- `app.js`
- `vendor-loader.js`
- `manifest.webmanifest`
- `sw.js`
- `.nojekyll`
- `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`
- `CHECKLIST_VALIDACION_V2_0.md`

La app se entrega neutra: no incorpora tratamientos reales en el codigo publico.

## Publicacion recomendada en GitHub Pages

1. Crear un repositorio nuevo, o vaciar el anterior si se desea empezar limpio.
2. Subir el contenido de esta carpeta a la raiz del repositorio.
3. En GitHub: `Settings > Pages`.
4. En `Build and deployment`, elegir `Deploy from a branch`.
5. Seleccionar la rama principal y la carpeta `/ (root)`.
6. Guardar.
7. Abrir la URL publicada y comprobar que aparece `APP CUADERNO DE TRATAMIENTOS · V 2.0`.
8. Instalar en iPhone desde Safari mediante `Compartir > Anadir a pantalla de inicio`.
9. Antes de importar datos reales, completar el checklist de validacion.

## Correccion de cache integrada

La V 2.0 incluye:

- Versionado de activos con `?v=2.0.0`.
- `service worker` con cache versionada.
- Eliminacion automatica de caches antiguas en `activate`.
- Registro con `updateViaCache: 'none'`.
- Solicitud explicita de `registration.update()` al cargar.

## Funciones principales

- Inicio con resumen de campana, continuidad y alertas.
- Alta guiada de tratamientos por fecha.
- Multiples productos por fecha y multiples fechas por flujo.
- Borradores autoguardados.
- Validacion tecnica de dosis, volumen, limites por ha y maximos de campana cuando la ficha lo permite.
- Cuaderno en vista de trabajo, tabla de 15 columnas y vista documental tipo PDF.
- Exportacion a CSV, Excel compatible y PDF.
- Catalogo de productos con ficha, documentacion asociada y revision documental campo a campo.
- Copia completa e importacion por sustitucion o fusion con conflictos producto a producto.

## Nota operativa sobre revision documental

La V 2.0 prioriza texto extraible de PDF y genera propuestas revisables. Las imagenes se guardan, se visualizan dentro de la app y quedan incluidas en las copias completas. Esta entrega no integra OCR pesado local sobre fotografias.
