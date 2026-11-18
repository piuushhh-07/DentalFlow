import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { serializeBranchTrendCsv } from "@/features/clinic-groups/lib/branch-trend-csv";

describe("branch trend CSV serialization", () => {
  it("adds a UTF-8 BOM and CRLF row endings", () => {
    assert.equal(serializeBranchTrendCsv([["Month", "Payments"], ["Nov 2026", 1250]]), '\uFEFF"Month","Payments"\r\n"Nov 2026","1250"\r\n');
  });

  it("quotes commas and escapes embedded quotes", () => {
    assert.equal(serializeBranchTrendCsv([["Branch", "Amount"], ['North, "Main"', 10]]), '\uFEFF"Branch","Amount"\r\n"North, ""Main""","10"\r\n');
  });

  it("neutralizes spreadsheet formula prefixes in text cells", () => {
    const csv = serializeBranchTrendCsv([["=HYPERLINK(\\"https://bad.example\\")", "+SUM(A1:A2)", "-2", "@cmd"]]);
    assert.equal(csv, '\uFEFF"\'=HYPERLINK(\\"https://bad.example\\")","\'+SUM(A1:A2)","-2","\'@cmd"\r\n');
  });
});
