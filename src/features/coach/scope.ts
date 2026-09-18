/**
 * Filtro de alcance de FinTrack Coach: **por reglas, no por IA**.
 *
 * Se ejecuta antes de leer un solo dato financiero y antes de que exista
 * ningún proveedor de modelo. Esa es su razón de ser: una pregunta sobre qué
 * acción comprar no debe llegar siquiera a tocar la base de datos, y un
 * rechazo no debe depender de que un modelo esté de acuerdo esta vez.
 *
 * El orden de evaluación importa y es deliberado:
 *
 * 1. **Bloqueadas** (`out_of_scope`): inversión, predicción de mercado, evasión,
 *    inyección de prompt y temas ajenos. Ganan siempre, incluso si la frase
 *    también menciona gastos.
 * 2. **No soportadas** (`unsupported`): preguntas financieras legítimas que
 *    FinTrack todavía no puede responder porque no guarda esos datos. Van antes
 *    que las permitidas para que "¿cuánto debo ahorrar para mi meta?" no se
 *    confunda con una pregunta de ahorro.
 * 3. **Permitidas** (`allowed`), en el orden de la tabla de intenciones.
 * 4. **Todo lo demás se rechaza.** La lista es de permitidos, no de prohibidos:
 *    una pregunta que no encaje en ninguna regla sale como fuera de alcance.
 */

/** Intenciones que FinTrack Coach v1 sabe responder. */
export type CoachIntent =
  | 'period_summary'
  | 'spending_by_category'
  | 'period_comparison'
  | 'budget_status'
  | 'cashflow_analysis'
  | 'spending_review'
  | 'financial_concept'
  | 'app_feature_help'

/** Por qué se rechazó una pregunta ajena al producto. */
export type OutOfScopeReason =
  | 'investment_advice'
  | 'market_prediction'
  | 'tax_or_legal_advice'
  | 'prompt_injection'
  | 'off_topic'

/**
 * Preguntas financieras legítimas que el esquema de FinTrack no soporta
 * todavía. No son "fuera de tema": merecen una explicación de qué falta.
 */
export type UnsupportedFeature =
  'debt_management' | 'savings_goals' | 'emergency_fund' | 'currency_conversion'

export type ScopeDecision =
  | { kind: 'allowed'; intent: CoachIntent; currencyHint: string | null }
  | { kind: 'out_of_scope'; reason: OutOfScopeReason }
  | { kind: 'unsupported'; feature: UnsupportedFeature }

/**
 * Texto comparable: minúsculas y sin tildes.
 *
 * Sin esto, "¿en qué gasté más?" y "en que gaste mas" serían dos preguntas
 * distintas para las reglas, y bastaría escribir sin tildes para esquivar un
 * bloqueo.
 */
export function normalizeMessage(message: string): string {
  return (
    message
      .toLowerCase()
      .normalize('NFD')
      // \p{M} son las marcas combinantes que NFD acaba de separar de su letra:
      // quitarlas convierte "á" en "a" sin tocar ñ, ¿ ni signos.
      .replace(/\p{M}/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

const BLOCKED: readonly { reason: OutOfScopeReason; pattern: RegExp }[] = [
  {
    reason: 'prompt_injection',
    pattern:
      /ignora (las|tus|estas|todas)|olvida (las|tus|todo)|muestra(me)? (tu|el|las) (prompt|instruccion|regla)|cual es tu prompt|system prompt|revela (tus|las)|actua como|haz de cuenta que eres|jailbreak|developer mode|modo desarrollador|(datos|transacciones|movimientos|gastos) de otro usuario|otro usuario/,
  },
  {
    reason: 'investment_advice',
    pattern:
      /\baccion(es)?\b|\betfs?\b|fondo(s)? (indexado|mutuo|de inversion)|criptomoneda|\bcripto\b|bitcoin|\bbtc\b|ethereum|nasdaq|s&p|bolsa de valores|\btrading\b|\bbroker\b|dividendos?|invertir|en que invierto|portafolio|donde pongo mi dinero/,
  },
  {
    reason: 'market_prediction',
    pattern:
      /(subira|bajara|va a subir|va a bajar)|prediccion|pronostico|cuanto (valdra|costara)|rendimiento futuro|como estara el (dolar|mercado|precio)/,
  },
  {
    reason: 'tax_or_legal_advice',
    pattern:
      /\bevad|evasion|elud(ir|o) impuestos|no pagar impuestos|ocultar (ingresos|dinero)|lavar dinero|lavado de (dinero|activos)|asesoria (legal|tributaria|fiscal)|declaracion de renta|\bdian\b|demanda judicial/,
  },
  {
    reason: 'off_topic',
    pattern:
      /chiste|receta|\bclima\b|futbol|pelicula|cancion|poema|traduce|escribe(me)? (un |el )?(codigo|programa|script)|codigo (en|de) (python|javascript|typescript|java)|quien gano/,
  },
]

const UNSUPPORTED: readonly { feature: UnsupportedFeature; pattern: RegExp }[] = [
  {
    feature: 'debt_management',
    pattern:
      /\bdeuda(s)?\b|cuota minima|tasa de interes|\bavalancha\b|bola de nieve|\bprestamo(s)?\b|refinanci|amortiza|\bmora\b|\bintereses\b/,
  },
  {
    feature: 'emergency_fund',
    pattern: /fondo de emergencia|fondo de imprevistos|colchon financiero|\bimprevistos\b/,
  },
  {
    feature: 'savings_goals',
    pattern:
      /\bmeta(s)?\b|objetivo de ahorro|cuanto (debo|deberia|tengo que) ahorrar|ahorrar para|para comprar (un|una|mi)/,
  },
  {
    feature: 'currency_conversion',
    pattern:
      /\bconvert|\bconvier|conversion|tipo de cambio|a cuanto esta el (dolar|euro)|equivale en|cuanto es en (dolares|pesos|euros|usd|cop|ars)|pasar de (cop|usd|ars) a/,
  },
]

const ALLOWED: readonly { intent: CoachIntent; pattern: RegExp; and?: RegExp }[] = [
  {
    intent: 'app_feature_help',
    pattern:
      /como (funciona|creo|hago|edito|configuro|agrego|registro|añado|anado)|donde (veo|encuentro|esta|puedo ver)|para que sirve|como uso|como se usa/,
  },
  {
    intent: 'financial_concept',
    pattern: /que es\b|que significa|explicame|explica\b|diferencia entre|en que consiste/,
    // Pedir una definición no basta: tiene que ser de un concepto del temario.
    // Sin esto, "explícame mis gastos" se respondería como si fuera teoría.
    and: /presupuesto|tasa de ahorro|ahorro neto|flujo de caja|gasto(s)? (esencial|discrecional|hormiga)|categoria|moneda|unidades minimas|saldo consolidado/,
  },
  {
    intent: 'period_comparison',
    pattern:
      /mes pasado|mes anterior|compara|comparado|mas que el mes|menos que el mes|subieron|bajaron|aumentaron|disminuyeron|aumento respecto|\bvs\b/,
  },
  { intent: 'budget_status', pattern: /presupuesto/ },
  {
    intent: 'spending_review',
    pattern:
      /deberia revisar|que revisar|reducir (mis )?gasto|recortar|donde recortar|gasto(s)? no esencial|gastos hormiga|gastar menos|ahorrar mas/,
  },
  {
    intent: 'cashflow_analysis',
    pattern:
      /flujo de caja|mas de lo que (ingreso|gano|recibo|entra)|me alcanza|gastando de mas|numeros rojos|deficit|en rojo/,
  },
  {
    intent: 'spending_by_category',
    pattern:
      /en que gaste|en que estoy gastando|categoria|mayor gasto|gasto principal|se me va (el|la plata|el dinero)|que gaste mas|donde gaste/,
  },
  {
    intent: 'period_summary',
    pattern:
      /cuanto gaste|cuanto ingrese|cuanto llevo|como voy|como me fue|resumen|mis gastos|mis ingresos|\bbalance\b|ahorro neto|tasa de ahorro|\bsaldo\b|cuanto ahorre/,
  },
]

const CURRENCY_HINTS: readonly { code: string; pattern: RegExp }[] = [
  { code: 'COP', pattern: /\bcop\b|pesos colombianos|peso colombiano/ },
  { code: 'USD', pattern: /\busd\b|dolares|dolar estadounidense/ },
  { code: 'ARS', pattern: /\bars\b|pesos argentinos|peso argentino/ },
]

/**
 * Moneda que la pregunta menciona explícitamente, o `null`.
 *
 * "Pesos" a secas no cuenta: en FinTrack puede ser COP o ARS, y adivinar sería
 * justo lo que las reglas de moneda prohíben. Si la frase nombra más de una
 * moneda tampoco se elige ninguna: quien pregunta por dos monedas a la vez
 * necesita una aclaración, no que el backend se quede con la primera.
 */
export function detectCurrencyHint(message: string): string | null {
  const normalized = normalizeMessage(message)
  const matches = CURRENCY_HINTS.filter((hint) => hint.pattern.test(normalized))

  return matches.length === 1 ? matches[0].code : null
}

/**
 * Decide si una pregunta entra en el alcance de v1 y con qué intención.
 *
 * Nunca lanza: un mensaje vacío o ilegible sale como fuera de alcance, no como
 * error. La validación de longitud y forma es responsabilidad de quien recibe
 * la solicitud.
 */
export function classifyMessage(message: string): ScopeDecision {
  const normalized = normalizeMessage(message)

  if (normalized === '') return { kind: 'out_of_scope', reason: 'off_topic' }

  for (const rule of BLOCKED) {
    if (rule.pattern.test(normalized)) return { kind: 'out_of_scope', reason: rule.reason }
  }

  for (const rule of UNSUPPORTED) {
    if (rule.pattern.test(normalized)) return { kind: 'unsupported', feature: rule.feature }
  }

  for (const rule of ALLOWED) {
    if (rule.pattern.test(normalized) && (rule.and === undefined || rule.and.test(normalized))) {
      return { kind: 'allowed', intent: rule.intent, currencyHint: detectCurrencyHint(message) }
    }
  }

  return { kind: 'out_of_scope', reason: 'off_topic' }
}
