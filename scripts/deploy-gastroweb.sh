#!/usr/bin/env bash
set -Eeuo pipefail
umask 022

readonly APP_ROOT="/opt/kiju-gastro"
readonly RELEASES_DIR="${APP_ROOT}/releases"
readonly DEPLOY_RECEIVER="/usr/local/sbin/kiju-gastroweb-deploy"
readonly WEB_SERVICE="kiju-gastro.service"
readonly API_SERVICE="gastroapi.service"
readonly WEB_HEALTH_URL="http://127.0.0.1:3011/gastro/"
readonly API_HEALTH_URL="http://127.0.0.1:4000/api/health"
readonly MAX_ARCHIVE_BYTES=536870912
readonly REQUIRED_PNPM="10.22.0"

on_error() {
  local status="$1"
  local line="$2"
  trap - ERR
  set +e

  echo "Deploy fehlgeschlagen in Zeile ${line} (Status ${status})." >&2
  if [[ "${switch_started}" == "1" ]]; then
    echo "Vorherige Release-Verknüpfungen werden wiederhergestellt." >&2
    atomic_symlink "${APP_ROOT}/api-current" "${old_api_target}" || true
    atomic_symlink "${APP_ROOT}/current" "${old_web_target}" || true
    systemctl restart "${API_SERVICE}" || true
    systemctl restart "${WEB_SERVICE}" || true
  fi
  journalctl -u "${API_SERVICE}" -n 40 --no-pager >&2 || true
  journalctl -u "${WEB_SERVICE}" -n 40 --no-pager >&2 || true
  exit "${status}"
}

atomic_symlink() {
  local link="$1"
  local target="$2"
  local temporary="${link}.next.$$"
  rm -f -- "${temporary}"
  ln -s -- "${target}" "${temporary}"
  mv -Tf -- "${temporary}" "${link}"
}

die() {
  echo "$*" >&2
  exit 1
}

original_command="${SSH_ORIGINAL_COMMAND:-}"
if [[ ! "${original_command}" =~ ^deploy[[:space:]]([0-9a-f]{40})$ ]]; then
  die "Nur ein bestätigter Deploy-Aufruf mit vollständiger Commit-ID ist erlaubt."
fi
revision="${BASH_REMATCH[1]}"

exec 9>/run/lock/kiju-gastroweb-deploy.lock
flock -n 9 || die "Ein Server-Deploy läuft bereits."

temporary_dir="$(mktemp -d /tmp/kiju-gastroweb-deploy.XXXXXX)"
archive_file="${temporary_dir}/source.tar.gz"
archive_list="${temporary_dir}/archive-files.txt"
release_dir=""
switch_started="0"
old_api_target=""
old_web_target=""
trap 'rm -rf -- "${temporary_dir}"' EXIT
trap 'on_error "$?" "$LINENO"' ERR

cat > "${archive_file}"
[[ -s "${archive_file}" ]] || die "Das Quellarchiv ist leer."
archive_bytes="$(stat -c '%s' "${archive_file}")"
(( archive_bytes <= MAX_ARCHIVE_BYTES )) || die "Das Quellarchiv überschreitet 512 MiB."

if ! tar -tzf "${archive_file}" > "${archive_list}"; then
  die "Das Quellarchiv ist ungültig."
fi
while IFS= read -r archive_path || [[ -n "${archive_path}" ]]; do
  case "${archive_path}" in
    /*|../*|*/../*|*/..|..)
      die "Das Quellarchiv enthält einen unzulässigen Pfad."
      ;;
  esac
done < "${archive_list}"

release_name="$(date -u +%Y%m%dT%H%M%S)-${revision:0:7}"
release_dir="${RELEASES_DIR}/${release_name}"
[[ ! -e "${release_dir}" ]] || release_dir="${release_dir}-$$"
install -d -o kiju-wawi -g kiju-wawi -m 0750 "${release_dir}"
chmod 0755 "${temporary_dir}"
chmod 0644 "${archive_file}"
runuser -u kiju-wawi -- tar --extract --gzip --file="${archive_file}" \
  --directory="${release_dir}" --no-same-owner --no-same-permissions
printf '%s\n' "${revision}" > "${release_dir}/REVISION"
chown kiju-wawi:kiju-wawi "${release_dir}/REVISION"

[[ -f "${release_dir}/package.json" ]] || die "package.json fehlt im Archiv."
[[ -f "${release_dir}/pnpm-lock.yaml" ]] || die "pnpm-lock.yaml fehlt im Archiv."
[[ -f "${release_dir}/scripts/deploy-gastroweb.sh" ]] || die "Das Deploy-Skript fehlt im Archiv."
[[ "$(pnpm --version)" == "${REQUIRED_PNPM}" ]] || die "Auf dem Server wird pnpm ${REQUIRED_PNPM} benötigt."
node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major < 20 || (major === 20 && minor < 9)) process.exit(1);' \
  || die "Auf dem Server wird Node.js 20.9 oder neuer benötigt."

echo "Baue Commit ${revision} in ${release_dir}."
runuser -u kiju-wawi -- env \
  HOME=/home/kiju-wawi \
  PATH="${PATH}" \
  NEXT_PUBLIC_BASE_PATH=/gastro \
  bash -c 'cd "$1" && pnpm install --frozen-lockfile && pnpm build' \
  _ "${release_dir}"

standalone_web_dir="${release_dir}/apps/web/.next/standalone/apps/web"
[[ -f "${standalone_web_dir}/server.js" ]] || die "Der eigenständige Webserver fehlt nach dem Build."
api_dist_dir="${release_dir}/apps/api/dist"
api_runtime_entry="${api_dist_dir}/main.js"
if [[ ! -f "${api_runtime_entry}" ]]; then
  echo "Nest hat keinen API-Starteinstieg im erwarteten Verzeichnis erzeugt; kompiliere die API direkt mit TypeScript."
  runuser -u kiju-wawi -- env \
    HOME=/home/kiju-wawi \
    PATH="${PATH}" \
    bash -c 'cd "$1/apps/api" && pnpm exec tsc --project tsconfig.json --incremental false' \
    _ "${release_dir}"
  api_entry="$(find "${api_dist_dir}" -type f -name 'main.js' -print -quit)"
  [[ -n "${api_entry}" ]] || die "Der API-Build fehlt."
  api_entry_relative="${api_entry#"${api_dist_dir}/"}"
  printf 'require("./%s");\n' "${api_entry_relative}" > "${api_runtime_entry}"
fi
chown kiju-wawi:kiju-wawi "${api_runtime_entry}"
chmod 0644 "${api_runtime_entry}"
[[ -d "${release_dir}/apps/web/.next/static" ]] || die "Next.js-Assets fehlen."
runuser -u kiju-wawi -- rm -rf "${standalone_web_dir}/.next/static"
runuser -u kiju-wawi -- install -d -m 0755 "${standalone_web_dir}/.next"
runuser -u kiju-wawi -- cp -a "${release_dir}/apps/web/.next/static" "${standalone_web_dir}/.next/static"
if [[ -d "${release_dir}/apps/web/public" ]]; then
  runuser -u kiju-wawi -- rm -rf "${standalone_web_dir}/public"
  runuser -u kiju-wawi -- cp -a "${release_dir}/apps/web/public" "${standalone_web_dir}/public"
fi

api_pid="$(systemctl show --property=MainPID --value "${API_SERVICE}")"
[[ "${api_pid}" =~ ^[1-9][0-9]*$ && -r "/proc/${api_pid}/environ" ]] \
  || die "Der laufende API-Prozess für die Datenbankmigration ist nicht erreichbar."
database_url="$(tr '\0' '\n' < "/proc/${api_pid}/environ" | sed -n 's/^DATABASE_URL=//p')"
[[ -n "${database_url}" ]] || die "DATABASE_URL fehlt in der API-Dienstumgebung."
echo "Wende ausstehende Datenbankmigrationen an."
runuser -u kiju-wawi -- env \
  HOME=/home/kiju-wawi \
  PATH="${PATH}" \
  DATABASE_URL="${database_url}" \
  bash -c 'cd "$1" && pnpm --filter @kiju/api prisma:migrate:deploy' \
  _ "${release_dir}"
unset database_url

[[ -L "${APP_ROOT}/api-current" ]] || die "Der API-Release-Link fehlt."
[[ -L "${APP_ROOT}/current" ]] || die "Der Web-Release-Link fehlt."
old_api_target="$(readlink "${APP_ROOT}/api-current")"
old_web_target="$(readlink "${APP_ROOT}/current")"

switch_started="1"
atomic_symlink "${APP_ROOT}/api-current" "${release_dir}"
atomic_symlink "${APP_ROOT}/current" "${release_dir}/apps/web"
systemctl restart "${API_SERVICE}"
systemctl restart "${WEB_SERVICE}"
systemctl is-active --quiet "${API_SERVICE}"
systemctl is-active --quiet "${WEB_SERVICE}"

wait_for_health() {
  local url="$1"
  local attempt
  for attempt in {1..30}; do
    if curl --fail --silent --show-error --max-time 4 "${url}" >/dev/null; then
      echo "Erreichbar: ${url}"
      return 0
    fi
    sleep 2
  done
  echo "Gesundheitsprüfung fehlgeschlagen: ${url}" >&2
  return 1
}

wait_for_health "${API_HEALTH_URL}"
wait_for_health "${WEB_HEALTH_URL}"
install -o root -g root -m 0755 "${release_dir}/scripts/deploy-gastroweb.sh" "${DEPLOY_RECEIVER}"
switch_started="0"
trap - ERR
echo "DEPLOY_COMPLETED ${revision} ${release_dir}"
