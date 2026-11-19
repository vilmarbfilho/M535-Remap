#!/bin/bash
# Compila o helper, monta build/M535 Remap Helper.app e assina.
#   scripts/build-helper.sh            -> só build
#   scripts/build-helper.sh --install  -> build + instala em ~/Applications e (re)inicia
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
IDENTITY="M535Remap Local Signing"
APP="$ROOT/build/M535 Remap Helper.app"
INSTALL_DIR="$HOME/Applications"

echo "→ swift build (release, arm64)…"
cd "$ROOT/helper"
swift build -c release --arch arm64 2>&1 | grep -vE "search path .* not found" || true
BIN="$(swift build -c release --arch arm64 --show-bin-path)/M535Helper"
[ -x "$BIN" ] || { echo "✗ binário não encontrado: $BIN"; exit 1; }

echo "→ Montando $APP"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN" "$APP/Contents/MacOS/M535Helper"
cp "$ROOT/helper/Support/Info.plist" "$APP/Contents/Info.plist"
cp "$ROOT/helper/Support/AppIcon.icns" "$APP/Contents/Resources/AppIcon.icns"

if security find-identity -v -p codesigning | grep -q "\"$IDENTITY\""; then
  echo "→ Assinando com \"$IDENTITY\""
  codesign --force --sign "$IDENTITY" --timestamp=none "$APP"
else
  echo "⚠︎ Certificado \"$IDENTITY\" não encontrado — assinando ad-hoc."
  echo "  As permissões do macOS serão perdidas a cada rebuild. Rode scripts/create-signing-cert.sh."
  codesign --force --sign - "$APP"
fi
codesign --verify --strict "$APP" && echo "✓ Assinatura válida"

if [[ "${1:-}" == "--install" ]]; then
  echo "→ Instalando em $INSTALL_DIR"
  mkdir -p "$INSTALL_DIR"
  if pgrep -x M535Helper >/dev/null; then
    pkill -TERM -x M535Helper || true   # SIGTERM → o helper restaura o mouse antes de sair
    for _ in 1 2 3 4 5 6 7 8 9 10; do pgrep -x M535Helper >/dev/null || break; sleep 0.3; done
  fi
  # Migração: versões antigas instalavam o helper como "M535 Remap.app" (nome que agora é da interface).
  OLD="$INSTALL_DIR/M535 Remap.app"
  if [ -d "$OLD" ] && [ "$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$OLD/Contents/Info.plist" 2>/dev/null)" = "com.m535remap.helper" ]; then
    rm -rf "$OLD"
  fi
  rm -rf "$INSTALL_DIR/M535 Remap Helper.app"
  cp -R "$APP" "$INSTALL_DIR/"
  open "$INSTALL_DIR/M535 Remap Helper.app"
  echo "✓ M535 Remap Helper iniciado (ícone do mouse na barra de menus)"
fi
