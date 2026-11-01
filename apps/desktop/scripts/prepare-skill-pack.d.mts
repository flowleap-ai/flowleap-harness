import type { DesktopSkillPackRecord } from './desktop-product.mjs'

/** The `pack.json` record of a staged skill pack. */
export interface StagedDesktopSkillPack {
  repository: string
  commit: string
  version: string
}

/**
 * Read the staged `pack.json`, or undefined when the stage holds another commit or none.
 * @param destination The stage directory.
 * @param commit The pinned commit.
 * @returns The staged record.
 */
export function readStagedSkillPack(destination: string, commit: string): StagedDesktopSkillPack | undefined

/**
 * Stage one pinned skill pack.
 * @param spec The product's skill pack record.
 * @param destination The stage directory; replaced unless it already holds `spec.commit`.
 * @returns The staged record.
 */
export function prepareDesktopSkillPack(spec: DesktopSkillPackRecord, destination: string): Promise<StagedDesktopSkillPack>
