import { describe, expect, it } from 'vitest'
import { lintedFiles, pushedCommits } from './lint-pushed.ts'

describe('pushed-file type-aware lint', () => {
  it('reads the local commit of each pushed ref and skips deleted refs', () => {
    expect(pushedCommits([
      `refs/heads/feature ${'a'.repeat(40)} refs/heads/feature ${'0'.repeat(40)}`,
      `(delete) ${'0'.repeat(40)} refs/heads/old ${'b'.repeat(40)}`,
      '',
    ].join('\n'))).toEqual(['a'.repeat(40)])
  })

  it('lints only TypeScript files that still exist, once each', () => {
    const present = new Set(['src/a.ts', 'src/b.tsx'])
    expect(lintedFiles(['src/b.tsx', 'src/a.ts', 'src/a.ts', 'README.md', 'src/gone.ts'], path => present.has(path)))
      .toEqual(['src/a.ts', 'src/b.tsx'])
  })
})
