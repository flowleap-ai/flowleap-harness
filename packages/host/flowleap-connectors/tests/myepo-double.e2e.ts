import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

const driver = fileURLToPath(new URL('./fixtures/myepo-double/driver.ts', import.meta.url))
const repoTsconfig = fileURLToPath(new URL('../../../../tsconfig.json', import.meta.url))

describe('the MyEPO double in the headless profile', () => {
  it('links flowleapMyEpo to the seed firm through the shipped overlay and serves each of its ten reads', async () => {
    let outcome: Record<string, unknown> = {}
    await runLoaderSmoke({
      label: 'MyEPO double headless smoke',
      tempDirPrefix: 'myepo-double-e2e-',
      binScript: driver,
      libBinScript: driver,
      configPath: fileURLToPath(new URL('./fixtures/myepo-link/myepo-link.patch.yml', import.meta.url)),
      tsconfigPath: repoTsconfig,
      inspect: async (cwd) => {
        outcome = JSON.parse(await readFile(join(cwd, 'outcome.json'), 'utf8')) as Record<string, unknown>
      },
    })

    expect(outcome).toMatchObject({
      linked: { kind: 'passed', mailbox: true },
      portfolios: [
        'Wago Verwaltungsgesellschaft mbH (public sample data, not a live MyEPO account)',
        'PHOENIX CONTACT GmbH & Co. KG (public sample data, not a live MyEPO account)',
        'Renishaw plc (public sample data, not a live MyEPO account)',
      ],
      biblio: { number: '23771920', titles: { EN: 'APPARATUS AND METHOD FOR POSITION ENCODING' }, applicants: ['Renishaw plc'] },
      communications: 17,
      unhandled: ['EP21810318.2 2317A', 'EP23771920.8 2004C', 'EP24166597.5 2001A', 'EP23755468.8 2001A'],
      folders: ['Inbox', 'Done'],
      download: { filename: 'SF-2023-0045-2026.09.29-EP23771920-2004C.pdf', head: '%PDF-' },
      readAfter: true,
      dueDates: [{ termKey: 'DUE_TERM_21', dueDate: '2027-01-29', actor: 'applicant' }],
      terms: 82,
      fees: [{ feeCode: '007', amount: 1135, dueDate: '2027-01-29' }, { feeCode: '035', amount: 1050, dueDate: '2027-09-30' }],
      tested: { kind: 'passed', mailbox: true },
    })
    expect((outcome['tested'] as { portfolios: unknown[] }).portfolios).toHaveLength(3)
    expect((outcome['applications'] as string[]).sort()).toEqual([
      'EP20706232 SF-2020-0031', 'EP21755382 SF-2021-0011', 'EP21810318 SF-2026-0019', 'EP22213933 SF-2022-0024',
      'EP23755468 SF-2023-0042', 'EP23771920 SF-2023-0045', 'EP24166597 SF-2024-0007',
    ])
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
