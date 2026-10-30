/** The wizard dismissal is a live Config field kept off the generated Settings pages. */
import { Context } from '@deepseek-ai/cordis'
import { expect, it, onTestFinished } from 'vitest'
import { liveConfig, omitsGeneratedPage } from '../../../settings/settings/tests/live-config.ts'
import { plainConfig } from '../../../settings/settings/src/schema.ts'
import * as HostPlugin from '../src/index.ts'

it('validates and updates the wizard dismissal without remounting', async () => {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  const configuration = await liveConfig(ctx, HostPlugin)
  expect(plainConfig(configuration.fiber.effectiveConfig)).toMatchObject({ wizardDismissed: false })
  await configuration.update({ wizardDismissed: true })
  expect(plainConfig(configuration.fiber.effectiveConfig)).toMatchObject({ wizardDismissed: true })
  expect(configuration.entry.fiber).toBe(configuration.fiber)
})

it('keeps its own instance off the generated Settings pages', () => omitsGeneratedPage(ctx => ctx.plugin(HostPlugin)))
