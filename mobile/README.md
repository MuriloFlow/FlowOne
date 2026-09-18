# FLOW Mobile

Aplicativo instalável (Android + iOS) da Central de Gestão FLOW. Não é um site: o WebView roda dentro de um shell nativo Capacitor.

## Rodar

1. Copie `mobile/.env.example` para `mobile/.env` com **somente** chaves públicas:

```
VITE_SUPABASE_URL=https://sirupkygppdladkpzytc.supabase.co
VITE_SUPABASE_ANON_KEY=
VITE_FLOW_OPS_URL=https://sirupkygppdladkpzytc.supabase.co/functions/v1/flow-ops
```

Nunca coloque `SUPABASE_SERVICE_ROLE_KEY`, `CARDPLUS_*` ou `OPENAI_*` aqui.

2. Backend: publique a Edge Function `flow-ops` (veja `supabase/functions/flow-ops/README.md`) e rode o SQL `0015_flow_attendance_photos.sql` no FLOW.

3. No diretório `mobile`:

```bash
npm install
npm start
```

4. App nativo:

```bash
npx cap add android
npx cap add ios
npm run sync
npx cap open android
npx cap open ios
```

No Windows o Xcode não gera IPA assinado. Use um Mac + Apple Developer team. Veja `download/IOS-README.txt` depois de `npm run dist:mobile` na raiz.

## Atualização silenciosa

Não existe o modal “atualização disponível?” do launcher desktop.

- Cada push em `main` publica `mobile-www.zip` + `latest-mobile.yml` no GitHub Release.
- No **cold start**, o app aplica o bundle baixado na sessão anterior (já abre na versão nova).
- Em seguida, em segundo plano, consulta `https://github.com/MuriloFlow/FlowOne/releases/latest/download/latest-mobile.yml`. Se houver versão mais nova, baixa o zip para o **próximo** restart.
- Plugin nativo: `@capgo/capacitor-updater` (`autoUpdate: false`). Mudança de plugin/SDK ainda exige APK/IPA novo.

## APK local

Na raiz do repositório:

```bash
npm run dist:mobile
```

Saída em `download/FLOW-<versão>.apk` se o Android SDK + JDK 17 estiverem instalados (`ANDROID_HOME`). Sem SDK, o projeto `mobile/android` continua válido para abrir no Android Studio (`npx cap open android`). O workflow de release no Windows publica o OTA (`mobile-www.zip` + `latest-mobile.yml`) junto com o instalador desktop; APK não é gerado no runner atual.
