# DPMAconnectPlus recorded answers

These files are answers of the live DPMAconnectPlus service (`DPMAregisterPatService`). FlowLeap did not record them: FlowLeap has no DPMAconnectPlus contract on 2026-11-16.

## Source

- Repository: <https://github.com/patent-dev/dpma-connect-plus> (Go client, MIT licence, Funktionslust GmbH / patent.dev).
- Commit: `bc95566862af51453d9b25b00b8e5543bcf6112c`.
- The licence text of that repository is in `LICENSE.patent-dev`.
- The content of each answer is public register data of the Deutsches Patent- und Markenamt (DPMA).

| File here | File in the repository | The call |
|---|---|---|
| `patent_info.xml` | `testdata/patent_info.xml` | `getRegisterInfo` of DE 100 27 360 |
| `patent_search.xml` | `testdata/patent_search.xml` | `search/TI=Elektrofahrzeug`, cut to 4 hits by the repository |
| `patent_search_limited.xml` | `testdata/patent_search_limited.xml` | a search that the DPMA cut at the hit limit |
| `patent_search_empty.xml` | `testdata/patent_search_empty.xml` | a search with no hit |
| `patent_search_error.xml` | `testdata/patent_search_error.xml` | a search with a query that the DPMA cannot read |
| `auth_error.xml` | `testdata/auth_error.xml` | a call with a refused login |
| `data_not_available.xml` | `testdata/data_not_available.xml` | a weekly package for a week with no data |
| `version.txt` | `demo/examples/get_version_patent/response.txt` | `version` |

The files are byte copies, with one exception: the line ends of `data_not_available.xml` are LF, not CRLF as recorded, so that a repository that stores text with LF line ends keeps the same bytes. Do not edit them.

## Limits

- The repository does not record the HTTP status of each answer. The client reads the body first and then the status, so it does not depend on the status of a failure answer.
- `patent_search.xml` has `HitCount="4"` and a counter of 3923 hits, because the repository cut the list. A live answer has all hits up to the limit.
- The schema of the hit list (`PatentHitList.xsd`) is not public. These files are the only source of its shape.

## After the contract

Record the same calls with the FlowLeap access, replace these files, and remove `LICENSE.patent-dev` and this source section.
