import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pngToIco from 'png-to-ico'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(root, 'icons/icon.png')
const output = resolve(root, 'build/icon.ico')

mkdirSync(resolve(root, 'build'), { recursive: true })

const buffer = await pngToIco(source)
writeFileSync(output, buffer)
console.log('Wrote', output, buffer.length, 'bytes')
