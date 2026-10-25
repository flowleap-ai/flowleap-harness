# Chroma and the Knowledge Pool

Research date: 2026-10-25. Status: research note, input to the Knowledge Pool ADR. No code.
Labels: **[V]** verified today in a primary source (list at the end), **[L]** read in a local file,
**[U]** unverified (not found in a primary source today, or only in a secondary source).

Short answer: Chroma is a search index (vectors, metadata filters, substring and regex filters). It
is not a wiki, not a memory product and not an access-control layer. In the Knowledge Pool design it
could only replace the SQLite FTS5 index, and on the self-hosted version it does that worse than FTS5
today, because ranked keyword (BM25) and hybrid search are Chroma Cloud only.

Note on the design: the edge-case register in
`2026-10-22-knowledge-pool-design.md` section 10 has 32 rows, not 33 **[L]**. This note maps all 32.

## 1. What Chroma is

**Company and products.** Chroma (trychroma.com) calls itself "open-source data infrastructure for
AI" **[V]**. Products named on the site: Database (the open-source `chromadb`), Chroma Cloud, Cloud
Sync ("serverless data ingestion for Chroma Cloud"), Agent (the Context-1 model with an API
waitlist), and a Package Search MCP server over open-source code **[V]**. No memory product, no wiki
and no document-management layer is named anywhere on the site or in the docs we searched **[V]**.

**The open-source database.**

| Fact | Value |
|---|---|
| Licence | Apache-2.0 (repository and `chroma-mcp`) **[V]** |
| Language | mostly Rust since 1.0.0 (2025-03-01, "rewritten much of Chroma in Rust"); Python, TypeScript, Go and Rust clients **[V]** |
| Latest stable | 1.5.9, 2026-05-05; no stable release in the five months since **[V]** |
| Storage | delegates to SQLite and, for distributed, object storage **[V]**; vector index is HNSW and must sit in RAM to query or update **[V]** |
| Modes | embedded library; single-node server ("typically under 10 million records"); distributed (services, object storage, SSD caches) **[V]** |
| Distributed self-host | the `k8s/` manifests say "UNDER ACTIVE DEVELOPMENT and are not yet ready for production use" **[V]**. In practice self-hosted means single-node. |
| Data model | tenant > database > collection; a collection holds ids, embeddings, metadata and documents **[V]** |
| Search on single-node | dense vector query (`query`), `where` metadata filters, `where_document` with `$contains` and `$regex`. The text filters are case-sensitive and filter only; the docs describe no ranking for them **[V]** |
| Search API (ranked BM25, sparse, hybrid with RRF) | "available in Chroma Cloud only. Future support on single-node Chroma is planned." **[V]** |
| Collection forking (copy-on-write versions) | "available in Chroma Cloud only. The storage engine on single-node Chroma does not support forking." **[V]** |
| Conditional transactions | optimistic, one collection per transaction, explicit-id deletes only **[V]**; whether single-node supports them **[U]** |
| Embedding functions | run in the client. Default `all-MiniLM-L6-v2` (Sentence Transformers) runs locally. Python: OpenAI, Mistral, Cohere, Google, Hugging Face and its embedding server, Jina, Together, Cloudflare, Morph. JavaScript adds Ollama, Voyage, Perplexity, Qwen (Cloud). A local BM25 sparse function exists **[V]** |
| MCP | `chroma-core/chroma-mcp`, Apache-2.0, tools for collections and documents; last push 2025-09-17 **[V]** |

**Chroma Cloud.** Usage pricing: $2.50 per GiB written, $0.33 per GiB-month stored, $0.0075 per TiB
queried, $0.09 per GiB returned; Starter $0 with $5 credit, Team $250 a month, Enterprise custom
**[V]**. Regions: AWS `us-east-1` and GCP `europe-west1` (Belgium) since 2026-04-09; "data is stored
and processed entirely within the region you select" **[V]**. SOC 2 Type II; Enterprise has
single-tenant, BYOC (data plane in the customer's cloud, control plane run by Chroma),
customer-managed keys, PrivateLink **[V]**. Cloud is "the managed offering of distributed Chroma"
**[V]**; it has features single-node does not (Search API, forking, Sync), so self-hosting is not the
same product. Cloud quotas include 16,384 bytes per document and 300 results per query **[V]**.

**Research line.** Five reports **[V]**: Embedding Adapters (2024-05), Evaluating Chunking Strategies
(2024-07), Generative Benchmarking (2025-04), Context Rot (2025-07), Context-1 (2026-03).

- Context Rot: 18 models; quality falls as input grows, even on simple tasks; distractors make it
  worse; on LongMemEval, focused prompts of about 300 tokens beat full prompts of about 113K tokens
  **[V]**. This supports the pool's 8,000-token-per-turn cap and its small-hits read path.
- Context-1: a 20B open-weights "self-editing" search subagent that returns ranked documents to the
  answering model and drops irrelevant results from its own context **[V]**. Its harness is not
  public, per a secondary source **[U]**. It is retrieval, not memory curation.

## 2. Fit against the Knowledge Pool

Chroma touches one layer of the design: the index under the pages. Everything above it (pages,
review, walls, compile, provenance) the pool service must still build.

### By design section

| Section | Chroma covers | Evidence |
|---|---|---|
| 1 Purpose (keep, share, walls, provenance, budget) | partly: storage and search only | no memory, wiki or curation product **[V]** |
| 2 Constraints (2-4 vCPU, 8-16 GB, no GPU) | partly | 100,000 pages of 384-dim vectors fit easily (8 GB RAM holds about 1.7M 1024-dim records **[V]**); the CPU embedding cost is still unmeasured, the same gap the design names |
| 3 Data model (Markdown pages, front matter, git history) | no | records are id + embedding + metadata + document; no history on single-node (forking is Cloud only) **[V]**; metadata could hold `scope`, `tier`, `status` |
| 4 Tiers and walls | partly, as a filter | tenants and databases can partition storage, and `where` can filter scope; there is no user, group or token model on the self-hosted server (built-in auth removed in 1.0.0) **[V]**. The pool service must enforce every wall |
| 5 Write path (screens, dedup, provenance check, compare-and-set) | no | Chroma stores what it is given; dedup by vector distance is possible but the screens and `base_version` stay in the service. Transactions exist, single-node support **[U]** |
| 6 Read path (BM25 with field weights, recency, `disputed` last, map) | no on single-node | no ranked keyword search or hybrid on single-node **[V]**; field weights and recency would be code in the service either way |
| 6 Embeddings trigger | yes, this is the only real fit | dense query with metadata filter, local default embedder **[V]** |
| 7 Compile and lint | no | no job, no model calls in the database |
| 8 Deployment, backup, deletion | partly | one Docker container with a `/data` volume **[V]**; backup procedure not documented beyond "taken a snapshot" **[U]** |
| 9 Security (fail-closed walls, audit, injection framing) | no | no auth, no audit log on single-node **[V]**; OWASP LLM08 asks for permission-aware vector stores, which Chroma single-node is not |
| 11 MVP (Firm tier, BM25, review) | not needed | the MVP has no embeddings |
| 12 Alternatives rejected | already covers it | "A vector database as the primary store" was rejected **[L]**; Chroma is one |

### By edge case (section 10)

"Yes" means Chroma does the work. "Partly" means Chroma gives a primitive and the service does the
rest. "No" means the service does all of it with or without Chroma.

| # | Case | Chroma | Note |
|---|---|---|---|
| 1 | Contradictory facts | no | needs the compile pass |
| 2 | Cites a withdrawn patent | no | needs the connectors check |
| 3 | Matter re-opened | partly | `status` in metadata, filter on it |
| 4 | Client splits | no | person assigns pages |
| 5 | 400-page specification | no | Chroma would invite chunking it all; the design says pointer plus summary |
| 6 | Privileged email pasted | no | write screen |
| 7 | Compile hallucinates a merge | no | code check |
| 8 | Index over the context cap | no | map is built by the service |
| 9 | Service down mid-session | no | one more process that can be down |
| 10 | Page references a deleted matter | no | pointer check |
| 11 | Query spans walls | partly | `where scope in [...]` inside the query, so hidden rows are not ranked; the service must build the list and recheck reads |
| 12 | 2,000 hits | partly | `n_results`; but no total count of matches with a vector query **[U]** |
| 13 | Repository over 100k files | no | git concern |
| 14 | Clock skew | no | server stamps time |
| 15 | Hand edit outside the tools | no | git concern |
| 16 | Old schema instance | no | service concern |
| 17 | Import IDE Working Records | no | importer |
| 18 | Pool text instructs the agent | no | framing and review |
| 19 | Number formats | no | normaliser |
| 20 | Firm leaves, wants everything | partly | data is exportable, but the Markdown repositories are the export anyway |
| 21 | API key in a proposal | no | secrets screen |
| 22 | Remote image or HTML | no | validation |
| 23 | Firm page names a client | no | client-name screen |
| 24 | Conflict found after reads | no | audit log |
| 25 | Group source unreachable | no | service |
| 26 | Compile hits the cost cap | no | service |
| 27 | Same page proposed twice | partly | vector distance can find near-duplicates; hash and title dedup stay |
| 28 | German inflection miss | yes, if embeddings are added | a multilingual embedder would close it; the default `all-MiniLM-L6-v2` is English-centred **[U]** |
| 29 | Attorney wants a page deleted | partly | `delete(ids=...)` removes the row; the tombstone and git history stay in the service |
| 30 | Index corrupt | partly | rebuild from repositories, same as FTS5; re-embedding costs time |
| 31 | Claude Code uses the pool | no | same MCP server |
| 32 | Page rests only on session sources | no | compile report |

Count: 1 yes (conditional), 7 partly, 24 no. Specific checks: right to be forgotten is a row
delete plus the service's own git rewrite; per-matter access control is a filter, not enforcement;
versioning and provenance do not exist on single-node; multi-user writes are safe at the database
but compare-and-set on a page stays in the service.

## 3. Self-hosting facts for a patent firm

| Question | Answer |
|---|---|
| One VM, Docker next to the harness | yes: image `chromadb/chroma`, port 8000, volume at `/data`, YAML config at `/config.yaml` **[V]** |
| Footprint | RAM bounds collection size: N (millions of 1024-dim records) = 0.245 × RAM in GB; at least 2 GB RAM; keep 1 GB for the OS; past RAM, latency "spikes" **[V]**. 100,000 pages at 384 dimensions is well under 1 GB **[U]** (derived, not measured) |
| Latency | t3.medium (4 GB): query mean 5 ms, p99.9 18 ms; inserts about 190 ms per batch of 32 **[V]** |
| Persistence and backup | files under the volume (SQLite plus index files). No documented online backup or restore command for single-node; the docs only warn to snapshot the volume **[V]** for the warning, **[U]** for any procedure. Stopping the container and copying the volume is the safe default **[U]** |
| Auth | none built in since 1.0.0 ("Chroma no longer provides built-in authentication implementations") **[V]**. The firm must put it behind the pool service only, on a private network, never on the tailnet as its own endpoint |
| Observability | OpenTelemetry hooks **[V]** |
| Licence with the MIT harness | Apache-2.0 is compatible with MIT for use and redistribution; ship the Apache NOTICE if the image is bundled **[V]** for the licences, legal reading **[U]** |
| Air-gapped | possible: the default embedder runs locally **[V]**; Ollama (JS client) or a Hugging Face embedding server on the box also work **[V]**. Mistral and OpenAI embedders work on the firm's own keys **[V]**, but then text leaves the box, so the walls question returns |
| Project health | no stable release since 2026-05-05 **[V]**; the MCP server's last push 2025-09-17 **[V]**. Activity is on Cloud features |

## 4. Alternatives in the same slot

| Option | Process | Keyword ranking | Vectors | Auth | Licence | Ops cost for the firm |
|---|---|---|---|---|---|---|
| SQLite FTS5 (the design) | inside the pool service | BM25 with column weights **[L]** | no | the pool's | public domain | none extra |
| SQLite FTS5 + sqlite-vec | inside the pool service | BM25 | brute force; 68 to 185 ms at 100k published **[L]** | the pool's | MIT or Apache-2.0; v0.1.9, pre-1.0 **[V]** | none extra; one native extension |
| LanceDB | embedded library, files on disk | full-text index and hybrid **[U]** | yes | the pool's | Apache-2.0, v0.40.0 2026-10-07 **[V]** | none extra; second storage format |
| pgvector | needs PostgreSQL | Postgres full text (`ts_rank`, not BM25) **[U]** | yes | Postgres roles, row-level security **[U]** | PostgreSQL licence **[V]** | a Postgres to run and back up, unless the firm has one |
| Chroma single-node | separate container | none ranked; substring and regex filters **[V]** | yes | none **[V]** | Apache-2.0 **[V]** | one more container, RAM-bound, volume backup |
| Qdrant | separate container | sparse vectors / BM25 **[U]** | yes | API keys, JWT **[U]** | Apache-2.0, v1.20.0 2026-10-22 **[V]** | one more container |
| Weaviate | separate container | BM25 and hybrid **[U]** | yes | API keys, RBAC **[U]** | "BSD-3-Clause or the Weaviate License" per file **[V]**; check before bundling | heaviest of the set; most configuration |

## 5. What dsh has today

Read in the fork on 2026-10-25 **[L]**:

- No vector store and no embeddings in any `packages/*/*/README.md`.
- `session-query-sqlite`: SQLite FTS5 search over session history, deterministic ranking, quoted
  query text. Used by the experimental `session-search` bundle (five read-only tools), off by default.
- `docs/user/guide/mcp-memory.md`: three default-off example MCP rows (Memorix, the MCP reference
  memory server, Engram). DSH starts or connects to the server and does not pick its model or
  embedder. The reference server is substring match over a JSONL knowledge graph.
- Skills and `agent-instructions` (`AGENTS.md`) give static context, not memory.
- The harness is MIT **[L]**.

So the Knowledge Pool as designed (FTS5 in its own service, reached over the existing MCP client)
reuses a pattern the harness already ships. Chroma would be the first vector store in the stack.

## 6. Recommendation

1. Chroma, if used at all, sits as an optional semantic index under the pool service, beside FTS5, never as the store or the wiki: Markdown pages in git stay the record, the service keeps walls, screens, review and compile, and Chroma gets only page ids, embeddings and `scope`/`status` metadata.
2. It costs the firm one more container with no auth (private network only), RAM-sized, volume backups we must script, a re-embed on every restore, and an embedder (local CPU, or the firm's key, which sends page text out); sqlite-vec or LanceDB give the same vectors inside the service with none of that.
3. Decide first whether the embeddings trigger in design section 6 ever fires at a real firm (reformulation rate and "the page existed" misses in the first 30 days); only then measure CPU embedding throughput for a multilingual model and pick sqlite-vec first, Chroma only if single-node gains the Search API and auth.

## Sources

Local (read 2026-10-25):

- `flowleap/docs/2026-10-22-knowledge-pool-design.md`; `HANDOFF.md` (Knowledge Pool, model hosting notes)
- `docs/user/guide/mcp-memory.md`; `packages/session-query/session-query-sqlite/README.md`;
  `packages/experimental/session-search/README.md`; `LICENSE`
- Memory notes `vision-ai-native-os-for-patent-firms.md`, `harness-business-self-hosted-support.md`

Web (read 2026-10-25):

- https://www.trychroma.com/home
- https://www.trychroma.com/pricing
- https://www.trychroma.com/products/agent
- https://www.trychroma.com/research
- https://www.trychroma.com/research/context-rot
- https://trychroma.com/research/context-1
- https://trychroma.com/changelog/eu-region-support
- https://docs.trychroma.com/llms-full.txt (full docs dump; migration log v1.0.0, Search API and forking availability, Cloud quotas, conditional transactions, full-text search)
- https://docs.trychroma.com/docs/overview/introduction
- https://docs.trychroma.com/docs/overview/architecture
- https://docs.trychroma.com/docs/embeddings/embedding-functions
- https://docs.trychroma.com/docs/querying-collections/full-text-search
- https://docs.trychroma.com/cloud/search-api/overview.md
- https://docs.trychroma.com/cloud/schema/sparse-vector-search.md
- https://docs.trychroma.com/cloud/collection-forking
- https://docs.trychroma.com/integrations/embedding-models/chroma-bm25
- https://docs.trychroma.com/guides/deploy/docker
- https://docs.trychroma.com/guides/deploy/performance
- https://github.com/chroma-core/chroma (licence, languages, releases via GitHub API, `k8s/WARNING.md`)
- https://github.com/chroma-core/chroma-mcp
- https://github.com/asg017/sqlite-vec, https://github.com/lancedb/lancedb, https://github.com/pgvector/pgvector,
  https://github.com/qdrant/qdrant, https://github.com/weaviate/weaviate (licence and latest release via GitHub API)
- Secondary, not relied on for facts marked [V]: https://cookbook.chromadb.dev/security/legacy-auth/,
  https://www.marktechpost.com/2026/03/29/chroma-releases-context-1-a-20b-agentic-search-model-for-multi-hop-retrieval-context-management-and-scalable-synthetic-task-generation/
