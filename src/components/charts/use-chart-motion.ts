import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion'

/**
 * Props de animación compartidas por los gráficos.
 *
 * Recharts anima 1500 ms por defecto, demasiado para un panel de datos que se
 * consulta de un vistazo: se reduce a 600 ms con desaceleración, dentro del
 * presupuesto de entrada del resto de la interfaz. Si el usuario pidió menos
 * movimiento, el gráfico aparece ya dibujado.
 */
export function useChartMotion() {
  const prefersReducedMotion = usePrefersReducedMotion()

  return {
    isAnimationActive: !prefersReducedMotion,
    animationDuration: 600,
    animationEasing: 'ease-out',
  } as const
}
