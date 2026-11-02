/** The `skillInventory` Remote reads the view of a new chat, names each skill's origin, and loads one exact skill's body. */

import { Context } from '@deepseek-ai/cordis'
import { createScope, scopeOf, type ScopeKey } from '@deepseek-ai/dsh-scope'
import SkillRegistry, { type SkillCandidate, type SkillFault, type SkillLookupOptions, type SkillProvider } from '@deepseek-ai/dsh-skill'
import { remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import SkillInventoryService, { skillOrigin } from '../src/index.ts'

type Seen = SkillProvider & { seen: SkillLookupOptions[] }

function provider(name: string, skills: Array<{ skill: string; source: string; rank: number }>, faults: SkillFault[] = []): Seen {
  const seen: SkillLookupOptions[] = []
  return {
    name,
    seen,
    list: (options) => {
      seen.push(options)
      return Promise.resolve({
        candidates: skills.map(({ skill, source, rank }): SkillCandidate => ({
          name: skill,
          description: `${skill} from ${name}`,
          invocation: { modelInvocable: true, userInvocable: skill !== 'background' },
          provider: name,
          source,
          rank,
          locator: `# ${skill} by ${name}`,
          ...skill === 'background' ? { whenToUse: 'At the start of a matter.' } : { path: `/${name}/${skill}/SKILL.md` },
        })),
        complete: true,
        faults,
      })
    },
    get: candidate => Promise.resolve({ ...candidate, content: candidate.locator as string }),
  }
}

async function mount(options: { presets?: boolean } = {}) {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(SkillRegistry)
  ctx.provide('workingDirectory', { defaultDirectory: '/work' } as never)
  const released = vi.fn()
  const acquireScope = vi.fn()
  if (options.presets === true) {
    const preset = createScope(ctx, { preset: 'patent' })
    onTestFinished(() => preset.dispose())
    const key: ScopeKey = scopeOf(preset.ctx)!
    acquireScope.mockImplementation(() => Promise.resolve({ key, [Symbol.asyncDispose]: () => { released(); return Promise.resolve() } }))
    ctx.provide('agentPresets', { acquireScope } as never)
    preset.ctx.get('skills')!.registerProvider(() => provider('preset-local', [{ skill: 'claims', source: 'project-dsh', rank: 900 }]))
  }
  await ctx.plugin(SkillInventoryService, SkillInventoryService.Config({ pluginNames: { flowleap: 'FlowLeap methods' } }))
  return { ctx, inventory: ctx.skillInventory, released, acquireScope }
}

describe('skillOrigin', () => {
  it('names user, project, and firm folders by their source and every other provider as a plugin', () => {
    const names = { flowleap: 'FlowLeap methods' }
    expect(skillOrigin('user-dsh', 'filesystem', names)).toEqual({ kind: 'mine' })
    expect(skillOrigin('user-agents', 'filesystem', names)).toEqual({ kind: 'mine' })
    expect(skillOrigin('project-dsh', 'filesystem', names)).toEqual({ kind: 'project' })
    expect(skillOrigin('project-agents', 'filesystem', names)).toEqual({ kind: 'project' })
    expect(skillOrigin('firm', 'firm-share', names)).toEqual({ kind: 'firm' })
    expect(skillOrigin('custom', 'flowleap', names)).toEqual({ kind: 'plugin', name: 'FlowLeap methods' })
    expect(skillOrigin('bundled', 'skill-office', names)).toEqual({ kind: 'plugin', name: 'skill-office' })
    expect(skillOrigin('custom', 'constructor', names)).toEqual({ kind: 'plugin', name: 'constructor' })
  })
})

describe('skillInventory Remote', () => {
  it('lists the default view with origins, the replace link, and faults', async () => {
    const { ctx, inventory } = await mount()
    const fault: SkillFault = { provider: 'flowleap', source: 'custom', path: '/pack/broken/SKILL.md', reason: { kind: 'missing-field', field: 'description' } }
    const pack = provider('flowleap', [{ skill: 'claims', source: 'custom', rank: 300 }, { skill: 'background', source: 'custom', rank: 300 }], [fault])
    ctx.skills.registerProvider(() => pack)
    ctx.skills.registerProvider(() => provider('filesystem', [{ skill: 'claims', source: 'user-dsh', rank: 100 }]))

    const value = await inventory.list(new AbortController().signal)
    expect(pack.seen[0]).toMatchObject({ cwd: '/work' })
    expect(value.complete).toBe(true)
    expect(value.faults).toEqual([{ path: '/pack/broken/SKILL.md', origin: { kind: 'plugin', name: 'FlowLeap methods' }, reason: { kind: 'missing-field', field: 'description' } }])
    expect(value.skills).toEqual([
      {
        name: 'background', provider: 'flowleap', source: 'custom', description: 'background from flowleap', whenToUse: 'At the start of a matter.',
        origin: { kind: 'plugin', name: 'FlowLeap methods' }, userInvocable: false, modelInvocable: true,
      },
      {
        name: 'claims', provider: 'filesystem', source: 'user-dsh', description: 'claims from filesystem', path: '/filesystem/claims/SKILL.md',
        origin: { kind: 'mine' }, userInvocable: true, modelInvocable: true,
      },
      {
        name: 'claims', provider: 'flowleap', source: 'custom', description: 'claims from flowleap', path: '/flowleap/claims/SKILL.md',
        origin: { kind: 'plugin', name: 'FlowLeap methods' }, userInvocable: true, modelInvocable: true,
        replacedBy: { provider: 'filesystem', source: 'user-dsh', origin: { kind: 'mine' } },
      },
    ])
  })

  it('reads a replaced skill body by its exact identity and reports a missing one as skill/not-found', async () => {
    const { ctx, inventory } = await mount()
    ctx.skills.registerProvider(() => provider('flowleap', [{ skill: 'claims', source: 'custom', rank: 300 }]))
    ctx.skills.registerProvider(() => provider('filesystem', [{ skill: 'claims', source: 'user-dsh', rank: 100 }]))
    const signal = new AbortController().signal

    await expect(inventory.read({ name: 'claims', provider: 'flowleap', source: 'custom' }, signal)).resolves.toEqual({ content: '# claims by flowleap' })
    await expect(inventory.read({ name: 'claims', provider: 'filesystem', source: 'user-dsh' }, signal)).resolves.toEqual({ content: '# claims by filesystem' })
    const missing = await inventory.read({ name: 'claims', provider: 'flowleap', source: 'user-dsh' }, signal).catch((error: unknown) => error)
    expect(remoteErrorOf(missing)).toMatchObject({ code: 'skill/not-found', details: { name: 'claims', provider: 'flowleap', source: 'user-dsh' } })
  })

  it('reads through the default agent preset scope and releases it', async () => {
    const { ctx, inventory, released, acquireScope } = await mount({ presets: true })
    ctx.skills.registerProvider(() => provider('flowleap', [{ skill: 'claims', source: 'custom', rank: 300 }]))
    const value = await inventory.list(new AbortController().signal)
    expect(acquireScope).toHaveBeenCalledWith(undefined)
    expect(value.skills.map(skill => [skill.provider, skill.origin.kind, skill.replacedBy?.origin.kind])).toEqual([
      ['preset-local', 'project', undefined],
      ['flowleap', 'plugin', 'project'],
    ])
    expect(released).toHaveBeenCalledTimes(1)
  })

  it('reports a failed discovery as gateway/internal', async () => {
    const { ctx, inventory } = await mount()
    ctx.skills.registerProvider(() => ({
      name: 'broken',
      list: () => Promise.resolve({ candidates: [], complete: true, faults: [{ provider: 'other', source: 'custom', path: '/x', reason: { kind: 'missing-frontmatter' } }] }),
      get: () => Promise.resolve(undefined),
    }))
    const failure = await inventory.list(new AbortController().signal).catch((error: unknown) => error)
    expect(remoteErrorOf(failure)).toMatchObject({ code: 'gateway/internal' })
  })
})
