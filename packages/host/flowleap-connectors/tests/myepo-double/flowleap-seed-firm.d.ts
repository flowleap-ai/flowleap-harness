/** The part of the `flowleap-seed-firm` package (plain JavaScript with JSDoc types) that the MyEPO double reads. */
declare module 'flowleap-seed-firm' {
  export interface SeedDocument {
    readonly row: number
    readonly kind: string
    readonly language: 'de' | 'en' | 'fr'
    readonly registerListDate: string
    readonly dateOnDocument: string | null
    readonly formCode: string | null
    readonly reference: string | null
    readonly applicationNumberPrinted: string | null
    /** The PDF on disk. */
    readonly path: string
  }
  export interface RegisterSnapshot {
    readonly tool: string
    readonly body: unknown
  }
  export interface Matter {
    readonly application: string
    readonly firstPublication: string
    readonly client: string
    readonly fileNumber: string
    readonly type: 'prosecution' | 'opposition'
    readonly documents: readonly SeedDocument[]
    readonly register: Readonly<Record<string, RegisterSnapshot>>
  }
  export interface Client {
    readonly id: string
    readonly publishedNames: readonly string[]
  }
  export interface Seed {
    readonly root: string
    readonly clients: readonly Client[]
    readonly clocks: { readonly default: string; readonly clocks: Readonly<Record<string, string>> }
    readonly matters: readonly Matter[]
  }
  /** Reads the whole seed from the package directory, or from `root`. */
  export function loadSeed(root?: string): Seed
}
