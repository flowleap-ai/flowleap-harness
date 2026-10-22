# WO claim numbering fixtures

The XML files `wo-9951190-a1-claims.xml` and `ep-0983762-a1-claims.xml` are verbatim successful EPO OPS responses retrieved on 2026-09-09 using `Accept: application/fulltext+xml`:

- `https://ops.epo.org/3.2/rest-services/published-data/publication/docdb/WO.9951190.A1/claims`
- `https://ops.epo.org/3.2/rest-services/published-data/publication/docdb/EP.0983762.A1/claims`

Only public patent XML is retained; no credentials, tokens, HTTP headers, or personal/session data are included. WO XML SHA-256: `a364fbdffc9d6b8ab9ebb80f9eaf0f00273a1fbba8b19a8f1899e710cfb493e9`.

WO is `fulltext-format="text-only"`, `lang="JA"`, with one unnumbered `<claim>` and one `<claim-text>`. Its text starts `1.\n請求の範囲\n1. ...`, followed by printed numbers 2–11. Numbers 5–9 have spaces before the dot; 10 and 11 have spaces between digits. There are no nested claim elements to recover. The decoded claim text exactly matches the previously saved tool output's single Claim 1 block from the reported session. No substantive text, OCR spelling, formula markup, or heading is corrected.

EP has eight English claims in a single unnumbered claim wrapper but separate XML paragraphs, including lettered continuation paragraphs for claims 1 and 2. It verifies that the WO fix preserves already-correct EP boundaries.
