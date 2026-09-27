# Importador CSV de extractos bancarios

> Ruta `/import`, enlazada desde Hojas («Importar CSV»). Código en
> `src/features/csv-import/` y `src/pages/CsvImport.tsx`.

## Principio

**El CSV genera borradores, nunca movimientos.** Las filas elegidas se guardan
como `sheet_drafts` en una hoja nueva; el usuario las revisa, asigna
categorías y las registra con el flujo existente de Hojas
(`register_sheet_draft`, atómico por fila). No hay ninguna escritura en
`transactions` desde el importador.

No se creó un sistema paralelo: edición, validación final, registro masivo y
reglas de moneda son los de Hojas (`docs/07-hojas.md`).

## Flujo

1. **Archivo.** `.csv` o `.txt`, máximo 5 MB, máximo 2000 filas de datos, al
   menos una fila además de los encabezados.
2. **Vista previa** de las cinco primeras filas.
3. **Cuenta y columnas.** Solo cuentas activas. Mapeo manual de fecha,
   concepto y monto —o débito y crédito—, más saldo opcional (informativo, no
   se publica). Se propone un mapeo por palabras frecuentes de los
   encabezados, siempre visible y editable.
4. **Formato.** Formato de fecha, separador decimal y, con una columna de
   monto con signo, qué significa un negativo. Categoría por defecto opcional
   para gastos e ingresos, solo activas.
5. **Revisión.** Cada fila con su estado, errores y avisos, y una casilla para
   incluirla o no.
6. **Importar.** Crea la hoja `CSV <archivo> (<fecha>)` y abre `/sheets?sheet=…`.

## Privacidad y seguridad

| Riesgo                     | Tratamiento                                                                       |
| -------------------------- | --------------------------------------------------------------------------------- |
| Archivo en el servidor     | Se lee con `File.arrayBuffer()` en el navegador; no se sube a Storage             |
| Descripciones hacia la IA  | El importador no llama a ningún proveedor; el Coach no lee descripciones          |
| Publicación automática     | Imposible: solo inserta en `sheets` y `sheet_drafts`                              |
| Inyección de fórmulas      | Se guarda el texto tal cual y se avisa; `toCsv` exporta con `escapeFormulae`      |
| HTML en descripciones      | Texto plano; React lo escapa. No hay `dangerouslySetInnerHTML`                    |
| Caracteres de control      | Eliminados; espacios colapsados; descripción recortada a 250 con aviso            |
| Archivo binario renombrado | Rechazado si contiene NUL                                                         |
| Acceso a datos ajenos      | Cliente del navegador con la sesión del usuario; RLS en `sheets` y `sheet_drafts` |

## Formatos admitidos

| Aspecto        | Admitido                                                                              |
| -------------- | ------------------------------------------------------------------------------------- |
| Separador      | Coma, punto y coma, tabulador (detectado)                                             |
| Codificación   | UTF-8 (con o sin BOM); si no es UTF-8 válido, Windows-1252, y se avisa                |
| Fecha          | `DD/MM/AAAA`, `MM/DD/AAAA`, `AAAA-MM-DD` con `/`, `-` o `.`; hora ignorada            |
| Año            | Cuatro cifras obligatorias                                                            |
| Montos         | Signo `-` inicial o final, paréntesis, `$`/códigos de moneda, miles con `.` `,` o `'` |
| Tipo de montos | Una columna con signo, o débito y crédito separados (un 0 en la otra se ignora)       |

**Bancos concretos:** no se afirma compatibilidad con ningún banco
(Bancolombia, Nequi, Nu u otros). No se probó con extractos reales de ninguno.
El mapeo manual está pensado para adaptarse a cualquiera que cumpla lo
anterior; registrar mapeos probados por banco queda como trabajo futuro, con
un archivo de muestra anonimizado por banco.

## Reglas que no se adivinan

- **Fecha ambigua.** Se proponen los formatos que interpretan más filas. Si
  hay más de uno (todas las fechas con día ≤ 12), no se preselecciona ninguno y
  la importación queda bloqueada hasta elegir.
- **Separador decimal.** Solo se propone con evidencia inequívoca (una o dos
  cifras tras el último separador). Los grupos de miles deben tener tres
  cifras: `1,5` con punto decimal es un error, no `15`.
- **Signo.** Con una columna de monto, el usuario confirma si un negativo es
  gasto o ingreso. Sin esa confirmación no hay normalización.

## Moneda y montos

La moneda no se lee del CSV: es la de la cuenta elegida, igual que en todo
FinTrack. El exponente (`getCurrencyExponent`) fija la escala: `-45.000` en
COP son `45000`; `-45,99` en USD son `4599` centavos. Aritmética con texto y
`BigInt`, sin `parseFloat`. Decimales de más solo se aceptan si son ceros
(`15.000,00` en COP); si no, la fila es inválida en vez de redondearse.

## Transferencias

Un extracto no distingue un pago a un tercero de un movimiento entre cuentas
propias, y Hojas no registra transferencias. Una descripción con
«transferencia», «traslado», «traspaso», «pago tarjeta»… deja la fila en
**requiere revisión** y fuera de la importación por defecto. Si el usuario la
incluye, entra como ingreso o gasto según su signo; lo correcto para una
transferencia real es registrarla desde Movimientos → Transferencia.

## Duplicados

Se comparan contra los movimientos de la misma cuenta en el rango de fechas
del archivo y contra los borradores pendientes de cualquier hoja.

| Coincidencia                                 | Aviso                  | Por defecto |
| -------------------------------------------- | ---------------------- | ----------- |
| Fecha, monto, tipo y descripción normalizada | Duplicado probable     | Excluida    |
| Fecha, monto y tipo, descripción distinta    | Posible duplicado      | Incluida    |
| Otra fila idéntica en el mismo archivo       | Repetida en el archivo | Incluida    |

La descripción se normaliza sin tildes, mayúsculas ni signos. La decisión final
es siempre del usuario.

## Trazabilidad

La hoja creada tiene una columna propia `origen_csv` con
`csv_import · <archivo> · línea <n>`. Al registrar, pasa a
`transactions.custom_fields`, así cada movimiento conserva su origen.

## Límites conocidos

- No hay IA ni reglas de categorización automática.
- Años de dos cifras no se admiten.
- Extractos en PDF o Excel no se leen: hay que exportar CSV.
- Las filas con errores no se pueden corregir en la pantalla de importación;
  hay que corregir el archivo o crearlas a mano en Hojas.

## Pruebas

`src/features/csv-import/csv-import.test.ts` y `src/pages/CsvImport.test.tsx`:
separadores, encabezados desconocidos, formatos de fecha y ambigüedad,
decimales con punto y coma, miles, débito/crédito, archivo vacío, filas
inválidas, cuenta y categoría archivadas, duplicados, transferencias,
fórmulas, HTML, moneda de la cuenta, y que no se escribe en `transactions`.
