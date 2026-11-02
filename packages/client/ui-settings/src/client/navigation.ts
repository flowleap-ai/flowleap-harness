/** Settings navigation service type: opens the Settings panel from a surface outside it. */

/** Opens the Settings panel from a surface outside it, such as a Chat failure row. */
export interface SettingsNavigation {
  /**
   * Open the Settings panel on one registered section. While the Settings
   * shell is not mounted (the Host denies settings access), the call does nothing.
   * @param id - `settings.section` entry id, such as `models`.
   */
  openSection(id: string): void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Provided by the Settings shell plugin; absent when no shell plugin is loaded. */
    settingsNavigation: SettingsNavigation
  }
}
