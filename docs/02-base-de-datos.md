# FinTrack — Base de datos

> Modelo de datos del MVP sobre Supabase PostgreSQL.
> Todas las tablas usan RLS y políticas explícitas.

---

## Estándares generales

- Toda tabla privada incluye `id` UUID, `user_id` UUID no nulo (cuando aplique), `created_at` y `updated_at` (cuando corresponda).
- `user_id` referencia `auth.users(id)` con `on delete cascade` cuando aplique.
- RLS activada en todas las tablas privadas.
- Políticas explícitas de SELECT / INSERT / UPDATE / DELETE.
- Un usuario autenticado solo opera sobre filas donde `user_id = auth.uid()`.
- Políticas de INSERT y UPDATE con `WITH CHECK`.
- Independencia total del frontend para la protección de datos.

### Prueba de aislamiento (dos usuarios)

1. Usuario A crea datos.
2. Usuario B **no** puede ver datos de A.
3. Usuario B **no** puede crear filas con `user_id` de A.
4. Usuario B **no** puede actualizar ni eliminar datos de A.

---

## Modelo de datos del MVP

### `profiles`

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | UUID | PK. Referencia `auth.users(id)`. |
| `display_name` | TEXT | |
| `currency_code` | TEXT | Valor predeterminado `COP`. |
| `timezone` | TEXT | Valor predeterminado `America/Bogota`. |
| `theme_preference` | TEXT | `light`, `dark` o `system`. |
| `onboarding_completed` | BOOLEAN | Valor predeterminado `false`. |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

### `accounts`

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | UUID | PK. |
| `user_id` | UUID | Referencia `auth.users(id)`. |
| `name` | TEXT | |
| `type` | TEXT | `cash`, `checking`, `savings`, `digital_wallet`, `credit_card`. |
| `initial_balance_minor` | BIGINT | |
| `currency_code` | TEXT | |
| `color` | TEXT | |
| `icon` | TEXT | |
| `is_archived` | BOOLEAN | Valor predeterminado `false`. |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

### `categories`

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | UUID | PK. |
| `user_id` | UUID | Referencia `auth.users(id)`. |
| `name` | TEXT | |
| `type` | TEXT | `income` o `expense`. |
| `icon` | TEXT | |
| `color` | TEXT | |
| `is_system` | BOOLEAN | Valor predeterminado `false`. |
| `is_archived` | BOOLEAN | Valor predeterminado `false`. |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

### `transactions`

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | UUID | PK. |
| `user_id` | UUID | Referencia `auth.users(id)`. |
| `account_id` | UUID | Referencia `accounts(id)`. |
| `category_id` | UUID nullable | Referencia `categories(id)`. |
| `type` | TEXT | `income`, `expense` o `transfer`. |
| `transfer_direction` | nullable | `incoming` o `outgoing`. |
| `amount_minor` | BIGINT | Positivo. Unidades mínimas de la moneda. |
| `transaction_date` | DATE | |
| `description` | TEXT | |
| `notes` | TEXT nullable | |
| `is_reconciled` | BOOLEAN | Valor predeterminado `false`. |
| `transfer_group_id` | UUID nullable | Vincula los dos movimientos de una transferencia. |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

---

## Índices mínimos

- `accounts(user_id)`.
- `categories(user_id, type)`.
- `transactions(user_id, transaction_date DESC)`.
- `transactions(user_id, account_id)`.
- `transactions(user_id, category_id)`.
- `transactions(transfer_group_id)`.

---

## Reglas financieras

1. Un usuario es dueño de todos sus perfiles, cuentas, categorías y movimientos.

2. Tipos de movimientos: `income`, `expense`, `transfer`.

3. Los montos son **siempre enteros positivos en unidades mínimas**:
   - Para COP: COP 15.000 se guarda como `15000`.
   - Nunca usar `float` de JavaScript para cálculos financieros relevantes.

4. Saldo por cuenta:

   ```
   saldo inicial
   + ingresos
   − gastos
   + transferencias recibidas
   − transferencias enviadas
   ```

5. Transferencias entre cuentas del mismo usuario:
   - No se consideran ingreso ni gasto en el dashboard consolidado.
   - Conservan el saldo consolidado del usuario.
   - Crean **dos movimientos vinculados** mediante `transfer_group_id`.
   - Tienen dirección interna (`incoming` / `outgoing`).

6. Tasa de ahorro:

   ```
   (ingresos - gastos) / ingresos * 100
   ```

   Si ingresos es 0: retornar `null`, mostrar `—` o un texto apropiado. Nunca devolver `NaN` o `Infinity`.

7. Una categoría de tipo `income` **no** se puede usar en una transacción `expense`, y viceversa.

8. Las cuentas y categorías con historial deben **archivarse** (`is_archived = true`). No eliminar físicamente registros que puedan romper el historial.

9. No crear “Ahorro” como gasto predeterminado:
   - Ahorrar se modela como **transferencia** a una cuenta de ahorro.
   - Las metas se crearán en una fase posterior.

---

## Tablas posteriores (fuera del primer esquema)

No crear estas tablas hasta llegar a su fase y recibir aprobación:

- `budgets`.
- `recurring_rules`.
- `goals`.
- `notifications`.
- `saved_ledger_views`.

---

## Estrategia de perfiles y categorías

- **Profile inicial:** crear mediante trigger seguro en migración, sin depender del cliente.
- **Categorías predeterminadas por usuario:** crear durante onboarding con una estrategia segura y repetible (ver `docs/03-ui-ux.md`).