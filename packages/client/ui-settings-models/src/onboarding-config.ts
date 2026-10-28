/** Public page-bootstrap options shared by the Host and Client halves. */

import z from '@deepseek-ai/schemastery'

/** Onboarding options after schema defaults are applied. */
export interface Config {
  /** Offer the browser API-key step when no native shell owns credential onboarding. */
  credentialOnboarding: boolean
  /**
   * The deployment fixes the model routes and keys: the page shows them and
   * offers no add, edit, sign-in, or key entry. The Host operations refuse
   * those writes on their own (`llm-pi-ai` `fixedRoutes`, `credentials-local`
   * `lockedRefs`); this flag only keeps the page from offering them.
   */
  managed: boolean
}

/** Validate Host configuration and its public page-bootstrap payload. */
export const Config: z<Partial<Config>, Config> = z.object({
  credentialOnboarding: z.boolean().default(true),
  managed: z.boolean().default(false),
})

/** Page-global key carrying only the public onboarding options. */
export const ONBOARDING_CONFIG_GLOBAL = '__DSH_MODELS_ONBOARDING__'
