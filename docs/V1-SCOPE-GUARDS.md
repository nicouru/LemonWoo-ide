# V1 Scope Guards

Este documento detalla las reglas de alcance estrictas para **LemonWoo v1**. Estas reglas protegen la simplicidad y el foco inicial del proyecto, evitando el "scope creep" y garantizando que el IDE sea extremadamente rápido y fácil de usar localmente.

## Regla Central de V1

> **Una ventana de agente única + DeepSeek API Key + Programación local real.**

LemonWoo v1 se enfoca en resolver un único problema excepcionalmente bien: permitir que un agente local de inteligencia artificial actúe sobre tu código local utilizando la API de DeepSeek directamente (BYOK - Bring Your Own Key).

---

## Qué SÍ entra en V1

- **Interfaz de Agente única**: Panel lateral integrado tipo chat que interactúa con el espacio de trabajo actual.
- **Modelo de Lenguaje único**: Integración directa y optimizada con DeepSeek Coder/Chat.
- **Esquema BYOK**: Carga y almacenamiento local seguro de la API key provista por el usuario.
- **Acciones Locales**: Lectura de archivos, escritura de archivos, ejecución de comandos y aplicación de diffs controlados.
- **Notificaciones básicas y Stop**: Control sobre la ejecución del agente en tiempo real.
- **Distribución macOS Local**: Generación de un `.app` y un `.dmg` firmados de manera ad-hoc listos para ejecutar.

---

## Qué queda FUERA de V1 (Destinado a V1.1+)

El hecho de que estas características estén fuera de la versión v1 no significa que se descarten permanentemente; simplemente están agendadas para iteraciones futuras (**v1.1 o posterior**) para no retrasar el lanzamiento inicial y garantizar la estabilidad:

1. **Protocolo MCP (Model Context Protocol)**:
   - *Por qué queda fuera:* MCP Hub, MCP Registry, y herramientas de MCP complejas (como Playwright MCP o servidores externos) agregan una capa de abstracción y dependencias innecesarias para la programación local básica.
2. **Selectores de Proveedor o Modelo (Provider/Model Pickers)**:
   - *Por qué queda fuera:* Para evitar sobrecargar la interfaz de usuario con opciones complejas. La versión 1 está diseñada en torno a la API de DeepSeek.
3. **Orquestación Multi-Agente**:
   - *Por qué queda fuera:* El loop de programación actual es directo y predecible. La complejidad de coordinar múltiples agentes autónomos es excesiva para esta fase.
4. **Memoria Persistente Compleja**:
   - *Por qué queda fuera:* Bases de datos vectoriales locales, embeddings integrados o SQLite para almacenamiento persistente de memoria de chat no son necesarios para los casos de uso iniciales.
5. **Monetización y Telemetría Avanzada**:
   - *Por qué queda fuera:* Integraciones de pasarelas de pago (Stripe) y telemetría invasiva (OpenTelemetry) quedan fuera para mantener el software 100% privado y de código abierto sin fricciones comerciales.
6. **Agentes de Navegador Activos (Browser Agents)**:
   - *Por qué queda fuera:* El uso de herramientas autónomas de navegación (como Stagehand) añade riesgos de seguridad e inestabilidad al flujo básico de edición de código.

---

## Scripts de Verificación de Alcance

Para garantizar automatizadamente que no se introducen funcionalidades fuera de alcance en las ramas activas, se utiliza el script:

```bash
bash scripts/verify-v1-scope.sh
```

### Cómo interpretar Falsos Positivos

El validador busca palabras clave como `mcp`, `stripe`, `opentelemetry`, etc. Si necesitas documentar alguna característica futura, puedes hacerlo en:
- `docs/V1-SCOPE-GUARDS.md` (este archivo)
- `docs/ANTIGRAVITY-AUDIT.md`
- `docs/PUBLIC-RELEASE-CHECKLIST.md`

El script de verificación ignora explícitamente estos archivos de documentación. Si se genera un falso positivo en código de producción, reevalúa si la implementación realmente requiere el uso del término o busca una nomenclatura alternativa para mantener la pureza de V1.
