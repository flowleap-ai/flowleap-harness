/** Deployment switches shared by the Host configuration and the browser menu rows. */
import z from '@deepseek-ai/schemastery'

/** Page global that carries the validated configuration to the browser. */
export const ENTRY_CUSTOMIZATION_GLOBAL = '__DSH_ENTRY_CUSTOMIZATION_CONFIG__'

/** Menu rows a deployment offers. */
export interface Config {
  /** Offer **Create your plugin**, which opens a Creator draft; turn it off where the Creator preset is not offered. */
  createPlugin: boolean
}

/** Validated menu-row switches. */
export const Config: z<Partial<Config>, Config> = z.object({
  createPlugin: z.boolean().default(true),
})
