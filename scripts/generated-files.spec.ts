import { describe, expect, it } from 'vitest'
import { generatorPairs, repositoryGeneratorPairs } from './generated-files.ts'

describe('generated file inventory', () => {
  it('pairs each generator with the check that runs it with --check', () => {
    expect(generatorPairs({
      'gen-doc-graphs': 'tsx scripts/gen-doc-graphs.ts',
      'verify-doc-graphs': 'tsx scripts/gen-doc-graphs.ts --check',
      'verify-md-links': 'tsx scripts/verify-md-links.ts',
    })).toEqual([{ name: 'doc-graphs', generate: 'gen-doc-graphs', check: 'verify-doc-graphs' }])
  })

  it('rejects a generator without a matching check and names the script to add', () => {
    expect(() => generatorPairs({ 'gen-new-catalog': 'tsx scripts/gen-new-catalog.ts' }))
      .toThrow('package.json script "gen-new-catalog" needs "verify-new-catalog": "tsx scripts/gen-new-catalog.ts --check"')
    expect(() => generatorPairs({
      'gen-new-catalog': 'tsx scripts/gen-new-catalog.ts',
      'verify-new-catalog': 'tsx scripts/gen-new-catalog.ts',
    })).toThrow('needs "verify-new-catalog"')
  })

  it('covers the generators whose stale output reached CI', () => {
    expect(repositoryGeneratorPairs().map(pair => pair.check)).toEqual(expect.arrayContaining([
      'verify-doc-graphs',
      'verify-module-graph',
      'verify-config-catalog',
      'verify-cordis-catalog',
    ]))
  })
})
