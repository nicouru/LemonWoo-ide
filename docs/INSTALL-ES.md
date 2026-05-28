# Instalar LemonWoo (macOS)

1. Descargar y abrir `LemonWoo-<version>-mac-<arch>.dmg`.
2. Arrastrar `LemonWoo.app` a Aplicaciones.
3. Abrir LemonWoo.
   - *Nota de Gatekeeper/ad-hoc signing:* en v1 la app usa firma ad-hoc local. Si macOS la bloquea por "unidentified developer", hacé clic derecho (o Control-click) sobre `LemonWoo.app` y elegí **Abrir**.
   - Si persiste bloqueo por quarantine, ejecutar:
     - `xattr -cr /Applications/LemonWoo.app`
4. Primer arranque:
   - Confirmar que abre la ventana principal de LemonWoo.
   - Si tarda en abrir por primera vez, esperar el bootstrap inicial.
5. Configurar DeepSeek BYOK:
   - Pegar una API key propia cuando LemonWoo lo solicite.
   - LemonWoo no incluye llaves embebidas ni muestra el valor de tu key en logs de release.
6. Escribirle al agente en el cuadro principal.
