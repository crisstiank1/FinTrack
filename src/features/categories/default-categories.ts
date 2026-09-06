export type DefaultCategory = {
  name: string
  type: 'income' | 'expense'
  icon: string
  group: 'income' | 'essential' | 'flexible'
}

// Estrategia de categorías por usuario (docs/02-base-de-datos.md y
// docs/03-ui-ux.md): se crean durante el onboarding con is_system = true.
// No incluye "Ahorro": ahorrar se modela como transferencia, no como gasto.
export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  // Ingresos
  { name: 'Salario', type: 'income', icon: 'wallet', group: 'income' },
  { name: 'Freelance', type: 'income', icon: 'briefcase', group: 'income' },
  { name: 'Ventas', type: 'income', icon: 'shopping-bag', group: 'income' },
  { name: 'Inversiones', type: 'income', icon: 'trending-up', group: 'income' },
  { name: 'Reembolsos', type: 'income', icon: 'rotate-ccw', group: 'income' },
  { name: 'Regalos', type: 'income', icon: 'gift', group: 'income' },
  { name: 'Otros ingresos', type: 'income', icon: 'circle-dollar-sign', group: 'income' },

  // Gastos esenciales
  { name: 'Vivienda', type: 'expense', icon: 'home', group: 'essential' },
  { name: 'Servicios públicos', type: 'expense', icon: 'zap', group: 'essential' },
  { name: 'Internet y telefonía', type: 'expense', icon: 'wifi', group: 'essential' },
  { name: 'Alimentación', type: 'expense', icon: 'utensils-crossed', group: 'essential' },
  { name: 'Transporte', type: 'expense', icon: 'car', group: 'essential' },
  { name: 'Salud', type: 'expense', icon: 'heart-pulse', group: 'essential' },
  { name: 'Educación', type: 'expense', icon: 'graduation-cap', group: 'essential' },
  { name: 'Seguros', type: 'expense', icon: 'shield', group: 'essential' },
  { name: 'Deudas y créditos', type: 'expense', icon: 'credit-card', group: 'essential' },

  // Gastos flexibles
  { name: 'Restaurantes', type: 'expense', icon: 'coffee', group: 'flexible' },
  { name: 'Entretenimiento', type: 'expense', icon: 'clapperboard', group: 'flexible' },
  { name: 'Suscripciones', type: 'expense', icon: 'smartphone', group: 'flexible' },
  { name: 'Ropa', type: 'expense', icon: 'shirt', group: 'flexible' },
  { name: 'Compras personales', type: 'expense', icon: 'shopping-cart', group: 'flexible' },
  { name: 'Viajes', type: 'expense', icon: 'plane', group: 'flexible' },
  { name: 'Mascotas', type: 'expense', icon: 'paw-print', group: 'flexible' },
  { name: 'Regalos', type: 'expense', icon: 'gift', group: 'flexible' },
  { name: 'Otros gastos', type: 'expense', icon: 'more-horizontal', group: 'flexible' },
]
