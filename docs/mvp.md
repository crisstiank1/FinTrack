# MVP - FinTrack

## Descripción del Producto

Aplicación web de finanzas personales.

## Tipo de Usuario

- Uso personal.
- Multiusuario en baja escala.
- Cada usuario solo puede acceder a sus propios datos.

## Moneda Inicial

- COP como moneda predeterminada.
- Cada usuario podrá elegir su moneda principal.
- No habrá conversión automática de monedas en el MVP.

## Stack Tecnológico

- React + TypeScript
- Vite
- Tailwind CSS
- Supabase (Auth + DB + RLS)
- Cloudflare Pages (despliegue)

## Funcionalidades del MVP

1. **Autenticación**
   - Registro e inicio de sesión con Google.
   - Registro e inicio de sesión con correo y contraseña.
   - Recuperación de contraseña.

2. **Onboarding**
   - Wizard de bienvenida al primer inicio de sesión.

3. **Cuentas Financieras**
   - Crear, editar y eliminar cuentas (banco, efectivo, tarjeta, etc.).
   - Saldo actual por cuenta.

4. **Categorías**
   - Categorías de ingresos y gastos predefinidas.
   - Crear categorías personalizadas.

5. **Movimientos**
   - Registrar ingresos, gastos y transferencias entre cuentas.
   - Fecha, monto, categoría, descripción.

6. **Dashboard Mensual**
   - Resumen de ingresos, gastos y balance del mes.
   - Gráficos básicos (barras o dona).

7. **Presupuestos**
   - Establecer límite por categoría por mes.
   - Alertar cuando se supera el presupuesto.

8. **Libro Financiero Tipo Tabla**
   - Vista tipo Excel con todos los movimientos.
   - Filtros por fecha, categoría, tipo, cuenta.
   - Ordenamiento por columnas.
   - Exportación a CSV.

9. **Seguridad**
   - Row Level Security (RLS) en Supabase.
   - Cada usuario solo ve sus datos.

10. **Despliegue**
    - Deploy en Cloudflare Pages.

## Fuera del MVP

- Integración bancaria.
- Pagos.
- OCR de facturas.
- Adjuntos/archivos.
- IA de clasificación automática.
- Hogares compartidos.
- Notificaciones push o por correo.
- Conversión de moneda histórica.
- Fórmulas libres tipo Excel.

## Decisiones Pendientes (Post-MVP)

- Paleta de colores final.
- Nombre de branding.
- Tipografía.
- Diseño responsive móvil.
- Landing page.

## Estructura de Navegación (MVP)

```
/auth/login
/auth/register
/auth/forgot-password
/onboarding
/dashboard
/accounts
/categories
/transactions
/budgets
/ledger
/settings
```
