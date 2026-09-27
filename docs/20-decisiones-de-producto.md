# Decisiones de producto: automatización y datos

## FinTrack no crea movimientos reales por su cuenta

Ningún proceso de FinTrack inserta en `transactions` sin una acción explícita
del usuario sobre ese movimiento concreto.

| Funcionalidad  | Qué crea                         | Quién registra el movimiento |
| -------------- | -------------------------------- | ---------------------------- |
| Importador CSV | Borradores en una hoja nueva     | El usuario, desde Hojas      |
| Recurrentes    | Borradores al pulsar «Proyectar» | El usuario, desde Hojas      |
| FinTrack Coach | Nada: es de solo lectura         | —                            |

Motivo: un movimiento equivocado corrompe saldos, presupuestos y el Plan sin
que el usuario lo note. Un borrador de más se ve y se borra.

Consecuencias:

- Sin CRON ni funciones programadas que escriban datos financieros.
- La proyección recurrente es idempotente por plantilla y mes, y sobrevive a que
  el borrador se registre o se elimine.
- El importador marca posibles duplicados y posibles transferencias, pero la
  decisión final es del usuario.

## Transferencias fuera de los automatismos

Una transferencia son dos movimientos enlazados. Ni Hojas, ni el importador, ni
las plantillas recurrentes las crean: el importador deja las que lo parecen en
«requiere revisión» y las plantillas solo admiten ingreso y gasto.

## Monedas

Nada convierte divisas. La moneda de un borrador, de una plantilla o de una fila
importada es la de su cuenta, y el exponente de esa moneda fija la escala del
monto.

## Datos hacia terceros

- El CSV se lee en el navegador y no se guarda.
- El Coach solo envía agregados, con consentimiento explícito y vigente, y
  nunca descripciones de movimientos (`docs/16-coach-fase-4.md`).
- No se usa IA para categorizar movimientos importados.
