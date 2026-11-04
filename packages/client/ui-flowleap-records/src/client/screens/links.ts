/**
 * Copy link: write the address of a view to the clipboard.
 */

/**
 * Write an address to the clipboard.
 * @param href - the address.
 * @returns whether the clipboard took it; a browser without clipboard access or a refused permission gives false.
 */
export async function copyLink(href: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(href)
    return true
  } catch (_error: unknown) {
    // No clipboard API, no permission, or a document without focus: the caller reports the failure where it shows.
    return false
  }
}
