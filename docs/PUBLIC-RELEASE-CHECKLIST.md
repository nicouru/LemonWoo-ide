# Public Release Checklist (V1)

Este documento sirve como la lista de verificación final antes de hacer público el repositorio de GitHub y realizar lanzamientos locales de LemonWoo IDE.

---

## 1. Estado Actual Esperado y Ramas
- [ ] La rama `main` debe contener la base de código estable y rebrandeada de VSCodium.
- [ ] Los bloques v1 ya mergeados deben estar presentes en `main`: agente, preview local, TestGate/fix loop, RC release hardening y native Flash Tab completion.
- [ ] No debe haber PRs abiertos que modifiquen `extensions/lemonwoo-ai/**`, `packages/deepseek/**`, `packages/agent-runtime/**` o `scripts/**` sin volver a ejecutar la matriz RC.
- [ ] Volver a ejecutar todos los scripts de guardrails y verificación de release en la rama combinada antes de publicar el release definitivo.

---

## 2. Comandos Previos a la Publicación
Antes de empujar cualquier cambio definitivo a la rama pública de `main`, ejecuta de forma local:

```bash
# 1) Gate RC reproducible (incluye checks, smoke, scope/public guards y live smoke policy)
pnpm rc:check

# 2) Reporte trazable del candidato RC
pnpm rc:report

# 3) Pipeline de release local con empaquetado DMG
pnpm release:check
```

---

## 3. Seguridad de Secretos y Licencias
- **Sin Secretos**: Asegúrate de que no existan variables de entorno `.env` persistidas con llaves API de prueba ni tokens de GitHub en directorios compartidos.
- **Licencia**: Confirmar la presencia de `LICENSE` (MIT) y `NOTICE` en el root del repositorio.

---

## 4. Release Local macOS
- [ ] Generar el bundle: `pnpm build:mac`
- [ ] Empaquetar el DMG: `pnpm package:dmg`
- [ ] Confirmar checksum generado: `dist/LemonWoo-<version>-mac-<arch>.dmg.sha256`
- [ ] Auditar los artefactos construidos: `bash scripts/verify-release-artifacts.sh`
- [ ] Probar la apertura inicial del DMG simulando un sistema limpio (usando la guía de [QA-MANUAL-ES.md](QA-MANUAL-ES.md)).

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
Durante la preparación del release público v1, se identificaron referencias a términos fuera de alcance en comentarios o documentación. Son permitidas cuando explican exclusiones y no activan dependencias/runtime fuera de v1:
- **Archivo**: [packages/deepseek/src/client.ts](../packages/deepseek/src/client.ts) (Líneas 17-18)
  - *Referencia:* Contiene comentarios explicativos indicando que se excluyen de v1 la compatibilidad con el endpoint de Anthropic y FIM beta.
  - *Resolución:* No representan código ejecutable ni configuraciones activas, por lo que son permitidas y se encuentran filtradas de forma segura en `verify-v1-scope.sh`.
