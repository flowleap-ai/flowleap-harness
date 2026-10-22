import { describe, expect, it } from "vitest";
import { cleanDocumentId, parseDocumentId } from "./utils.js";

describe("cleanDocumentId", () => {
  it("strips a bare trailing kind code (US6021533A)", () => {
    expect(cleanDocumentId("US6021533A")).toBe("US6021533");
  });

  it("strips dot-separated kind code (US.6021533.A)", () => {
    expect(cleanDocumentId("US.6021533.A")).toBe("US6021533");
  });

  it("strips dot-separated two-char kind code (EP1000000.B1)", () => {
    expect(cleanDocumentId("EP1000000.B1")).toBe("EP1000000");
  });

  it("strips bare two-char kind code (EP1000000B1)", () => {
    expect(cleanDocumentId("EP1000000B1")).toBe("EP1000000");
  });

  it("leaves a clean WO number unchanged", () => {
    expect(cleanDocumentId("WO2020123456")).toBe("WO2020123456");
  });

  it("uppercases and strips slashes (wo2020/123456)", () => {
    expect(cleanDocumentId("wo2020/123456")).toBe("WO2020123456");
  });

  it("strips spaces, commas, and kind code (US 6,021,533 A)", () => {
    expect(cleanDocumentId("US 6,021,533 A")).toBe("US6021533");
  });

  it("leaves a clean EP number unchanged", () => {
    expect(cleanDocumentId("EP1000000")).toBe("EP1000000");
  });

  it("returns empty string unchanged", () => {
    expect(cleanDocumentId("")).toBe("");
  });
});

describe("parseDocumentId", () => {
  it("parses a document ID with a bare kind code", () => {
    expect(parseDocumentId("US6021533A")).toEqual({
      country: "US",
      number: "6021533",
    });
  });
});
