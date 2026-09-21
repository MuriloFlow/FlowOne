# FLOW Mobile

Aplicativo instalável (**Android + iOS**) da Central de Gestão FLOW. Não é um site: o WebView roda dentro de um shell nativo Capacitor.

| Plataforma | Arquivo | Onde gerar |
|---|---|---|
| Android | `FLOW-<versão>.apk` | Windows/Mac com Android SDK (`npm run dist:mobile`) |
| iOS | `FLOW-<versão>.ipa` | **Somente Mac** + Xcode + Apple Developer (`./scripts/build-ios-ipa.sh`) |
| OTA (ambos) | `mobile-www.zip` + `latest-mobile.yml` | Push em `main` (GitHub Release) |

## Rodar

1. Copie `mobile/.env.example` para `mobile/.env` com **somente** chaves públicas:

```
VITE_SUPABASE_URL=https://sirupkygppdladkpzytc.supabase.co
VITE_SUPABASE_ANON_KEY=
VITE_FLOW_OPS_URL=https://sirupkygppdladkpzytc.supabase.co/functions/v1/flow-ops
```

Nunca coloque `SUPABASE_SERVICE_ROLE_KEY`, `CARDPLUS_*` ou `OPENAI_*` aqui.

2. Backend: publique a Edge Function `flow-ops` e rode o SQL necessário no FLOW.

3. No diretório `mobile`:

```bash
npm install
npm start
```

4. App nativo:

```bash
npm run sync
npx cap open android   # Android Studio
npx cap open ios       # Xcode (Mac)
```

## Android (APK)

Na raiz do repositório:

```bash
npm run dist:mobile
```

Saída em `download/FLOW-<versão>.apk` se o Android SDK + JDK estiverem instalados.

## iOS (IPA)

O equivalente do APK no iPhone é o **`.ipa`**. A Apple **não permite** gerar IPA assinado no Windows.

### No Mac (recomendado)

```bash
cd mobile
npm ci
chmod +x scripts/build-ios-ipa.sh
./scripts/build-ios-ipa.sh app-store   # TestFlight
# ou: ./scripts/build-ios-ipa.sh ad-hoc
```

O IPA sai em `download/FLOW-<versão>.ipa`.

Pacote pronto para enviar a um Mac: `download/FLOW-<versão>-iOS.zip` + `download/FLOW-iOS-LEIA-ME.txt`  
(gerados por `node scripts/package-ios.mjs` ou `npm run dist:mobile`).

### Bundle

- **Bundle ID:** `com.flow.mobile`
- **Nome:** FLOW
- **iOS mínimo:** 15.0

## Atualização silenciosa (Android e iOS)

Não existe o modal “atualização disponível?” do launcher desktop.

- Cada push em `main` publica `mobile-www.zip` + `latest-mobile.yml` no GitHub Release.
- No cold start, o app aplica o bundle baixado na sessão anterior.
- Em seguida consulta o manifesto; se houver versão nova, baixa para o **próximo** restart.
- Plugin: `@capgo/capacitor-updater` (`autoUpdate: false`).
- Mudança de plugin/SDK nativo ainda exige **APK ou IPA novo**.
