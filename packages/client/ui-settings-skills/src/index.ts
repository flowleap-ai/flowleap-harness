/**
 * Skills settings, Host half: the `skillInventory` Remote that lists every
 * skill of the default agent view with its origin, the files that are not
 * skills, and the body of one exact skill. The browser half owns the
 * settings section through `exports["./client"]`.
 * @module @deepseek-ai/dsh-client-ui-settings-skills
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type { SkillInventory, SkillSource, SkillViewOptions } from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-working-directory'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import z from '@deepseek-ai/schemastery'
import type { SkillInventoryRow, SkillInventoryValue, SkillOrigin, SkillRef, SkillTextValue } from './types.ts'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host owner of the `skillInventory` Remote namespace. */
    skillInventory: SkillInventoryService
  }
}

/** Skills settings configuration. */
export interface Config {
  /** Product name per skill provider name; a provider without an entry shows its own name. */
  pluginNames: Record<string, string>
}

/**
 * Map one skill source and provider to the origin the user sees. The source
 * names are fixed protocol values of the skill providers.
 * @param source - discovery source of the candidate.
 * @param provider - provider that produced the candidate.
 * @param pluginNames - product name per provider name.
 * @returns the origin.
 */
export function skillOrigin(source: SkillSource, provider: string, pluginNames: Readonly<Record<string, string>>): SkillOrigin {
  switch (source) {
    case 'user-dsh':
    case 'user-agents':
      return { kind: 'mine' }
    case 'project-dsh':
    case 'project-agents':
      return { kind: 'project' }
    case 'firm':
      return { kind: 'firm' }
    default:
      return { kind: 'plugin', name: (Object.hasOwn(pluginNames, provider) ? pluginNames[provider] : undefined) ?? provider }
  }
}

/** Serves the skills of the view a new chat gets: the default working directory and the default agent preset. */
export default class SkillInventoryService extends TypertRemoteService {
  static inject = ['skills', 'workingDirectory']

  static Config: z<Partial<Config>, Config> = z.object({
    pluginNames: z.dict(z.string()).default({}),
  })

  /**
   * @param ctx - Host context carrying the skill registry, the working directory, and optional agent presets.
   * @param config - provider product names.
   */
  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'skillInventory')
  }

  /**
   * List every skill of the default agent view, each replaced skill after its winner, and the files that are not skills.
   * @param signal - caller lifetime carried by the Remote transport.
   * @returns the rows with their origin.
   * @throws RemoteError `gateway/internal` when discovery fails.
   */
  @Remote
  async list(signal: AbortSignal): Promise<SkillInventoryValue> {
    let inventory: SkillInventory
    try {
      inventory = await this.withView(signal, options => this.ctx.skills.inspect(options))
    } catch (error: unknown) {
      throw new RemoteError('gateway/internal', `skill inventory failed: ${String(error)}`, {}, { cause: error })
    }
    const names = this.config.pluginNames
    return {
      skills: inventory.skills.map((skill): SkillInventoryRow => ({
        name: skill.name,
        provider: skill.provider,
        source: skill.source,
        description: skill.description,
        ...skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse },
        ...skill.path === undefined ? {} : { path: skill.path },
        origin: skillOrigin(skill.source, skill.provider, names),
        userInvocable: skill.invocation.userInvocable,
        modelInvocable: skill.invocation.modelInvocable,
        ...skill.replacedBy === undefined ? {} : {
          replacedBy: { ...skill.replacedBy, origin: skillOrigin(skill.replacedBy.source, skill.replacedBy.provider, names) },
        },
      })),
      faults: inventory.faults.map(fault => ({
        path: fault.path,
        origin: skillOrigin(fault.source, fault.provider, names),
        reason: fault.reason,
      })),
      complete: inventory.complete,
    }
  }

  /**
   * Load the body of one exact skill of the default agent view, a winner or a replaced one.
   * @param ref - name, provider, source, and path as `list()` reports them.
   * @param signal - caller lifetime carried by the Remote transport.
   * @returns the Markdown body.
   * @throws RemoteError `skill/not-found` when the view holds no such skill or its file is gone.
   */
  @Remote
  async read(ref: SkillRef, signal: AbortSignal): Promise<SkillTextValue> {
    const { name, provider, source, path } = ref
    const definition = await this.withView(signal, options => this.ctx.skills.read({ name, provider, source, path }, options))
    if (definition === undefined) {
      throw new RemoteError('skill/not-found', `skill "${name}" from ${provider} (${source}) not found`, { name, provider, source })
    }
    return { content: definition.content }
  }

  /** Run one read over the default working directory and the default agent preset's standing scope. */
  private async withView<T>(signal: AbortSignal, read: (options: SkillViewOptions) => Promise<T>): Promise<T> {
    const presets = this.ctx.get('agentPresets')
    await using lease = presets === undefined ? undefined : await presets.acquireScope(undefined)
    return await read({ cwd: this.ctx.workingDirectory.defaultDirectory, scope: lease?.key, signal })
  }
}
