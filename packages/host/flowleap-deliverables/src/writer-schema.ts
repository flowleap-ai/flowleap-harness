/**
 * The model-facing contract of `write_patent_results`: the IDE's input schema,
 * copied verbatim from `contributes.languageModelTools` in flowleap-agent-v2
 * (see SOURCE.json; `scripts/flowleap/sync-deliverables.sh --check` compares
 * it), and a description that carries the contract alone. The IDE's 670-word
 * description is not copied: per-template rules live in the validation result
 * that names the row and the fix (ADR 0018 decision 4).
 *
 * Three harness-only additions beside the IDE's: the `jurisdictions` property,
 * the model's proposal for the fto-memo header's `Jurisdiction(s)` cell, which
 * the user confirms or replaces in the markets card (S5 acceptance defect B and
 * pass 4), the `dossier` template (defect C), and the `officeAction` property,
 * the structured analysis of an office action that `office-action-scaffold`
 * renders and the office action board reads; see the README, "What differs
 * from the IDE copy".
 * @module
 */

import { officeActionParameter } from './work-page/office-action-input.ts'

/** The tool name, shared with the IDE and the exported Patent Agent prompt. */
export const WRITE_PATENT_RESULTS_NAME = 'write_patent_results'

/** The report templates the writer renders in this harness. */
export const REPORT_TEMPLATES = ['prior-art-report', 'fto-memo', 'office-action-scaffold', 'invalidity-claim-chart', 'find-better-report', 'eou-infringement-chart', 'patentability-opinion', 'landscape-report', 'portfolio-due-diligence-memo', 'dossier'] as const

/** The Application Drafting templates the schema names; they arrive with S5 D3 and are refused until then. */
export const DRAFTING_TEMPLATES = ['draft-application', 'draft-outline'] as const

/** What the model reads about the tool: the contract, not the per-template rules. */
export const WRITE_PATENT_RESULTS_DESCRIPTION = 'Save a patent deliverable as a Markdown file under the working directory: a free-form document (no template) or a templated report (prior-art-report, find-better-report, invalidity-claim-chart, fto-memo, eou-infringement-chart, office-action-scaffold, patentability-opinion, landscape-report, portfolio-due-diligence-memo, dossier). '
  + 'filePath is relative to the working directory or absolute inside it; parent folders are created and an existing file is replaced. '
  + 'prior-art-report, find-better-report, and invalidity-claim-chart with coverage rows take empty content and build the report from the structured coverage fields, checked against the evidence this session\'s data tools returned: every source anchor and quote must come from a tool result (get_claims, get_description, get_abstract), copied verbatim. '
  + 'office-action-scaffold for the analysis of an office action takes officeAction (the action table, the objections and the claim tables as fields) and content with only the response plan, the sources and gaps, and the closing sentence; a response plan alone takes content only. '
  + 'Every other template wraps the content you write; a templated save appends a generated provenance section that states which of its figures, dates and quotations a tool result holds. Use dossier for the dossier of one publication (snapshot, claims, family, legal status, citations, US family chain, sources). '
  + 'A successful save writes the report, a working record and an evidence companion beside it and delivers them to the user; do not call present for these files, and do not edit a delivered file with another tool: re-save it here so the card stays true. '
  + 'A refusal names each field to fix; correct it and retry. draft-application and draft-outline save through the drafting folder contract (see start_application_draft).'

/* jscpd:ignore-start -- the IDE's schema repeats the chart-row properties per side; a verbatim copy keeps
   it comparable with contributes.languageModelTools. */
/**
 * The IDE's input schema, verbatim. The registry validates `output.schema` only,
 * so the keyword set here is the IDE's own.
 */
export const WRITE_PATENT_RESULTS_PARAMETERS: Record<string, unknown> = {
  type: 'object',
  properties: {
    filePath: {
      type: 'string',
      description: 'Absolute or workspace-relative path to the report. Use the actual workspace path; existing files can be updated with this tool.',
    },
    content: {
      type: 'string',
      description: 'Report body. Required for every template except prior-art-report and find-better-report, and except invalidity-claim-chart when it is saved with structured coverage; those take coverage instead and must leave content empty. For landscape-report include the trend, top-filer and jurisdiction tables and the white-space notes, each figure with its counting basis and source.',
    },
    template: {
      type: 'string',
      enum: [
        'prior-art-report',
        'fto-memo',
        'office-action-scaffold',
        'invalidity-claim-chart',
        'find-better-report',
        'eou-infringement-chart',
        'patentability-opinion',
        'landscape-report',
        'portfolio-due-diligence-memo',
        'dossier',
        'draft-application',
        'draft-outline',
      ],
      description: 'Optional report wrapper. prior-art-report is a review of candidate evidence, not an ISR or patentability opinion. Use patentability-opinion only for a requested formal assessment; fto-memo for FTO, office-action-scaffold for responses, invalidity-claim-chart/eou-infringement-chart for their respective element charts (invalidity-claim-chart also takes structured coverage, and then requires empty content), find-better-report for a Find Better run on a granted patent (structured only: coverage with examiner and found sides, baseline, examinerBestArt, tracks; empty content), landscape-report for landscapes, portfolio-due-diligence-memo for portfolios, dossier for the dossier of one publication (content is the dossier body: snapshot, claims, family, legal status, citations, US family chain, sources and limitations), draft-application for a Draft Application of the application-drafting skill (filePath drafting/<matter>/draft-application.md; content is the whole draft starting with its frontmatter; it is written unchanged, never wrapped, with the generated snapshot and the Working Record beside it; findings never block it, but it refuses while drafting/<matter>/draft-outline.md is missing or made for other claims), draft-outline for the Draft Outline of the application-drafting skill (filePath drafting/<matter>/draft-outline.md; content is the Outline table, one row per Outline Item; the tool sets the office and the Approved Claims SHA-256 in its frontmatter; it refuses while feature-list.md is not confirmed, while claims.md is not approved, or when no Outline Item parses; it returns the outline check without blocking the save). Omit for free-form content.',
    },
    matter: {
      type: 'string',
      description: 'Matter/case reference or the identifying patent/application number, when the user provided one. Leave unset to keep the practitioner placeholder.',
    },
    subject: {
      type: 'string',
      description: 'Short phrase naming what the report is about (the technology searched, product cleared, portfolio reviewed). ALWAYS provide this when using a template — it is known from the request.',
    },
    jurisdictions: {
      type: 'string',
      description: 'fto-memo: the markets the memo clears, as a short list (for example "DE, FR, US"): the markets the user named, or your proposal when the user named none. Before the first save of a memo the user confirms or replaces them in a question card, and the answer fills the memo header; without a possible answer your value is marked as not confirmed.',
    },
    officeAction: officeActionParameter(),
    objective: {
      type: 'string',
      description: "prior-art-report: one or two sentences stating the invention and the question the search answers. invalidity-claim-chart and find-better-report: the earliest priority date the art is measured against, with its basis. Provide it — do not leave the report's Objective section as a stub.",
    },
    office: {
      type: 'string',
      enum: [
        'US',
        'EPO',
      ],
      description: 'draft-application: the office, when the draft frontmatter does not name it.',
    },
    model: {
      type: 'string',
      description: 'draft-application: the model the disclosure went to (the one stated in chat before drafting), when the draft frontmatter does not name it.',
    },
    provider: {
      type: 'string',
      description: 'draft-application: the provider the disclosure went to, when the draft frontmatter does not name it.',
    },
    disclosureVersion: {
      type: 'string',
      description: 'draft-application: the version or date of the invention disclosure the draft is made from, for the Working Record.',
    },
    promptsSummary: {
      type: 'string',
      description: 'draft-application: a short summary of the skill, template and attorney instructions the draft was made with, for the Working Record.',
    },
    searchStrategy: {
      type: 'string',
      description: 'Confirmed search scope and cutoff basis, sources and strategy. Actual query/count history is generated from recorded executions for prior-art-report; identify unavailable or unsearched sources in limitations.',
    },
    concepts: {
      type: 'array',
      description: 'prior-art-report: the concept-synonym table the search was built from — every core concept with the synonyms, technical equivalents and related terms actually used in queries. The report renders it as its "Concepts searched" section; an attorney judging whether a search was competent reads it first.',
      items: {
        type: 'object',
        properties: {
          concept: {
            type: 'string',
            minLength: 1,
            description: 'One core concept of the invention, in the words the search used.',
          },
          synonyms: {
            type: 'array',
            description: 'The synonyms, technical equivalents and related terms actually used in queries for that concept.',
            items: {
              type: 'string',
              minLength: 1,
            },
          },
        },
        required: [
          'concept',
          'synonyms',
        ],
        additionalProperties: false,
      },
    },
    classifications: {
      type: 'array',
      description: 'prior-art-report: the CPC/IPC codes the search covered, each with its meaning in plain words. The report renders them as its "Classifications searched" section.',
      items: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            minLength: 1,
            description: 'The CPC or IPC code, e.g. "A61K 6/00".',
          },
          meaning: {
            type: 'string',
            minLength: 1,
            description: 'What that code covers, in plain words.',
          },
        },
        required: [
          'code',
          'meaning',
        ],
        additionalProperties: false,
      },
    },
    challengedPublication: {
      type: 'string',
      description: 'invalidity-claim-chart and find-better-report: the publication number of the patent whose claims are being charted against the cited art (for find-better-report, the granted target patent). Falls back to matter when unset.',
    },
    criticalDate: {
      type: 'string',
      description: 'invalidity-claim-chart: the critical date as an ISO date (YYYY-MM-DD), e.g. the priority date of the challenged patent. With it, the receipt lists every cited document published after it as an open point. Keep the basis of the date in objective. Leave it out when the date is not known; the receipt then says the date check was skipped.',
    },
    coverage: {
      type: 'array',
      description: "Required for prior-art-report: explicit feature rows and an essential combination row. Status is model judgment. Copy known IDs from inline source labels or local evidenceLookup. Supported/partial rows require exact source quotations and review fields. invalidity-claim-chart accepts the same structured coverage: feature = a claim element of the challenged patent written as \"Claim 1 — element (b): …\", one combination row per independent claim (\"Claim 1 as a whole\"), claimNumber naming that claim, and sourceAnchors/evidence/elements pointing at the PRIOR-ART documents; when coverage is supplied content must be empty and the writer validates, renders and receipts the chart. find-better-report: one row per element of each independent claim (claimNumber required), each with an examiner side and a found side; the row's own status, sourceAnchors, evidence and elements are unused there.",
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          feature: {
            type: 'string',
            minLength: 1,
          },
          importance: {
            type: 'string',
            enum: [
              'essential',
              'optional',
            ],
          },
          status: {
            type: 'string',
            enum: [
              'supported',
              'partial',
              'unresolved',
            ],
          },
          sourceAnchors: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
          gap: {
            type: 'string',
            description: 'Remaining limitation or search/review gap; use an empty string only when none is identified. On an essential feature left unresolved when no drawing was read this session, state the reason a drawing cannot settle it with the phrase "figures not consulted:" followed by that reason (for example a composition or process subject); otherwise read the drawings of the closest candidates first.',
          },
          kind: {
            type: 'string',
            enum: [
              'feature',
              'combination',
              'fallback',
            ],
            description: 'fallback is invalidity-claim-chart only: one rung of the Fallback Ladder, charting only the limitation that fallback adds, with the same status, sourceAnchors, evidence, elements and gap as a feature row. A dependent-claim fallback gives claimNumber (the dependent claim) and fallbackOf (the independent claim); a description-supported fallback gives no claimNumber, fallbackOf and basis.',
          },
          claimNumber: {
            type: 'string',
            minLength: 1,
            description: "invalidity-claim-chart: the challenged claim this row is an element of (e.g. \"1\"); on a fallback row, the dependent claim it charts, which must be a rung of fallbackOf's Fallback Ladder as derived from the challenged patent's claims recorded by get_patent_details. The chart's header states the distinct claims its rows name. find-better-report: required on every row; the independent claim of the target patent this element belongs to.",
          },
          fallbackOf: {
            type: 'string',
            minLength: 1,
            description: 'invalidity-claim-chart, kind fallback only: the independent claim this fallback falls back from; it must have feature rows in this chart.',
          },
          basis: {
            type: 'object',
            description: "invalidity-claim-chart, description-supported fallback only (no claimNumber): the challenged patent's description passage that supports the fallback. The quote is checked verbatim against the recorded text at anchor, and anchor must be a description anchor of the challenged patent.",
            properties: {
              anchor: {
                type: 'string',
                minLength: 1,
              },
              quote: {
                type: 'string',
                minLength: 1,
              },
            },
            required: [
              'anchor',
              'quote',
            ],
            additionalProperties: false,
          },
          elements: {
            type: 'array',
            description: 'Required for supported/partial rows (feature and combination alike): one entry per constituent the feature requires. A supported row discloses every element by cited text or by a recorded drawing; a partial row discloses some and leaves at least one undisclosed; a supported combination row must rest on a single publication. A text element gives anchor plus disclosedBy, a literal fragment of that anchor’s recorded text. A figure element gives anchor = a PUB:figure:N anchor printed by get_patent_figures, basis = "figure", and reading = what the drawing clearly shows (that an element exists, how parts connect or are arranged) — never a dimension, proportion or ratio unless the drawing is stated to be to scale.',
            items: {
              type: 'object',
              properties: {
                element: {
                  type: 'string',
                  minLength: 1,
                  description: 'One required constituent of the feature in your own words (e.g. the component, the property it must have, the quantity or range).',
                },
                anchor: {
                  type: 'string',
                  minLength: 1,
                  description: 'The one of this row’s sourceAnchors whose passage — or, with basis "figure", whose recorded drawing page — discloses this element. Omit together with disclosedBy when nothing cited discloses it.',
                },
                disclosedBy: {
                  type: 'string',
                  minLength: 1,
                  description: 'A literal fragment copied from that anchor’s recorded text that discloses the element; matching ignores case and whitespace. Fragments under 12 characters are disclosed as weak in the report. Omit together with anchor when no cited text discloses the element, and always for a figure element — a drawing has no quotable text.',
                },
                basis: {
                  type: 'string',
                  enum: [
                    'text',
                    'figure',
                  ],
                  description: 'What discloses this element: "text" (the default) for a passage cited by anchor plus disclosedBy, "figure" for a recorded drawing page cited by a PUB:figure:N anchor and stated in reading.',
                },
                reading: {
                  type: 'string',
                  minLength: 1,
                  description: 'basis "figure" only: what the drawing clearly shows — that an element exists, how the parts connect or are arranged. It replaces disclosedBy. A reading that states a dimension, a proportion or a ratio is rejected unless the same reading says the drawing is to scale (MPEP 2125).',
                },
              },
              required: [
                'element',
              ],
              additionalProperties: false,
            },
          },
          examiner: {
            type: 'object',
            properties: {
              status: {
                type: 'string',
                enum: [
                  'supported',
                  'partial',
                  'unresolved',
                ],
                description: 'supported renders as disclosed, partial as partially disclosed, unresolved as not found. Only supported counts toward "disclosed n of m".',
              },
              sourceAnchors: {
                type: 'array',
                items: {
                  type: 'string',
                },
              },
              gap: {
                type: 'string',
                description: "What this side's art does not disclose for the element; an empty string only when nothing is missing.",
              },
              elements: {
                type: 'array',
                description: 'Required for supported/partial rows (feature and combination alike): one entry per constituent the feature requires. A supported row discloses every element by cited text or by a recorded drawing; a partial row discloses some and leaves at least one undisclosed; a supported combination row must rest on a single publication. A text element gives anchor plus disclosedBy, a literal fragment of that anchor’s recorded text. A figure element gives anchor = a PUB:figure:N anchor printed by get_patent_figures, basis = "figure", and reading = what the drawing clearly shows (that an element exists, how parts connect or are arranged) — never a dimension, proportion or ratio unless the drawing is stated to be to scale.',
                items: {
                  type: 'object',
                  properties: {
                    element: {
                      type: 'string',
                      minLength: 1,
                      description: 'One required constituent of the feature in your own words (e.g. the component, the property it must have, the quantity or range).',
                    },
                    anchor: {
                      type: 'string',
                      minLength: 1,
                      description: 'The one of this row’s sourceAnchors whose passage — or, with basis "figure", whose recorded drawing page — discloses this element. Omit together with disclosedBy when nothing cited discloses it.',
                    },
                    disclosedBy: {
                      type: 'string',
                      minLength: 1,
                      description: 'A literal fragment copied from that anchor’s recorded text that discloses the element; matching ignores case and whitespace. Fragments under 12 characters are disclosed as weak in the report. Omit together with anchor when no cited text discloses the element, and always for a figure element — a drawing has no quotable text.',
                    },
                    basis: {
                      type: 'string',
                      enum: [
                        'text',
                        'figure',
                      ],
                      description: 'What discloses this element: "text" (the default) for a passage cited by anchor plus disclosedBy, "figure" for a recorded drawing page cited by a PUB:figure:N anchor and stated in reading.',
                    },
                    reading: {
                      type: 'string',
                      minLength: 1,
                      description: 'basis "figure" only: what the drawing clearly shows — that an element exists, how the parts connect or are arranged. It replaces disclosedBy. A reading that states a dimension, a proportion or a ratio is rejected unless the same reading says the drawing is to scale (MPEP 2125).',
                    },
                  },
                  required: [
                    'element',
                  ],
                  additionalProperties: false,
                },
              },
              evidence: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    anchor: {
                      type: 'string',
                      minLength: 1,
                      description: 'One of this row’s sourceAnchors.',
                    },
                    quote: {
                      type: 'string',
                      minLength: 1,
                      description: 'Optional for a numbered claim: omit to copy its entire recorded text verbatim by anchor. For a description passage this field is required and must match returned text. Never re-fetch a claim merely to transcribe it for this field.',
                    },
                    scope: {
                      type: 'string',
                      minLength: 1,
                      description: 'Identify independent/dependent claim or description/embodiment scope and reviewed dependency chain.',
                    },
                    qualifiers: {
                      type: 'string',
                      minLength: 1,
                      description: 'Preserve restrictions and distinguish overlapping ranges from exact feature support.',
                    },
                    quantityBasis: {
                      type: 'string',
                      minLength: 1,
                      description: 'State original units, basis and every constituent. Keep parts as parts; do not substitute an unverified percentage conversion. Say not applicable when appropriate.',
                    },
                  },
                  required: [
                    'anchor',
                    'scope',
                    'qualifiers',
                    'quantityBasis',
                  ],
                  additionalProperties: false,
                },
              },
            },
            required: [
              'status',
              'sourceAnchors',
              'gap',
            ],
            additionalProperties: false,
            description: "find-better-report: the examiner's best art on this element, checked exactly like an invalidity chart row (quotes, element map, second read). Cite only the examiner's best art named for this claim in examinerBestArt. The row's own status, sourceAnchors, evidence and elements are unused in find-better-report: set status \"unresolved\", sourceAnchors [] and gap \"\".",
          },
          found: {
            type: 'object',
            properties: {
              status: {
                type: 'string',
                enum: [
                  'supported',
                  'partial',
                  'unresolved',
                ],
                description: 'supported renders as disclosed, partial as partially disclosed, unresolved as not found. Only supported counts toward "disclosed n of m".',
              },
              sourceAnchors: {
                type: 'array',
                items: {
                  type: 'string',
                },
              },
              gap: {
                type: 'string',
                description: "What this side's art does not disclose for the element; an empty string only when nothing is missing.",
              },
              elements: {
                type: 'array',
                description: 'Required for supported/partial rows (feature and combination alike): one entry per constituent the feature requires. A supported row discloses every element by cited text or by a recorded drawing; a partial row discloses some and leaves at least one undisclosed; a supported combination row must rest on a single publication. A text element gives anchor plus disclosedBy, a literal fragment of that anchor’s recorded text. A figure element gives anchor = a PUB:figure:N anchor printed by get_patent_figures, basis = "figure", and reading = what the drawing clearly shows (that an element exists, how parts connect or are arranged) — never a dimension, proportion or ratio unless the drawing is stated to be to scale.',
                items: {
                  type: 'object',
                  properties: {
                    element: {
                      type: 'string',
                      minLength: 1,
                      description: 'One required constituent of the feature in your own words (e.g. the component, the property it must have, the quantity or range).',
                    },
                    anchor: {
                      type: 'string',
                      minLength: 1,
                      description: 'The one of this row’s sourceAnchors whose passage — or, with basis "figure", whose recorded drawing page — discloses this element. Omit together with disclosedBy when nothing cited discloses it.',
                    },
                    disclosedBy: {
                      type: 'string',
                      minLength: 1,
                      description: 'A literal fragment copied from that anchor’s recorded text that discloses the element; matching ignores case and whitespace. Fragments under 12 characters are disclosed as weak in the report. Omit together with anchor when no cited text discloses the element, and always for a figure element — a drawing has no quotable text.',
                    },
                    basis: {
                      type: 'string',
                      enum: [
                        'text',
                        'figure',
                      ],
                      description: 'What discloses this element: "text" (the default) for a passage cited by anchor plus disclosedBy, "figure" for a recorded drawing page cited by a PUB:figure:N anchor and stated in reading.',
                    },
                    reading: {
                      type: 'string',
                      minLength: 1,
                      description: 'basis "figure" only: what the drawing clearly shows — that an element exists, how the parts connect or are arranged. It replaces disclosedBy. A reading that states a dimension, a proportion or a ratio is rejected unless the same reading says the drawing is to scale (MPEP 2125).',
                    },
                  },
                  required: [
                    'element',
                  ],
                  additionalProperties: false,
                },
              },
              evidence: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    anchor: {
                      type: 'string',
                      minLength: 1,
                      description: 'One of this row’s sourceAnchors.',
                    },
                    quote: {
                      type: 'string',
                      minLength: 1,
                      description: 'Optional for a numbered claim: omit to copy its entire recorded text verbatim by anchor. For a description passage this field is required and must match returned text. Never re-fetch a claim merely to transcribe it for this field.',
                    },
                    scope: {
                      type: 'string',
                      minLength: 1,
                      description: 'Identify independent/dependent claim or description/embodiment scope and reviewed dependency chain.',
                    },
                    qualifiers: {
                      type: 'string',
                      minLength: 1,
                      description: 'Preserve restrictions and distinguish overlapping ranges from exact feature support.',
                    },
                    quantityBasis: {
                      type: 'string',
                      minLength: 1,
                      description: 'State original units, basis and every constituent. Keep parts as parts; do not substitute an unverified percentage conversion. Say not applicable when appropriate.',
                    },
                  },
                  required: [
                    'anchor',
                    'scope',
                    'qualifiers',
                    'quantityBasis',
                  ],
                  additionalProperties: false,
                },
              },
            },
            required: [
              'status',
              'sourceAnchors',
              'gap',
            ],
            additionalProperties: false,
            description: 'find-better-report: the best art the Find Better tracks found on this element, checked exactly like an invalidity chart row. If nothing found discloses the element, status "unresolved" with the gap saying so.',
          },
          evidence: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                anchor: {
                  type: 'string',
                  minLength: 1,
                  description: 'One of this row’s sourceAnchors.',
                },
                quote: {
                  type: 'string',
                  minLength: 1,
                  description: 'Optional for a numbered claim: omit to copy its entire recorded text verbatim by anchor. For a description passage this field is required and must match returned text. Never re-fetch a claim merely to transcribe it for this field.',
                },
                scope: {
                  type: 'string',
                  minLength: 1,
                  description: 'Identify independent/dependent claim or description/embodiment scope and reviewed dependency chain.',
                },
                qualifiers: {
                  type: 'string',
                  minLength: 1,
                  description: 'Preserve restrictions and distinguish overlapping ranges from exact feature support.',
                },
                quantityBasis: {
                  type: 'string',
                  minLength: 1,
                  description: 'State original units, basis and every constituent. Keep parts as parts; do not substitute an unverified percentage conversion. Say not applicable when appropriate.',
                },
              },
              required: [
                'anchor',
                'scope',
                'qualifiers',
                'quantityBasis',
              ],
              additionalProperties: false,
            },
          },
        },
        required: [
          'feature',
          'importance',
          'status',
          'sourceAnchors',
          'gap',
          'kind',
        ],
        additionalProperties: false,
      },
    },
    fallbacksNotCharted: {
      type: 'array',
      description: 'invalidity-claim-chart: rungs of the Fallback Ladder the chart does not chart, each with the reason (e.g. "claim 9 is a use claim outside the attack"). Every rung under a charted independent claim has exactly one fallback row or one entry here.',
      items: {
        type: 'object',
        properties: {
          claimNumber: {
            type: 'string',
            minLength: 1,
          },
          reason: {
            type: 'string',
            minLength: 1,
          },
        },
        required: [
          'claimNumber',
          'reason',
        ],
        additionalProperties: false,
      },
    },
    rounds: {
      type: 'array',
      description: "invalidity-claim-chart: each Search Round, run only on the expert's answer to the Round Report. answers are the ids of the open points of the previous receipt that the expert chose (e.g. rung-3); a new round must name at least one, else the save is refused. targets are claim numbers or the feature of a description fallback; every query must match a tool execution recorded this session (same tool name, same query text, whitespace aside), else the save is refused.",
      items: {
        type: 'object',
        properties: {
          round: {
            type: 'integer',
            minimum: 1,
          },
          targets: {
            type: 'array',
            items: {
              type: 'string',
              minLength: 1,
            },
          },
          answers: {
            type: 'array',
            description: "The ids of the previous receipt's open points the expert chose and this round answers, e.g. [\"rung-3\", \"search-1\"].",
            items: {
              type: 'string',
              minLength: 1,
            },
          },
          queries: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                tool: {
                  type: 'string',
                  minLength: 1,
                  description: 'The tool the query ran through, e.g. search_patents.',
                },
                query: {
                  type: 'string',
                  minLength: 1,
                  description: 'The query exactly as it ran.',
                },
                count: {
                  type: 'integer',
                  minimum: 0,
                  description: 'Hits returned, 0 included.',
                },
              },
              required: [
                'tool',
                'query',
              ],
              additionalProperties: false,
            },
          },
          outcome: {
            type: 'string',
            minLength: 1,
            description: 'What the round changed in the chart, or that it found nothing new.',
          },
        },
        required: [
          'round',
          'targets',
          'queries',
          'outcome',
        ],
        additionalProperties: false,
      },
    },
    baseline: {
      type: 'object',
      description: "find-better-report: the Examiner Baseline exactly as `flowleap patent examiner-baseline <publication> --json` prints it (publication, offices[], membersWalked[], documents[] with document, kinds, npl, cells{office: {text, citations[]}}, gaps[], dedupe), or the examiner_baseline backend tool's result. Pass it unedited; the writer renders the matrix and the gaps from it.",
      properties: {
        publication: {
          type: 'string',
        },
        offices: {
          type: 'array',
          items: {
            type: 'string',
          },
        },
        membersWalked: {
          type: 'array',
          items: {
            type: 'object',
          },
        },
        documents: {
          type: 'array',
          items: {
            type: 'object',
          },
        },
        gaps: {
          type: 'array',
          items: {
            type: 'object',
          },
        },
        dedupe: {
          type: 'string',
        },
      },
      required: [
        'offices',
        'documents',
        'gaps',
      ],
    },
    baselinePath: {
      type: 'string',
      minLength: 1,
      description: 'find-better-report: workspace-relative or absolute workspace path of the unedited Baseline JSON on disk: the path the examiner_baseline tool returns, or the --json output of `flowleap patent examiner-baseline <publication>`. Use it instead of baseline (exactly one of the two); the writer reads the file, checks the same shape and its completeness, and states the source in the result and the working record.',
    },
    examinerBestArt: {
      type: 'array',
      description: "find-better-report: per independent claim, the Baseline document(s) taken as the examiner's best art. Each publication must be in baseline.documents[] and carry, in at least one office, an X or Y category; where no X or Y citation exists (a US-origin family often has none), a document an examiner cited or a US office action rejected claims with is accepted and shown with its basis. A document only the applicant cited, with no category and no rejection, is refused.",
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          claimNumber: {
            type: 'string',
            minLength: 1,
            description: 'The independent claim of the target patent, e.g. "1".',
          },
          publications: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'string',
              minLength: 1,
            },
            description: 'Publication numbers as the Baseline lists them (kind code optional), e.g. "US5135330".',
          },
        },
        required: [
          'claimNumber',
          'publications',
        ],
        additionalProperties: false,
      },
    },
    tracks: {
      type: 'array',
      description: 'find-better-report: every expansion track the run took (backward citations two hops from each X/Y reference; inventor and NPL-author networks; classification co-occurrence with the Discriminating Terms), each with every query and its hit count, zero included. A track with no query is listed with an empty queries array. Mark each backward-citation query with hop 1 or 2. A track with no query, or a backward-citation track with no hop 2 query, makes the per-claim result read "Search incomplete for claim N" instead of "No better art found". A count the execution record holds replaces the one given here.',
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            minLength: 1,
          },
          queries: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  minLength: 1,
                },
                tool: {
                  type: 'string',
                  description: 'The tool or command the query ran through.',
                },
                count: {
                  type: 'integer',
                  minimum: 0,
                  description: 'Hits returned, 0 included.',
                },
                hop: {
                  type: 'integer',
                  enum: [
                    1,
                    2,
                  ],
                  description: 'Backward-citation track only: the hop of the two-hop walk this query belongs to (1 = references of an X/Y document, 2 = references of a hop-1 document). A backward-citation track with no hop 2 query makes the result read "Search incomplete"; when hop 1 left no document outside the Baseline, log one hop 2 entry saying so with count 0.',
                },
              },
              required: [
                'query',
              ],
              additionalProperties: false,
            },
          },
        },
        required: [
          'name',
          'queries',
        ],
        additionalProperties: false,
      },
    },
    limitations: {
      type: 'array',
      description: 'Required for prior-art-report. State review scope, unsearched tracks, unavailable sources and uncertainties.',
      minItems: 1,
      items: {
        type: 'string',
        minLength: 1,
      },
    },
    stopReason: {
      type: 'string',
      minLength: 1,
      description: 'Required for prior-art-report. Explain why synthesis is appropriate given coverage and repeated/new evidence, or identify the user-directed/bounded stop and remaining tracks. No universal query-count target.',
    },
  },
  required: [
    'filePath',
    'content',
  ],
}
/* jscpd:ignore-end */
