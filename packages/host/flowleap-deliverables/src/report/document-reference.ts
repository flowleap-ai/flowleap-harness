/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The patent document reference the connector library attaches to every read
 * (`documentReference`), copied from the IDE's `patentDocumentReference.ts`
 * (see SOURCE.json) without its VS Code command and URI scheme. The harness
 * has no patent reader pane, so a citation renders as its plain anchor.
 * @module
 */

/** Navigation into retrieved patent data: a publication, a section, and for claims the claim number. */
export interface PatentDocumentReference {
  readonly publicationNumber: string
  readonly section: 'bibliography' | 'abstract' | 'claims' | 'description'
  readonly claimNumber?: string
}

/**
 * Validate both connector data and untrusted model input before it names a source.
 * @param value - the candidate reference object.
 * @returns the reference, or `undefined` when the shape is not a reference.
 */
export function parsePatentDocumentReference(value: unknown): PatentDocumentReference | undefined {
  if (!value || typeof value !== 'object' || !('publicationNumber' in value) || !('section' in value)) {
    return undefined
  }
  const { publicationNumber, section } = value
  const claimNumber = 'claimNumber' in value ? value.claimNumber : undefined
  if (typeof publicationNumber !== 'string' || !/^[A-Z]{2}\d{1,16}(?:[A-Z]\d?)?$/.test(publicationNumber)
		|| (section !== 'bibliography' && section !== 'abstract' && section !== 'claims' && section !== 'description')
		|| (claimNumber !== undefined && (section !== 'claims' || typeof claimNumber !== 'string' || !/^[1-9]\d{0,4}$/.test(claimNumber)))) {
    return undefined
  }
  return { publicationNumber, section, ...(claimNumber ? { claimNumber } : {}) }
}

/**
 * The target a reference names inside its document: `claim-N` or the section.
 * @param reference - the validated reference.
 * @returns the target label.
 */
export function patentDocumentTarget(reference: PatentDocumentReference): string {
  return reference.claimNumber ? `claim-${reference.claimNumber}` : reference.section
}

/**
 * How a report cites a recorded source. The IDE renders a `flowleap://` reader
 * link here; the harness has no reader pane, so the citation is the anchor
 * label itself (plan section 1: "plain anchors instead").
 * @param label - the anchor label to show.
 * @param _reference - the reference the label stands for; unused without a reader.
 * @returns the label unchanged.
 */
export function patentCitationLink(label: string, _reference: PatentDocumentReference | null | undefined): string {
  return label
}
