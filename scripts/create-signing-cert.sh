#!/bin/bash
# Creates (once) a self-signed code signing certificate in the login Keychain.
# With a stable signature, macOS keeps the permissions (Accessibility / Input Monitoring)
# across rebuilds — the default ad-hoc signature makes TCC revoke them on every build.
#
# macOS will ask for your password to trust the certificate for "Code Signing".
set -euo pipefail

NAME="M535Remap Local Signing"
KEYCHAIN="$HOME/Library/Keychains/login.keychain-db"
OPENSSL=/usr/bin/openssl   # system LibreSSL: produces a .p12 that `security` imports without extra flags

if security find-identity -v -p codesigning | grep -q "\"$NAME\""; then
  echo "✓ Certificado \"$NAME\" já existe e é válido para assinatura."
  exit 0
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

cat > "$TMP/cert.cnf" <<EOF
[req]
distinguished_name = dn
x509_extensions = ext
prompt = no
[dn]
CN = $NAME
[ext]
basicConstraints = critical, CA:false
keyUsage = critical, digitalSignature
extendedKeyUsage = critical, codeSigning
EOF

echo "→ Gerando chave e certificado (validade 10 anos)…"
$OPENSSL req -x509 -newkey rsa:2048 -nodes -days 3650 \
  -keyout "$TMP/key.pem" -out "$TMP/cert.pem" -config "$TMP/cert.cnf" 2>/dev/null
$OPENSSL pkcs12 -export -inkey "$TMP/key.pem" -in "$TMP/cert.pem" \
  -out "$TMP/cert.p12" -passout pass:m535 -name "$NAME"

echo "→ Importando no Keychain de login…"
security import "$TMP/cert.p12" -k "$KEYCHAIN" -P m535 -T /usr/bin/codesign -T /usr/bin/security

echo "→ Marcando como confiável para assinatura de código (o macOS vai pedir sua senha)…"
security add-trusted-cert -r trustRoot -p codeSign -k "$KEYCHAIN" "$TMP/cert.pem"

if security find-identity -v -p codesigning | grep -q "\"$NAME\""; then
  echo "✓ Pronto: \"$NAME\" disponível para o codesign."
  echo "  (No primeiro build o macOS pode perguntar se o codesign pode usar a chave — escolha \"Sempre Permitir\".)"
else
  echo "✗ O certificado foi importado mas não aparece como identidade válida. Veja: security find-identity -v -p codesigning"
  exit 1
fi
