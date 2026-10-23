/**
 * The hinge matter of the IDE's `applicationDraftingTools.spec.ts`: a Feature
 * List, two claims, one figure, the Draft Outline bound to the claims, and a
 * draft with its source markers; shared by the gate and tool specs.
 */

import { parseDraftingFrontmatter } from '../src/drafting/frontmatter.ts'
import { sha256Hex } from '../src/report/text.ts'

export const featureList = (confirmed = 'true') => `---
office: US
confirmed: ${confirmed}
---
| ID | Feature | Source |
| --- | --- | --- |
| F1 | A housing 12 that holds a lever 14 of steel. | disclosure:§1 |
`

export const claims = (approved = 'true', second = 'wherein the lever is steel') => `---
approved: ${approved}
---
1. A hinge comprising a housing and a lever.
2. The hinge of claim 1, ${second}.
`

export const figures = `## FIG. 1

- 12: housing
- 14: lever
`

/** The SHA-256 of the claims body, as the drafting tools compute the Approved Claims hash. */
export const claimsHashOf = (text: string) => sha256Hex(parseDraftingFrontmatter(text).body.trim())

/** The Outline table the model writes; the draft-outline save adds the frontmatter. */
export const outlineTable = `# Draft Outline

| Item | Section | Kind | Claims | Claim terms | Sources | Explain | Question |
|------|---------|------|--------|-------------|---------|---------|----------|
| O1 | BACKGROUND | Template |  |  |  | no |  |
| O2 | DETAILED DESCRIPTION | Technical | 1, 2 | a hinge, a housing, a lever | F1, FIG. 1 | yes |  |
`

/** draft-outline.md made for the given claims. */
export const outline = (claimsText = claims()) => `---
office: US
claims: ${claimsHashOf(claimsText)}
---
${outlineTable}`

export const draft = (extra = '') => `---
office: US
model: claude-sonnet-5
provider: anthropic
---
# Hinge

## BACKGROUND

<!-- src: disclosure:§1, item:O1 -->
A hinge joins a door to a frame.

## SUMMARY

<!-- src: feature:F1 -->
A hinge has a housing and a lever. The lever is steel.

## BRIEF DESCRIPTION OF THE DRAWINGS

<!-- src: template -->
FIG. 1 is a side view of the hinge.

## DETAILED DESCRIPTION

<!-- src: feature:F1, item:O2 -->
The housing 12 holds the lever 14. The lever 14 is steel.

## CLAIMS

1. A hinge comprising a housing and a lever.
2. The hinge of claim 1, wherein the lever is steel.

## ABSTRACT

<!-- src: feature:F1 -->
A hinge has a housing and a lever of steel.
${extra}`

export const openQuestion = `
## Inventor Questions

> **Inventor Question IQ-1:** Which steel grade is the lever made of?
`

export const twoQuestions = `
## Inventor Questions

> **Inventor Question IQ-1:** Which steel grade is the lever made of?
> Belongs: Detailed Description, after the paragraph on the housing 12.

> **Inventor Question IQ-2:** How thick is the lever?
`

/** The draft after the agent applied the answer to IQ-1: the answer at its place with its marker, the question deleted. */
export const appliedIq1 = (questions = '\n## Inventor Questions\n\n> **Inventor Question IQ-2:** How thick is the lever?\n') => draft(questions).replace(
  'The housing 12 holds the lever 14. The lever 14 is steel.\n',
  'The housing 12 holds the lever 14. The lever 14 is steel.\n\n<!-- src: inventor:IQ-1 -->\nThe lever 14 is stainless steel.\n')

/** Fills the answer slot of one question in inventor-answers.md, the way the attorney or the inventor does. */
export const fillAnswer = (answers: string, id: string, answer: string) => answers.replace(new RegExp(`(## ${id}\\n[\\s\\S]*?\\*\\*Answer:\\*\\*\\n)`), `$1${answer}\n`)

/** The frontmatter block of a drafting file, with hashes replaced. */
export const frontmatterOf = (text: string) => (text.split('---')[1] ?? '').replace(/[0-9a-f]{64}/g, '<sha>')

/** Hashes and times replaced, so a record reads the same in every run. */
export const stable = (text: string) => text.replace(/[0-9a-f]{64}/g, '<sha>').replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, '<time>')

/** The matter files with both gates open and the outline bound to the claims. */
export const gatesOpen = {
  'drafting/hinge/feature-list.md': featureList(),
  'drafting/hinge/claims.md': claims(),
  'drafting/hinge/figures.md': figures,
  'drafting/hinge/draft-outline.md': outline(),
}

/** The matter files without draft-outline.md. */
export const noOutline = {
  'drafting/hinge/feature-list.md': featureList(),
  'drafting/hinge/claims.md': claims(),
  'drafting/hinge/figures.md': figures,
}
