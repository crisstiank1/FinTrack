#!/usr/bin/env bash
# Aplica todas las migraciones sobre una base PostgreSQL vacía y ejecuta las
# pruebas SQL de supabase/tests/db. Cada prueba lanza una excepción si falla.
#
# Uso: DATABASE_URL=postgres://user@host:port/db scripts/test-db.sh
#
# La base debe estar vacía: el script crea roles y esquemas. No lo ejecutes
# contra el proyecto remoto.
set -euo pipefail

: "${DATABASE_URL:?Define DATABASE_URL apuntando a una base PostgreSQL vacía}"

if [[ "$DATABASE_URL" == *supabase.co* ]]; then
  echo "Negado: DATABASE_URL apunta a un proyecto de Supabase." >&2
  exit 1
fi

root="$(cd "$(dirname "$0")/.." && pwd)"
psql_run() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -X "$@"; }

psql_run -f "$root/supabase/tests/db/00-supabase-stubs.sql"

for migration in "$root"/supabase/migrations/*.sql; do
  echo "migración: $(basename "$migration")"
  psql_run -f "$migration"
done

status=0
for test in "$root"/supabase/tests/db/[1-9]*.{sql,sh}; do
  [[ -e "$test" ]] || continue
  if [[ "$test" == *.sh ]]; then
    runner=(env DATABASE_URL="$DATABASE_URL" bash "$test")
  else
    runner=(psql_run -f "$test")
  fi
  if "${runner[@]}" > /dev/null; then
    echo "ok     $(basename "$test")"
  else
    echo "FALLO  $(basename "$test")"
    status=1
  fi
done

exit $status
