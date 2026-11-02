// @vitest-environment jsdom
/** The Skills section as the settings shell renders it: the states, one card per skill, the replace note, faults, and the full text. */

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { allowAllAccess, bindSnapshotSelector, contextMenuHook } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
// Type-only: the LocaleNamespaceMap merge that gives the section its `t` seat.
import type {} from '../src/client/index.ts'
import { SkillsSection, type SkillsSectionController, type SkillsSectionProps } from '../src/client/SkillsSection.tsx'
import { skillKey, type SkillsState } from '../src/client/skills-store.ts'
import { en } from '../src/client/locales.ts'
import type { SkillFaultRow, SkillInventoryRow, SkillInventoryValue } from '../src/types.ts'

afterEach(cleanup)

const t = ((key: keyof typeof en, params?: Record<string, string>) =>
  en[key].replace(/\{(\w+)\}/g, (_match, name: string) => params?.[name] ?? `{${name}}`)) as SkillsSectionProps['t']

const unusedHook = (() => { throw new Error('unused by the skills section') }) as never
const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource']
const kit = {
  useSessions: unusedHook, useSessionStatus: unusedHook, usePanelInfo: unusedHook, useSessionRetainInfo: () => undefined,
  useResource, useWorkspaces: unusedHook, ...allowAllAccess, useContextMenu: contextMenuHook(),
}

const mine = { kind: 'mine' } as const
const pack = { kind: 'plugin', name: 'FlowLeap methods' } as const

function row(overrides: Partial<SkillInventoryRow> & Pick<SkillInventoryRow, 'name'>): SkillInventoryRow {
  return {
    provider: 'flowleap', source: 'custom', description: `${overrides.name} description`, origin: pack,
    userInvocable: true, modelInvocable: true, ...overrides,
  }
}

const claimsMine = row({ name: 'claims', provider: 'filesystem', source: 'user-dsh', origin: mine })
const claimsPack = row({ name: 'claims', replacedBy: { provider: 'filesystem', source: 'user-dsh', origin: mine } })
const drafting = row({ name: 'drafting', userInvocable: false })
const project = row({ name: 'house-style', provider: 'filesystem', source: 'project-dsh', origin: { kind: 'project' }, modelInvocable: false })
const firm = row({ name: 'firm-rules', provider: 'firm-share', source: 'firm', origin: { kind: 'firm' } })

function ready(inventory: Partial<SkillInventoryValue>, texts: SkillsState['texts'] = {}): SkillsState {
  return { inventory: { status: 'ready', inventory: { skills: [], faults: [], complete: true, ...inventory } }, texts }
}

function renderSection(initial: SkillsState) {
  const store = createSnapshotStore(initial)
  const controller = {
    load: vi.fn(() => Promise.resolve()),
    readText: vi.fn(() => Promise.resolve()),
  } satisfies SkillsSectionController
  const props: SkillsSectionProps = { ...kit, close: vi.fn(), t, controller, useSkills: bindSnapshotSelector(store) }
  render(<SkillsSection {...props} />)
  return { controller, store }
}

function card(name: string, index = 0): HTMLElement {
  const cards = document.querySelectorAll<HTMLElement>(`[data-skill="${name}"]`)
  const found = cards[index]
  if (found === undefined) throw new Error(`no card ${name}[${index}]`)
  return found
}

describe('SkillsSection', () => {
  it('explains the word, loads on mount, and shows a centered loading state', () => {
    const { controller } = renderSection({ inventory: { status: 'loading' }, texts: {} })
    expect(controller.load).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('heading', { name: en.title })).toBeTruthy()
    expect(screen.getByText(en.intro)).toBeTruthy()
    expect(screen.getByRole('status', { name: en.loading })).toBeTruthy()
  })

  it('shows a failure with Retry that reads the inventory again', () => {
    const { controller } = renderSection({ inventory: { status: 'error' }, texts: {} })
    expect(screen.getByRole('alert').textContent).toBe(en.loadFailed)
    fireEvent.click(screen.getByRole('button', { name: en.retry }))
    expect(controller.load).toHaveBeenCalledTimes(2)
  })

  it('says the agent has no skills when the view is empty', () => {
    renderSection(ready({}))
    expect(screen.getByText(en.empty)).toBeTruthy()
    expect(screen.queryByRole('heading', { name: en.faultsTitle })).toBeNull()
  })

  it('shows one card per skill with its source, description, and replace notes on both sides', () => {
    renderSection(ready({ skills: [claimsMine, claimsPack, drafting, project, firm] }))
    const winner = card('claims', 0)
    expect(within(winner).getByText('Mine')).toBeTruthy()
    expect(within(winner).getByText('claims description')).toBeTruthy()
    expect(within(winner).getByText('Replaces the FlowLeap methods skill with the same name.')).toBeTruthy()
    const loser = card('claims', 1)
    expect(loser.hasAttribute('data-replaced')).toBe(true)
    expect(within(loser).getByText('FlowLeap methods')).toBeTruthy()
    expect(within(loser).getByText('Replaced by the Mine skill with the same name.')).toBeTruthy()
    expect(within(card('drafting')).getByText(en.agentOnly)).toBeTruthy()
    expect(within(card('house-style')).getByText('Project')).toBeTruthy()
    expect(within(card('house-style')).getByText(en.userOnly)).toBeTruthy()
    expect(within(card('firm-rules')).getByText('Firm')).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getAllByRole('button').map(button => button.textContent)).toEqual(Array(5).fill(en.showText))
  })

  it('warns that an incomplete view can miss skills', () => {
    renderSection(ready({ skills: [drafting], complete: false }))
    expect(screen.getByText(en.incomplete)).toBeTruthy()
  })

  it('reads the full text on request and shows it, then hides it', () => {
    const { controller, store } = renderSection(ready({ skills: [claimsMine, claimsPack] }))
    const loser = card('claims', 1)
    fireEvent.click(within(loser).getByRole('button', { name: en.showText }))
    expect(controller.readText).toHaveBeenCalledWith(claimsPack)
    expect(within(loser).getByRole('status', { name: en.textLoading })).toBeTruthy()
    act(() => { store.update((state) => { state.texts[skillKey(claimsPack)] = { status: 'ready', content: '# Pack claims\n\nRead the claims first.' } }) })
    expect(within(loser).getByRole('region', { name: 'Full text of claims' }).textContent).toContain('Read the claims first.')
    expect(within(card('claims', 0)).queryByRole('region')).toBeNull()
    fireEvent.click(within(loser).getByRole('button', { name: en.hideText }))
    expect(within(loser).queryByRole('region')).toBeNull()
    expect(controller.readText).toHaveBeenCalledTimes(1)
  })

  it('shows a failed or gone full text with Retry', () => {
    const { controller } = renderSection(ready({ skills: [claimsMine, drafting] }, {
      [skillKey(claimsMine)]: { status: 'error' },
      [skillKey(drafting)]: { status: 'gone' },
    }))
    fireEvent.click(within(card('claims')).getByRole('button', { name: en.showText }))
    expect(within(card('claims')).getByRole('alert').textContent).toContain(en.textFailed)
    fireEvent.click(within(card('drafting')).getByRole('button', { name: en.showText }))
    expect(within(card('drafting')).getByRole('alert').textContent).toContain(en.textGone)
    fireEvent.click(within(card('claims')).getByRole('button', { name: en.retry }))
    expect(controller.readText).toHaveBeenLastCalledWith(claimsMine)
  })

  it('lists files with faults with their path, source, and a localized reason per kind', () => {
    const at = (path: string, reason: SkillFaultRow['reason']): SkillFaultRow => ({ path, origin: pack, reason })
    renderSection(ready({
      skills: [drafting],
      faults: [
        at('/pack/a/SKILL.md', { kind: 'missing-frontmatter' }),
        at('/pack/b/SKILL.md', { kind: 'invalid-yaml', detail: 'bad indent' }),
        at('/pack/c/SKILL.md', { kind: 'missing-field', field: 'description' }),
        at('/pack/d/SKILL.md', { kind: 'invalid-name', name: 'Bad Name' }),
        at('/pack/e/SKILL.md', { kind: 'invalid-invocation', detail: 'user-invocable' }),
        { path: '/home/me/.dsh/skills/f.md', origin: mine, reason: { kind: 'not-text', detail: 'binary' } },
      ],
    }))
    const group = screen.getByRole('region', { name: en.faultsTitle })
    const rows = within(group).getAllByRole('listitem')
    expect(rows.map(item => item.querySelector('p')?.textContent)).toEqual([
      en.faultMissingFrontmatter,
      en.faultInvalidYaml,
      'The frontmatter has no description field.',
      'The name "Bad Name" is not valid. Use lowercase letters, digits, and hyphens.',
      en.faultInvalidInvocation,
      en.faultNotText,
    ])
    expect(rows[0]!.textContent).toContain('SKILL.md')
    expect(within(rows[0]!).getByText('FlowLeap methods')).toBeTruthy()
    expect(within(rows[5]!).getByText('Mine')).toBeTruthy()
  })
})
