# FLOW iOS

O Windows **não** gera IPA assinado.

No Mac:

1. `cd mobile && npm ci && npm run sync`
2. Abra `ios/App/App.xcworkspace` no Xcode
3. Signing & Capabilities: Team Apple Developer, bundle `com.flow.mobile`
4. Product → Archive → Distribute App

O projeto nativo já está em `mobile/ios/`. Sem Mac, use o APK Android e o OTA `mobile-www.zip`.
