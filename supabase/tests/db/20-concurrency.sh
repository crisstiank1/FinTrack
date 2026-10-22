#!/usr/bin/env bash
# Concurrencia real: muchas sesiones de PostgreSQL a la vez, no un bucle.
# Lo invoca scripts/test-db.sh con DATABASE_URL ya definido.
set -euo pipefail

psql_q() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -qAtX "$@"; }

user='cccccccc-0000-4000-8000-000000000003'
claims="{\"sub\":\"$user\",\"role\":\"authenticated\"}"

psql_q <<SQL
insert into auth.users (id) values ('$user');
insert into public.accounts (id, user_id, name, type, currency_code)
values ('c9000000-0000-4000-8000-000000000003', '$user', 'Banco C', 'checking', 'COP');
insert into public.categories (id, user_id, name, type)
values ('c8000000-0000-4000-8000-000000000003', '$user', 'Arriendo C', 'expense');
insert into public.recurring_templates (user_id, type, amount_minor, account_id, category_id, description, day_of_month)
values ('$user', 'expense', 1000, 'c9000000-0000-4000-8000-000000000003', 'c8000000-0000-4000-8000-000000000003', 'Arriendo', 1),
       ('$user', 'expense', 2000, 'c9000000-0000-4000-8000-000000000003', 'c8000000-0000-4000-8000-000000000003', 'Internet', 15);
SQL

as_user() {
  psql_q -c "set role authenticated" -c "select set_config('request.jwt.claims', '$claims', false)" \
    -c "select pg_sleep(greatest(0, $barrier - extract(epoch from clock_timestamp())))" \
    -c "$1" | tail -1
}

# Barrera: todas las sesiones esperan hasta el mismo instante y disparan a la
# vez. Sin ella, los procesos arrancan escalonados y la carrera no ocurre.
new_barrier() { barrier=$(psql_q -c "select extract(epoch from clock_timestamp()) + 2"); }

# 1. Veinte proyecciones simultáneas del mismo mes: dos borradores, no cuarenta.
new_barrier
pids=()
for _ in $(seq 20); do
  as_user "select public.project_recurring_templates('2026-07')" > /dev/null &
  pids+=($!)
done
for pid in "${pids[@]}"; do wait "$pid"; done

drafts=$(psql_q -c "select count(*) from public.sheet_drafts where user_id = '$user' and generated_for_month = '2026-07'")
projections=$(psql_q -c "select count(*) from public.recurring_template_projections where user_id = '$user' and generated_for_month = '2026-07'")
sheets=$(psql_q -c "select count(*) from public.sheets where user_id = '$user' and name = 'Recurrentes 2026-07'")
if [[ "$drafts" != 2 || "$projections" != 2 || "$sheets" != 1 ]]; then
  echo "proyección concurrente: borradores=$drafts proyecciones=$projections hojas=$sheets" >&2
  exit 1
fi

# 2. Cuarenta consumos simultáneos de cuota con límite 15: exactamente 15.
out=$(mktemp -d)
new_barrier
pids=()
for i in $(seq 40); do
  as_user "select coalesce(public.consume_ai_quota(15)::text, 'NULL')" > "$out/$i" &
  pids+=($!)
done
for pid in "${pids[@]}"; do wait "$pid"; done

granted=$(grep -vc NULL "$out"/* | awk -F: '{s+=$2} END {print s}')
counter=$(psql_q -c "select coalesce(sum(message_count), 0) from public.ai_usage_counters where user_id = '$user'")
distinct=$(grep -hv NULL "$out"/* | sort -u | wc -l)
rm -rf "$out"
if [[ "$granted" != 15 || "$counter" != 15 || "$distinct" != 15 ]]; then
  echo "cuota concurrente: concedidas=$granted contador=$counter distintos=$distinct" >&2
  exit 1
fi
