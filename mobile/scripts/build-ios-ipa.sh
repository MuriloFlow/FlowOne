#!/usr/bin/env bash
# Gera o IPA do FLOW no Mac (equivalente do APK no Android).
# Uso:
#   cd mobile
#   chmod +x scripts/build-ios-ipa.sh
#   ./scripts/build-ios-ipa.sh                 # Ad Hoc (dispositivos registrados)
#   ./scripts/build-ios-ipa.sh app-store       # TestFlight / App Store
#   ./scripts/build-ios-ipa.sh development     # Debug em aparelhos de desenvolvimento
#
# Requer: macOS + Xcode 15+ + conta Apple Developer + Team selecionável.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$ROOT/.." && pwd)"
DOWNLOAD="$REPO/download"
SCHEME="App"
WORKSPACE="$ROOT/ios/App/App.xcworkspace"
PROJECT="$ROOT/ios/App/App.xcodeproj"
ARCHIVE_PATH="$ROOT/ios/build/FLOW.xcarchive"
EXPORT_DIR="$ROOT/ios/build/export"
MODE="${1:-ad-hoc}"
VERSION="$(node -p "require('$ROOT/package.json').version")"

case "$MODE" in
  ad-hoc|adhoc) METHOD="ad-hoc"; PLIST_NAME="ExportOptions-AdHoc.plist" ;;
  app-store|appstore|testflight) METHOD="app-store"; PLIST_NAME="ExportOptions-AppStore.plist" ;;
  development|dev) METHOD="development"; PLIST_NAME="ExportOptions-Development.plist" ;;
  *)
    echo "Modo inválido: $MODE (use ad-hoc | app-store | development)"
    exit 1
    ;;
esac

EXPORT_PLIST="$ROOT/ios/$PLIST_NAME"
if [[ ! -f "$EXPORT_PLIST" ]]; then
  echo "Falta $EXPORT_PLIST"
  exit 1
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Este script só roda no macOS com Xcode."
  exit 1
fi

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "Instale o Xcode (App Store) e as Command Line Tools."
  exit 1
fi

cd "$ROOT"
if [[ ! -d node_modules ]]; then
  npm ci
fi
npm run build
npx cap sync ios

OPEN_TARGET="$PROJECT"
if [[ -d "$WORKSPACE" ]]; then
  OPEN_TARGET="$WORKSPACE"
fi

mkdir -p "$ROOT/ios/build" "$DOWNLOAD"
rm -rf "$ARCHIVE_PATH" "$EXPORT_DIR"

echo "==> Arquivando FLOW $VERSION ($METHOD)"
if [[ -d "$WORKSPACE" ]]; then
  xcodebuild \
    -workspace "$WORKSPACE" \
    -scheme "$SCHEME" \
    -configuration Release \
    -archivePath "$ARCHIVE_PATH" \
    -destination "generic/platform=iOS" \
    clean archive \
    CODE_SIGN_STYLE=Automatic
else
  xcodebuild \
    -project "$PROJECT" \
    -scheme "$SCHEME" \
    -configuration Release \
    -archivePath "$ARCHIVE_PATH" \
    -destination "generic/platform=iOS" \
    clean archive \
    CODE_SIGN_STYLE=Automatic
fi

echo "==> Exportando IPA"
xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_DIR" \
  -exportOptionsPlist "$EXPORT_PLIST"

IPA_SRC="$(find "$EXPORT_DIR" -maxdepth 1 -name '*.ipa' | head -n 1)"
if [[ -z "$IPA_SRC" ]]; then
  echo "IPA não encontrado em $EXPORT_DIR"
  exit 1
fi

DEST="$DOWNLOAD/FLOW-${VERSION}.ipa"
cp -f "$IPA_SRC" "$DEST"
echo ""
echo "IPA pronto: $DEST"
echo "Envie via TestFlight (app-store) ou instale em devices registrados (ad-hoc)."
echo "OTA web continua igual ao Android (mobile-www.zip / latest-mobile.yml)."
