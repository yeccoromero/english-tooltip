# English Tooltip

Extensión de Chrome (Manifest V3) para aprender inglés: **selecciona texto en inglés en cualquier página y ve la traducción al español en un tooltip**.

## Funciones
- Tooltip con la traducción junto a la selección (Shadow DOM, modo claro/oscuro, `Esc` o clic fuera para cerrar).
- 🔊 Pronunciación en inglés (Web Speech API, gratis).
- ⭐ Guardar en vocabulario → página de vocabulario con lista y **exportación CSV** (importable en Anki).
- 💡 Explicación del significado en contexto con Claude (opcional, requiere tu API key de Anthropic).
- Detecta el idioma automáticamente (cualquier idioma → español) y no traduce texto que ya está en español (configurable). Funciona con una sola palabra. Límite de caracteres y lista de sitios desactivados.

## Uso del icono
- **Clic en el icono:** activa o desactiva la extensión (la insignia roja «OFF» indica que está apagada). No pide nada más.
- **Clic derecho en el icono:** «Mi vocabulario» y «Opciones».

## Motores de traducción (página de opciones)
| Motor | Coste | Notas |
|---|---|---|
| Chrome local (Translator API) | Gratis | En el dispositivo, sin enviar datos. Chrome 138+. La primera vez descarga el modelo en segundo plano; mientras tanto usa el respaldo. |
| MyMemory | Gratis | Sin clave, con límite diario. Respaldo por defecto. |
| DeepL / Google Cloud Translation | Tu API key | En «Automático» se usan si hay clave configurada. |

Con motores externos el texto seleccionado se envía a ese servicio.

## Instalar sin Node (lo más fácil)
La carpeta `dist/` ya viene compilada en el repo.
1. En GitHub: **Code → Download ZIP** y descomprime.
2. Abre `chrome://extensions` y activa **Modo desarrollador** (arriba a la derecha).
3. **Cargar descomprimida** → elige la carpeta `english-tooltip-main/dist`.
4. Fija la extensión con el icono 🧩 y abre ⚙ **Opciones** para ajustar el motor o poner claves.

Cuando actualices el código, vuelve a descargar y pulsa ↻ en `chrome://extensions`.

## Desarrollo
```bash
npm install
npm run build        # genera dist/
```
1. Abre `chrome://extensions`, activa **Modo desarrollador**.
2. **Cargar descomprimida** → elige la carpeta `dist/`.
3. Abre cualquier página en inglés y selecciona texto.

Otros scripts: `npm run watch`, `npm run typecheck`, `npm test` (lógica), `npm run zip` (paquete para la Chrome Web Store). `node tests/e2e.mjs` carga la extensión en Chromium con Playwright y comprueba el tooltip.

## Estructura
```
src/content/     detección de selección, tooltip (Shadow DOM), Translator API local
src/background/  service worker: traducción remota, explicación con Claude, guardado de vocabulario
src/shared/      ajustes, proveedores, detección de idioma, mensajes
src/options/     página de opciones     src/vocab/   vocabulario
public/          manifest.json, HTML, iconos (regenerar con node scripts/icons.mjs)
```

## Publicar en la Chrome Web Store
Cuota única de 5 USD. Sube `english-tooltip.zip`, añade capturas y una política de privacidad (indica que el texto seleccionado se envía al motor externo elegido y que las claves se guardan en `chrome.storage.sync`).
