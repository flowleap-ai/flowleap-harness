/** Host half of the Plugins page: registry-response probing for the installation dialog and the page's display switches. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import z from '@deepseek-ai/schemastery'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { PLUGIN_MANAGER_PAGE_GLOBAL, type PageConfig } from './page-config.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    pluginRegistryProbe: PluginRegistryProbe
  }
}

/** Registry-probe deadline, process-local cache policy, and the page's display switches. */
export interface Config extends PageConfig {
  /** Whether the dialog can compare the public npm registries. */
  registryProbeEnabled: boolean
  /** Deadline for the parallel HTTPS probes, including response cleanup. */
  registryProbeTimeoutMs: number
  /** Lifetime of a winning registry or unavailable result. */
  registryProbeCacheTtlMs: number
}

/**
 * Compares public registry responses on the Host; the Client owns the initial selection. Embeds the display switches
 * in browser pages as {@link PLUGIN_MANAGER_PAGE_GLOBAL}.
 */
export default class PluginRegistryProbe extends TypertRemoteService {
  static Config: z<Partial<Config>, Config> = z.object({
    registryProbeEnabled: z.boolean().default(true),
    registryProbeTimeoutMs: z.natural().min(1).max(MAX_TIMER_DELAY_MS).default(1500),
    registryProbeCacheTtlMs: z.natural().default(300000),
    packageNames: z.boolean().default(true),
  })

  private readonly lifetime = new AbortController()
  private pending: Promise<string | null> | undefined
  private cached: { registry: string | null; expiresAt: number } | undefined

  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'pluginRegistryProbe')
    const page: PageConfig = { packageNames: config.packageNames }
    ctx.on('webserver/index-inject', (table) => {
      table.push({ kind: 'global', name: PLUGIN_MANAGER_PAGE_GLOBAL, value: page })
    })
    ctx.effect(() => async () => {
      this.lifetime.abort()
      await this.pending
    })
  }

  /**
   * Race npm and npmmirror HTTPS ping responses through the Host's fetch proxy.
   * Concurrent readers share a probe; a winner cancels and awaits the other request.
   * @returns the first registry with a successful response, or null when disabled or neither responds successfully; results are cached.
   * @throws rejects when the service has been unloaded.
   */
  @Remote
  async fastest(): Promise<string | null> {
    this.lifetime.signal.throwIfAborted()
    if (!this.config.registryProbeEnabled) return null
    if (this.cached !== undefined && this.cached.expiresAt > Date.now()) return this.cached.registry
    this.pending ??= this.probe().finally(() => { this.pending = undefined })
    return this.pending
  }

  private async probe(): Promise<string | null> {
    const finished = new AbortController()
    const signal = AbortSignal.any([this.lifetime.signal, finished.signal, AbortSignal.timeout(this.config.registryProbeTimeoutMs)])
    const requests = ['https://registry.npmjs.org/-/ping', 'https://registry.npmmirror.com/-/ping'].map(async endpoint => ({
      registry: new URL('/', endpoint).href,
      response: await fetch(endpoint, { signal, redirect: 'error' }),
    }))
    const successful = requests.map(async (request) => {
      const { registry, response } = await request
      if (!response.ok) throw new Error(`Registry ping returned HTTP ${response.status}`)
      return registry
    })
    let registry: string | null
    try {
      registry = await Promise.any(successful)
    } catch (_unavailableRegistries) {
      registry = null
    } finally {
      finished.abort()
      const responses = await Promise.allSettled(requests)
      await Promise.allSettled(responses.map(async (result) => {
        if (result.status === 'fulfilled') await result.value.response.body?.cancel()
      }))
    }
    if (!this.lifetime.signal.aborted) this.cached = { registry, expiresAt: Date.now() + this.config.registryProbeCacheTtlMs }
    return registry
  }
}
