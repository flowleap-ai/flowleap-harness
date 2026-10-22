import { parseStringPromise } from "xml2js";
import type { PriorityClaim } from "./types.js";

// Regex pattern for removing namespace prefixes
const NAMESPACE_PREFIX_REGEX = /^[^:]+:/;

function cleanKey(key: string): string {
  // Remove namespace prefixes
  return key.replace(NAMESPACE_PREFIX_REGEX, "");
}

function transformNode(node: any): any {
  if (node === null || node === undefined) {
    return null;
  }

  // Handle text nodes
  if (typeof node === "string") {
    return node;
  }

  // Handle arrays
  if (Array.isArray(node)) {
    if (node.length === 0) {
      return null;
    }
    if (node.length === 1) {
      return transformNode(node[0]);
    }
    return node.map(transformNode).filter((n) => n !== null);
  }

  // Handle objects
  if (typeof node === "object") {
    const result: Record<string, any> = {};

    // Handle attributes
    if (node.$ && Object.keys(node.$).length > 0) {
      for (const [key, value] of Object.entries(node.$)) {
        result[`@${cleanKey(key)}`] = value;
      }
    }

    // Handle text content
    if (node._ !== undefined) {
      result.text = node._;
    }

    // Handle child elements
    for (const [key, value] of Object.entries(node)) {
      if (key === "$" || key === "_") {
        continue;
      }

      const cleanedKey = cleanKey(key);
      const transformed = transformNode(value);

      if (transformed !== null) {
        result[cleanedKey] = transformed;
      }
    }

    // If only text, return the text directly
    if (Object.keys(result).length === 1 && result.text !== undefined) {
      return result.text;
    }

    return Object.keys(result).length > 0 ? result : null;
  }

  return node;
}

/** Read XML's ordered children, not xml2js's grouped text/element properties. */
function orderedClaimText(node: any): string {
  if (typeof node === "string") return node;
  if (!node || typeof node !== "object") return "";
  const children = node["$$"];
  if (!Array.isArray(children)) return node._ ?? "";
  return children.map(child => {
    const name = cleanKey(child["#name"] ?? "");
    if (name === "__text__") return child._ ?? "";
    if (name === "br") return "\n";
    const text = orderedClaimText(child);
    return name === "claim-text" || name === "p" ? `\n${text}\n` : text;
  }).join("");
}

/** Flatten only claim-text from the ordered parse; retain the existing normalized document shape. */
function preserveClaimTextOrder(node: any): any {
  if (Array.isArray(node)) return node.map(preserveClaimTextOrder);
  if (!node || typeof node !== "object") return node;
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(node)) {
    // The keyed properties still carry attributes and document identity. Ordered
    // children are consumed only for claim-text, never exposed to other extractors.
    if (key === "$$" || key === "#name") continue;
    if (cleanKey(key) === "claim-text") {
      const paragraphs = Array.isArray(value) ? value : [value];
      result[key] = paragraphs.map(paragraph => orderedClaimText(paragraph)
        .replace(/[ \t]*\n[ \t]*/g, "\n").replace(/\n{2,}/g, "\n").trim());
    } else {
      result[key] = preserveClaimTextOrder(value);
    }
  }
  return result;
}

export async function xmlToJson(xml: string, options?: { preserveClaimOrder?: boolean }): Promise<any> {
  try {
    const parsed = await parseStringPromise(xml, {
      explicitArray: true,
      mergeAttrs: false,
      explicitCharkey: true,
      charkey: "_",
      attrkey: "$",
      xmlns: false,
      explicitRoot: false,
      ...(options?.preserveClaimOrder ? { explicitChildren: true, preserveChildrenOrder: true, charsAsChildren: true, includeWhiteChars: true } : {}),
    });

    return transformNode(options?.preserveClaimOrder ? preserveClaimTextOrder(parsed) : parsed);
  } catch (error) {
    throw new Error(`XML parsing failed: ${error}`);
  }
}

/** Remove duplicate entries while preserving first-seen order. */
function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

/**
 * Normalize an EPO fixed-width classification symbol into a clean form.
 * e.g. "A61C  13/   003            A I" -> "A61C 13/003".
 * Falls back to the trimmed/whitespace-collapsed input when it does not match.
 */
function normalizeClassificationSymbol(raw: any): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const match = raw.match(/^\s*([A-H])\s*(\d{1,2})\s*([A-Z])\s*(\d{1,4})\s*\/\s*(\d{1,6})/);
  if (match) {
    const [, section, cls, subclass, group, subgroup] = match;
    return `${section}${cls}${subclass} ${group}/${subgroup}`;
  }
  const collapsed = raw.trim().replace(/\s+/g, " ");
  return collapsed || null;
}

/** Build a CPC symbol (e.g. "A61K 31/04") from a structured patent-classification node. */
function buildCpcSymbol(c: any): string | null {
  const section = c?.section;
  const cls = c?.class;
  const subclass = c?.subclass;
  const group = c?.["main-group"];
  const subgroup = c?.subgroup;
  if (section && cls && subclass && group && subgroup) {
    return `${section}${cls}${subclass} ${group}/${subgroup}`;
  }
  if (typeof c?.text === "string") {
    return normalizeClassificationSymbol(c.text);
  }
  return null;
}

/** Read a possibly-repeated XML child as an ordered list. */
function asList(node: any): any[] {
  if (node === null || node === undefined) {
    return [];
  }
  return Array.isArray(node) ? node : [node];
}

/** Text of a node that may carry attributes ({ text: "…" }) or be a bare string. */
function nodeText(node: any): string | undefined {
  const raw =
    typeof node === "string"
      ? node
      : typeof node?.text === "string"
        ? node.text
        : undefined;
  const trimmed = raw?.trim();
  return trimmed || undefined;
}

/**
 * Normalize one <citation> of a <references-cited> block.
 *
 * Patent citations carry a <patcit> with one <document-id> per format: the
 * epodoc entry gives the publication number an agent can read back, the docdb
 * entry gives kind and date. Non-patent literature carries an <nplcit> instead.
 * A citation with neither is not usable evidence and is dropped by the caller.
 */
function extractCitedReference(citation: any): any | null {
  const documentIds = asList(citation?.patcit?.["document-id"]);
  const epodoc = documentIds.find((d) => d?.["@document-id-type"] === "epodoc");
  const docdb = documentIds.find((d) => d?.["@document-id-type"] === "docdb");

  const epodocNumber = nodeText(epodoc?.["doc-number"]);
  const country = nodeText(docdb?.country);
  const docdbNumber = nodeText(docdb?.["doc-number"]);
  const kind = nodeText(docdb?.kind);
  const docId =
    epodocNumber ??
    (country && docdbNumber ? `${country}${docdbNumber}${kind ?? ""}` : undefined);

  const npl = nodeText(citation?.nplcit?.text);
  if (!docId && !npl) {
    return null;
  }

  const citedByRaw = nodeText(citation?.["@cited-by"]);
  const citedBy =
    citedByRaw === "applicant" || citedByRaw === "examiner" ? citedByRaw : "unknown";

  // OPS repeats <category> when a document is both search-report art and cited
  // in the application (e.g. A and D) — keep both, deduped, in document order.
  const categories = dedupe(
    asList(citation?.category)
      .map(nodeText)
      .filter((v): v is string => !!v)
  );
  // A search report writes one <rel-claims> after each <category>, and the
  // lists can differ: EP2110298A3 cites EP1602570 as X for claim 13 and A for
  // claims 1,5,9 (#548). `relevantClaims` stays the first list, verbatim, as
  // shipped; `categoryClaims` pairs each category with its own list.
  const rawCategories = asList(citation?.category).map(nodeText);
  const rawClaims = asList(citation?.["rel-claims"]).map(nodeText);
  const relevantClaims = dedupe(rawClaims.filter((v): v is string => !!v))[0];
  // xml2js groups repeated elements by name and loses their interleaving, so a
  // category is paired with a claim list by position only when the counts are
  // equal. A category with no <rel-claims> (an A with passages only) makes the
  // counts differ: then no pairs are given rather than wrong ones.
  const categoryClaims =
    rawCategories.length > 0 && rawCategories.length === rawClaims.length
      ? rawCategories.flatMap((category, index) =>
          category ? [{ category, claims: rawClaims[index] ?? null }] : []
        )
      : [];
  const relevantPassages = asList(citation?.["rel-passage"])
    .flatMap((rp) => asList(rp?.passage))
    .map(nodeText)
    .filter((v): v is string => !!v);

  const phase = nodeText(citation?.["@cited-phase"]);

  const reference: any = {
    docId: docId ?? "",
    citedBy,
  };
  if (kind) reference.kind = kind;
  const date = nodeText(docdb?.date) ?? nodeText(epodoc?.date);
  if (date) reference.date = date;
  // OPS writes the literal string "undefined" when a citation has no phase.
  if (phase && phase !== "undefined") reference.phase = phase;
  if (categories.length > 0) reference.category = categories.join(",");
  if (relevantClaims) reference.relevantClaims = relevantClaims;
  if (categoryClaims.length > 0) reference.categoryClaims = categoryClaims;
  if (relevantPassages.length > 0) reference.relevantPassages = relevantPassages;
  if (npl) reference.npl = npl;

  return reference;
}

/**
 * Normalize the <references-cited> block into an ordered CitedReference list.
 * A malformed citation is skipped, never thrown — the biblio read must survive
 * one bad entry.
 */
function extractCitedReferences(biblioData: any): any[] {
  return asList(biblioData?.["references-cited"]?.citation)
    .map((citation) => {
      try {
        return extractCitedReference(citation);
      } catch {
        return null;
      }
    })
    .filter((c) => c !== null);
}

/**
 * Normalize the `priority-claims` block into PriorityClaim records.
 *
 * Every field lives one level down, under `document-id`, one entry per
 * `document-id-type`. Reading `date`/`country`/`doc-number` straight off the
 * `priority-claim` gave `undefined` for all three, and the date filter behind
 * it then dropped every claim — so the list came back empty for every document
 * rather than absent, which a consumer cannot tell from "no priority" (#432).
 *
 * The epodoc entry is the outward number: it is the only variant OPS serves on
 * every claim and the only one with a guaranteed format. The docdb entry
 * supplies country, kind and date, which epodoc does not carry separately.
 */
function extractPriorityClaims(biblioData: any): PriorityClaim[] {
  return asList(biblioData?.["priority-claims"]?.["priority-claim"]).flatMap((claim) => {
    const ids = asList(claim?.["document-id"]);
    const byType = (type: string) =>
      ids.find((d) => d?.["@document-id-type"] === type);

    const docdb = byType("docdb");
    const epodoc = byType("epodoc");
    const original = byType("original");

    const docdbNumber = nodeText(docdb?.["doc-number"]);
    const kind = nodeText(docdb?.kind) ?? null;

    const epodocNumber = nodeText(epodoc?.["doc-number"]) ?? null;
    // docdb is the only entry with a <country> element. Some claims carry no
    // docdb entry at all, and there the epodoc number's leading two letters
    // are the office — reading them is not parsing the number, it is the one
    // part of the epodoc format that is fixed.
    const country =
      nodeText(docdb?.country) ?? epodocNumber?.match(/^(?<office>[A-Z]{2})/)?.groups?.office ?? "";
    const docdbApplication = docdbNumber
      ? `${country}${docdbNumber}${kind ? ` (${kind})` : ""}`
      : null;

    // A claim carrying no identifier at all is not evidence of anything.
    if (!epodocNumber && !docdbApplication) {
      return [];
    }

    return [
      {
        date: nodeText(docdb?.date) ?? nodeText(epodoc?.date) ?? null,
        country,
        epodocApplication: epodocNumber,
        docdbApplication,
        originalApplication: nodeText(original?.["doc-number"]) ?? null,
        kind,
      },
    ];
  });
}

// Specialized extractors for common patterns
export function extractBiblio(data: any): any {
  // Navigate through the transformed structure
  let doc = data;

  // Handle exchange-documents wrapper
  if (data?.["exchange-documents"]) {
    const exchangeDocs = data["exchange-documents"];
    if (exchangeDocs?.["exchange-document"]) {
      doc = Array.isArray(exchangeDocs["exchange-document"])
        ? exchangeDocs["exchange-document"][0]
        : exchangeDocs["exchange-document"];
    }
  }

  const biblio: any = {
    docId: null,
    title: null,
    abstract: null,
    applicants: [],
    inventors: [],
    ipc: [],
    cpc: [],
    dates: {
      filing: null,
      publication: null,
      priority: [],
    },
  };

  // Extract document ID from attributes or bibliographic data
  const biblioData = doc?.["bibliographic-data"] || doc;

  // First try to get from document attributes
  if (doc?.["@country"] && doc?.["@doc-number"]) {
    const cc = doc["@country"];
    const nr = doc["@doc-number"];
    const kind = doc["@kind"];
    biblio.docId = `${cc}${nr}${kind ? `.${kind}` : ""}`;
  } else {
    // Fallback to publication-reference
    const pubRef = biblioData?.["publication-reference"]?.["document-id"];

    if (Array.isArray(pubRef)) {
      const epodoc = pubRef.find((d) => d?.["@document-id-type"] === "epodoc" && /[A-Z]\d?$/.test(d?.["doc-number"] ?? ""));
      if (epodoc) {
        const nr = epodoc?.["doc-number"];
        biblio.docId = nr; // EPO format already includes country code
      } else {
        const docdb = pubRef.find((d) => d?.["@document-id-type"] === "docdb");
        if (docdb) {
          const cc = docdb?.country;
          const nr = docdb?.["doc-number"];
          const kind = docdb?.kind;
          biblio.docId = `${cc}${nr}${kind ? `.${kind}` : ""}`;
        }
      }
    } else if (pubRef) {
      const cc = pubRef?.country;
      const nr = pubRef?.["doc-number"];
      const kind = pubRef?.kind;
      biblio.docId = `${cc}${nr}${kind ? `.${kind}` : ""}`;
    }
  }

  // Extract title
  const titles = biblioData?.["invention-title"];
  if (titles) {
    if (Array.isArray(titles)) {
      const enTitle = titles.find((t) => t?.["@lang"] === "en");
      biblio.title = enTitle?.text || enTitle || titles[0]?.text || titles[0];
    } else if (typeof titles === "object" && titles.text) {
      biblio.title = titles.text;
    } else if (typeof titles === "string") {
      biblio.title = titles;
    }
  }

  // Extract abstract
  const abstracts = doc?.abstract;
  if (abstracts) {
    if (Array.isArray(abstracts)) {
      const enAbstract = abstracts.find((a) => a?.["@lang"] === "en");
      biblio.abstract =
        enAbstract?.p || enAbstract || abstracts[0]?.p || abstracts[0];
    } else {
      biblio.abstract = abstracts?.p || abstracts;
    }
  }

  // Extract applicants
  const parties = biblioData?.parties;
  const applicants = parties?.applicants?.applicant;
  if (applicants) {
    const appList = Array.isArray(applicants) ? applicants : [applicants];
    biblio.applicants = appList
      .map((a) => {
        // Check for different name structures
        const nameObj = a?.["applicant-name"];
        if (nameObj) {
          const name = nameObj?.name || nameObj;
          if (typeof name === "string") {
            return name;
          }
          if (name?.text) {
            return name.text;
          }
        }
        return null;
      })
      .filter(Boolean);
  }

  // Extract inventors
  const inventors = parties?.inventors?.inventor;
  if (inventors) {
    const invList = Array.isArray(inventors) ? inventors : [inventors];
    biblio.inventors = invList
      .map((i) => {
        // Check for different name structures
        const nameObj = i?.["inventor-name"];
        if (nameObj) {
          const name = nameObj?.name || nameObj;
          if (typeof name === "string") {
            return name;
          }
          if (name?.text) {
            return name.text;
          }
        }
        return null;
      })
      .filter(Boolean);
  }

  // Extract IPC
  const ipcClasses =
    biblioData?.["classifications-ipcr"]?.["classification-ipcr"] ||
    biblioData?.["classification-ipc"]?.["classification-ipc"];
  if (ipcClasses) {
    const ipcList = Array.isArray(ipcClasses) ? ipcClasses : [ipcClasses];
    biblio.ipc = dedupe(
      ipcList
        .map((c) => normalizeClassificationSymbol(c?.text || c))
        .filter((v): v is string => !!v)
    );
  }

  // Extract CPC.
  // EPO OPS returns CPC under <patent-classifications>/<patent-classification>,
  // distinguished from other schemes by <classification-scheme scheme="CPC*"/>
  // (CPCI = inventive, CPCA = additional). The structured sub-elements
  // (section/class/subclass/main-group/subgroup) are assembled into a symbol.
  const patentClasses =
    biblioData?.["patent-classifications"]?.["patent-classification"];
  if (patentClasses) {
    const pcList = Array.isArray(patentClasses) ? patentClasses : [patentClasses];
    biblio.cpc = dedupe(
      pcList
        .filter((c) => {
          const scheme = c?.["classification-scheme"]?.["@scheme"];
          return typeof scheme === "string" && scheme.toUpperCase().startsWith("CPC");
        })
        .map((c) => buildCpcSymbol(c))
        .filter((v): v is string => !!v)
    );
  }

  // Extract dates. A reference lists one <document-id> per format (docdb,
  // epodoc, original) and the date is often only on one of them (for
  // application-reference it is typically the epodoc entry), so take the
  // first entry that carries a date rather than document-id[0].
  const refDate = (ref: any): string | undefined => {
    if (!ref) return undefined;
    const list = Array.isArray(ref) ? ref : [ref];
    return list.map((d) => d?.date).find(Boolean);
  };

  const appDate = refDate(biblioData?.["application-reference"]?.["document-id"]);
  if (appDate) {
    biblio.dates.filing = appDate;
  }

  const pubDate = refDate(biblioData?.["publication-reference"]?.["document-id"]);
  if (pubDate) {
    biblio.dates.publication = pubDate;
  }

  // References cited by the applicant and by the examiner's search report.
  const citedReferences = extractCitedReferences(biblioData);
  if (citedReferences.length > 0) {
    biblio.citedReferences = citedReferences;
  }

  biblio.dates.priority = extractPriorityClaims(biblioData);

  return biblio;
}

/** A provider claim number is an anchor, not the paragraph's position in an array. */
export interface NumberedClaim { number: string; text: string }

function claimText(node: any): string {
  if (typeof node === "string") return node.trim();
  if (Array.isArray(node)) return node.map(claimText).filter(Boolean).join("\n");
  if (!node || typeof node !== "object") return "";
  return Object.entries(node).filter(([key]) => !key.startsWith("@"))
    .map(([, value]) => claimText(value)).filter(Boolean).join("\n");
}

/**
 * The claims headings OPS text-only full text prints before claim 1, each on its
 * own line or on claim 1's line ("Ansprüche 1. Hydraulischer Aktor …"), with
 * OPS's bare "1." sometimes on the line before. A heading from this list is the
 * one preamble claim 1 may have; any other preamble leaves the section
 * unaddressed. Behind a heading the line starts are the boundary evidence, since
 * the XML paragraphs of such a document break at pages, not at claims (live
 * WO2025031952A1: claim 1 is split across two paragraphs and claims 2 to 12 share
 * the second).
 *
 * Accepted risk, the same one the Japanese branch always carried: a line that
 * starts with an OCR-split decimal ("2. 5 bar") while the real claim 2 sits
 * mid-line yields a wrong claim 2. It needs both faults at once, and the run
 * gate below still refuses every gap and duplicate.
 */
// One optional blank run, then an optional colon with its own run: two adjacent
// optional runs backtracked quadratically on a heading followed by thousands of
// blanks (#575 review). The line-break branch eats every blank line, as the old
// `\s*\n` did, and accepts CRLF.
const CLAIMS_HEADING = /^(?:1\.\s*)?(?:請求の範囲|Patentansprüche|Ansprüche|Claims|Revendications|What is claimed is|We claim|I claim)[ \t]*(?::[ \t]*)?(?:(?:\r?\n)+[ \t]*(?:\r?\n[ \t]*)*|(?=1[ \t]*[.)][ \t]))/i;

/**
 * Text-only OPS can put every printed claim into one XML paragraph. Only accept
 * a complete consecutive sequence from 1; an OCR gap, duplicate, or unknown
 * preamble leaves the entire section unaddressed rather than inventing anchors.
 */
function splitPrintedClaims(paragraphs: string[]): NumberedClaim[] | undefined {
  const text = paragraphs.join('\n');
  if (text.length > 2_000_000) return undefined;
  const printedNumber = /^[ \t]*(?<number>[1-9](?:[ \t]*[0-9]){0,4})[ \t]*[.)][ \t]+(?=\S)/;
  const heading = text.match(CLAIMS_HEADING);
  // Embedded line numbers may be subclauses. Recover them only behind a known
  // claims heading; other flat sources keep XML paragraphs as the boundary
  // evidence. Unsupported single-paragraph lists stay unaddressed.
  if (!heading && paragraphs.length === 1 && [...text.matchAll(new RegExp(printedNumber.source, 'gm'))].length > 1) return undefined;
  const headingEnd = heading ? heading[0].length : 0;
  const units = heading ? text.slice(headingEnd).split('\n') : paragraphs;
  const starts: { number: number; index: number }[] = [];
  let offset = headingEnd;
  for (const unit of units) {
    const match = unit.match(printedNumber);
    if (match) starts.push({ number: Number(match.groups!.number.replace(/[ \t]/g, "")), index: offset });
    offset += unit.length + 1;
  }
  if (!starts.length || starts.some((start, index) => start.number !== index + 1)) return undefined;
  // Claim 1 keeps the recognized heading in front of it, including OPS's bare
  // "1." on the preceding line. Never discard an unfamiliar preamble.
  if (starts[0].index !== headingEnd) return undefined;
  return starts.map((start, index) => ({
    number: String(start.number),
    text: text.slice(index === 0 ? 0 : start.index, starts[index + 1]?.index ?? text.length).trim(),
  }));
}

/** OPS supplies either numbered claim nodes or flat text with printed numbers. */
export function extractNumberedClaims(data: any, lang = 'en'): { claims: NumberedClaim[]; language: string; unsegmentedText?: string } {
  const fulltextDocs = data?.["fulltext-documents"]?.["fulltext-document"];
  const docs = fulltextDocs ? (Array.isArray(fulltextDocs) ? fulltextDocs : [fulltextDocs]) : [data];
  const variants = docs.flatMap(doc => Array.isArray(doc?.claims) ? doc.claims : doc?.claims ? [doc.claims] : []);
  const variant = variants.find(node => node?.["@lang"]?.toLowerCase() === lang.toLowerCase()) ?? variants[0];
  const language = variant?.["@lang"]?.toLowerCase() ?? lang;
  const nodes = variant?.claim ?? data?.claim;
  const list = nodes ? (Array.isArray(nodes) ? nodes : [nodes]) : [];
  const claims: NumberedClaim[] = list.map(node => ({
    number: String(node?.["@num"] ?? node?.["@number"] ?? ''),
    text: claimText(node?.["claim-text"]),
  }));
  if (claims.every(claim => /^0*[1-9]\d{0,4}$/.test(claim.number))) {
    const numbered = claims.map(claim => ({ ...claim, number: String(Number(claim.number)) }));
    if (new Set(numbered.map(claim => claim.number)).size === numbered.length) return { claims: numbered, language };
  } else if (claims.every(claim => !claim.number)) {
    const paragraphs = list.flatMap(node => Array.isArray(node?.["claim-text"]) ? node["claim-text"] : [node?.["claim-text"]]).map(claimText).filter(Boolean);
    const printed = splitPrintedClaims(paragraphs);
    if (printed) return { claims: printed, language };
  }
  const unsegmentedText = claims.map(claim => claim.text).filter(Boolean).join('\n');
  return { claims: [], language, ...(unsegmentedText ? { unsegmentedText } : {}) };
}

/** String-array compatibility; unaddressable source text must not be discarded. */
export function extractClaims(data: any, lang?: string): string[] {
  const result = extractNumberedClaims(data, lang);
  return result.unsegmentedText ? [result.unsegmentedText] : result.claims.map(claim => claim.text);
}

export function extractDescription(data: any, lang?: string): string {
  // Handle ftxt:fulltext-documents structure
  const fulltextDocs = data?.["fulltext-documents"]?.["fulltext-document"];
  if (fulltextDocs) {
    const docs = Array.isArray(fulltextDocs) ? fulltextDocs : [fulltextDocs];

    // Try to find the document with the requested language
    let targetDoc = docs[0];
    if (lang) {
      const matchingDoc = docs.find(
        (d) => d?.description?.["@lang"]?.toUpperCase() === lang.toUpperCase()
      );
      if (matchingDoc) {
        targetDoc = matchingDoc;
      }
    }

    const descriptionNode = targetDoc?.description;
    if (descriptionNode) {
      const paragraphs = descriptionNode?.p;
      if (paragraphs) {
        const pList = Array.isArray(paragraphs) ? paragraphs : [paragraphs];
        return pList
          .map((p) => p?.text || p)
          .filter(Boolean)
          .join("\n\n");
      }
    }
    return "";
  }

  // Fallback to direct description structure
  const descNodes = data?.description?.p || data?.p;

  if (!descNodes) {
    return "";
  }

  const paragraphs = Array.isArray(descNodes) ? descNodes : [descNodes];

  return paragraphs
    .map((p) => p?.text || p)
    .filter(Boolean)
    .join("\n\n");
}
