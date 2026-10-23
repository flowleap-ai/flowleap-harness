// Complete the production closure pnpm's legacy `deploy` leaves behind, the way
// scripts/executable-packaging.ts and scripts/build-exe-for-python-sdk-staging.ts
// do for the single-executable build, as one standalone module the Docker
// builder stage can run without tsx:
//
//   1. restore the direct dependencies the legacy hoister leaves beside the
//      source instead of inside the deployed closure;
//   2. replace every symlink under the deployed node_modules whose target lies
//      outside the closure (the `link:` overrides of vendor/cosmokit and
//      vendor/schemastery, for example) with a real copy, so the closure runs
//      once the source tree is gone.
//
//   node deploy/restore-legacy-hoists.mjs <deployed root> <source node_modules>
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, unlinkSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'

const [staging, source] = process.argv.slice(2)
if (staging === undefined || source === undefined) {
  console.error('usage: node deploy/restore-legacy-hoists.mjs <deployed root> <source node_modules>')
  process.exit(2)
}

/** Copy one package directory without its nested node_modules, following links. */
function copyPackage(from, to) {
  const nested = join(from, 'node_modules')
  cpSync(from, to, {
    recursive: true,
    dereference: true,
    filter: path => path !== nested && !path.startsWith(nested + sep),
  })
}

// ── 1. direct dependencies ──────────────────────────────────────────────────
const manifest = JSON.parse(readFileSync(join(staging, 'package.json'), 'utf8'))
const dependencies = Object.keys(manifest.dependencies ?? {}).sort()
const restored = []
for (const dependency of dependencies) {
  const destination = join(staging, 'node_modules', dependency)
  if (existsSync(destination)) continue
  const from = join(source, dependency)
  if (!existsSync(from)) {
    console.error(`restore-legacy-hoists: deployed dependency ${dependency} is absent from ${destination} and ${from}`)
    process.exit(1)
  }
  mkdirSync(dirname(destination), { recursive: true })
  copyPackage(from, destination)
  restored.push(dependency)
}
const missing = dependencies.filter(dependency => !existsSync(join(staging, 'node_modules', dependency)))
if (missing.length > 0) {
  console.error(`restore-legacy-hoists: dependencies remain missing: ${missing.join(', ')}`)
  process.exit(1)
}
console.log(`restore-legacy-hoists: ${restored.length === 0 ? 'no direct dependency to restore' : `restored ${restored.join(', ')}`}`)

// ── 2. links that leave the closure ─────────────────────────────────────────
const payload = realpathSync(staging)
const nodeModules = join(staging, 'node_modules')

/** Every symlink under a directory tree, without following links. */
function symlinksUnder(directory) {
  const links = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isSymbolicLink()) links.push(path)
    else if (entry.isDirectory()) links.push(...symlinksUnder(path))
  }
  return links
}

/** Whether a resolved path lies inside the deployed closure. */
function insideClosure(path) {
  return path === payload || path.startsWith(payload + sep)
}

/** The symlinks whose target is outside the closure or dangling. */
function linksLeavingClosure() {
  return symlinksUnder(nodeModules).filter((link) => {
    try {
      return !insideClosure(realpathSync(link))
    } catch {
      return true
    }
  })
}

let materialized = 0
let removed = 0
for (let pass = 0; pass < 5; pass++) {
  const outside = linksLeavingClosure()
  if (outside.length === 0) break
  for (const link of outside) {
    let target
    try {
      target = realpathSync(link)
    } catch {
      unlinkSync(link)
      removed++
      continue
    }
    if (link.split(sep).includes('.bin') || !lstatSync(target).isDirectory()) {
      // Executable shims and single-file links into the source tree are not part of the runtime.
      unlinkSync(link)
      removed++
      continue
    }
    unlinkSync(link)
    copyPackage(target, link)
    materialized++
  }
}
const stillOutside = linksLeavingClosure()
if (stillOutside.length > 0) {
  console.error(`restore-legacy-hoists: links still leave the closure: ${stillOutside.slice(0, 5).join(', ')}`)
  process.exit(1)
}
console.log(`restore-legacy-hoists: materialized ${materialized} package link(s) that left the closure, removed ${removed} shim or file link(s)`)
