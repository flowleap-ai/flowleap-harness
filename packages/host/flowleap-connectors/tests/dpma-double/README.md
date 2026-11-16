# DPMA double

The DPMA double is a local server that answers the DPMAconnectPlus calls of the DPMA register connector (`createConnectors(host).dpma`), in the XML of the real service. It lets the builders use the connector before FlowLeap has a contract with the DPMA.

**The data is recorded public register data. It is not a live answer of the DPMA to FlowLeap.** The start lines of the server say so. The one register record of the data set is DE 100 27 360 (leading file number `100273602`), a recorded answer from the library fixtures ([`vendor/flowleap-connectors/src/dpma/__fixtures__/README.md`](../../../../../vendor/flowleap-connectors/src/dpma/__fixtures__/README.md) names its source).

## Start it

```bash
node --import tsx/esm packages/host/flowleap-connectors/tests/dpma-double/bin.ts --port 8291
```

Run the command from the repository root. The server listens on 127.0.0.1 only. It prints the data marker, the base with the account, and the file numbers.

The account is `flowleap-dpma-double` with the password `public-sample-data`, and its hit limit is 100 (the limit of a DPMA test access). These values are public, because the double serves only public data. To point a composition at the double, set `dpma.baseUrl` of `flowleap-connectors` to `http://127.0.0.1:8291/dpmaws/rest-services` and store the account with `set('dpma', …)` of the `flowleapConnectors` Remote.

## What it does

| Call | Answer |
|---|---|
| `GET …/DPMAregisterPatService/version` | the recorded version text |
| `GET …/DPMAregisterPatService/search/<query>` | a `PatentHitList` built from the register records that match |
| `GET …/DPMAregisterPatService/getRegisterInfo/<leading file number>` | the register record, byte for byte |
| `GET …/DPMAregisterPatService/getRegisterabzuege/<date>/<period>` | "data not available": the double has no register extracts |
| a wrong user name or password | the recorded `Error` element, `Authentification failed` |
| an unknown file | the "data not available" `Transaction` element |
| a query that the double cannot read | a `PatentHitList` with `HitCount="0"` and the message of the DPMA for a refused query |
| more hits than the hit limit | the first hits, with `maxHitsReached="true"` and the message of the DPMA for a cut list |
| a different service or call | `404` |

The double reads a part of the expert search only: conditions `FIELD=value` joined by `UND` or `AND`, with the fields `TI` (title), `INH` (applicant), `VTR` (representative), `AKZ` (file number) and `AT` (filing date as `dd.mm.yyyy`, also with `>=` and `<=`). A text condition matches when the register text has the value, without case. It refuses each other field and operator (`ODER`, `NICHT`, parentheses), so a test cannot pass on a query that the double did not evaluate.

## Where the double is not the DPMA

- **HTTP status.** The recorded answers have no HTTP status. The double sends `401` with the refused login and `200` with each other XML answer. The library client reads the body before the status, so it does not depend on this.
- **An unknown file.** No answer of the DPMA for an unknown leading file number is recorded. The double sends "data not available".
- **The hit list.** The double builds each hit from the register record. `registered-number` is the file number of the record (`10027360.2`), not the printed form of the DPMA (`100 27 360.2`). `legalstatus` is the English text for the two status values that the recorded answers show.
- **The query language.** The real expert search has many more fields, wildcards and operators.

## The data

[`fixture-data.ts`](fixture-data.ts) reads the library fixtures on each start. The data set has one file. The DE files of the seed firm are not in it: they come with the built records of [ADR 0004](../../../../../flowleap/docs/adr/0004-dpma-register-connector.md), decision 9.

[`../dpma-double.spec.ts`](../dpma-double.spec.ts) runs the library client against the double, as a function and over HTTP.
