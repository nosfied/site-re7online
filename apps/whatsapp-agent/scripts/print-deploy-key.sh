#!/usr/bin/env bash
set -euo pipefail

SSH_DIR="${HOME}/.ssh"
KEY_PATH="${SSH_DIR}/re7online_github_deploy"
PUB_PATH="${KEY_PATH}.pub"

mkdir -p "${SSH_DIR}"
chmod 700 "${SSH_DIR}"

if [[ ! -f "${KEY_PATH}" || ! -f "${PUB_PATH}" ]]; then
  ssh-keygen -t ed25519 -N "" -f "${KEY_PATH}" -C "re7online-github-deploy"
fi

KNOWN_HOSTS="${SSH_DIR}/known_hosts"
if ! ssh-keygen -F github.com -f "${KNOWN_HOSTS}" >/dev/null 2>&1; then
  ssh-keyscan -H github.com >> "${KNOWN_HOSTS}" 2>/dev/null
fi

chmod 600 "${KEY_PATH}"
chmod 644 "${PUB_PATH}"

echo "Public deploy key (adicione no GitHub -> Deploy keys):"
cat "${PUB_PATH}"
