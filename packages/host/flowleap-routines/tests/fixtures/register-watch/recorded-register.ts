import { readFile } from 'node:fs/promises'
import { Service, type Context } from '@deepseek-ai/cordis'
import type { RegisterApplication, RegisterEntry, RegisterSource } from '@deepseek-ai/dsh-flowleap-connectors'

/** The register as `./register.json` in the working directory states it at each read: application to entries. */
export default class RecordedRegister extends Service implements RegisterSource {
  constructor(ctx: Context) {
    super(ctx, 'flowleapRegister')
  }

  async read(application: RegisterApplication): Promise<readonly RegisterEntry[]> {
    const register = JSON.parse(await readFile('register.json', 'utf8')) as Record<string, RegisterEntry[]>
    const entries = register[application]
    if (entries === undefined) throw new Error(`no recorded register for ${application}`)
    return entries
  }
}
