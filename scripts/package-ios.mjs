import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const mobileDir = path.join(root, 'mobile')
const downloadDir = path.join(root, 'download')
const mobilePkg = JSON.parse(fs.readFileSync(path.join(mobileDir, 'package.json'), 'utf8'))
const version = String(mobilePkg.version || '1.0.0')

fs.mkdirSync(downloadDir, { recursive: true })

function run(command, cwd = root) {
  console.log(`$ ${command}`)
  execSync(command, { cwd, stdio: 'inherit', shell: true })
}

const guide = [
  'FLOW — aplicativo iOS',
  '======================',
  '',
  `Versão: ${version}`,
  'Bundle ID: com.flow.mobile',
  'Arquivo instalável no iPhone: FLOW-' + version + '.ipa  (equivalente do .apk no Android)',
  '',
  'IMPORTANTE (Apple)',
  '------------------',
  'A Apple não permite gerar um IPA assinado no Windows. É obrigatório um Mac com Xcode',
  'e uma conta Apple Developer (https://developer.apple.com — paga anualmente).',
  'Sem isso não dá para instalar o app em iPhones de usuários (regra da Apple, não do FLOW).',
  '',
  'O que já está pronto neste pacote',
  '---------------------------------',
  '- Projeto nativo Capacitor iOS (mesma base do Android)',
  '- Código web do app (src/renderer + src/shared)',
  '- Plugins: Filesystem, Share, Camera, Preferences, Capgo OTA updater, etc.',
  '- Script que gera o .ipa no Mac: mobile/scripts/build-ios-ipa.sh',
  '- OTA igual ao Android: mobile-www.zip + latest-mobile.yml no GitHub Release',
  '',
  'Como gerar o IPA no Mac (recomendado)',
  '-------------------------------------',
  '1. Descompacte FLOW-' + version + '-iOS.zip',
  '2. Copie mobile/.env.example → mobile/.env e preencha as chaves públicas (iguais ao Android).',
  '3. No Terminal:',
  '',
  '     chmod +x GERAR-IPA-NO-MAC.sh',
  '     ./GERAR-IPA-NO-MAC.sh app-store',
  '',
  '   Opções:  app-store (TestFlight)  |  ad-hoc (devices cadastrados)  |  development',
  '',
  '4. O arquivo sai em:',
  '',
  '     download/FLOW-' + version + '.ipa',
  '',
  '5. Distribuição:',
  '   - TestFlight / App Store Connect → envie o IPA (modo app-store) e convide usuários.',
  '   - Ad Hoc → cadastre UDIDs dos iPhones no Developer Portal e compartilhe o IPA.',
  '',
  'Pelo Xcode (alternativa visual)',
  '-------------------------------',
  '1. cd mobile && npm ci && npm run sync',
  '2. open ios/App/App.xcodeproj',
  '3. Signing & Capabilities → selecione seu Team Apple',
  '4. Product → Archive → Distribute App',
  '',
  'Atualizações OTA (igual Android)',
  '--------------------------------',
  'Depois que o IPA nativo estiver instalado, cada push em main publica mobile-www.zip.',
  'O app baixa e aplica sozinho no próximo restart — sem precisar de novo IPA,',
  'exceto quando mudar plugin/SDK nativo.',
  '',
  'Arquivos relacionados',
  '---------------------',
  `- FLOW-${version}-iOS.zip     → fonte iOS pronta para o Mac`,
  `- FLOW-${version}.apk         → Android (se gerado nesta máquina)`,
  `- mobile-www.zip              → bundle OTA web (Android + iOS)`,
  `- latest-mobile.yml           → manifesto OTA`,
  '',
  'Suporte bundle: com.flow.mobile',
  ''
].join('\n')

fs.writeFileSync(path.join(downloadDir, 'FLOW-iOS-LEIA-ME.txt'), guide, 'utf8')
fs.writeFileSync(path.join(downloadDir, 'IOS-README.txt'), guide, 'utf8')

const staging = path.join(downloadDir, `_ios-staging-${version}`)
const zipName = `FLOW-${version}-iOS.zip`
const zipPath = path.join(downloadDir, zipName)

fs.rmSync(staging, { recursive: true, force: true })
fs.rmSync(zipPath, { force: true })
fs.mkdirSync(staging, { recursive: true })

const copyList = [
  ['mobile/package.json', 'mobile/package.json'],
  ['mobile/package-lock.json', 'mobile/package-lock.json'],
  ['mobile/capacitor.config.ts', 'mobile/capacitor.config.ts'],
  ['mobile/vite.config.ts', 'mobile/vite.config.ts'],
  ['mobile/tsconfig.json', 'mobile/tsconfig.json'],
  ['mobile/.env.example', 'mobile/.env.example'],
  ['mobile/README.md', 'mobile/README.md'],
  ['mobile/ios', 'mobile/ios'],
  ['mobile/scripts', 'mobile/scripts'],
  ['src/renderer', 'src/renderer'],
  ['src/shared', 'src/shared']
]

function copyRecursive(src, dest) {
  const stat = fs.statSync(src)
  if (stat.isDirectory()) {
    const base = path.basename(src)
    const normalized = src.replace(/\\/g, '/')
    if (base === 'build' || base === 'DerivedData' || base === 'Pods' || base === '.DS_Store' || base === 'node_modules') {
      return
    }
    if (base === 'public' && normalized.includes('/ios/')) return
    fs.mkdirSync(dest, { recursive: true })
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry))
    }
    return
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
}

for (const [from, to] of copyList) {
  const src = path.join(root, from)
  if (!fs.existsSync(src)) {
    console.warn(`skip missing ${from}`)
    continue
  }
  copyRecursive(src, path.join(staging, to))
}

fs.writeFileSync(path.join(staging, 'FLOW-iOS-LEIA-ME.txt'), guide, 'utf8')
fs.writeFileSync(
  path.join(staging, 'GERAR-IPA-NO-MAC.sh'),
  [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'ROOT="$(cd "$(dirname "$0")" && pwd)"',
    'cd "$ROOT/mobile"',
    'if [[ ! -f .env ]]; then',
    '  echo "Crie mobile/.env a partir de .env.example (mesmas chaves do Android)."',
    '  exit 1',
    'fi',
    'chmod +x scripts/build-ios-ipa.sh',
    'npm ci',
    './scripts/build-ios-ipa.sh "${1:-app-store}"',
    'echo "Se o IPA foi gerado, copie de: $ROOT/download/"',
    ''
  ].join('\n'),
  'utf8'
)

// build-ios-ipa.sh escreve em repo/download — no ZIP o "repo" é a pasta descompactada
const buildScript = fs.readFileSync(path.join(mobileDir, 'scripts', 'build-ios-ipa.sh'), 'utf8')
fs.writeFileSync(path.join(staging, 'mobile', 'scripts', 'build-ios-ipa.sh'), buildScript, 'utf8')

if (process.platform === 'win32') {
  run(
    `powershell -NoProfile -Command "Compress-Archive -Path '${staging}\\*' -DestinationPath '${zipPath}' -Force"`
  )
} else {
  run(`cd "${staging}" && zip -r "${zipPath}" .`)
}

fs.rmSync(staging, { recursive: true, force: true })

const dist = path.join(mobileDir, 'dist')
if (fs.existsSync(dist)) {
  const wwwZip = path.join(downloadDir, 'mobile-www.zip')
  fs.rmSync(wwwZip, { force: true })
  if (process.platform === 'win32') {
    run(
      `powershell -NoProfile -Command "Compress-Archive -Path '${dist}\\*' -DestinationPath '${wwwZip}' -Force"`
    )
  } else {
    run(`cd "${dist}" && zip -r "${wwwZip}" .`)
  }
  if (fs.existsSync(wwwZip)) {
    const sha512 = createHash('sha512').update(fs.readFileSync(wwwZip)).digest('base64')
    fs.writeFileSync(
      path.join(downloadDir, 'latest-mobile.yml'),
      [
        `version: ${version}`,
        'path: mobile-www.zip',
        `sha512: ${sha512}`,
        `url: https://github.com/MuriloFlow/FlowOne/releases/latest/download/mobile-www.zip`,
        `releaseDate: ${new Date().toISOString()}`,
        ''
      ].join('\n'),
      'utf8'
    )
  }
}

console.log(`iOS package -> download/${zipName}`)
console.log('Guide -> download/FLOW-iOS-LEIA-ME.txt')
