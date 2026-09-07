# FinTrack — Validación manual de la Fase 7

> Pruebas que deben ejecutarse contra el proyecto Supabase real antes de dar por
> cerrado el Libro financiero e iniciar la Fase 8.
>
> **Estado: PENDIENTE.** Ninguna de estas verificaciones se ha ejecutado todavía.
> El agente no puede realizarlas: requieren iniciar sesión y crear usuarios, y no
> debe manejar contraseñas ni crear cuentas. Tampoco fue posible levantar una
> instancia local (`supabase start` necesita Docker, que no está instalado en
> este equipo).

Anota el resultado de cada punto en la columna correspondiente.

---

## 1. Agregación del resumen (la más importante)

El resumen del Libro usa funciones de agregación de PostgREST
(`select=type,total:amount_minor.sum()`). Está soportado desde PostgREST 12 y el
proyecto reporta la versión 14.5, pero hay que confirmarlo en ejecución.

**Cómo probar:** abre `/ledger` con sesión iniciada.

| Resultado | Significado |
| --- | --- |
| Se ven cifras en Ingresos, Gastos, Balance y Movimientos | La agregación funciona. Nada que hacer. |
| Aparece "No pudimos calcular el resumen..." | La agregación falló. La tabla y la exportación siguen operativas por diseño. |

Si falló, abre las herramientas de desarrollo (F12) → pestaña **Network** → busca
la petición a `transactions?select=type,total:amount_minor.sum()` y copia el
cuerpo de la respuesta. Ese mensaje indica la causa exacta.

**No resolver esto sumando en el navegador**: reintroduciría el problema de
rendimiento que la Fase 7 resolvió. La alternativa acordada es una función RPC
en SQL (ver el apartado final).

- [ ] Resultado: ______________________________

---

## 2. Totales correctos con datos conocidos

Crea estos movimientos **desde la interfaz**, todos en el mismo mes y en la
misma moneda:

| Movimiento | Monto |
| --- | --- |
| Ingreso | COP 3.500.000 |
| Gasto | COP 120.000 |
| Gasto | COP 80.000 |
| Transferencia entre dos cuentas propias | COP 200.000 |

En `/ledger`, filtrando por ese mes, el resumen debe mostrar exactamente:

```
Ingresos:    COP 3.500.000
Gastos:      COP 200.000
Balance:     COP 3.300.000
Movimientos: 5
```

La transferencia genera dos filas (`Movimientos: 5`, no 4) pero **no debe**
alterar ingresos, gastos ni balance.

- [ ] Resultado: ______________________________

---

## 3. Coincidencia con el dashboard

Con el **mismo mes** seleccionado en ambas pantallas y **sin filtros de cuenta,
categoría ni tipo** en el Libro:

| Dashboard | Libro | Deben coincidir |
| --- | --- | --- |
| KPI "Ingresos del mes" | Resumen "Ingresos" | Sí |
| KPI "Gastos del mes" | Resumen "Gastos" | Sí |
| KPI "Ahorro neto" | Resumen "Balance" | Sí |

> Nota: el Libro filtra por rango de fechas y el dashboard por mes. Para que la
> comparación sea válida, pon en el Libro **Desde** = día 1 y **Hasta** = último
> día del mismo mes.

- [ ] Resultado: ______________________________

---

## 4. La exportación CSV respeta los filtros

1. En `/ledger`, filtra por **Tipo = Gastos** y un rango de fechas concreto.
2. Pulsa **Exportar CSV**.
3. Abre el archivo en Excel y comprueba:

- [ ] Las columnas salen separadas (no todo en una sola celda).
- [ ] Las tildes y la ñ se ven correctamente.
- [ ] Solo aparecen gastos, y solo del rango elegido.
- [ ] El número de filas coincide con "Movimientos" del resumen.
- [ ] La columna `Monto` es numérica y sumable.

**Sobre las transferencias en el CSV:** se exportan las dos filas del par con
signos opuestos, así que sumar `Monto` sobre un export **completo** da el
balance correcto. Un export filtrado **por una sola cuenta** contiene solo una
mitad del par y la suma quedará desviada por ese monto: para esos casos usa las
columnas `Tipo`, `Dirección` y `Grupo de transferencia` para excluir o emparejar
las transferencias en la hoja.

- [ ] Resultado: ______________________________

---

## 5. Aislamiento RLS con dos usuarios

Las políticas son `auth.uid() = user_id` en las cuatro tablas
(`profiles`, `accounts`, `categories`, `transactions`), para SELECT, INSERT,
UPDATE y DELETE, con `WITH CHECK` en INSERT y UPDATE.

### 5.1 Preparación

1. Registra dos usuarios de prueba (Usuario A y Usuario B) desde `/auth`.
2. Con el Usuario A, completa el onboarding y crea una cuenta, una categoría y
   un movimiento.
3. En Supabase Studio → **SQL Editor**, obtén los identificadores:

```sql
select id, email from auth.users order by created_at desc limit 5;
```

Anota el UUID de A y el de B.

### 5.2 Prueba por SQL (recomendada)

El editor SQL corre como superusuario y **se salta RLS**, así que hay que
impersonar a cada usuario. Ejecuta cada bloque completo, de una vez.

```sql
-- Lo que ve el Usuario B (debe ser 0 en las tres tablas de A)
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"UUID_DE_B","role":"authenticated"}';

  select
    (select count(*) from public.accounts     where user_id = 'UUID_DE_A') as cuentas_de_a,
    (select count(*) from public.categories   where user_id = 'UUID_DE_A') as categorias_de_a,
    (select count(*) from public.transactions where user_id = 'UUID_DE_A') as movimientos_de_a;
commit;
```

Resultado esperado: `0 | 0 | 0`.

```sql
-- B no puede insertar filas a nombre de A (debe fallar por WITH CHECK)
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"UUID_DE_B","role":"authenticated"}';

  insert into public.accounts (user_id, name, type)
  values ('UUID_DE_A', 'Cuenta intrusa', 'cash');
rollback;
```

Resultado esperado: error `new row violates row-level security policy`.

```sql
-- B no puede modificar ni borrar datos de A (deben afectar 0 filas)
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"UUID_DE_B","role":"authenticated"}';

  with actualizados as (
    update public.transactions set description = 'HACKEADO'
    where user_id = 'UUID_DE_A' returning 1
  ),
  borrados as (
    delete from public.accounts where user_id = 'UUID_DE_A' returning 1
  )
  select
    (select count(*) from actualizados) as filas_actualizadas,
    (select count(*) from borrados)     as filas_borradas;
rollback;
```

Resultado esperado: `0 | 0`.

> Los `rollback` garantizan que la prueba no deja rastro aunque algo pase.

### 5.3 Prueba por interfaz (complementaria)

1. Inicia sesión como Usuario B en una ventana de incógnito.
2. `/accounts`, `/transactions`, `/ledger` y `/dashboard` deben salir vacíos.
3. El saldo consolidado de B debe ser 0, no el de A.

- [ ] 5.2 SELECT devuelve 0: ______________________________
- [ ] 5.2 INSERT falla: ______________________________
- [ ] 5.2 UPDATE/DELETE afectan 0 filas: ______________________________
- [ ] 5.3 Interfaz de B vacía: ______________________________

---

## Plan B si la agregación falla (punto 1)

Solo implementar si el punto 1 falla, y previa aprobación.

Función RPC que calcula el resumen en PostgreSQL y devuelve tres números:

- `security invoker` (**no** `security definer`): la función se ejecuta con los
  permisos de quien la llama, así que las políticas RLS siguen aplicando y no
  hace falta comprobar `user_id` a mano ni abrir un agujero de permisos.
- `set search_path = ''` y todos los nombres calificados con `public.`, para que
  no pueda ser secuestrada por un esquema en el `search_path` del llamante.
- `revoke ... from public` y `grant execute ... to authenticated`.
- Recibe los mismos filtros que la tabla, para que resumen y filas no diverjan.

Se presentará como propuesta antes de escribirla.
