/**
 * Product copy this brand replaces in upstream dictionaries: every English
 * string the shipped `flowleap-web` rows still render that names the
 * harness or its vendor. Each entry is layered over the owning namespace
 * through `ctx.locale.override()` for both shipped locales, so a Chinese
 * browser reads the same English text instead of the dictionary's own.
 * Namespaces and keys are the owning packages' literals; a renamed key
 * upstream makes the override inert for that key, never wrong.
 * @module
 */

import type { BrandRecord } from '../brand.ts'

/** One namespace's replaced keys. */
export interface CopyOverride {
  /** Dictionary namespace the owning plugin registers. */
  readonly ns: string
  /** Replaced keys and their text. */
  readonly dict: Readonly<Record<string, string>>
}

/**
 * Build the copy overrides for one brand.
 * @param brand - the validated brand record.
 * @returns one entry per namespace, in registration order.
 */
export function brandCopy(brand: BrandRecord): readonly CopyOverride[] {
  const product = brand.productName
  return [
    // dsh-client-locale: the sidebar label and the document title base.
    { ns: 'common', dict: { 'brand.localBuild': product } },
    // dsh-client-ui-conversation: the blank-session headline.
    ...(brand.tagline === undefined ? [] : [{ ns: 'conversation', dict: { 'hero.headline': brand.tagline } }]),
    // dsh-client-ui-settings-models: first-run notice and key onboarding.
    {
      ns: 'settings.models',
      dict: {
        welcomeTitle: 'Preview notice',
        welcomeBody: `${product} is in preview. It runs the Patent Agent in your browser on your own model keys and your own patent-office keys; your files stay on the computer that runs it.\n\nResults are research assistance, not legal advice. Check every citation against the office record before you rely on it, and send feedback to FlowLeap so the next release improves.`,
        onboardingTitle: 'Add a model key to get started',
        onboardingDescription: 'Add an Anthropic, OpenRouter or Mistral key, or sign in with the provider that gives you one.',
      },
    },
    // dsh-client-ui-model-selection: the account model group and the lock message.
    {
      ns: 'model',
      dict: {
        'provider.account': 'Account',
        'error.sessionInUse': `This session is already in use, possibly by another running ${product} instance. Quit the other instance and try again.`,
      },
    },
    // dsh-client-ui-plugin-manager: restart and compatibility notices.
    {
      ns: 'pluginManager',
      dict: {
        restartNotice: `Restart ${product} to apply the change. {reason}`,
        restartReasonPackageMoved: `An installed package now resolves to another directory, or the change replaces a package the ${product} installation provides. Uninstall a package before installing it from another location.`,
        restartReasonHostModule: `The change reaches modules ${product} itself loaded.`,
        restartReasonModuleComparison: `${product} could not compare the loaded plugins with their files.`,
        installGuideSafety: `Install only plugins you trust: they run with your permissions and can damage ${product} or leak your data.`,
        installUpgradeNotice: `On-demand Official plugins offer Update when their version differs from ${product}. To update other plugins, uninstall and reinstall them.`,
        installProblemShipped: `This plugin ships with ${product}; upgrading ${product} updates it`,
        sourceTargetSpec: `Source for this ${product}`,
        sourceTargetVersion: `Version for this ${product}`,
        installDoneRestart: `Installed; restart ${product} to load it. {reason}`,
        reasonIncompatibleVersion: `{plugin} is incompatible with ${product} {runtime} (requires {requirements}); running it may cause crashes or data loss.`,
        reasonIncompatibleVersionUnnamed: `This plugin is incompatible with the running ${product} version; running it may cause crashes or data loss.`,
        reasonIncompatibleInstall: `Install a plugin version compatible with this ${product}.`,
        reasonIncompatibleInstalled: `Uninstall it and install a version compatible with this ${product}.`,
      },
    },
    // dsh-client-ui-sidebar-documentpreview (office): the unavailable notice.
    { ns: 'sidebarOffice', dict: { unavailable: `Office previews are unavailable. Enable the document preview service on the computer running ${product}.` } },
    // dsh-client-ui-chat: turn failure messages that name the process or the vendor account.
    {
      ns: 'chat',
      dict: {
        'message.failure.interrupted': `The ${product} process exited before this turn finished (for example, it was killed, crashed, or timed out while shutting down), so the turn was closed when ${product} restarted. Unfinished tool calls have unknown outcomes.`,
        'message.failure.accountSignedOut': 'Stopped because you signed out of the model provider account.',
        'message.failure.accountSignInRequired': 'Sign in to the model provider and ensure the request destination supports account authentication.',
      },
    },
  ]
}
