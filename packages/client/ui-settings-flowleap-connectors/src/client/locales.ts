/**
 * Copy of the Patent data connectors section and wizard. English only: the
 * locale registry requires both shipped locales, so the English dictionary is
 * registered for `zh` too (README, Known Limitations).
 */

/** Locale keys the section and wizard render. */
export type ConnectorsLocaleKey =
  | 'nav' | 'title' | 'intro' | 'loadFailed'
  | 'epoOpsName' | 'epoOpsHint' | 'usptoOdpName' | 'usptoOdpHint'
  | 'semanticScholarName' | 'semanticScholarHint' | 'mistralName' | 'mistralHint'
  | 'consumerKey' | 'consumerSecret' | 'apiKey' | 'fieldHint' | 'stored' | 'empty'
  | 'configured' | 'notConfigured' | 'readOnly'
  | 'save' | 'saving' | 'remove' | 'removing' | 'test' | 'testing' | 'testPassed' | 'testFailed'
  | 'wizardTitle' | 'wizardIntro' | 'wizardSkip' | 'wizardSave' | 'wizardTest' | 'wizardTestHint' | 'wizardSaveFailed'

/** English copy. */
export const en: Record<ConnectorsLocaleKey, string> = {
  nav: 'Patent data connectors',
  title: 'Patent data connectors',
  intro: 'The patent agent reads EPO, USPTO and academic data in this process with the firm\'s own keys. Keys are stored in the credential store, never in the settings file, and are never shown again after you save them.',
  loadFailed: 'The connector status could not be read. Check the connection and open this page again.',
  epoOpsName: 'EPO OPS',
  epoOpsHint: 'Open Patent Services consumer key and secret from developers.epo.org. Powers patent search, bibliographic data, families, legal status and the EP register.',
  usptoOdpName: 'USPTO ODP',
  usptoOdpHint: 'Open Data Portal API key from data.uspto.gov. Powers US application data, file wrappers, continuity and citations.',
  semanticScholarName: 'Semantic Scholar',
  semanticScholarHint: 'Optional API key from semanticscholar.org. Raises the rate limit of academic search; arXiv needs no key.',
  mistralName: 'Mistral',
  mistralHint: 'Mistral API key for OCR of scanned documents and PDFs (read_pdf, file-wrapper documents). Billed by Mistral per page.',
  consumerKey: 'Consumer key',
  consumerSecret: 'Consumer secret',
  apiKey: 'API key',
  fieldHint: 'Write-only. The stored value is never shown; enter every field to replace the stored key.',
  stored: 'Stored',
  empty: 'Not set',
  configured: 'Configured',
  notConfigured: 'Not configured',
  readOnly: 'The credential store is read-only in this deployment.',
  save: 'Save',
  saving: 'Saving…',
  remove: 'Remove',
  removing: 'Removing…',
  test: 'Test connection',
  testing: 'Testing…',
  testPassed: 'Connection test passed',
  testFailed: 'Connection test failed',
  wizardTitle: 'Connect your patent data sources',
  wizardIntro: 'Add the firm\'s keys so the patent agent can read EPO, USPTO and academic data. You can add or change them later under Settings > Patent data connectors.',
  wizardSkip: 'Skip for now',
  wizardSave: 'Save',
  wizardTest: 'Test',
  wizardTestHint: 'Test saves the keys you entered, then checks each saved connector.',
  wizardSaveFailed: 'A key could not be saved. The connector reports the reason below.',
}

/** Chinese locale seat: the English dictionary, because this package ships English copy only. */
export const zh: Record<ConnectorsLocaleKey, string> = en
