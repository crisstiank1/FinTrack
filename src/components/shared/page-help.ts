/**
 * Textos del «?» junto al título de cada pantalla (M18). Viven juntos para que
 * se revisen de una vez y las pruebas comparen contra la misma fuente.
 */
export const PAGE_HELP = {
  dashboard:
    'Tu resumen del mes: saldo, ingresos, gastos y presupuestos. Registra movimientos desde el panel de la izquierda; el mes y la cuenta de arriba cambian las cifras y los gráficos. Los presupuestos se muestran en la moneda del Plan.',
  accounts:
    'Tus cuentas de efectivo, banco, ahorro e inversión, cada una en su moneda. El saldo parte del saldo inicial y suma los movimientos registrados.',
  transactions:
    'Registra y corrige ingresos, gastos y transferencias. Una transferencia mueve dinero entre tus cuentas: no cuenta como gasto ni como ingreso.',
  ledger: 'Todo tu historial en una tabla, con filtros, búsqueda y exportación a CSV.',
  sheets:
    'Borradores que puedes llenar con calma. No afectan tus cifras hasta que los registras como movimientos.',
  budgets:
    'Cuánto quieres gastar por categoría en el mes y cuánto llevas. Puedes aplicar un presupuesto desde este mes en adelante o solo a este mes.',
  plan: 'Planea tus ingresos y cómo repartirlos, y compáralo con lo que pasó. Las cifras reales se calculan solas desde tus movimientos.',
  settings: 'Tu nombre, tu moneda principal y tus categorías.',
} as const
