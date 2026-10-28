/**
 * Sample agent and connector rows for the look-first review of the form. The Host-backed agent store replaces them.
 */

import type { AgentDraft, ConnectorChoice } from './form-store.ts'

/** Connector rows of the sample firm: three configured, one without a key. */
export const SAMPLE_CONNECTORS: readonly ConnectorChoice[] = [
  { id: 'epo-ops', configured: true },
  { id: 'uspto-odp', configured: true },
  { id: 'flowleap', configured: true },
  { id: 'semantic-scholar', configured: false },
]

/**
 * The sample draft a new agent starts from.
 * @returns one filled draft.
 */
export function sampleDraft(): AgentDraft {
  return {
    name: 'Office action responder',
    description: 'Drafts responses to EPO and USPTO office actions in the house style of the firm.',
    instructions: [
      'You draft responses to office actions for our firm.',
      'Read the office action and the cited documents first. Then search the firm playbook for the matching objection type.',
      'Write in the house style of the style guide. Cite each passage that you use with the file name and the page.',
      'Do not argue a point that the playbook marks as weak without a note to the attorney.',
    ].join('\n\n'),
    files: [
      { name: 'Firm OA response playbook.pdf', bytes: 2_516_582, state: 'indexed' },
      { name: 'Claim drafting style guide.docx', bytes: 384_102, state: 'indexed' },
      { name: 'EP3456789 response 2025.pdf', bytes: 1_048_576, state: 'indexing' },
    ],
    connectors: ['epo-ops', 'uspto-odp'],
  }
}
