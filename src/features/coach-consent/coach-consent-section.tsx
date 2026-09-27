import { useId, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { CURRENT_AI_CONSENT_VERSION } from '@/features/coach/consent'

import { useCoachConsent, useSetCoachConsent } from './hooks'

function formatDate(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })
}

/**
 * Consentimiento explícito de FinTrack Coach, separado de cualquier otra
 * aceptación. Nunca viene marcado: el usuario tiene que leer, marcar la casilla
 * y pulsar el botón. Revocar es un solo clic.
 */
export function CoachConsentSection() {
  const consentQuery = useCoachConsent()
  const setConsent = useSetCoachConsent()
  const [checked, setChecked] = useState(false)
  const checkboxId = useId()
  const descriptionId = useId()

  const state = consentQuery.data

  async function change(grant: boolean) {
    try {
      await setConsent.mutateAsync(grant)
      setChecked(false)
      toast.success(grant ? 'Autorización registrada' : 'Autorización retirada')
    } catch (error) {
      toast.error('No se pudo guardar tu decisión', {
        description: error instanceof Error ? error.message : undefined,
      })
    }
  }

  return (
    <section
      className="mt-6 rounded-2xl border border-border bg-card p-4 shadow-card sm:p-6"
      aria-labelledby="settings-coach-title"
    >
      <h2 id="settings-coach-title" className="text-lg font-semibold text-foreground">
        FinTrack Coach
      </h2>
      <p id={descriptionId} className="text-sm text-muted-foreground">
        FinTrack Coach todavía no está disponible. Cuando lo esté, necesitará tu autorización para
        enviar a Google Gemini API tu pregunta y totales agregados de tus finanzas. Nunca envía
        descripciones de movimientos, nombres de cuentas ni tu correo. No es asesoramiento
        financiero profesional.{' '}
        <a href="/privacy" className="underline underline-offset-4">
          Leer la política de privacidad
        </a>
      </p>

      <div className="mt-4" aria-live="polite">
        {consentQuery.isPending ? (
          <p className="text-sm text-muted-foreground">Cargando tu decisión...</p>
        ) : consentQuery.isError ? (
          <p role="alert" className="text-sm text-destructive">
            No se pudo leer tu decisión. Mientras tanto, FinTrack Coach no usará tus datos.
          </p>
        ) : state?.status === 'granted' ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-foreground">
              Autorizaste el análisis el {formatDate(state.at)} (política {state.version}).
            </p>
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-9 whitespace-normal"
              disabled={setConsent.isPending}
              onClick={() => change(false)}
            >
              {setConsent.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Retirar autorización de FinTrack Coach
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {state?.status === 'outdated' && (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                La política cambió desde que autorizaste el análisis (aceptaste la versión{' '}
                {state.version}). Tu autorización anterior ya no es válida.
              </p>
            )}
            <div className="flex items-start gap-2">
              <input
                id={checkboxId}
                type="checkbox"
                className="mt-1 size-4"
                checked={checked}
                onChange={(event) => setChecked(event.target.checked)}
                aria-describedby={descriptionId}
              />
              <label htmlFor={checkboxId} className="text-sm">
                Leí la política de privacidad (versión {CURRENT_AI_CONSENT_VERSION}) y autorizo que
                FinTrack Coach analice mis datos financieros agregados.
              </label>
            </div>
            <div>
              <Button
                type="button"
                disabled={!checked || setConsent.isPending}
                onClick={() => change(true)}
              >
                {setConsent.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                Autorizar análisis de FinTrack Coach
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
