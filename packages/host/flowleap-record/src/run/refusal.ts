/** The refusals of the run commands as the model reads them. @module */

import type { RecordCommandError, RecordCommandRefusal } from '../types.ts'

/** A refused run command as the model reads it. */
export interface RunCommandError {
  readonly error: RecordCommandRefusal
  /** What the refusal means and what to do. */
  readonly message: string
  /** The Firm Record's own sentence, when it gave one. */
  readonly detail?: string
}

const MESSAGES: Record<RecordCommandRefusal, string> = {
  not_configured: 'This runtime has no Firm Record configured, so nothing can be proposed. Tell the attorney in this chat.',
  no_key: 'This runtime has no record token, so the Firm Record refuses every command. Tell the attorney in this chat.',
  refused: 'The Firm Record refused the runtime\'s record token. Tell the attorney in this chat.',
  agent_cannot_decide: 'Only a person decides. Propose, and leave each decision to the attorney in the Records app.',
  not_routed_person: 'This Ticket is routed to another person, so this runtime cannot act on it. Stop the run.',
  not_found: 'The Firm Record has no Ticket with this id. Use the ticket id of the run message.',
  invalid_body: 'The Firm Record found the command invalid. Check the arguments against the tool description and try once again.',
  ticket_not_waking: 'The Ticket does not wait for a run.',
  ticket_not_running: 'The Ticket has no running run, so it takes no proposal and no finish. Do not try again; tell the attorney in this chat.',
  client_rule_forbids_ai_draft: 'The client rules do not allow an AI draft of a letter to the client. Do not propose a client report; tell the attorney in this chat that the report is due by hand.',
  client_rule_forbids_ai_read: 'The client\'s AI wishes, or the firm\'s provider contracts, do not allow this model to read this letter. Do not read it in another way; tell the attorney in this chat that a person reads the letter, or that a model of a provider with a contract may read it if the client allows it.',
  statement_without_evidence: 'Every statement needs at least one source document. Add the evidence and propose again.',
  statement_without_span: 'Every source needs a span: the page number and an exact quote from that page. Read the text with record_read_document_text, add the span to each source, and propose again.',
  quote_not_in_letter: 'A quote is not in the text of its page. Copy each quote character for character from the page text of record_read_document_text, check the page number, and propose again.',
  quote_ambiguous: 'A quote is in the text of its page more than once. Use a longer quote, up to 200 characters, that is in the page text only once, and propose again.',
  evidence_outside_matter: 'A source is a document that is not filed on the matter of this Ticket. Use only documents that record_read lists for this matter, and propose again.',
  no_proposals: 'This run has no proposal yet. Propose what the task of the run message asks for first: a letter with record_propose_report, or a reading with record_propose_reading.',
  idempotency_key_reused: 'The Firm Record already took a different command from this run under the same key: a finish of this run, or a report of this tool call. Do not repeat it; tell the attorney in this chat what differs.',
  document_too_large: 'The letter is larger than 5 MiB. Write a shorter letter without embedded images.',
  unreachable: 'The Firm Record did not answer. Try again later.',
  service_error: 'The Firm Record answered with an error. Try again later.',
  invalid_answer: 'The Firm Record answered with data that is not a receipt of the command.',
}

/**
 * The refusal as the model reads it.
 * @param refusal - the seam refusal.
 * @param messages - messages that replace the shared ones for this tool, by refusal code.
 * @returns the error value with its message and the Firm Record's detail.
 */
export function runRefusal(
  refusal: RecordCommandError, messages: Partial<Record<RecordCommandRefusal, string>> = {},
): RunCommandError {
  const message = messages[refusal.error] ?? MESSAGES[refusal.error]
  return refusal.detail === undefined
    ? { error: refusal.error, message }
    : { error: refusal.error, message, detail: refusal.detail }
}

/** The output-schema branch of a refused run command. */
export const RUN_ERROR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    error: { type: 'string', required: true },
    message: { type: 'string', required: true },
    detail: { type: 'string' },
  },
} as const
