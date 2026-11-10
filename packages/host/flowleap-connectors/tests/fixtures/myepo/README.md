# MyEPO sandbox fixtures

The answers of the EPO MyEPO sandbox (`https://api-sandbox.apps-staging.epo.org/latest`), recorded read-only on 2026-11-09 after the account's reset, for the specs of the MyEPO client and link. Each file holds the status, the content type and the body of one answer; the data is the sandbox's dummy data. No file holds a client ID, a client secret or a token, and the recording sent no write and no reset.

| File | Request |
|---|---|
| `portfolios.json` | `GET /portfolios`: 6 portfolios, three with full access |
| `applications.json`, `applications-page.json` | `GET /applications` and `GET /applications?size=2&page=1`: 8 applications |
| `applications-portfolio-999.json` | `GET /applications?portfolioId=999`: `403 ERR_20` |
| `biblio-EPC-EP00000001.json`, `biblio-unknown.json` | `GET /biblio-data/EPC/applications/EP00000001`, and `EP99999999`: `400 ERR_30` |
| `communications.json`, `communications-unhandled.json` | `GET /communications` and `GET /communications/unhandled`: 9 letters, one with no application |
| `folders.json` | `GET /communications/folders` |
| `due-dates-EPC-EP00000001.json`, `fees-EPC-EP00000001.json` | the due dates and the pending fees of `EP00000001` |
| `terms.json` | `GET /terms`: 82 terms in English, French and German |
| `token-refused.json` | the login service's `401 invalid_client` for a wrong secret (status and error fields only) |
| `api-401.json` | the API's `401` for a token that is not a JWT |

The download of a letter is not stored: the sandbox ZIP of letter `l9s8o3a1luusand` was 609,537 bytes and held one PDF, `P79105WO1-2023.05.30-SE2023123456-I1015.pdf` (620,983 bytes). The [MyEPO double](../../myepo-double/README.md) answers each download with a ZIP of the same layout and a small PDF; it serves these recordings as its sandbox data set, and its spec checks that it answers each recorded read with the recorded status and body.
