#!/bin/bash
# Uninstalls M535 Remap: apps, configuration, logs, preferences, login item and permissions.
# The project's source code is never touched. The signing certificate is only removed with --remove-cert.
#
# usage: scripts/uninstall.sh [--yes] [--dry-run] [--remove-cert] [--keep-ui] [--ui-app PATH] [--wait-pid PID]
#   --yes          don't ask for confirmation
#   --dry-run      only show what would be done
#   --remove-cert  also remove the "M535Remap Local Signing" certificate from the Keychain
#   --keep-ui      don't remove the settings app or its data
#   --ui-app       path of the settings app to remove (default: ~/Applications/M535 Remap.app)
#   --wait-pid     (used by the app itself) wait for this process to exit before removing the settings app
set -uo pipefail

YES=0; DRY=0; REMOVE_CERT=0; KEEP_UI=0; WAIT_PID=""
APPS="$HOME/Applications"
UI_APP="$APPS/M535 Remap.app"

while [ $# -gt 0 ]; do
  case "$1" in
    -y|--yes) YES=1 ;;
    --dry-run) DRY=1; YES=1 ;;
    --remove-cert) REMOVE_CERT=1 ;;
    --keep-ui) KEEP_UI=1 ;;
    --ui-app) UI_APP="$2"; shift ;;
    --wait-pid) WAIT_PID="$2"; shift ;;
    -h|--help) sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "opção desconhecida: $1 (use --help)"; exit 2 ;;
  esac
  shift
done

HELPER_ID="com.m535remap.helper"
UI_ID="com.m535remap.settings"
SUPPORT="$HOME/Library/Application Support/M535Remap"
UI_DATA="$HOME/Library/Application Support/M535 Remap"
LOGS="$HOME/Library/Logs/M535Remap"
PREFS="$HOME/Library/Preferences/$UI_ID.plist"
SOCK="$SUPPORT/helper.sock"
CERT="M535Remap Local Signing"

ok()   { echo "  ✓ $*"; }
warn() { echo "  ⚠︎ $*"; }
# Runs destructive commands (or only prints them with --dry-run).
act() { if [ $DRY -eq 1 ]; then echo "    [dry-run] $*"; else "$@"; fi; }
bundle_id() { /usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$1/Contents/Info.plist" 2>/dev/null; }

# Removes an .app only if the bundle id matches (never deletes another app with the same name).
remove_app() {
  local path="$1" id="$2" quiet="${3:-}"
  [ -d "$path" ] || return 0
  if [ "$(bundle_id "$path")" = "$id" ]; then act rm -rf "$path" && ok "Removido: $path"
  elif [ -z "$quiet" ]; then warn "Ignorado (não é o M535 Remap): $path"; fi
}

if [ $YES -eq 0 ]; then
  echo "Isto vai remover do seu Mac:"
  echo "  • M535 Remap Helper.app$([ $KEEP_UI -eq 0 ] && echo " e M535 Remap.app") em ~/Applications"
  echo "  • Configuração, logs e preferências (~/Library/…/M535Remap, M535 Remap)"
  echo "  • Item de login e permissões de Monitoramento de Entrada / Acessibilidade"
  [ $REMOVE_CERT -eq 1 ] && echo "  • Certificado \"$CERT\" do Keychain"
  echo "O código do projeto não é afetado."
  read -r -p "Continuar? [s/N] " r
  [[ "$r" =~ ^[sSyY]$ ]] || { echo "Cancelado."; exit 0; }
fi

echo "→ Desativando \"Iniciar com o macOS\""
if [ -S "$SOCK" ]; then
  { [ $DRY -eq 1 ] && echo "    [dry-run] IPC setLaunchAtLogin false"; } || \
  printf '{"id":1,"method":"setLaunchAtLogin","params":{"enabled":false}}\n' | nc -U -w 1 "$SOCK" >/dev/null 2>&1 \
    && ok "Item de login removido" || warn "Helper não respondeu (o item some junto com o app)"
else
  ok "Helper não está rodando"
fi

echo "→ Encerrando o helper (devolve o mouse ao padrão de fábrica)"
if pgrep -x M535Helper >/dev/null; then
  act pkill -TERM -x M535Helper
  [ $DRY -eq 1 ] || for _ in $(seq 1 20); do pgrep -x M535Helper >/dev/null || break; sleep 0.25; done
  if [ $DRY -eq 0 ] && pgrep -x M535Helper >/dev/null; then
    pkill -KILL -x M535Helper
    warn "Encerrado à força — desligue e ligue o mouse para restaurar os botões"
  else
    ok "Helper encerrado e mouse restaurado"
  fi
else
  ok "Helper já estava encerrado"
fi

if [ $KEEP_UI -eq 0 ] && [ -z "$WAIT_PID" ]; then
  act osascript -e "tell application id \"$UI_ID\" to quit" >/dev/null 2>&1 || true
fi

echo "→ Removendo permissões"
for svc in ListenEvent Accessibility; do
  act tccutil reset "$svc" "$HELPER_ID" >/dev/null 2>&1 && ok "$svc" \
    || warn "$svc: remova manualmente em Ajustes → Privacidade e Segurança"
done

echo "→ Removendo apps"
remove_app "$APPS/M535 Remap Helper.app" "$HELPER_ID"
remove_app "$APPS/M535 Remap.app" "$HELPER_ID" quiet   # old installs used this name for the helper

echo "→ Removendo configuração e logs"
act rm -rf "$SUPPORT" "$LOGS" && ok "Configuração e logs removidos"

if [ $REMOVE_CERT -eq 1 ]; then
  echo "→ Removendo certificado \"$CERT\""
  if security find-certificate -c "$CERT" >/dev/null 2>&1; then
    if [ $DRY -eq 1 ]; then
      echo "    [dry-run] security remove-trusted-cert + delete-identity \"$CERT\""
    else
      TMP=$(mktemp)
      security find-certificate -c "$CERT" -p > "$TMP"
      security remove-trusted-cert "$TMP" >/dev/null 2>&1 || true   # may ask for the password
      rm -f "$TMP"
      security delete-identity -c "$CERT" >/dev/null 2>&1 || security delete-certificate -c "$CERT" >/dev/null 2>&1
    fi
    ok "Certificado removido"
  else
    ok "Certificado não encontrado"
  fi
fi

remove_ui() {
  remove_app "$UI_APP" "$UI_ID"
  remove_app "$APPS/M535 Remap Settings.app" "$UI_ID"   # old name
  act rm -rf "$UI_DATA"
  act defaults delete "$UI_ID" >/dev/null 2>&1 || true
  act rm -f "$PREFS"
  ok "Dados do app de configuração removidos"
}

if [ $KEEP_UI -eq 0 ]; then
  echo "→ Removendo o app de configuração"
  if [ -n "$WAIT_PID" ]; then
    for _ in $(seq 1 120); do kill -0 "$WAIT_PID" 2>/dev/null || break; sleep 0.25; done
  fi
  remove_ui
fi

[ $DRY -eq 1 ] && echo "✓ Simulação concluída — nada foi alterado." || echo "✓ M535 Remap desinstalado."
