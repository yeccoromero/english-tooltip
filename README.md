# English Tooltip

Extensión de Chrome (Manifest V3) para aprender inglés: **selecciona texto en inglés en cualquier página y ve la traducción al español en un tooltip**.

## Funciones
- Tooltip minimalista encima de la selección: solo la traducción. Los botones (🔊 pronunciar, ☆ guardar, 💡 explicar) van en un módulo aparte a su lado.
- 🔊 Pronunciación en inglés (Web Speech API, gratis).
- ⭐ Guardar en vocabulario → página de vocabulario con lista y **exportación CSV** (importable en Anki).
- 💡 Explicación del significado en contexto con Claude (opcional, requiere tu API key de Anthropic).
- Detecta el idioma automáticamente (cualquier idioma → español) y traduce todo lo que subrayas: cualquier idioma → español, y si el texto ya está en español → inglés. Funciona con una sola palabra. Límite de caracteres y lista de sitios desactivados.

## Cuenta y sincronización (web app)
En **Opciones → Cuenta → Conectar con Google** la extensión inicia sesión por su cuenta (sesión propia, no comparte tokens con la web app) y sincroniza tu vocabulario con la [web app](https://github.com/yeccoromero/english-tooltip-app):
- Sube lo que guardas, repasas o borras; baja lo que cambias en la web. **Gana el último cambio** (por palabra, con la hora del dispositivo).
- Funciona sin conexión: los cambios se guardan aquí y suben al volver. Se sincroniza al guardar/repasar, al abrir Chrome y cada 15 min.
- Tus palabras de antes (sin cuenta) se suben solas la primera vez que conectas.
- «Desconectar» deja las palabras en el navegador y las marca para subir a la próxima cuenta que conectes.
- El repaso de la extensión también registra cada respuesta en tu cuenta (racha y estadísticas de la web).

**Configuración necesaria (una vez):** el inicio de sesión vuelve a una dirección fija derivada del ID de la extensión. El manifest incluye una clave (`key`) que fija ese ID: `gmkdjaeaeoiendclnaljkeomjcopgalj`. Añade en Supabase → Authentication → URL Configuration → **Redirect URLs**: `https://gmkdjaeaeoiendclnaljkeomjcopgalj.chromiumapp.org/**`. (Si publicas en la Chrome Web Store el ID cambia: añade también la nueva dirección.)

**Copia de seguridad:** en la página de vocabulario → Lista → *Copia de seguridad* (JSON, incluye el progreso) y *Restaurar copia* (acepta el JSON o el CSV que exporta la extensión).

## Contexto y diccionario
- Al guardar con ☆ se guarda también **la frase donde encontraste la palabra** y, si es una sola palabra, su **definición** (📖, diccionario gratuito dictionaryapi.dev: pronunciación fonética, tipo de palabra, definición y ejemplo).
- En el repaso, la tarjeta muestra la traducción, la definición y la frase con la palabra resaltada.

## Racha y aviso diario
La página de vocabulario muestra tu **racha de días** y lo repasado hoy. En Opciones puedes activar un **aviso diario** (hora configurable) que te dice cuántas palabras te esperan.

## Traducir sin subrayar (hover)
Deja el mouse quieto ~0,7 s sobre una palabra y aparece la traducción; al mover el mouse se cierra. Si subrayas algo, manda la selección. Se puede desactivar, cambiar la espera o exigir **mantener Alt** pulsada (traduce al instante y gasta menos consultas) en Opciones.

## Repaso con tarjetas
Clic derecho en el icono → **Mi vocabulario** → pestaña **Repasar**. Las palabras guardadas con ⭐ salen como tarjetas (inglés → mostrar traducción → «Lo sabía» / «Otra vez»). Usa repetición espaciada tipo Leitner (1, 2, 4, 8, 16, 32 días); las que fallas vuelven a salir en la misma sesión. Atajos: `Espacio` mostrar, `→` lo sabía, `←` otra vez.

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

Otros scripts: `npm run watch`, `npm run typecheck`, `npm test` (lógica), `npm run zip` (paquete para la Chrome Web Store), `npm run test:e2e` (carga la extensión en Chromium con Playwright y comprueba el tooltip, diccionario, repaso…) y `npm run test:sync` (sincronización contra un Supabase simulado).

## Estructura
```
src/content/     detección de selección, tooltip (Shadow DOM), Translator API local
src/background/  service worker: traducción remota, Claude, único escritor del vocabulario (store) y sincronización con la cuenta (sync)
src/shared/      ajustes, proveedores, idioma, mensajes, cuenta (auth), sincronización (sync-core), palabras (words)
src/options/     página de opciones     src/vocab/   vocabulario
public/          manifest.json, HTML, iconos (regenerar con node scripts/icons.mjs)
```

## Publicar en la Chrome Web Store
Cuota única de 5 USD. Sube `english-tooltip.zip`, añade capturas y una política de privacidad (indica que el texto seleccionado se envía al motor externo elegido y que las claves se guardan en `chrome.storage.sync`).
