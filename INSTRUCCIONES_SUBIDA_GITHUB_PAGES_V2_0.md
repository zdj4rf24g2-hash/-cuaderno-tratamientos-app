# INSTRUCCIONES DE SUBIDA - GITHUB PAGES - V 2.0

1. Crear un repositorio nuevo en GitHub o utilizar uno limpio.
2. Subir todos los archivos de esta carpeta a la raiz del repositorio.
3. Verificar que se han subido tambien:
   - `.nojekyll`
   - `manifest.webmanifest`
   - `sw.js`
   - `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`
4. Abrir `Settings > Pages`.
5. En `Build and deployment`, seleccionar `Deploy from a branch`.
6. Elegir la rama principal y carpeta `/ (root)`.
7. Guardar.
8. Abrir la URL publicada.
9. Confirmar visualmente que aparece:
   - `APP CUADERNO DE TRATAMIENTOS · V 2.0`
   - `Campaña 2026`
   - Barra inferior con Inicio, Nuevo, Cuaderno, Alertas y Más.
10. En Safari de iPhone, usar `Compartir > Añadir a pantalla de inicio` para instalar la PWA.
11. Ejecutar el checklist de validacion antes de importar datos reales.

## Control de actualizacion

La V 2.0 integra versionado de activos, cache versionada y limpieza automatica de caches antiguas. Si se habia instalado una version previa, al abrir la V 2.0 publicada y recargar, el nuevo service worker debe tomar el control.
