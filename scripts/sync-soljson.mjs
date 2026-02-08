import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDir, '..')
const source = resolve(projectRoot, 'node_modules', 'solc', 'soljson.js')
const targetDir = resolve(projectRoot, 'public', 'solc')
const target = resolve(targetDir, 'soljson.js')

await mkdir(targetDir, { recursive: true })
await copyFile(source, target)

console.log(`Synced ${source} -> ${target}`)
