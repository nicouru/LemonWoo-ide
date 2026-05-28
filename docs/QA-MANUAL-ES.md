# Manual de QA Local para LemonWoo IDE

Esta guía detalla los pasos para probar LemonWoo IDE manualmente como si fueras un usuario final. Está escrita de forma sencilla para que cualquier persona técnica o semi-técnica pueda realizar la verificación de calidad.

---

## 1. Instalación y Primera Apertura

### A. Si usas el archivo DMG (Recomendado):
1. Ve a la carpeta `dist/` en tu repositorio y haz doble clic en `LemonWoo-<version>-mac-arm64.dmg`.
2. En la ventana que aparece, arrastra el icono de `LemonWoo.app` a la carpeta de **Aplicaciones** (Applications).
3. Ve a tu carpeta de **Aplicaciones** en Finder y haz doble clic en `LemonWoo`.

### B. Si usas directamente el archivo `LemonWoo.app`:
1. Copia `dist/LemonWoo.app` a tu carpeta de `/Applications`.
2. Haz doble clic para iniciarlo.

### C. Bypass de Gatekeeper (Si aparece la advertencia):
- Al ser una versión de desarrollo firmada de manera "ad-hoc", macOS puede mostrar el mensaje: *"LemonWoo está dañado y no se puede abrir"* o *"No se puede abrir porque proviene de un desarrollador no identificado"*.
- **Solución:** Ve a la carpeta `/Applications` en Finder, haz **clic derecho** (o Control-click) sobre `LemonWoo.app` y selecciona **Abrir**. En el cuadro de diálogo que aparece, confirma haciendo clic en **Abrir**. (Este paso solo se requiere la primera vez).

---

## 2. Configuración Inicial y Panel del Agente

1. **Apertura automática**: Al abrir la aplicación, confirma que aparece automáticamente la vista **LemonWoo Agent** como superficie principal.
   - Si aparece una pestaña **Welcome**, debe cerrarse/ocultarse automáticamente y no quedar como superficie primaria.
2. **BYOK (DeepSeek Key)**:
   - En el panel del agente verás un campo para ingresar tu API key de DeepSeek.
   - Pega tu clave de DeepSeek (debe comenzar con `sk-`).
   - Haz clic en **Conectar**.
   - Debes ver `Conectando DeepSeek...` y luego estado listo.
   - Si la key es incorrecta, la app debe mostrar `Key inválida.` y no guardarla.
   - Cierra y vuelve a abrir LemonWoo para verificar que la clave sigue guardada y no tienes que volver a pegarla.
   - Sin key guardada, el foco inicial debe quedar en el input `DeepSeek API key`.
   - Con key guardada, el foco inicial debe quedar en la caja de prompt del agente.

---

## 3. Pruebas del Agente y Trabajo Local

1. **Abrir una carpeta**:
   - Ve a `Archivo` -> `Abrir carpeta...` (File -> Open Folder...).
   - Selecciona una carpeta de prueba con código sencillo (por ejemplo, un sitio web básico con HTML/JS).
2. **Hacer una pregunta sencilla**:
   - Escribe en la caja de texto del agente: `"Hola, ¿puedes explicar qué archivos hay en este proyecto?"`
   - Presiona Enviar.
   - Verifica que el agente responda correctamente enlistando tus archivos locales.
3. **Solicitar una modificación**:
   - Pídele al agente: `"Modifica el archivo index.html para agregar un título destacado que diga 'Hola LemonWoo'"`.
   - Espera a que termine de procesar.
   - Debería aparecer una propuesta de **diff**.
   - Haz clic en **Aplicar diff** y verifica que los cambios realmente se escribieron en tu archivo local.

---

## 3b. Loop de programación con fixture (repetible)

Usá el fixture del repo para validar el flujo completo sin depender de un proyecto propio:

1. **Preparar workspace**
   - En LemonWoo: `Archivo` → `Abrir carpeta...` → elegí `fixtures/agent-loop-ts` dentro del clon del repo.
2. **Key y foco**
   - Pegá `DEEPSEEK_API_KEY` en el panel y conectá.
   - Sin key: foco en el input de API key. Con key: foco en el prompt del agente.
3. **Pedir cambio**
   - Prompt sugerido: `Arreglá el test que falla en sum con un patch mínimo.`
   - Esperá streaming y un único bloque `diff`.
4. **Aplicar y verificar**
   - Clic en **Aplicar diff** → confirmá que `src/sum.ts` cambió en disco.
   - Clic en **Correr tests** (TestGate) → debe pasar o mostrar salida útil si falla.
5. **Corregir con agente (si falla)**
   - Si TestGate falla, usá **Corregir con agente** y confirmá que no reutiliza un diff viejo de la tarea anterior.
6. **Segunda tarea**
   - Pedí otro cambio pequeño distinto y confirmá que el diff previo no se mezcla.
7. **Editor usable**
   - Abrí un archivo real del fixture (por ejemplo `src/sum.ts`) y cambiá de tab: **LemonWoo Agent no debe robar foco** automáticamente.
8. **Automatizado (opcional)**
   ```bash
   pnpm -r build
   export DEEPSEEK_API_KEY=sk-...
   pnpm smoke:agent:live
   ```
   Sin key exportada, el mismo comando debe terminar con `SKIP: falta DEEPSEEK_API_KEY` (exit 78).

---

## 4. Servidor de Vista Previa (Local Preview Server)

1. **Levantar Preview**:
   - Pídele al agente: *"quiero ver la página en una URL, levantá un servidor local"*.
   - Confirma que el panel muestra una acción local verificada con URL concreta (por ejemplo `http://localhost:3000` o el puerto que detecte el proyecto).
2. **Detener Servidor**:
   - Haz clic en el botón **Detener servidor**.
   - Intenta recargar la página en tu navegador para verificar que el servidor local se ha apagado correctamente.

---

## 5. Casos de Borde y Estado del Sistema

### Probar Modo Sin Red / Sin Key:
1. **Borrar Key**:
   - Elimina la API key de DeepSeek desde el panel.
   - Intenta escribirle al agente. El sistema debe mostrar un mensaje amigable indicando que se requiere una clave para continuar.
2. **Desconectar Internet**:
   - Apaga el Wi-Fi de tu computadora.
   - Con la API key puesta, intenta hacerle una pregunta al agente.
   - Verifica que el sistema no se congele y muestre un error de red claro.

### Probar el botón de Stop (Detener):
1. Pídele al agente una tarea muy larga (por ejemplo, `"Escribe un código completo de 500 líneas para una app de notas"`).
2. Mientras está escribiendo, haz clic en el botón **Stop** (Detener) en la UI.
3. El agente debe detener inmediatamente la generación y el estado debe volver a listo.

### Probar streaming visible:
1. Pide una tarea que requiera explicación y patch.
2. Verifica que la salida aparece de forma incremental (no solo al final).
3. Presiona **Detener** y confirma que dejan de llegar tokens.

---

## 6. Verificación de la Simplicidad de la Interfaz

Recorre el editor y los menús para confirmar que no se muestran características bloqueadas o experimentales:
- **NO debe haber selectores de modelo** (como cambiar entre GPT-4, Claude, etc.).
- **NO debe haber selectores de proveedor** (Stripe, Anthropic, etc.).
- **NO debe haber configuraciones avanzadas de MCP** (Model Context Protocol).
- La interfaz debe mantenerse limpia y enfocada únicamente en el chat de agente local y la edición de código.

---

## 7. Escenarios de falla recomendados

- **Key inválida**: confirmar mensaje claro y no persistencia.
- **Rate limit**: confirmar mensaje `Rate limit, reintentando.`.
- **Streaming cortado**: el sistema debe caer a respuesta buffered sin romper la sesión.
- **Stop no responde**: confirmar cancelación real y retorno a `Listo`.
- **Diff no aplica porque cambió el archivo**: debe mostrar error claro sin aplicar parcial.
- **TestGate falla por dependencias no instaladas**: debe mostrar salida y habilitar corrección con agente.
- **Live smoke sin key**: `pnpm smoke:agent:live` debe devolver `SKIP: falta DEEPSEEK_API_KEY` (exit 78).

---

## 8. Autocompletado Tab (Inline Completion)

1. **Prueba básica de Autocompletado**:
   - Con la API key de DeepSeek conectada, abre un archivo de código (por ejemplo, un archivo `.ts` o `.js`).
   - Comienza a escribir una estructura común, por ejemplo:
     ```typescript
     function calculateDiscount(price, discountPercentage) {
     ```
   - Presiona Enter o haz una pequeña pausa.
   - Confirma que aparece una sugerencia en texto gris ("ghost text") con el cuerpo de la función.
   - Presiona la tecla `Tab` para aceptar la sugerencia. El texto debe insertarse en el editor.
2. **Prueba de Cancelación y Debounce**:
   - Comienza a escribir código de forma rápida y continua.
   - El editor no debe trabarse ni congelarse. Debido al debounce de 300ms, las llamadas de autocompletado no se realizarán a la red si sigues tecleando continuamente. Al dejar de teclear, se esperarán 300ms antes de disparar la petición, cancelando cualquier llamada en curso mediante `AbortController`.
3. **Prueba Sin Conexión / Sin Key**:
   - Desconecta la API key (haz clic en `Desconectar` o borra la clave).
   - Abre un archivo de código y escribe. No debe aparecer ninguna sugerencia ni realizarse ninguna llamada a la red.
4. **Prueba de Exclusión**:
   - Confirma que no se generan sugerencias de autocompletado en archivos ubicados dentro de directorios excluidos (como `node_modules/`, `.git/` o `dist/`), archivos sensibles (`.env`, credenciales, claves/certificados, `.aws`, `.ssh`, `.docker/config.json`, kubeconfig), ni en archivos gigantescos mayores a 1MB.
5. **Prueba de desconexión de key**:
   - Desconectá la API key.
   - Confirmá que el autocompletado deja de llamar a DeepSeek y que las sugerencias pendientes se cancelan.
