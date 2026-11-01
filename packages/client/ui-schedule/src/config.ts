/** Deployment switches shared by the Host configuration and the Automation tasks page. */
import z from '@deepseek-ai/schemastery'

/** Page global that carries the validated configuration to the browser. */
export const SCHEDULE_PAGE_GLOBAL = '__DSH_SCHEDULE_PAGE_CONFIG__'

/** Automation tasks page behavior a deployment selects. */
export interface Config {
  /** New task opens the new chat with the localized example request (`new.draft`) in the composer, unsent; off opens an empty chat. */
  newTaskDraft: boolean
}

/** Validated Automation tasks page switches. */
export const Config: z<Partial<Config>, Config> = z.object({
  newTaskDraft: z.boolean().default(false),
})
