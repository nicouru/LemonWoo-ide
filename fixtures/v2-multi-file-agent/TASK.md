# V2 functional dogfood task

Open this folder in LemonWoo and ask:

`Arreglá los tests de este repo con el menor patch posible. Inspeccioná los archivos necesarios, proponé diff, verificá y corregí si falla.`

Expected behavior:

1. The seeded tests start red.
2. The agent inspects/searches before editing.
3. The first patch can touch multiple files.
4. If TestGate remains red, **Corregir con agente** produces a second patch.
5. Final `npm test` is green.

