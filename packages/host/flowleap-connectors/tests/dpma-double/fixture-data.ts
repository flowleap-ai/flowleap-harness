/**
 * The data set of the DPMA double before FlowLeap has a contract: the one register record that the library fixtures
 * hold, a recorded answer of the live service (DE 100 27 360, read with the leading file number 100273602).
 * @module
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { DpmaDoubleAccount, DpmaDoubleData } from './double.ts'

/** What the data is, printed at start so that nobody reads it as an answer of the DPMA to FlowLeap. */
export const SAMPLE_MARKER = 'DPMA double: recorded public register data, not a live DPMA answer'

/** The account of the double. The values are public and open nothing at the DPMA. */
export const DOUBLE_ACCOUNT: DpmaDoubleAccount = { username: 'flowleap-dpma-double', password: 'public-sample-data', hitLimit: 100 }

/**
 * Read one library fixture.
 * @param name - the file name under the library's `dpma/__fixtures__`.
 * @returns its text.
 */
function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../../../vendor/flowleap-connectors/src/dpma/__fixtures__/${name}`, import.meta.url)), 'utf8')
}

/**
 * The data set from the library fixtures.
 * @returns the one recorded register record and the recorded version text.
 */
export function fixtureData(): DpmaDoubleData {
  return {
    label: SAMPLE_MARKER,
    version: fixture('version.txt').trim(),
    records: [{ leadingRegisteredNumber: '100273602', xml: fixture('patent_info.xml') }],
  }
}
