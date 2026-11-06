/** The parts that the model-facing Firm Record tools share: pieces of their output schemas and the texts of the seam refusals. */

/** A local date in an output schema. */
export const LOCAL_DATE = { type: 'string', description: 'YYYY-MM-DD' } as const

/** A string or null in an output schema. */
export const STRING_OR_NULL = { oneOf: [{ type: 'string' }, { type: 'null' }] } as const

/** The output schema of a refused read: the refusal code and what it means. */
export const REFUSAL_OUTPUT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    error: { type: 'string', required: true },
    message: { type: 'string', required: true },
  },
} as const

/** The texts of the seam refusals that mean the same for each read. */
export const SEAM_MESSAGES = {
  no_key: 'This runtime has no record token, so the Firm Record refuses every read.',
  refused: 'The Firm Record refused the runtime\'s record token.',
  unreachable: 'The Firm Record did not answer. Try again later.',
} as const
