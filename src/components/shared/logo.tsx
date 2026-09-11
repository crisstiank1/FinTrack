import logoDark from '@/assets/brand/logo-dark.png'
import logoDarkIcon from '@/assets/brand/logo-dark-icon.png'
import logoLight from '@/assets/brand/logo-light.png'
import logoLightIcon from '@/assets/brand/logo-light-icon.png'
import { cn } from '@/lib/utils'

interface LogoProps {
  variant?: 'full' | 'icon'
  className?: string
}

export function Logo({ variant = 'full', className }: LogoProps) {
  const light = variant === 'full' ? logoLight : logoLightIcon
  const dark = variant === 'full' ? logoDark : logoDarkIcon

  return (
    <span className={cn('inline-flex items-center', className)}>
      <img src={light} alt="FinTrack" className="block h-full w-auto object-contain dark:hidden" />
      <img src={dark} alt="FinTrack" className="hidden h-full w-auto object-contain dark:block" />
    </span>
  )
}
