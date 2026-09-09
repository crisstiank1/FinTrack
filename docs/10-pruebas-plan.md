# FinTrack — Pruebas SQL del Plan mensual

> Plan de pruebas de la Fase 8.7. **Todavía no hay SQL ejecutable**: las
> migraciones M1, M2 y M3 no existen. Este documento fija qué debe comprobar
> cada caso y qué resultado se espera, para que la suite se escriba junto a las
> migraciones y no después.

Cuando existan las migraciones, la suite seguirá el formato de
`docs/08-pruebas-hojas.md`: casos numerados para el editor SQL de Supabase, dos
usuarios de prueba, ejecutados en orden y sin depender de datos reales.

## Requisitos previos

1. Dos usuarios de prueba creados desde *Authentication > Add user*. **No usar
   cuentas ni datos financieros reales.**
2. Cuentas de los tipos necesarios, incluido `investment`, que solo existe tras
   M1. No hace falta ninguna cuenta `credit_card`: **ninguna regla de esta fase
   la consulta.**
3. Categorías de gasto e ingreso, alguna archivada, para los casos de
   «prohibido estrenar».
4. Ejecutar los bloques en orden.

## Qué no se prueba aquí

La aritmética no entra en esta suite: reparto por mayor resto, exclusión de
transferencias entre cuentas del mismo tipo, identidades de las dos particiones
del gasto y convención de diferencia favorable son **lógica pura** y se prueban
con Vitest en el paso 2 de la fase. Duplicarlas en SQL crearía dos definiciones
de la misma regla, que acabarían divergiendo.

Tampoco se prueba aquí que una transferencia registrada hacia una cuenta
`credit_card` quede fuera de todos los agregados: es una consecuencia de las
consultas, no una garantía de la base de datos, y se comprueba con Vitest.

Aquí se prueba únicamente lo que la base de datos garantiza por sí misma:
aislamiento, restricciones, claves foráneas, triggers y cascadas.

---

## Bloque 1 — Aislamiento entre usuarios (casos 1-5)

| Caso | Comprueba | Esperado |
| --- | --- | --- |
| 1 | B no ve los planes de A | 0 filas |
| 2 | B no ve las líneas ni las clasificaciones de A | 0 filas |
| 3 | B no puede insertar filas con el `user_id` de A | Denegado por RLS |
| 4 | B no puede actualizar ni borrar filas de A | 0 filas afectadas |
| 5 | El rol `anon` no lee ninguna de las seis tablas | 0 filas |

## Bloque 2 — Clasificación única (casos 6-8)

| Caso | Comprueba | Esperado |
| --- | --- | --- |
| 6 | Segunda clasificación de la misma categoría | Viola U1 |
| 7 | La misma categoría clasificada por dos usuarios distintos | Permitido |
| 8 | Cambiar el grupo de una clasificación existente | Permitido |

El caso 8 importa porque la deuda solo existe aquí: reclasificar es la única
manera de declarar o retirar una categoría de deuda.

## Bloque 3 — Reglas de categoría al clasificar (casos 9-12)

| Caso | Comprueba | Esperado |
| --- | --- | --- |
| 9 | Clasificar una categoría de tipo `income` | Denegado por T1 |
| 10 | Estrenar una clasificación con categoría archivada | Denegado por T1 |
| 11 | Editar una clasificación cuya categoría se archivó después | **Permitido** |
| 12 | Clasificar una categoría de otro usuario | Denegado por F1 |

El caso 11 es el que distingue *prohibido estrenar* de *prohibido tocar*, y el
que garantiza que archivar una categoría no rompa los meses ya cerrados.

## Bloque 4 — Ejes de medición e importe (casos 13-17)

| Caso | Comprueba | Esperado |
| --- | --- | --- |
| 13 | Línea `bill` con `planned_minor` | Viola C7 |
| 14 | Línea `savings` sin `planned_minor` | Viola C7 |
| 15 | Línea `bill` con `account_id` | Viola C5 o C6 |
| 16 | Línea `savings` con `category_id` | Viola C5 o C6 |
| 17 | Línea sin `category_id` ni `account_id` | Viola C5 o C6 |

Es el bloque que demuestra que el doble presupuesto por categoría es imposible
de escribir, no solo de calcular.

## Bloque 5 — Una línea por categoría y por cuenta (casos 18-20)

| Caso | Comprueba | Esperado |
| --- | --- | --- |
| 18 | Segunda línea sobre la misma categoría en el mismo mes | Viola U10 |
| 19 | La misma categoría en un mes distinto | **Permitido** |
| 20 | Segunda línea sobre la misma cuenta en el mismo mes | Viola U11 |

## Bloque 6 — Fecha esperada (casos 21-23)

| Caso | Comprueba | Esperado |
| --- | --- | --- |
| 21 | `due_date` en una línea `variable` | Viola C3 |
| 22 | `due_date` de un mes distinto al del plan | Viola C4 |
| 23 | `period_month` que no corresponde al `plan_month_id` | Viola F7 |

El caso 23 confirma que la columna desnormalizada no puede desviarse, que es lo
que permite que C4 sea una restricción de fila y no un trigger.

## Bloque 7 — Tipo de cuenta por `kind` (casos 24-26)

| Caso | Comprueba | Esperado |
| --- | --- | --- |
| 24 | `savings` sobre una cuenta `checking` | Denegado por T3 |
| 25 | `investment` sobre una cuenta `savings` | Denegado por T3 |
| 26 | Estrenar una línea con cuenta archivada | Denegado por T3 |

## Bloque 8 — Suma de porcentajes (casos 27-29)

| Caso | Comprueba | Esperado |
| --- | --- | --- |
| 27 | Suma distinta de 10000 al cerrar la transacción | Denegado por T4 |
| 28 | Estado intermedio inválido dentro de una transacción | **Permitido** hasta el commit |
| 29 | Suma exactamente 10000 | Permitido |

El caso 28 es el que justifica que T4 sea diferido: reasignar porcentajes toca
varias filas y ningún orden de sentencias mantiene la suma válida en todo
momento.

## Bloque 9 — Fuentes de ingreso (casos 30-32)

| Caso | Comprueba | Esperado |
| --- | --- | --- |
| 30 | La misma categoría de ingreso en dos fuentes del mismo mes | Viola U9 |
| 31 | Puente apuntando a una fuente de otro mes | Viola F4 |
| 32 | Categoría de tipo `expense` en el puente | Denegado por T2 |

## Bloque 10 — Cascadas y diferimiento (casos 33-36)

| Caso | Comprueba | Esperado |
| --- | --- | --- |
| 33 | Borrar un `plan_months` arrastra allocations, fuentes y líneas | Hijos en 0 |
| 34 | Borrar una fuente arrastra su puente | Puente en 0 |
| 35 | Borrar el usuario arrastra las seis tablas | Todo en 0 |
| 36 | La cascada de usuario no falla en el punto intermedio | Sin error |

El caso 36 es el que justifica que las claves foráneas sean diferidas: con la
comprobación inmediata, borrar un usuario fallaría a mitad de camino aunque al
final no quedasen referencias.

## Bloque 11 — Posiciones (casos 37-38)

| Caso | Comprueba | Esperado |
| --- | --- | --- |
| 37 | Intercambiar dos posiciones sin diferir | Viola U12 |
| 38 | El mismo intercambio con la restricción diferida | Permitido |

## Bloque 12 — Ampliación de `accounts.type` (casos 39-40)

| Caso | Comprueba | Esperado |
| --- | --- | --- |
| 39 | Crear una cuenta con `type = 'investment'` | Permitido tras M1 |
| 40 | Crear una cuenta con un tipo inventado | Denegado por el CHECK |

---

## Resumen

40 casos en 12 bloques. Ninguno depende de datos financieros reales ni de la
aritmética de la aplicación: todos comprueban garantías de la base de datos,
que es lo que no se puede esquivar desde el cliente.

Ningún caso crea, consulta ni depende de una cuenta `credit_card`: el Plan
mensual no la usa en ninguna regla.
