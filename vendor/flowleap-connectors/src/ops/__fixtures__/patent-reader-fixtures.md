# Patent reader regression fixtures

`ep1234567-{a2,b1}-{biblio,claims}.xml` are unedited public EPO OPS responses recorded on 2026-09-05 from:

- `https://ops.epo.org/3.2/rest-services/published-data/publication/docdb/EP.1234567.A2/{biblio,claims}`
- `https://ops.epo.org/3.2/rest-services/published-data/publication/docdb/EP.1234567.B1/{biblio,claims}`

Bibliography requested `application/exchange+xml`; claims requested `application/fulltext+xml`. Credentials and response headers are not recorded.

The A2 date is 20020828 and its 27 German claims arrive as 29 `claim-text` paragraphs in one unnumbered `claim` node. B1's date is 20070411; its English, German and French claim variants have 26 claims, with continuation paragraphs inside the same flat structure. Claim 3 includes an (a)/(b)/(c) continuation. These capture the real D06/D07 rehearsal failure, including language fallback and publication identity.
