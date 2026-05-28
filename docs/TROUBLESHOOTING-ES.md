# Guía de Resolución de Problemas (Troubleshooting) - LemonWoo IDE

Esta guía describe los problemas más frecuentes que pueden surgir durante el uso de LemonWoo IDE en macOS y cómo resolverlos.

---

## 1. Instalación y Gatekeeper (Seguridad de macOS)

### El sistema dice que "LemonWoo está dañado" o "no se puede verificar el desarrollador"
- **Causa:** macOS Gatekeeper bloquea aplicaciones que no han sido firmadas con un certificado de desarrollador de Apple verificado.
- **Solución:**
  1. Abre Finder y navega hasta la carpeta `/Aplicaciones` (Applications).
  2. Haz **clic derecho** (o Control-click) sobre `LemonWoo.app` y selecciona **Abrir**.
  3. En la ventana emergente que pregunta si estás seguro, haz clic en **Abrir**.
- **Solución alternativa por Terminal:**
  Si sigue dando error, abre tu terminal y ejecuta el siguiente comando para limpiar el atributo de cuarentena:
  ```bash
  xattr -cr /Applications/LemonWoo.app
  ```

---

## 2. Configuración y Llaves API (DeepSeek Key)

### El agente responde con error 401 (Unauthorized) o 403 (Forbidden)
- **Causa:** La API key ingresada es inválida, expiró o no tiene saldo suficiente en tu cuenta de DeepSeek.
- **Solución:**
  1. Ve a la consola de DeepSeek (`platform.deepseek.com`) y genera una nueva API key.
  2. Asegúrate de tener saldo de uso (crédito) activo en tu cuenta.
  3. Pega la nueva clave en la UI de LemonWoo y presiona **Conectar**.
  4. Si la clave es inválida, LemonWoo mostrará `Key inválida.` y no la guardará.

### Error 429 (Rate Limit Exceeded)
- **Causa:** Has superado el límite de peticiones por minuto (RPM) o por día (RPD) que DeepSeek impone a tu nivel de cuenta.
- **Solución:** Espera unos minutos antes de volver a consultar al agente. LemonWoo muestra `Rate limit, reintentando.` cuando detecta esta situación.

### No puedo guardar la API key
- **Causa:** Permisos de escritura denegados en la carpeta de configuraciones de usuario de LemonWoo.
- **Solución:** Verifica que tu usuario de macOS tiene permisos de escritura en la ruta de configuración del editor:
  `~/.lemonwoo/`

---

## 3. Comportamiento del Agente e Interfaz

### La aplicación abre pero no aparece el panel del agente
- **Causa:** El panel lateral fue cerrado manualmente o hubo un error al cargar la extensión `lemonwoo-ai`.
- **Solución:**
  1. Ve al menú superior: `Ver` -> `Vistas de apariencia` o abre la paleta de comandos (`Cmd+Shift+P`).
  2. Busca el comando: `LemonWoo: Open Agent Window` o haz clic en el icono del limón en la barra de actividad lateral izquierda.

### La vista previa local (Local Preview) no levanta
- **Causa:** El puerto predeterminado (ej. 3000) está ocupado por otra aplicación.
- **Solución:** 
  1. Cierra otros servidores locales de desarrollo que tengas corriendo en tu máquina.
  2. Para verificar qué proceso está ocupando el puerto, abre una terminal y corre:
     ```bash
     lsof -i :3000
     ```
     Si hay un proceso, puedes matarlo con `kill -9 <PID>`.

### El streaming se corta o no aparece incremental
- **Causa:** red inestable o stream no disponible temporalmente.
- **Solución:** LemonWoo cae automáticamente a respuesta buffered en el mismo request. Reintenta la tarea si la salida quedó incompleta.

### El botón Stop no detiene la tarea
- **Causa:** operación local colgada o request ya finalizado.
- **Solución:** vuelve a presionar **Detener**, espera estado `Listo`, y relanza con **Reintentar**.
- Si persiste, abre Developer Tools y revisa errores de abort/cancelación.

### No puedo aplicar el diff (archivo cambió)
- **Causa:** el contexto del archivo ya no coincide con el hunk propuesto.
- **Solución:** pide al agente un diff nuevo sobre el estado actual del archivo.

### TestGate falla por dependencias no instaladas
- **Síntoma:** errores tipo `command not found`, módulos faltantes o scripts inexistentes.
- **Solución:** instala dependencias del proyecto (`pnpm install` / `npm install` / `yarn`) y ejecuta Verificar de nuevo.

### Live smoke salta por falta de key
- **Síntoma:** `SKIP: falta DEEPSEEK_API_KEY`.
- **Significado:** bloqueo externo esperado, no fallo del producto.
- **Solución:** exporta `DEEPSEEK_API_KEY` y vuelve a ejecutar `pnpm smoke:agent:live`.

---

## 4. Problemas de Compilación y Empaquetado (Desarrolladores)

### El comando `hdiutil verify` o la creación del DMG falla
- **Causa:** Formato de archivo corrupto o falta de espacio en disco en la carpeta `dist/`.
- **Solución:**
  1. Elimina archivos DMG viejos en la carpeta `dist/`.
  2. Corre `pnpm build:mac` primero para asegurar que `dist/LemonWoo.app` está completo antes de intentar empaquetarlo.

### El branding todavía muestra "VSCodium" o "Code-OSS" en algunos lugares
- **Causa:** El script de renombrado de macOS no pudo procesar algunos archivos debido a que estaban abiertos o bloqueados.
- **Solución:**
  1. Limpia los directorios temporales: `rm -rf dist/ apps/desktop/.build/unpack`
  2. Vuelve a ejecutar la compilación limpia:
     ```bash
     pnpm build:mac
     ```

---

## 5. Recolección de Logs y Depuración

Si el problema persiste, puedes obtener más información revisando los logs internos del editor:
1. Abre la paleta de comandos de LemonWoo (`Cmd+Shift+P`).
2. Escribe `Developer: Toggle Developer Tools` (Alternar herramientas de desarrollo) y ve a la pestaña **Console**.
3. Busca logs de error relacionados con la extensión `lemonwoo-ai`.
4. **IMPORTANTE:** Si vas a compartir estos logs en un foro público o reporte de bug, **borra manualmente cualquier rastro de tu API key** (que comience con `sk-`) para proteger tus credenciales.
