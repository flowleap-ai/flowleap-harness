/**
 * Client-safe vocabulary of the `skillInventory` Remote: the skills of the
 * default agent view with their origin, the files that are not skills, and
 * one skill body. Types only.
 * @module @deepseek-ai/dsh-client-ui-settings-skills/types
 */

import type { SkillFaultReason, SkillSource } from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-typert-protocol'

export type { SkillFaultReason } from '@deepseek-ai/dsh-skill'

/**
 * Where a skill comes from, as the user names it. Closed by `kind`: `firm`
 * for the firm's shared folder, `mine` for the user's own folders, `project`
 * for the working directory's folders, and `plugin` for any other provider.
 */
export type SkillOrigin =
  | { readonly kind: 'firm' }
  | { readonly kind: 'mine' }
  | { readonly kind: 'project' }
  | {
    readonly kind: 'plugin'
    /** Product name of the plugin, or the provider name when the row maps none. */
    readonly name: string
  }

/** Exact identity of one skill candidate, as `read()` takes it. */
export interface SkillRef {
  /** Kebab-case skill name. */
  readonly name: string
  /** Provider that produced the candidate. */
  readonly provider: string
  /** Discovery source of the candidate. */
  readonly source: SkillSource
}

/** One skill candidate of the view. */
export interface SkillInventoryRow extends SkillRef {
  /** Short routing description. */
  readonly description: string
  /** Optional extra routing guidance. */
  readonly whenToUse?: string
  /** Absolute instruction file path, absent for a skill without a file. */
  readonly path?: string
  /** Where the skill comes from. */
  readonly origin: SkillOrigin
  /** Whether the user can start the skill from the `/` list. */
  readonly userInvocable: boolean
  /** Whether the agent can load the skill on its own. */
  readonly modelInvocable: boolean
  /** Present when another skill with the same name wins; names that winner. */
  readonly replacedBy?: {
    readonly provider: string
    readonly source: SkillSource
    readonly origin: SkillOrigin
  }
}

/** One file that a provider found but could not offer as a skill. */
export interface SkillFaultRow {
  /** File path as the provider addresses it. */
  readonly path: string
  /** Where the file would come from. */
  readonly origin: SkillOrigin
  /** Why the file is not a skill. */
  readonly reason: SkillFaultReason
}

/** The skills of the default agent view. */
export interface SkillInventoryValue {
  /** Winners sorted by name, each followed by the candidates it replaced. */
  readonly skills: readonly SkillInventoryRow[]
  /** Files that are not skills, in provider order. */
  readonly faults: readonly SkillFaultRow[]
  /** Whether every provider completed; false means some skills can be missing. */
  readonly complete: boolean
}

/** The body of one skill. */
export interface SkillTextValue {
  /** Markdown instruction body without frontmatter. */
  readonly content: string
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The default agent view holds no skill with that name, provider, and source, or its file is gone. */
    'skill/not-found': { readonly name: string; readonly provider: string; readonly source: string }
  }
}
