# Public Release Checklist (V1)

Este documento sirve como la lista de verificación final antes de hacer público el repositorio de GitHub y realizar lanzamientos locales de LemonWoo IDE.

---

## 1. Estado Actual Esperado y Ramas
- [ ] La rama `main` debe contener la base de código estable y rebrandeada de VSCodium.
- [ ] Todos los PRs activos de funcionalidades invasivas deben estar cerrados o aislados.
- [ ] La rama de trabajo de Cursor (`feature/agent-programming-loop-v1`) debe ser fusionada a `main` únicamente tras pasar la suite completa de tests de integración y verificación funcional.

---

## 2. Comandos Previos a la Publicación
Antes de empujar cualquier cambio definitivo a la rama pública de `main`, ejecuta de forma local:

```bash
# 1. Ejecutar las suites de prueba de todos los paquetes
pnpm -r test

# 2. Verificar que no se introdujo scope fuera de v1 (Stripe, MCP, etc.)
bash scripts/verify-v1-scope.sh

# 3. Comprobar la preparación general de lanzamiento público (documentos, límites de tamaño, etc.)
bash scripts/verify-public-readiness.sh

# 4. Validar que no hay llaves privadas en el historial ni en el workspace
bash scripts/check-secrets.sh

# 5. Comprobar la validez del branding local
bash scripts/check-branding.sh
```

---

## 3. Seguridad de Secretos y Licencias
- **Sin Secretos**: Asegúrate de que no existan variables de entorno `.env` persistidas con llaves API de prueba ni tokens de GitHub en directorios compartidos.
- **Licencia**: Confirmar la presencia de `LICENSE` (MIT) y `NOTICE` en el root del repositorio.

---

## 4. Release Local macOS
- [ ] Generar el bundle: `pnpm build:mac`
- [ ] Empaquetar el DMG: `pnpm package:dmg`
- [ ] Auditar los artefactos construidos: `bash scripts/verify-release-artifacts.sh`
- [ ] Probar la apertura inicial del DMG simulando un sistema limpio (usando la guía de [QA-MANUAL-ES.md](file:///Users/lskjdnf02387f4bf/Developer/Lemonwoo2/docs/QA-MANUAL-ES.md)).

---

## 5. Limitaciones Conocidas de V1
- **Firma Ad-hoc**: La aplicación no está firmada con un Apple Developer ID ni notarizada por Apple. Gatekeeper bloqueará la ejecución directa (requiere hacer clic derecho -> Abrir).
- **Modelo Único**: Solo interactúa con la API de DeepSeek. No soporta otros proveedores (OpenAI, Anthropic) ni modelos alternativos de forma nativa en la UI.
- **Sin Paridad Total con Cursor**: V1 es un IDE simplificado enfocado únicamente en la asistencia de programación local y no busca paridad en todas las herramientas del editor de Cursor (como Composer multi-archivo complejo, terminales agentes avanzados, o integraciones en la nube).

---

## 6. Mensajería Pública (Qué Prometer y Qué NO)

### Lo que SÍ se promete:
- **IDE macOS Ligero**: LemonWoo es una versión optimizada de VSCodium rebrandeada con un agente local integrado.
- **DeepSeek BYOK**: Privacidad total usando tus propias llaves API directamente contra DeepSeek.
- **Edición y Testing Local**: Un loop básico de edición asistida capaz de proponer cambios, aplicar diffs y correr tests localmente.
- **Simplicidad**: Sin telemetría invasiva, sin cuentas forzadas, y sin almacenamiento en la nube de tu código.

### Lo que NO se promete aún:
- **MCP Extensible**: No hay soporte para MCP en v1.
- **Actualizaciones automáticas**: No hay auto-updater implementado.
- **Soporte Multi-plataforma Oficial**: V1 se centra y valida en macOS (ARM64). Windows/Linux vendrán más adelante.
- **Paridad de UI con editores premium comerciales**.

---

## 7. Hallazgos de Auditoría (Audit Findings)
Durante la preparación del release público v1, se identificaron las siguientes referencias a términos fuera de alcance en archivos activos que no debían ser editados para evitar pisar el trabajo de Cursor:
- **Archivo**: [packages/deepseek/src/client.ts](file:///Users/lskjdnf02387f4bf/Developer/Lemonwoo2/packages/deepseek/src/client.ts) (Líneas 17-18)
  - *Referencia:* Contiene comentarios explicativos indicando que se excluyen de v1 la compatibilidad con el endpoint de Anthropic y FIM beta.
  - *Resolución:* No representan código ejecutable ni configuraciones activas, por lo que son permitidas y se encuentran filtradas de forma segura en `verify-v1-scope.sh`.

