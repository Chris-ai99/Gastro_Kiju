#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="/root/Gastro_Kiju/Gastro_Kiju/Gastro_Kiju"
SERVICE_NAME="gastroweb"
APP_PORT="3011"
REQUIRED_NODE_MIN="20.9.0"
REQUIRED_PNPM="10.22.0"
PERSISTENT_DATA_DIR="${KIJU_DATA_DIR:-/var/lib/gastroweb}"
PERSISTENT_STATE_FILE="${PERSISTENT_DATA_DIR}/kiju-shared-state.json"
PERSISTENT_PRINT_FILE="${PERSISTENT_DATA_DIR}/kiju-print-state.json"
SYSTEMD_OVERRIDE_DIR="/etc/systemd/system/${SERVICE_NAME}.service.d"
SYSTEMD_PERSISTENCE_OVERRIDE="${SYSTEMD_OVERRIDE_DIR}/persistence.conf"

on_error() {
  local line="$1"
  echo
  echo "Deploy failed near line ${line}."
  echo "Recent ${SERVICE_NAME} status and logs:"
  systemctl status "${SERVICE_NAME}" --no-pager || true
  journalctl -u "${SERVICE_NAME}" -n 80 --no-pager || true
}

trap 'on_error "$LINENO"' ERR

run() {
  echo
  echo "==> $*"
  "$@"
}

echo "Starting ${SERVICE_NAME} deploy in ${PROJECT_DIR}"

cd "${PROJECT_DIR}"

echo
echo "==> Preparing persistent data outside the application directory"
persistence_was_configured="0"
if [[ -f "${SYSTEMD_PERSISTENCE_OVERRIDE}" ]]; then
  persistence_was_configured="1"
fi

service_user="$(systemctl show "${SERVICE_NAME}" --property=User --value 2>/dev/null || true)"
service_group="$(systemctl show "${SERVICE_NAME}" --property=Group --value 2>/dev/null || true)"
service_user="${service_user:-root}"
service_group="${service_group:-$(id -gn "${service_user}")}"

run install -d -m 0750 "${PERSISTENT_DATA_DIR}"
run chown "${service_user}:${service_group}" "${PERSISTENT_DATA_DIR}"
run install -d -m 0755 "${SYSTEMD_OVERRIDE_DIR}"

printf '%s\n' \
  '[Service]' \
  "Environment=\"KIJU_DATA_DIR=${PERSISTENT_DATA_DIR}\"" \
  "Environment=\"KIJU_SHARED_STATE_FILE=${PERSISTENT_STATE_FILE}\"" \
  "Environment=\"KIJU_PRINT_STATE_FILE=${PERSISTENT_PRINT_FILE}\"" \
  > "${SYSTEMD_PERSISTENCE_OVERRIDE}"

service_was_active="0"
if systemctl is-active --quiet "${SERVICE_NAME}"; then
  service_was_active="1"
  run systemctl stop "${SERVICE_NAME}"
fi

if [[ "${persistence_was_configured}" == "0" && -f data/kiju-shared-state.json ]]; then
  run cp -a data/kiju-shared-state.json "${PERSISTENT_STATE_FILE}"
elif [[ ! -f "${PERSISTENT_STATE_FILE}" && -f data/kiju-shared-state.json ]]; then
  run cp -a data/kiju-shared-state.json "${PERSISTENT_STATE_FILE}"
fi

if [[ "${persistence_was_configured}" == "0" && -f data/kiju-print-state.json ]]; then
  run cp -a data/kiju-print-state.json "${PERSISTENT_PRINT_FILE}"
elif [[ ! -f "${PERSISTENT_PRINT_FILE}" && -f data/kiju-print-state.json ]]; then
  run cp -a data/kiju-print-state.json "${PERSISTENT_PRINT_FILE}"
fi

run chown -R "${service_user}:${service_group}" "${PERSISTENT_DATA_DIR}"
if [[ -f "${PERSISTENT_STATE_FILE}" ]]; then
  run chmod 0600 "${PERSISTENT_STATE_FILE}"
fi
if [[ -f "${PERSISTENT_PRINT_FILE}" ]]; then
  run chmod 0600 "${PERSISTENT_PRINT_FILE}"
fi
run systemctl daemon-reload

if [[ "$(git diff --name-only -- data/kiju-shared-state.json)" == "data/kiju-shared-state.json" ]]; then
  echo
  echo "==> Restoring the tracked seed after migrating the live state"
  git restore -- data/kiju-shared-state.json
fi

if [[ "${service_was_active}" == "1" ]]; then
  run systemctl start "${SERVICE_NAME}"
fi

for generated_file in apps/web/next-env.d.ts apps/web/tsconfig.tsbuildinfo; do
  if [[ "$(git diff --name-only -- "${generated_file}")" == "${generated_file}" ]]; then
    echo
    echo "==> Resetting generated file ${generated_file}"
    git restore -- "${generated_file}"
  fi
done

if ! git diff --quiet --exit-code || ! git diff --cached --quiet --exit-code; then
  echo "Tracked local changes exist on the server. Refusing to deploy without manual review."
  git status --short
  exit 1
fi

echo
echo "==> Checking Node.js and pnpm"
node -e "
const min = '${REQUIRED_NODE_MIN}'.split('.').map(Number);
const actual = process.versions.node.split('.').map(Number);
const ok = actual[0] > min[0] ||
  (actual[0] === min[0] && (actual[1] > min[1] ||
  (actual[1] === min[1] && actual[2] >= min[2])));
if (!ok) {
  console.error('Node.js ' + process.versions.node + ' is too old. Need >= ${REQUIRED_NODE_MIN}.');
  process.exit(1);
}
console.log('Node.js ' + process.versions.node + ' OK (need >= ${REQUIRED_NODE_MIN})');
"

actual_pnpm="$(pnpm --version)"
if [[ "${actual_pnpm}" != "${REQUIRED_PNPM}" ]]; then
  echo "Warning: repo pins pnpm ${REQUIRED_PNPM}, server has pnpm ${actual_pnpm}. Continuing with server pnpm."
else
  echo "pnpm ${actual_pnpm} OK"
fi

before_rev="$(git rev-parse HEAD)"

run git pull --ff-only

after_rev="$(git rev-parse HEAD)"
install_needed="0"

if [[ ! -d node_modules || ! -f node_modules/.modules.yaml ]]; then
  install_needed="1"
elif [[ "${before_rev}" != "${after_rev}" ]] && git diff --name-only "${before_rev}" "${after_rev}" -- \
  package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc \
  "apps/*/package.json" "packages/*/package.json" | grep -q .; then
  install_needed="1"
fi

if [[ "${install_needed}" == "1" ]]; then
  run pnpm install --frozen-lockfile
else
  echo
  echo "==> Dependency files unchanged and node_modules exists; skipping pnpm install"
fi

run pnpm build

for generated_file in apps/web/next-env.d.ts apps/web/tsconfig.tsbuildinfo; do
  if [[ "$(git diff --name-only -- "${generated_file}")" == "${generated_file}" ]]; then
    echo
    echo "==> Resetting generated file ${generated_file} after build"
    git restore -- "${generated_file}"
  fi
done

echo
echo "==> Copying Next.js static assets into standalone runtime"
standalone_web_dir="apps/web/.next/standalone/apps/web"
rm -rf "${standalone_web_dir}/.next/static"
mkdir -p "${standalone_web_dir}/.next"
cp -a apps/web/.next/static "${standalone_web_dir}/.next/static"

if [[ -d apps/web/public ]]; then
  rm -rf "${standalone_web_dir}/public"
  cp -a apps/web/public "${standalone_web_dir}/public"
fi

run systemctl restart "${SERVICE_NAME}"

run systemctl status "${SERVICE_NAME}" --no-pager

echo
echo "==> Checking port ${APP_PORT}"
for attempt in {1..20}; do
  if ss -tulpen | grep "${APP_PORT}"; then
    break
  fi

  if [[ "${attempt}" == "20" ]]; then
    echo "Port ${APP_PORT} did not open in time."
    exit 1
  fi

  sleep 1
done

if systemctl list-unit-files nginx.service >/dev/null 2>&1; then
  run systemctl status nginx --no-pager
else
  echo
  echo "==> nginx service not installed; skipping nginx status check"
fi

echo
echo "Deploy finished successfully."
