import {
  cachedProviderRead,
  mapProviderError,
  type ProviderReadFailure,
  type ProviderReadResult,
} from "../cached-provider-read.js";
import type { ConnectorContext } from "../context.js";
import { ErrorCodes } from "../contract/error-codes.js";
import {
  DataKeysRequiredError,
  ProviderKeyInvalidError,
  RateLimitError,
  UpstreamError,
  UpstreamUnavailableError,
} from "../errors.js";
import {
  extractAbstract,
  extractConvertedNumber,
  extractDescriptionLanguages,
  extractEquivalents,
  extractEquivalentsFamily,
  extractFamilyBiblioMembers,
  extractFamilyLegalEvents,
  extractFamilyMembers,
  extractFamilyRepresentatives,
  extractFulltextAvailability,
  extractFulltextSections,
  extractImageInquiry,
  extractLegalEvents,
  extractProceduralSteps,
  extractRegisterBiblio,
  extractRegisterEvents,
  extractRegisterSearch,
  extractSearchRefs,
  extractStateCoverage,
  extractUnitaryPatent,
  formatRefDocId,
} from "./extract.js";
import { opsFetch, opsFetchBinary } from "./fetch.js";
import { rasterizePdf, rasterizePdfToPng } from "./rasterize.js";
import { OPS_RESPONSE_SHAPE_VERSION } from "./types.js";
import type {
  AbstractResponse,
  BiblioData,
  CitationItem,
  CitationsResponse,
  ClaimsResponse,
  CompactFigurePage,
  DescriptionData,
  EquivalentsFamilyData,
  EquivalentsResponse,
  ErrorResponse,
  FamilyBiblioResponse,
  FamilyLegalResponse,
  FamilyResponse,
  FulltextInquiryResponse,
  FulltextSectionsData,
  ImageInquiryData,
  LegalResponse,
  NumberConvertResponse,
  ProceduralStepsResponse,
  RegisterBiblioResponse,
  RegisterSearchResponse,
  RegisterEventsResponse,
  SearchResponse,
  SearchResultItem,
  UnitaryPatentResponse,
} from "./types.js";
import { cleanDocumentId } from "./utils.js";
import { publicationLookup, selectPublication } from "./publication.js";
import {
  extractBiblio,
  extractNumberedClaims,
  extractDescription,
  xmlToJson,
} from "./xml-to-json.js";

/**
 * EPO document module (PRD #94; tracer bullet #95, fan-out #98).
 *
 * The single seam for EPO OPS document data. Per-document operations —
 * biblio, abstract, claims, description, fulltext availability, family,
 * equivalents, legal status, forward citations, number conversion, EP
 * Register data, images/figures, and search — each own, inside the
 * implementation:
 *  - authenticated fetch via opsFetch (OAuth2 token + ~10 req/sec throttle),
 *  - hybrid memory+Redis caching composed on cachedProviderRead — one place
 *    constructs EPO cache keys (epoCacheKey), per-datum TTLs live in
 *    EPO_CACHE_TTL_SECONDS, failures are never cached,
 *  - typed-error mapping to the unified envelope (DataKeysRequiredError,
 *    ProviderKeyInvalidError, RateLimitError pass through; EPO HTTP failures
 *    become UpstreamError with the upstream status),
 *  - XML parsing via the shared extractors (xml-to-json.ts + extract.ts).
 *
 * Operations run their upstream fetch in the caller's AsyncLocalStorage
 * request context, so per-request patent keys flow through — the module never
 * captures credentials.
 *
 * The `get*Data` / `searchPatentsData` functions are the legacy direct-call
 * surface (tools registry) — thin wrappers over module operations that
 * collapse failures to the historical `{ error, status }` shape.
 */

/**
 * TTL for cached bibliographic data (24 hours — preserved from the ops biblio
 * route and the enrichment fan-out, which both used 86400s; published biblio
 * is effectively immutable).
 */
export const BIBLIO_CACHE_TTL_SECONDS = 86400;

/**
 * Per-datum cache TTLs, preserved from the TTL each retired route/wrapper
 * used. Published-document data (biblio, abstract, fulltext, family,
 * register biblio/UPP) is effectively immutable → 24h; status-like data
 * (legal, citations, register events/procedural) can change → 12h; searches →
 * 6h; number conversions and figure binaries never change → 7 days.
 * Claims/description are the heavier fulltext fetches (ADR 0002 cost model)
 * and keep their own keys/TTLs, distinct from biblio.
 */
export const EPO_CACHE_TTL_SECONDS = {
  biblio: BIBLIO_CACHE_TTL_SECONDS,
  abstract: 86400,
  claims: 86400,
  description: 86400,
  fulltextInquiry: 86400,
  fulltextSections: 86400,
  family: 86400,
  familyEquivalents: 86400,
  equivalents: 86400,
  legal: 43200,
  citations: 43200,
  search: 21600,
  numberConvert: 604800,
  images: 86400,
  figure: 604800,
  familyBiblio: 86400,
  familyLegal: 43200,
  registerBiblio: 86400,
  registerSearch: 21600,
  registerEvents: 43200,
  registerProcedural: 43200,
  registerUpp: 86400,
} as const;

/**
 * One place constructs EPO document cache keys:
 * `epo:v<shape>:<datum>:<cleaned epodoc id>` (plus datum-specific qualifiers
 * like language or range). The id is cleaned first so every consumer of the
 * same document shares one hybrid cache entry regardless of input formatting.
 *
 * The shape version comes first so one generation of entries is a single
 * scannable namespace: `epo:v1:*` and `epo:v2:*` never overlap, and an
 * operator can see at a glance which one is live. Bumping
 * OPS_RESPONSE_SHAPE_VERSION (`./types.ts`) in the same commit as a
 * response-shape change is what stops a deployed fix serving the old shape
 * out of a warm cache (#433) — see that constant for the bump rule.
 */
function epoCacheKey(datum: string, qualifier: string): string {
  return `epo:v${OPS_RESPONSE_SHAPE_VERSION}:${datum}:${qualifier}`;
}

/**
 * True when an opsFetch throw is OPS's zero-hit search answer: HTTP 404 with
 * fault code SERVER.EntityNotFound. The fault code is what makes the match
 * unambiguous — a genuine missing document 404s with a different code, and a
 * malformed query fails with 400 CLIENT.* codes.
 */
function isOpsNoSearchResults(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  return (
    message.includes("OPS error 404") &&
    message.includes("SERVER.EntityNotFound")
  );
}

/**
 * Normalize an opsFetch throw for the unified envelope. Typed key/rate-limit
 * errors pass through untouched (cachedProviderRead owns their mapping); EPO
 * HTTP failures become UpstreamError carrying the upstream status (404 →
 * not_found, 429 → rate_limit_exceeded — the same message sniffing the ops
 * routes historically applied, kept for byte-compatible adapters); anything
 * else stays as-is and maps to the generic 502 upstream_error.
 */
function asEpoUpstreamError(error: unknown): unknown {
  if (
    error instanceof DataKeysRequiredError ||
    error instanceof ProviderKeyInvalidError ||
    error instanceof RateLimitError ||
    error instanceof UpstreamUnavailableError ||
    error instanceof UpstreamError
  ) {
    return error;
  }

  const message = error instanceof Error ? error.message : null;
  if (message) {
    if (message.includes("404") || message.includes("not found")) {
      return new UpstreamError(404, "not_found", message);
    }
    if (message.includes("429")) {
      return new UpstreamError(429, "rate_limit_exceeded", message);
    }
    const match = /OPS error (\d{3})/.exec(message);
    if (match) {
      const status = Number.parseInt(match[1], 10);
      return new UpstreamError(
        status >= 400 && status < 600 ? status : 502,
        "upstream_error",
        message
      );
    }
  }

  return error;
}

/** Authenticated OPS fetch normalized for the unified envelope. */
async function fetchOpsXml(
  ctx: ConnectorContext,
  path: string,
  acceptType: string,
  range?: string
): Promise<string> {
  try {
    return await opsFetch(ctx, path, range ? { acceptType, range } : { acceptType });
  } catch (error) {
    throw asEpoUpstreamError(error);
  }
}

/**
 * `publicationLookup` for the envelope paths.
 *
 * Every module read answers the unified envelope, but the lookup runs BEFORE
 * cachedProviderRead (its result builds the cache key), so a malformed number
 * threw straight past the mapping and out of the module. Two things went wrong
 * with that: the tools facade saw a bare throw and reported 500 INTERNAL_ERROR
 * for what is a 422 INVALID_INPUT, and — worse — a per-document fan-out such
 * as the search hydration rejected as a whole, so ONE unparseable number in a
 * page failed every other hit on it.
 *
 * Returning the failure as an envelope fixes both: the caller's existing
 * `!result.ok` branch degrades that record and keeps the page.
 */
function resolvePublication(
  ctx: ConnectorContext,
  documentId: string
):
  | { ok: true; lookup: ReturnType<typeof publicationLookup> }
  | { ok: false; failure: ProviderReadFailure } {
  try {
    return { ok: true, lookup: publicationLookup(documentId) };
  } catch (error) {
    return { ok: false, failure: { ok: false, ...mapProviderError(ctx.host, error) } };
  }
}

// ============================================================================
// Biblio
// ============================================================================

export interface GetBiblioOptions {
  /** Cache TTL override in seconds. Defaults to BIBLIO_CACHE_TTL_SECONDS. */
  ttlSeconds?: number;
}

/**
 * Bibliographic data for a published document — the module operation.
 *
 * Serves from the shared hybrid cache when possible; on a miss fetches the
 * exchange+xml biblio document (throttled, authenticated, in the caller's
 * patent-key request context), parses it with the shared extractor, and
 * caches the normalized result. Failures map to the unified envelope and are
 * never cached.
 */
export async function getBiblio(
  ctx: ConnectorContext,
  documentId: string,
  opts: GetBiblioOptions = {}
): Promise<ProviderReadResult<BiblioData>> {
  const resolved = resolvePublication(ctx, documentId);
  if (!resolved.ok) {
    return resolved.failure;
  }
  const lookup = resolved.lookup;
  const cleanedDoc = lookup.docId;

  return cachedProviderRead<BiblioData>(ctx.host, {
    cacheKey: epoCacheKey("publication-v2:biblio", cleanedDoc),
    ttlSeconds: opts.ttlSeconds ?? BIBLIO_CACHE_TTL_SECONDS,
    fetchFresh: async () => {
      const xml = await fetchOpsXml(ctx,
        `/published-data/publication/${lookup.path}/biblio`,
        "application/exchange+xml"
      );

      const json = await xmlToJson(xml);
      const biblio = extractBiblio(selectPublication(json, cleanedDoc));

      // Add-only: omitted when the document has no references-cited block, so
      // cached entries written before this field stay valid.
      const citedReferences = biblio.citedReferences?.length
        ? { citedReferences: biblio.citedReferences }
        : {};

      // Normalized shape (and key order — the ops route serializes this
      // object verbatim, so order is part of the byte-compatible contract).
      return {
        docId: biblio.docId || documentId,
        title: biblio.title || null,
        abstract: biblio.abstract || null,
        applicants: biblio.applicants || [],
        inventors: biblio.inventors || [],
        ipc: biblio.ipc || [],
        cpc: biblio.cpc || [],
        dates: {
          filing: biblio.dates?.filing || null,
          publication: biblio.dates?.publication || null,
          priority: biblio.dates?.priority || [],
        },
        ...citedReferences,
      };
    },
  });
}

/**
 * Legacy direct-call surface over getBiblio (tools registry). Same shared
 * hybrid cache entry; failures collapse to the historical `{ error, status }`
 * shape.
 */
export async function getBiblioData(
  ctx: ConnectorContext,
  documentId: string
): Promise<BiblioData | ErrorResponse> {
  const result = await getBiblio(ctx, documentId);
  if (result.ok) {
    return result.data;
  }
  return { error: result.body.error.message, status: result.status };
}

// ============================================================================
// Abstract
// ============================================================================

/** Abstract text for a published document (English preferred). */
export async function getAbstract(
  ctx: ConnectorContext,
  documentId: string
): Promise<ProviderReadResult<AbstractResponse>> {
  const resolved = resolvePublication(ctx, documentId);
  if (!resolved.ok) {
    return resolved.failure;
  }
  const lookup = resolved.lookup;
  const cleanedDoc = lookup.docId;

  return cachedProviderRead<AbstractResponse>(ctx.host, {
    cacheKey: epoCacheKey("publication-v2:abstract", cleanedDoc),
    ttlSeconds: EPO_CACHE_TTL_SECONDS.abstract,
    fetchFresh: async () => {
      const xml = await fetchOpsXml(ctx,
        `/published-data/publication/${lookup.path}/abstract`,
        "application/exchange+xml"
      );

      const json = await xmlToJson(xml);
      const publication = selectPublication(json, cleanedDoc);
      const { abstract, lang } = extractAbstract(publication);

      return { docId: publicationLookup(extractBiblio(publication).docId).docId, lang, abstract };
    },
  });
}

/** Legacy direct-call surface over getAbstract (tools registry). */
export async function getAbstractData(
  ctx: ConnectorContext,
  documentId: string
): Promise<{ docId: string; abstract: string | null } | ErrorResponse> {
  const result = await getAbstract(ctx, documentId);
  if (result.ok) {
    return { docId: result.data.docId, abstract: result.data.abstract };
  }
  return { error: result.body.error.message, status: result.status };
}

// ============================================================================
// Claims / description / fulltext availability
// ============================================================================

/**
 * Claims text for a published document. The heavier fulltext fetch (ADR 0002
 * cost model) — its cache key includes the language and stays distinct from
 * biblio's.
 */
export async function getClaims(
  ctx: ConnectorContext,
  documentId: string,
  language = "en"
): Promise<ProviderReadResult<ClaimsResponse>> {
  const resolved = resolvePublication(ctx, documentId);
  if (!resolved.ok) {
    return resolved.failure;
  }
  const lookup = resolved.lookup;
  if (!lookup.kind) {
    const biblio = await getBiblio(ctx, documentId);
    if (!biblio.ok) return biblio;
    return getClaims(ctx, biblio.data.docId, language);
  }
  const cleanedDoc = lookup.docId;

  return cachedProviderRead<ClaimsResponse>(ctx.host, {
    cacheKey: epoCacheKey("publication-v4:claims", `${cleanedDoc}:${language}`),
    ttlSeconds: EPO_CACHE_TTL_SECONDS.claims,
    fetchFresh: async () => {
      // IMPORTANT: Use application/fulltext+xml for fulltext endpoints
      // application/exchange+xml returns bibliographic data only
      const xml = await fetchOpsXml(ctx,
        `/published-data/publication/${lookup.path}/claims`,
        "application/fulltext+xml"
      );

      const json = selectPublication(await xmlToJson(xml, { preserveClaimOrder: true }), cleanedDoc, true);
      const extracted = extractNumberedClaims(json, language);
      return {
        docId: cleanedDoc,
        lang: extracted.language,
        claims: extracted.unsegmentedText ? [extracted.unsegmentedText] : extracted.claims.map(claim => claim.text),
        numberedClaims: extracted.claims,
        ...(extracted.unsegmentedText ? { unsegmentedText: extracted.unsegmentedText } : {}),
      };
    },
  });
}

/** Legacy direct-call surface over getClaims (tools registry): numbered claims. */
export async function getClaimsData(
  ctx: ConnectorContext,
  documentId: string,
  language = "en"
): Promise<any | ErrorResponse> {
  const result = await getClaims(ctx, documentId, language);
  if (!result.ok) {
    return { error: result.body.error.message, status: result.status };
  }

  const claims = result.data.numberedClaims ?? result.data.claims.map((text, index) => ({
    number: (index + 1).toString(),
    text,
  }));

  return {
    docId: result.data.docId,
    claims,
    totalClaims: result.data.unsegmentedText ? null : claims.length,
    language: result.data.lang,
    ...(result.data.unsegmentedText ? { unsegmentedText: result.data.unsegmentedText } : {}),
  };
}

/**
 * Description text for a published document, with language detection. The
 * other heavy fulltext fetch — language-qualified key, distinct from biblio's.
 */
export async function getDescription(
  ctx: ConnectorContext,
  documentId: string,
  language = "en"
): Promise<ProviderReadResult<DescriptionData>> {
  const resolved = resolvePublication(ctx, documentId);
  if (!resolved.ok) {
    return resolved.failure;
  }
  const lookup = resolved.lookup;
  if (!lookup.kind) {
    const biblio = await getBiblio(ctx, documentId);
    if (!biblio.ok) return biblio;
    return getDescription(ctx, biblio.data.docId, language);
  }
  const cleanedDoc = lookup.docId;

  return cachedProviderRead<DescriptionData>(ctx.host, {
    cacheKey: epoCacheKey("publication-v2:description", `${cleanedDoc}:${language}`),
    ttlSeconds: EPO_CACHE_TTL_SECONDS.description,
    fetchFresh: async () => {
      // IMPORTANT: Use application/fulltext+xml for fulltext endpoints
      // application/exchange+xml returns bibliographic data only
      const xml = await fetchOpsXml(ctx,
        `/published-data/publication/${lookup.path}/description`,
        "application/fulltext+xml"
      );

      const json = selectPublication(await xmlToJson(xml), cleanedDoc, true);
      const availableLanguages = extractDescriptionLanguages(json);

      // Try to extract the requested language first (preferred)
      const description = extractDescription(json, language);

      // Detect actual language returned
      let actualLanguage = language;
      if (!description || description.length === 0) {
        // No description available at all
        actualLanguage = "none";
      } else if (
        availableLanguages.length > 0 &&
        !availableLanguages.includes(language.toUpperCase())
      ) {
        // Requested language not available, using first available
        actualLanguage = availableLanguages[0];
      }

      return {
        docId: cleanedDoc,
        description,
        language: actualLanguage,
        availableLanguages,
        requestedLanguage: language,
      };
    },
  });
}

/** Legacy direct-call surface over getDescription (tools registry). */
export async function getDescriptionData(
  ctx: ConnectorContext,
  documentId: string,
  language = "en"
): Promise<any | ErrorResponse> {
  const result = await getDescription(ctx, documentId, language);
  if (!result.ok) {
    return { error: result.body.error.message, status: result.status };
  }
  const data = result.data;
  return {
    docId: data.docId,
    description: data.description || null,
    language: data.language,
    availableLanguages: data.availableLanguages,
    requestedLanguage: data.requestedLanguage,
  };
}

/** Fulltext availability (claims/description per language) for a document. */
export async function getFulltextInquiry(
  ctx: ConnectorContext,
  documentId: string
): Promise<ProviderReadResult<FulltextInquiryResponse>> {
  const resolved = resolvePublication(ctx, documentId);
  if (!resolved.ok) {
    return resolved.failure;
  }
  const lookup = resolved.lookup;
  const cleanedDoc = lookup.docId;

  return cachedProviderRead<FulltextInquiryResponse>(ctx.host, {
    cacheKey: epoCacheKey("publication-v2:fulltext-inquiry", cleanedDoc),
    ttlSeconds: EPO_CACHE_TTL_SECONDS.fulltextInquiry,
    fetchFresh: async () => {
      const xml = await fetchOpsXml(ctx,
        `/published-data/publication/${lookup.path}/fulltext`,
        "application/exchange+xml"
      );

      const json = await xmlToJson(xml);
      const availability = extractFulltextAvailability(json);
      availability.docId = cleanedDoc;
      return availability;
    },
  });
}

/**
 * Fulltext sections in the legacy direct-call shape (fulltext-documents
 * walker) — its own operation because the shape is not derivable from the
 * inquiry-based one.
 */
export async function getFulltextSections(
  ctx: ConnectorContext,
  documentId: string
): Promise<ProviderReadResult<FulltextSectionsData>> {
  const resolved = resolvePublication(ctx, documentId);
  if (!resolved.ok) {
    return resolved.failure;
  }
  const lookup = resolved.lookup;
  const cleanedDoc = lookup.docId;

  return cachedProviderRead<FulltextSectionsData>(ctx.host, {
    cacheKey: epoCacheKey("publication-v2:fulltext-sections", cleanedDoc),
    ttlSeconds: EPO_CACHE_TTL_SECONDS.fulltextSections,
    fetchFresh: async () => {
      const xml = await fetchOpsXml(ctx,
        `/published-data/publication/${lookup.path}/fulltext`,
        "application/exchange+xml"
      );

      const json = await xmlToJson(xml);
      return extractFulltextSections(json, cleanedDoc);
    },
  });
}

/** Legacy direct-call surface over getFulltextSections (tools registry). */
export async function getFulltextAvailability(
  ctx: ConnectorContext,
  documentId: string
): Promise<FulltextSectionsData | ErrorResponse> {
  const result = await getFulltextSections(ctx, documentId);
  if (result.ok) {
    return result.data;
  }
  return { error: result.body.error.message, status: result.status };
}

// ============================================================================
// Family / equivalents
// ============================================================================

/** INPADOC family members (publication/application/priority refs). */
export async function getFamily(
  ctx: ConnectorContext,
  documentId: string
): Promise<ProviderReadResult<FamilyResponse>> {
  const cleanedDoc = cleanDocumentId(documentId);

  return cachedProviderRead<FamilyResponse>(ctx.host, {
    cacheKey: epoCacheKey("family", cleanedDoc),
    ttlSeconds: EPO_CACHE_TTL_SECONDS.family,
    fetchFresh: async () => {
      const xml = await fetchOpsXml(ctx,
        `/family/publication/epodoc/${cleanedDoc}`,
        "application/exchange+xml"
      );

      const json = await xmlToJson(xml);
      // Both grains, counted apart (#455): `members` is the row list,
      // `representatives` the member list — one entry per application.
      //
      // Inside the cached payload, unlike #450's coverage block: the
      // representatives are computed from the raw OPS response, and the
      // simple-family read consumes them from here.
      // OPS_RESPONSE_SHAPE_VERSION was bumped with it.
      const members = extractFamilyMembers(json);
      const representatives = extractFamilyRepresentatives(json);
      return {
        docId: cleanedDoc,
        members,
        representatives,
        memberCount: representatives.members.length,
        recordCount: members.length,
      };
    },
  });
}

/**
 * Family in the legacy direct-call shape (published-data equivalents
 * endpoint, exchange-documents walker) — behind getFamilyData and the EPO
 * Enrichment family field.
 */
export async function getEquivalentsFamily(
  ctx: ConnectorContext,
  documentId: string
): Promise<ProviderReadResult<EquivalentsFamilyData>> {
  const cleanedDoc = cleanDocumentId(documentId);

  return cachedProviderRead<EquivalentsFamilyData>(ctx.host, {
    cacheKey: epoCacheKey("family-equivalents", cleanedDoc),
    ttlSeconds: EPO_CACHE_TTL_SECONDS.familyEquivalents,
    fetchFresh: async () => {
      const xml = await fetchOpsXml(ctx,
        `/published-data/publication/epodoc/${cleanedDoc}/equivalents`,
        "application/exchange+xml"
      );

      const json = await xmlToJson(xml);
      return extractEquivalentsFamily(json, cleanedDoc);
    },
  });
}

/** Legacy direct-call surface over getEquivalentsFamily (tools registry). */
export async function getFamilyData(
  ctx: ConnectorContext,
  documentId: string
): Promise<EquivalentsFamilyData | ErrorResponse> {
  const result = await getEquivalentsFamily(ctx, documentId);
  if (result.ok) {
    return result.data;
  }
  return { error: result.body.error.message, status: result.status };
}

/** Equivalent publications of the same document (different kind codes). */
export async function getEquivalents(
  ctx: ConnectorContext,
  documentId: string
): Promise<ProviderReadResult<EquivalentsResponse>> {
  const cleanedDoc = cleanDocumentId(documentId);

  return cachedProviderRead<EquivalentsResponse>(ctx.host, {
    cacheKey: epoCacheKey("equivalents", cleanedDoc),
    ttlSeconds: EPO_CACHE_TTL_SECONDS.equivalents,
    fetchFresh: async () => {
      const xml = await fetchOpsXml(ctx,
        `/published-data/publication/epodoc/${cleanedDoc}/equivalents`,
        "application/exchange+xml"
      );

      const json = await xmlToJson(xml);
      return { docId: cleanedDoc, equivalents: extractEquivalents(json) };
    },
  });
}

// ============================================================================
// Legal status
// ============================================================================

/**
 * INPADOC legal events for a document (the working patent-family walker the
 * legal route always used), sorted newest first.
 */
export async function getLegalStatus(
  ctx: ConnectorContext,
  documentId: string
): Promise<ProviderReadResult<LegalResponse>> {
  const cleanedDoc = cleanDocumentId(documentId);

  return cachedProviderRead<LegalResponse>(ctx.host, {
    // v2: the extracted shape gained per-state fields (#356); entries cached under the old
    // key would serve stateless events for up to 12h after deploy.
    // v3: same reasoning for the designated/extension state lists — a v2 entry
    // carries no AK/AX states, so it would answer a coverage question with silence.
    cacheKey: epoCacheKey("legal-v3", cleanedDoc),
    ttlSeconds: EPO_CACHE_TTL_SECONDS.legal,
    fetchFresh: async () => {
      const xml = await fetchOpsXml(ctx,
        `/legal/publication/epodoc/${cleanedDoc}`,
        "application/exchange+xml"
      );

      const json = await xmlToJson(xml);
      const events = extractLegalEvents(json);
      return { docId: cleanedDoc, events, ...extractStateCoverage(events) };
    },
  });
}

// ============================================================================
// Search
// ============================================================================

export interface SearchPatentsOptions {
  /** Result range "start-end" (validated by the caller). Default "1-25". */
  range?: string;
  /** Fan out per-document biblio details (rides the shared biblio entries). */
  details?: boolean;
  /**
   * Comma-separated publication-country filter ('all'/absent → no filter).
   * Compiled into the CQL as `pn any "EP WO"`, so it constrains OPS's own
   * `total` rather than trimming an already-counted page.
   */
  countries?: string | null;
}

/**
 * Normalize a comma-separated country-code filter into the codes that go into
 * the CQL clause: trimmed, upper-cased, de-duplicated, order preserved. Empty
 * segments (a stray or trailing comma) are dropped; anything else that is not
 * exactly two letters A-Z is rejected. Returns null when there is no filter to
 * apply ('all', absent, or nothing but empty segments).
 *
 * @throws UpstreamError 422 INVALID_INPUT for a malformed country code.
 */
function normalizeCountryFilter(
  countries: string | null | undefined
): string[] | null {
  if (!countries || countries === "all") {
    return null;
  }

  const codes: string[] = [];
  for (const segment of countries.split(",")) {
    const code = segment.trim().toUpperCase();
    if (code === "") {
      continue;
    }
    if (!/^[A-Z]{2}$/.test(code)) {
      throw new UpstreamError(
        422,
        ErrorCodes.INVALID_INPUT,
        `Invalid country code "${segment.trim()}": expected a two-letter code such as EP or WO.`,
        { parameter: "countries", value: segment.trim() }
      );
    }
    if (!codes.includes(code)) {
      codes.push(code);
    }
  }

  return codes.length > 0 ? codes : null;
}

/**
 * Build the CQL actually sent to OPS. The country filter is pushed INTO the
 * query as a `pn any "EP WO"` clause so OPS's own `total` counts the FILTERED
 * matches — a page-level post-filter cannot do that and produces false-negative
 * counts (a count probe whose page happens to hold only excluded countries
 * looks like zero hits). Without a filter the query is sent unchanged.
 */
function buildEffectiveQuery(
  query: string,
  allowedCountries: string[] | null
): string {
  if (!allowedCountries) {
    return query;
  }
  return `(${query}) and pn any "${allowedCountries.join(" ")}"`;
}

/**
 * Per-document detail item for search results, via the shared biblio entry.
 * Absorbs every per-record failure — envelope OR throw — so one bad record in
 * a page costs exactly itself and never rejects the fan-out below.
 */
async function searchDetailItem(ctx: ConnectorContext, docId: string): Promise<SearchResultItem> {
  const bare = { docId, title: null, abstract: null, applicants: [], publicationDate: null };
  let result: ProviderReadResult<BiblioData>;
  try {
    result = await getBiblio(ctx, docId);
  } catch (error) {
    ctx.host.logger.warn(`[EPO Search] Biblio read threw for ${docId}:`, error instanceof Error ? error.message : error);
    return bare;
  }
  if (!result.ok) {
    ctx.host.logger.warn(`[EPO Search] Failed to fetch biblio for ${docId}:`, result.body.error.message);
    return bare;
  }
  const biblio = result.data;
  return {
    docId,
    title: biblio.title || null,
    abstract:
      typeof biblio.abstract === "string" ? biblio.abstract.slice(0, 500) : null,
    applicants: biblio.applicants?.slice(0, 3) || [],
    publicationDate: biblio.dates?.publication || null,
  };
}

/**
 * CQL search over published data, in the ops search route's shape: total,
 * clamped range, and either bare docIds or detail items (per-doc biblio rides
 * the shared hybrid biblio entries).
 *
 * A `countries` filter is compiled INTO the CQL (`pn any "EP WO"`), so `total`
 * is OPS's count for the FILTERED query and the response is internally
 * consistent at any range. The returned `effectiveQuery` always carries the CQL
 * that was actually sent (identical to `query` when no filter applies). The
 * cache key carries every parameter that shapes the response (effective query,
 * range, details, countries).
 */
export async function searchPatents(
  ctx: ConnectorContext,
  query: string,
  opts: SearchPatentsOptions = {}
): Promise<ProviderReadResult<SearchResponse>> {
  const range = opts.range ?? "1-25";
  const details = opts.details ?? true;
  const countriesKey = opts.countries ? opts.countries.toUpperCase() : "all";
  const [start, end] = range.split("-").map((n) => Number.parseInt(n, 10));

  // Validated before the cache key is built (the effective query is part of
  // it) and before any upstream call: a malformed code never reaches OPS.
  let allowedCountries: string[] | null;
  try {
    allowedCountries = normalizeCountryFilter(opts.countries);
  } catch (error) {
    return { ok: false, ...mapProviderError(ctx.host, error) };
  }
  const effectiveQuery = buildEffectiveQuery(query, allowedCountries);

  return cachedProviderRead<SearchResponse>(ctx.host, {
    cacheKey: epoCacheKey(
      "search",
      `${effectiveQuery.toLowerCase()}|${range}|${details}|${countriesKey}`
    ),
    ttlSeconds: EPO_CACHE_TTL_SECONDS.search,
    fetchFresh: async () => {
      let xml: string;
      try {
        xml = await fetchOpsXml(ctx,
          `/published-data/search?q=${encodeURIComponent(effectiveQuery)}`,
          "application/exchange+xml",
          range
        );
      } catch (error) {
        // OPS answers a zero-hit search with HTTP 404 + fault code
        // SERVER.EntityNotFound ("No results found"). For a search that is a
        // successful answer, not an error — return an empty result instead of
        // letting the 404 surface as NOT_FOUND with raw fault XML. Scoped to
        // this operation only: document reads keep their genuine 404s.
        if (isOpsNoSearchResults(error)) {
          return {
            total: 0,
            returned: 0,
            effectiveQuery,
            ...(allowedCountries ? { countryFilter: allowedCountries } : {}),
            range: { begin: start, end: 0 },
            docs: [],
          };
        }
        throw error;
      }

      const json = await xmlToJson(xml);
      const { total, refs } = extractSearchRefs(json);
      let docIds = refs.map(formatRefDocId);

      // Belt and braces. The filter now rides the CQL clause, so OPS should
      // never hand back an excluded country; this guard keeps the page honest
      // if it ever does, and is a no-op in practice.
      if (allowedCountries) {
        docIds = docIds.filter((docId) =>
          allowedCountries.includes(docId.substring(0, 2).toUpperCase())
        );
      }

      let docs: string[] | SearchResultItem[];
      if (details && docIds.length > 0) {
        // Fetch biblio in parallel, staggered to stay friendly to the quota.
        docs = await Promise.all(
          docIds.map(async (docId, index) => {
            await new Promise((resolve) => setTimeout(resolve, index * 100));
            return searchDetailItem(ctx, docId);
          })
        );
      } else {
        docs = docIds;
      }

      // Totals honesty: `total` is OPS's count for `effectiveQuery`, so a
      // country-filtered search reports the count of the FILTERED match set,
      // not a worldwide count the page cannot deliver. `returned` is this
      // page's size, `countryFilter` echoes the whitelist, and
      // `effectiveQuery` shows the CQL that produced the count.
      return {
        total,
        returned: docIds.length,
        effectiveQuery,
        ...(allowedCountries ? { countryFilter: allowedCountries } : {}),
        range: { begin: start, end: Math.min(end, total) },
        docs,
      };
    },
  });
}

/**
 * CQL search in the legacy direct-call shape: every result as a bare item
 * (title/abstract/applicants unpopulated), unclamped range.
 */
export async function searchPublished(
  ctx: ConnectorContext,
  query: string,
  range = "1-25"
): Promise<ProviderReadResult<SearchResponse>> {
  const [begin, end] = range.split("-").map((n) => Number.parseInt(n, 10));

  return cachedProviderRead<SearchResponse>(ctx.host, {
    cacheKey: epoCacheKey("search-refs", `${query.toLowerCase()}|${range}`),
    ttlSeconds: EPO_CACHE_TTL_SECONDS.search,
    fetchFresh: async () => {
      const xml = await fetchOpsXml(ctx,
        `/published-data/search?q=${encodeURIComponent(query)}`,
        "application/exchange+xml",
        range
      );

      const json = await xmlToJson(xml);
      const { total, refs } = extractSearchRefs(json);

      return {
        total,
        range: { begin, end },
        docs: refs.map((ref) => ({
          docId: formatRefDocId(ref),
          title: null,
          abstract: null,
          applicants: [],
          publicationDate: ref.date || null,
        })),
      };
    },
  });
}

/** Legacy direct-call surface over searchPublished (tools registry). */
export async function searchPatentsData(
  ctx: ConnectorContext,
  query: string,
  range = "1-25"
): Promise<SearchResponse | ErrorResponse> {
  const result = await searchPublished(ctx, query, range);
  if (result.ok) {
    return result.data;
  }
  return { error: result.body.error.message, status: result.status };
}

// ============================================================================
// Forward citations
// ============================================================================

/** Per-citation detail item, via the shared biblio entry. */
async function citationItem(ctx: ConnectorContext, docId: string): Promise<CitationItem> {
  const result = await getBiblio(ctx, docId);
  if (!result.ok) {
    return { docId, title: null, applicants: [], publicationDate: null };
  }
  const biblio = result.data;
  return {
    docId,
    title: biblio.title || null,
    applicants: biblio.applicants?.slice(0, 3) || [],
    publicationDate: biblio.dates?.publication || null,
  };
}

/**
 * Forward citations (documents citing this one) via a CQL citation search,
 * with per-citing-document biblio details. `type` selects the citation
 * context (all/examination/opposition/applicant/other); `range` must already
 * be validated by the caller (parseCitationsRange in the route).
 */
export async function getForwardCitations(
  ctx: ConnectorContext,
  documentId: string,
  type = "all",
  range = "1-25"
): Promise<ProviderReadResult<CitationsResponse>> {
  const docId = cleanDocumentId(documentId);

  // Build citation query based on type
  let cqlFilter: string;
  let citationType: string;

  switch (type.toLowerCase()) {
    case "examination":
    case "ex":
      cqlFilter = "ex";
      citationType = "examination";
      break;
    case "opposition":
    case "op":
      cqlFilter = "op";
      citationType = "opposition";
      break;
    case "applicant":
    case "rf":
      cqlFilter = "rf";
      citationType = "applicant";
      break;
    case "other":
    case "oc":
      cqlFilter = "oc";
      citationType = "other";
      break;
    case "all":
    default:
      // Search all citation types with OR
      cqlFilter = "ct"; // ct = all citation types
      citationType = "all";
      break;
  }

  return cachedProviderRead<CitationsResponse>(ctx.host, {
    cacheKey: epoCacheKey("citations", `${docId}:${citationType}:${range}`),
    ttlSeconds: EPO_CACHE_TTL_SECONDS.citations,
    fetchFresh: async () => {
      const query =
        citationType === "all" ? `ct=${docId}` : `${cqlFilter}=${docId}`;

      const xml = await fetchOpsXml(ctx,
        `/published-data/search?q=${encodeURIComponent(query)}`,
        "application/exchange+xml",
        range
      );

      const json = await xmlToJson(xml);
      const { total, refs } = extractSearchRefs(json);
      const citingDocIds = refs.map(formatRefDocId);

      // Fetch biblio for each citing document (staggered, shared entries)
      const citations: CitationItem[] = [];
      if (citingDocIds.length > 0) {
        const results = await Promise.all(
          citingDocIds.map(async (citingDocId, index) => {
            await new Promise((resolve) => setTimeout(resolve, index * 100));
            const item = await citationItem(ctx, citingDocId);
            item.citedIn = citationType;
            return item;
          })
        );
        citations.push(...results);
      }

      return { docId, total, citations };
    },
  });
}

// ============================================================================
// Number service
// ============================================================================

/**
 * Convert a patent number between formats (epodoc/docdb/original). Format
 * validation stays with the callers (route + registry wrapper).
 */
export async function convertPatentNumber(
  ctx: ConnectorContext,
  documentId: string,
  toFormat: string,
  fromFormat = "epodoc"
): Promise<ProviderReadResult<NumberConvertResponse>> {
  const docId = cleanDocumentId(documentId);

  return cachedProviderRead<NumberConvertResponse>(ctx.host, {
    cacheKey: epoCacheKey("number", `${fromFormat}:${toFormat}:${docId}`),
    ttlSeconds: EPO_CACHE_TTL_SECONDS.numberConvert,
    fetchFresh: async () => {
      const xml = await fetchOpsXml(ctx,
        `/number-service/publication/${fromFormat}/${docId}/${toFormat}`,
        "application/exchange+xml"
      );

      const json = await xmlToJson(xml);

      return {
        input: docId,
        inputFormat: fromFormat as NumberConvertResponse["inputFormat"],
        outputFormat: toFormat as NumberConvertResponse["outputFormat"],
        converted: extractConvertedNumber(json),
      };
    },
  });
}

// ============================================================================
// EP Register
// ============================================================================

/** EP Register bibliographic data (title, applicants, prosecution status). */
export async function getRegisterBiblio(
  ctx: ConnectorContext,
  documentId: string
): Promise<ProviderReadResult<RegisterBiblioResponse>> {
  const cleanedDoc = cleanDocumentId(documentId);

  return cachedProviderRead<RegisterBiblioResponse>(ctx.host, {
    cacheKey: epoCacheKey("register-biblio", cleanedDoc),
    ttlSeconds: EPO_CACHE_TTL_SECONDS.registerBiblio,
    fetchFresh: async () => {
      const xml = await fetchOpsXml(ctx,
        `/register/publication/epodoc/${cleanedDoc}/biblio`,
        "application/register+xml"
      );

      const json = await xmlToJson(xml);
      return extractRegisterBiblio(json, cleanedDoc);
    },
  });
}

/**
 * EP Register search (`/register/search/biblio`, register CQL): the one OPS search
 * with a representative index (`re`), beside `op` opponent, `ia` inventor or
 * applicant, and the published-data indexes the register shares. The page
 * carries OPS's total for the query (capped at 10000: three broad queries all
 * answered exactly 10000 on 2026-10-11) and one row per application in the
 * full register biblio shape — the `biblio` constituent, which the bare
 * `/register/search` page lacks (no status, no agent address). A zero-hit search is a 404 SERVER.EntityNotFound upstream, as
 * for published-data search, and is answered as an empty page.
 */
export async function searchRegister(
  ctx: ConnectorContext,
  query: string,
  range = "1-25"
): Promise<ProviderReadResult<RegisterSearchResponse>> {
  const [begin, end] = range.split("-").map((n) => Number.parseInt(n, 10));

  return cachedProviderRead<RegisterSearchResponse>(ctx.host, {
    cacheKey: epoCacheKey("register-search", `${query.toLowerCase()}|${range}`),
    ttlSeconds: EPO_CACHE_TTL_SECONDS.registerSearch,
    fetchFresh: async () => {
      let xml: string;
      try {
        xml = await fetchOpsXml(ctx,
          `/register/search/biblio?q=${encodeURIComponent(query)}`,
          "application/xml",
          range
        );
      } catch (error) {
        if (isOpsNoSearchResults(error)) {
          return { total: 0, returned: 0, query, range: { begin, end: 0 }, docs: [] };
        }
        throw error;
      }

      const { total, docs } = extractRegisterSearch(await xmlToJson(xml));
      return {
        total,
        returned: docs.length,
        query,
        range: { begin, end: Math.min(end, total) },
        docs,
      };
    },
  });
}

/** EP Register events timeline (procedural history), newest first. */
export async function getRegisterEvents(
  ctx: ConnectorContext,
  documentId: string
): Promise<ProviderReadResult<RegisterEventsResponse>> {
  const cleanedDoc = cleanDocumentId(documentId);

  return cachedProviderRead<RegisterEventsResponse>(ctx.host, {
    cacheKey: epoCacheKey("register-events", cleanedDoc),
    ttlSeconds: EPO_CACHE_TTL_SECONDS.registerEvents,
    fetchFresh: async () => {
      const xml = await fetchOpsXml(ctx,
        `/register/publication/epodoc/${cleanedDoc}/events`,
        "application/register+xml"
      );

      const json = await xmlToJson(xml);
      return { docId: cleanedDoc, events: extractRegisterEvents(json) };
    },
  });
}

/** EP Register procedural steps (with phase), newest first. */
export async function getRegisterProceduralSteps(
  ctx: ConnectorContext,
  documentId: string
): Promise<ProviderReadResult<ProceduralStepsResponse>> {
  const cleanedDoc = cleanDocumentId(documentId);

  return cachedProviderRead<ProceduralStepsResponse>(ctx.host, {
    cacheKey: epoCacheKey("register-procedural", cleanedDoc),
    ttlSeconds: EPO_CACHE_TTL_SECONDS.registerProcedural,
    fetchFresh: async () => {
      const xml = await fetchOpsXml(ctx,
        `/register/publication/epodoc/${cleanedDoc}/procedural-steps`,
        "application/register+xml"
      );

      const json = await xmlToJson(xml);
      return { docId: cleanedDoc, steps: extractProceduralSteps(json) };
    },
  });
}

/** Unitary Patent Protection status for an EP patent. */
export async function getRegisterUpp(
  ctx: ConnectorContext,
  documentId: string
): Promise<ProviderReadResult<UnitaryPatentResponse>> {
  const cleanedDoc = cleanDocumentId(documentId);

  return cachedProviderRead<UnitaryPatentResponse>(ctx.host, {
    cacheKey: epoCacheKey("register-upp", cleanedDoc),
    ttlSeconds: EPO_CACHE_TTL_SECONDS.registerUpp,
    fetchFresh: async () => {
      const xml = await fetchOpsXml(ctx,
        `/register/publication/epodoc/${cleanedDoc}/upp`,
        "application/register+xml"
      );

      const json = await xmlToJson(xml);
      return extractUnitaryPatent(json, cleanedDoc);
    },
  });
}

// ============================================================================
// Family biblio / family legal
// ============================================================================

/** Family members with bibliographic details in one call. */
export async function getFamilyBiblio(
  ctx: ConnectorContext,
  documentId: string
): Promise<ProviderReadResult<FamilyBiblioResponse>> {
  const cleanedDoc = cleanDocumentId(documentId);

  return cachedProviderRead<FamilyBiblioResponse>(ctx.host, {
    cacheKey: epoCacheKey("family-biblio", cleanedDoc),
    ttlSeconds: EPO_CACHE_TTL_SECONDS.familyBiblio,
    fetchFresh: async () => {
      const xml = await fetchOpsXml(ctx,
        `/family/publication/epodoc/${cleanedDoc}/biblio`,
        "application/ops+xml"
      );

      const json = await xmlToJson(xml);
      const { members, familyId } = extractFamilyBiblioMembers(json);
      return { docId: cleanedDoc, familyId, members };
    },
  });
}

/** Legal status events for every family member, newest first. */
export async function getFamilyLegal(
  ctx: ConnectorContext,
  documentId: string
): Promise<ProviderReadResult<FamilyLegalResponse>> {
  const cleanedDoc = cleanDocumentId(documentId);

  return cachedProviderRead<FamilyLegalResponse>(ctx.host, {
    // v3 alongside legal-v3: these events gained the same AK/AX state lists.
    cacheKey: epoCacheKey("family-legal-v3", cleanedDoc),
    ttlSeconds: EPO_CACHE_TTL_SECONDS.familyLegal,
    fetchFresh: async () => {
      const xml = await fetchOpsXml(ctx,
        `/family/publication/epodoc/${cleanedDoc}/legal`,
        "application/ops+xml"
      );

      const json = await xmlToJson(xml);
      return { docId: cleanedDoc, events: extractFamilyLegalEvents(json) };
    },
  });
}

// ============================================================================
// Images / figures
// ============================================================================

/** Available images/figures metadata for a patent. */
export async function getImages(
  ctx: ConnectorContext,
  documentId: string
): Promise<ProviderReadResult<ImageInquiryData>> {
  const cleanedDoc = cleanDocumentId(documentId);

  return cachedProviderRead<ImageInquiryData>(ctx.host, {
    cacheKey: epoCacheKey("images", cleanedDoc),
    ttlSeconds: EPO_CACHE_TTL_SECONDS.images,
    fetchFresh: async () => {
      const xml = await fetchOpsXml(ctx,
        `/published-data/publication/epodoc/${cleanedDoc}/images`,
        "application/exchange+xml"
      );

      const json = await xmlToJson(xml);
      return extractImageInquiry(json, cleanedDoc);
    },
  });
}

/** Legacy direct-call surface over getImages (tools registry). */
export async function getImagesData(
  ctx: ConnectorContext,
  documentId: string
): Promise<ImageInquiryData | ErrorResponse> {
  const result = await getImages(ctx, documentId);
  if (result.ok) {
    return result.data;
  }
  return { error: result.body.error.message, status: result.status };
}

export interface GetFigurePageOptions {
  /** Source format fetched from EPO. Default 'pdf'. */
  sourceFormat?: "png" | "tiff" | "pdf";
  /** Rasterize the (PDF) source to PNG before caching/returning. */
  renderToPng?: boolean;
}

/**
 * Fetch one page of an image document from EPO OPS as its source bytes.
 * EPO OPS images API: GET with Range as query parameter —
 * GET /published-data/images/{country}/{number}/{kind}/{type}?Range={page}
 */
async function fetchFigureSource(
  ctx: ConnectorContext,
  link: string,
  page: number,
  sourceFormat: "png" | "tiff" | "pdf"
): Promise<Buffer> {
  if (!link) {
    throw new UpstreamError(400, "invalid_request", "No image link available");
  }

  const acceptTypes: Record<string, string> = {
    png: "image/png",
    tiff: "image/tiff",
    pdf: "application/pdf",
  };

  const basePath = link.startsWith("/") ? link : `/${link}`;
  try {
    return await opsFetchBinary(ctx, `${basePath}?Range=${page}`, {
      acceptType: acceptTypes[sourceFormat],
    });
  } catch (error) {
    ctx.host.logger.error(
      `[OPS Image] Fetch failed for link=${link} page=${page}:`,
      error instanceof Error ? error.message : error
    );
    throw asEpoUpstreamError(error);
  }
}

/** A rasterizer failure as the unified upstream error. */
function rasterizeFailure(err: unknown): UpstreamError {
  return new UpstreamError(
    500,
    "upstream_error",
    `Failed to rasterize PDF to PNG: ${err instanceof Error ? err.message : "unknown error"}`
  );
}

/**
 * One figure page as base64, from the @link path of the image inquiry
 * response. The cached value is the output binary (post-rasterization when
 * renderToPng is set), so repeat requests skip both the fetch and the
 * rasterizer; the key carries link+page+source+render.
 */
export async function getFigurePage(
  ctx: ConnectorContext,
  link: string,
  page: number,
  opts: GetFigurePageOptions = {}
): Promise<ProviderReadResult<string>> {
  const sourceFormat = opts.sourceFormat ?? "pdf";
  const renderToPng = opts.renderToPng ?? false;

  return cachedProviderRead<string>(ctx.host, {
    cacheKey: epoCacheKey(
      "figure",
      `${link}:${page}:${sourceFormat}:${renderToPng ? "png" : "raw"}`
    ),
    ttlSeconds: EPO_CACHE_TTL_SECONDS.figure,
    fetchFresh: async () => {
      let buffer = await fetchFigureSource(ctx, link, page, sourceFormat);

      if (renderToPng) {
        try {
          buffer = rasterizePdfToPng(buffer);
        } catch (err) {
          throw rasterizeFailure(err);
        }
      }

      return buffer.toString("base64");
    },
  });
}

/**
 * One figure page rendered with fit=compact (#589): the PDF source scaled to
 * at most 1000 px on the long edge, grayscale, the smaller of PNG and JPEG.
 * Its own cache entry under the `compact` render qualifier, so a compact page
 * never collides with the full render of the same page and the existing
 * `png`/`raw` entries stay valid.
 */
export async function getFigurePageCompact(
  ctx: ConnectorContext,
  link: string,
  page: number
): Promise<ProviderReadResult<CompactFigurePage>> {
  return cachedProviderRead<CompactFigurePage>(ctx.host, {
    cacheKey: epoCacheKey("figure", `${link}:${page}:pdf:compact`),
    ttlSeconds: EPO_CACHE_TTL_SECONDS.figure,
    fetchFresh: async () => {
      const source = await fetchFigureSource(ctx, link, page, "pdf");
      try {
        const rendered = rasterizePdf(source, { fit: "compact" });
        return {
          base64: rendered.bytes.toString("base64"),
          format: rendered.format,
          width: rendered.width,
          height: rendered.height,
          bytes: rendered.bytes.length,
        };
      } catch (err) {
        throw rasterizeFailure(err);
      }
    },
  });
}
