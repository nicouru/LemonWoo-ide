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

1. **Apertura automática**: Al abrir la aplicación, confirma que se despliega automáticamente el panel lateral de **LemonWoo Agent** (normalmente a la derecha o izquierda de la pantalla).
2. **BYOK (DeepSeek Key)**:
   - En el panel del agente verás un campo para ingresar tu API key de DeepSeek.
   - Pega tu clave de DeepSeek (debe comenzar con `sk-`).
   - Haz clic en **Guardar** o presiona Enter.
   - Cierra y vuelve a abrir LemonWoo para verificar que la clave sigue guardada y no tienes que volver a pegarla.

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
   - Debería aparecer una visualización de **Diff** mostrando las líneas agregadas en verde y las eliminadas en rojo.
   - Haz clic en **Apply** (Aplicar) y verifica que los cambios realmente se escribieron en tu archivo local.

---

## 4. Servidor de Vista Previa (Local Preview Server)

1. **Levantar Preview**:
   - En el panel de control del agente o en los comandos rápidos, selecciona **Start Preview** (o pídele al agente *"levanta la vista previa de este sitio"*).
   - Confirma que se abre una pestaña interna o ventana de navegador apuntando a un puerto local (por ejemplo `http://localhost:3000`).
2. **Detener Servidor**:
   - Haz clic en el botón **Stop Preview** (Detener).
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

---

## 6. Verificación de la Simplicidad de la Interfaz

Recorre el editor y los menús para confirmar que no se muestran características bloqueadas o experimentales:
- **NO debe haber selectores de modelo** (como cambiar entre GPT-4, Claude, etc.).
- **NO debe haber selectores de proveedor** (Stripe, Anthropic, etc.).
- **NO debe haber configuraciones avanzadas de MCP** (Model Context Protocol).
- La interfaz debe mantenerse limpia y enfocada únicamente en el chat de agente local y la edición de código.
