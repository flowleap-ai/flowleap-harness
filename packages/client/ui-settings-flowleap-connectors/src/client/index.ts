/**
 * Patent data connectors settings, browser half: the "Patent data connectors"
 * settings section with one write-only card per connector, and the first-run
 * key wizard shown while no connector is configured and the dismissal is not
 * recorded. Both read presence and write keys through the `flowleapConnectors`
 * Remote; the dismissal rides this row's settings scope.
 */

// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the ctx.configForms Context merge and the settings SlotMap merge.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: the ctx.remote Context merge and the forwarded-event key face.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { ConnectorsSection, type ConnectorsSectionInjected } from './ConnectorsSection.tsx'
import { ConnectorsWizard, type ConnectorsWizardInjected } from './ConnectorsWizard.tsx'
import { ConnectorsStore } from './connectors-store.ts'
import { WizardStore, type WizardSection } from './wizard-store.ts'
import { en, zh, type ConnectorsLocaleKey } from './locales.ts'
import { WIZARD_SETTINGS_NAMESPACE } from '../wizard-settings.ts'

export type { ConnectorsSectionInjected, ConnectorsSectionProps } from './ConnectorsSection.tsx'
export type { ConnectorsWizardInjected, ConnectorsWizardProps } from './ConnectorsWizard.tsx'
export type { ConnectorCardProps, Translate } from './ConnectorCard.tsx'
export type { ConnectorCardState, ConnectorId, ConnectorsState } from './connectors-store.ts'
export type { WizardState } from './wizard-store.ts'
export type { ConnectorsLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Patent data connectors section and wizard copy. */
    'settings.flowleapConnectors': ConnectorsLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.flowleapConnectors'

/** Required services (cordis fiber inject); `remote.flowleapConnectors` parks the plugin until the Host serves the namespace. */
export const inject = ['slots', 'locale', 'remote', 'remote.flowleapConnectors', 'configForms']

/**
 * Register the section and the wizard step, and keep the page fresh on record changes.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-flowleap-connectors: dictionaries')
  const t = ctx.locale.bind(NS) as ConnectorsWizardInjected['t']
  const controller = new ConnectorsStore(ctx)
  const wizardController = new WizardStore(ctx.configForms.get<WizardSection>(WIZARD_SETTINGS_NAMESPACE))
  // A key written from another browser or the wizard changes no settings
  // section; the record event is the one signal that reaches the page.
  ctx.effect(() => {
    const dispose = ctx.remote.$on('credentials/record-updated', () => { controller.refresh() })
    return () => {
      wizardController.dispose()
      dispose()
    }
  }, 'ui-settings-flowleap-connectors: record invalidations')
  const sectionInjected = (): ConnectorsSectionInjected => ({ controller, hooks: { connectors: controller.store } })
  const wizardInjected = (): ConnectorsWizardInjected => ({
    controller, wizardController, hooks: { connectors: controller.store, wizard: wizardController.store }, t,
  })
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'flowleap-connectors', order: 15, label: () => t('nav'), locale: NS, inject: sectionInjected,
  }, ConnectorsSection))
  ctx.slots.inject('settings.onboarding', () => ctx.slots.register({
    name: 'settings.onboarding', id: 'flowleap-connectors', order: 10, inject: wizardInjected,
  }, ConnectorsWizard))
}
