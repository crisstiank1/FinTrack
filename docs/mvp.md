# MVP - FinTrack

## Descripción del Producto

Aplicación web de finanzas personales.

## Tipo de Usuario

- Uso personal.
- Multiusuario en baja escala.
- Cada usuario solo puede acceder a sus propios datos.

## Moneda Inicial

- COP como moneda predeterminada.
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

3. **Categorías**
   - Categorías de ingresos y gastos predefinidas.
   - Crear categorías personalizadas.

4. **Movimientos**
   - Registrar ingresos, gastos.
   - Fecha, monto, categoría, descripción.

5. **Dashboard Mensual**
   - Resumen de ingresos, gastos y balance del mes.
   - Gráficos básicos (barras o dona).

6. **Presupuestos**
   - Establecer límite por categoría por mes.
   - Alertar cuando se supera el presupuesto.

7. **Libro Financiero Tipo Tabla**
   - Vista tipo Excel con todos los movimientos.
   - Filtros por fecha, categoría, tipo, cuenta.
   - Ordenamiento por columnas.
   - Exportación a CSV.

8. **Seguridad**
   - Row Level Security (RLS) en Supabase.
   - Cada usuario solo ve sus datos.

9. **Despliegue**
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
