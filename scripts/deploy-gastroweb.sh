#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="/root/Gastro_Kiju/Gastro_Kiju/Gastro_Kiju"
SERVICE_NAME="gastroweb"
APP_PORT="3000"
REQUIRED_NODE_MIN="20.9.0"
REQUIRED_PNPM="10.22.0"

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

run systemctl restart "${SERVICE_NAME}"

run systemctl status "${SERVICE_NAME}" --no-pager

echo
echo "==> Checking port ${APP_PORT}"
ss -tulpen | grep "${APP_PORT}"

run systemctl status nginx --no-pager

echo
echo "Deploy finished successfully."
