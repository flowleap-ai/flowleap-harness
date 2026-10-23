/** Filesystem ownership for the Electron-managed desktop installation. */

import { join } from 'node:path'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'

/** Stable desktop installation paths under the shared Harness home. */
export interface DesktopPaths {
  readonly profile: string
  readonly lock: string
}

/** Profile directory of the upstream product. */
export const DEFAULT_DESKTOP_PROFILE_DIRECTORY = 'desktop'

/**
 * Resolve every Electron-owned path without changing the shared data roots.
 * @param dshHome - Harness home shared with npm-installed dsh.
 * @param profileDirectory - the product's profile directory under `profiles`; products keep separate profiles.
 * @returns immutable desktop path set.
 */
export function resolveDesktopPaths(
  dshHome: string = resolveDshHome(),
  profileDirectory: string = DEFAULT_DESKTOP_PROFILE_DIRECTORY,
): DesktopPaths {
  return {
    profile: join(dshHome, 'profiles', profileDirectory),
    lock: join(dshHome, 'profiles', profileDirectory, 'lock'),
  }
}
