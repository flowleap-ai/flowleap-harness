import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { clientBundle } from '../tsdown.client.ts'

const require = createRequire(import.meta.url)

/** Keep the license notices of the bundled sheet and mail parsers in the published client artifact. */
function licenseBanner(): string {
  const xlsRoot = dirname(require.resolve('xlsx'))
  const xls = readdirSync(xlsRoot).filter(name => /^(LICENSE|NOTICE)(\.|$)/u.test(name)).sort()
    .map(name => readFileSync(join(xlsRoot, name), 'utf8')).join('\n')
  const mime = readFileSync(join(dirname(require.resolve('postal-mime/package.json')), 'LICENSE.txt'), 'utf8')
  return ['//! Bundled sheet and mail parser license notices', ...`${xls}\n${mime}`.trimEnd().split('\n').map(line => `// ${line}`)].join('\n')
}

const banner = licenseBanner()

export default clientBundle(import.meta.dirname, ['lib/types/index.js'], { clientBanner: () => banner })
