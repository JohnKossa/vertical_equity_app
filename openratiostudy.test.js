"use strict";

const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");
const {
  median,
  parseNumber,
  medianCIFromRatios,
  computeMetricsFromPairs,
} = require("./worker.shim.js");

// ---------------------------------------------------------------------------
// Table 1 from the IAAO Ratio Studies Exposure Draft (September 2025, p.20–21)
// 54 observations [sale_price, assessed_value]
// ---------------------------------------------------------------------------
const TABLE1 = [
  [690000, 240000], [296250, 144000], [787500, 392000], [372000, 199200],
  [574500, 340800], [795000, 472000], [559500, 336000], [465000, 284800],
  [693600, 436000], [298500, 191200], [350000, 225000], [295000, 194000],
  [732000, 481600], [495000, 338400], [237000, 164800], [352500, 252800],
  [1289000, 945000], [379000, 280000], [540000, 407000], [560000, 423000],
  [390000, 306800], [300000, 236800], [450000, 361000], [345000, 290400],
  [277500, 235200], [485000, 415000], [442000, 381000], [435000, 380000],
  [998000, 875000], [772500, 680000], [365000, 329000], [487000, 457000],
  [547500, 516000], [300000, 295200], [580000, 580000], [840000, 840000],
  [622500, 640000], [637500, 660000], [340000, 354000], [750000, 800000],
  [352500, 390000], [705000, 800000], [410000, 469000], [859500, 1000000],
  [787500, 920000], [440000, 527000], [648000, 800000], [630000, 786000],
  [388500, 496000], [765000, 1000000], [243750, 320000], [720000, 960000],
  [705000, 952000], [240000, 327200],
];

function near(actual, expected, tol = 0.005, label = "") {
  const diff = Math.abs(actual - expected);
  assert.ok(diff <= tol, `${label}: expected ${expected} ± ${tol}, got ${actual} (diff ${diff.toFixed(6)})`);
}

describe("median()", () => {
  test("odd length", () => assert.equal(median([3, 1, 2]), 2));
  test("even length", () => assert.equal(median([4, 1, 3, 2]), 2.5));
  test("single element", () => assert.equal(median([7]), 7));
  test("empty returns NaN", () => assert.ok(isNaN(median([]))));
});

describe("parseNumber()", () => {
  test("plain number string", () => assert.equal(parseNumber("12345"), 12345));
  test("comma-formatted string", () => assert.equal(parseNumber("1,234,567"), 1234567));
  test("actual number passthrough", () => assert.equal(parseNumber(9.5), 9.5));
  test("empty string returns NaN", () => assert.ok(isNaN(parseNumber(""))));
  test("null returns NaN", () => assert.ok(isNaN(parseNumber(null))));
  test("non-numeric string returns NaN", () => assert.ok(isNaN(parseNumber("abc"))));
});

describe("medianCIFromRatios() — Section 7.5.3", () => {
  test("n=5 (odd), 90% CI spans min to max", () => {
    const ci = medianCIFromRatios([0.7, 0.8, 0.9, 1.0, 1.1], { confidence: 0.90 });
    assert.equal(ci.low, 0.7);
    assert.equal(ci.high, 1.1);
  });

  test("n=10 (even), 90% CI: positions 2 and 9", () => {
    const vals = [0.60, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95, 1.00, 1.05, 1.10];
    const ci = medianCIFromRatios(vals, { confidence: 0.90 });
    assert.equal(ci.low, 0.70);
    assert.equal(ci.high, 1.05);
  });

  test("n=14 (even), 90% CI: positions 4 and 11 — matches spec Table 4 Q1 grouping", () => {
    const q1 = [0.348, 0.486, 0.498, 0.535, 0.593, 0.594, 0.601, 0.612, 0.629, 0.641, 0.643, 0.658, 0.658, 0.684];
    const sorted = q1.slice().sort((a, b) => a - b);
    const ci = medianCIFromRatios(q1, { confidence: 0.90 });
    assert.equal(ci.low, sorted[3]);
    assert.equal(ci.high, sorted[10]);
  });

  test("n=13 (odd), 90% CI: positions 4 and 10 — matches spec Table 4 Q4 grouping", () => {
    const q4 = [1.041, 1.067, 1.106, 1.135, 1.144, 1.163, 1.168, 1.198, 1.235, 1.248, 1.277, 1.307, 1.363];
    const sorted = q4.slice().sort((a, b) => a - b);
    const ci = medianCIFromRatios(q4, { confidence: 0.90 });
    assert.equal(ci.low, sorted[3]);
    assert.equal(ci.high, sorted[9]);
  });

  test("single value: CI = [value, value]", () => {
    const ci = medianCIFromRatios([0.9], { confidence: 0.90 });
    assert.equal(ci.low, 0.9);
    assert.equal(ci.high, 0.9);
  });

  test("empty array returns NaN bounds", () => {
    const ci = medianCIFromRatios([], { confidence: 0.90 });
    assert.ok(isNaN(ci.low));
    assert.ok(isNaN(ci.high));
  });

  test("non-positive and non-finite values are filtered out", () => {
    const ci = medianCIFromRatios([-1, 0, NaN, Infinity, 0.8, 0.9, 1.0], { confidence: 0.90 });
    assert.equal(ci.low, 0.8);
    assert.equal(ci.high, 1.0);
  });
});

describe("Overall sample statistics — spec Section 8.2.1.2 (Table 1, n=54)", () => {
  let r;
  before(() => { r = computeMetricsFromPairs(TABLE1); });

  test("sample size is 54", () => assert.equal(r.n, 54));
  test("median ratio = 0.868", () => near(r.med, 0.868, 0.001, "median"));
  test("overall 90% CI lower = 0.787", () => near(r.ci.low, 0.787, 0.001, "CI lower"));
  test("overall 90% CI upper = 0.984", () => near(r.ci.high, 0.984, 0.001, "CI upper"));
  test("COD uses mean absolute deviation", () => near(r.COD, 24.64, 0.10, "COD"));
  test("PRD = 0.993", () => near(r.PRD, 0.993, 0.002, "PRD"));
});

describe("VEI — spec Section 8.2.1.2 worked example (Table 1, n=54)", () => {
  let r;
  before(() => { r = computeMetricsFromPairs(TABLE1); });

  test("4 strata produced", () => assert.equal(r.strata.length, 4));
  test("Q1 has 14 sales, Q4 has 13", () => { assert.equal(r.strata[0].n, 14); assert.equal(r.strata[3].n, 13); });
  test("Q1 median ratio = 0.728", () => near(r.strata[0].median, 0.728, 0.002, "Q1 median"));
  test("Q4 median ratio = 1.163", () => near(r.strata[3].median, 1.163, 0.002, "Q4 median"));
  test("Q1 90% CI lower = 0.643", () => near(r.strata[0].ci_low, 0.643, 0.003, "Q1 CI low"));
  test("Q1 90% CI upper = 0.848", () => near(r.strata[0].ci_high, 0.848, 0.003, "Q1 CI high"));
  test("Q4 90% CI upper = 1.248", () => near(r.strata[3].ci_high, 1.248, 0.003, "Q4 CI high"));
  test("VEI point estimate = 50.12%", () => near(r.VEI, 50.12, 0.20, "VEI"));
  test("Q1 and Q4 CIs do NOT overlap", () => assert.ok(r.strata[0].ci_high < r.strata[3].ci_low));
  test("VEI significance = 17.51%", () => near(r.VEI_significance, 17.51, 0.20, "VEI_significance"));
  test("conclusion is Progressivity", () => assert.equal(r.conclusion, "Progressivity"));
});

describe("VEI — minimum N enforcement", () => {
  test("N=19 -> VEI is NaN and note references the 20-sale minimum", () => {
    const pairs = Array.from({ length: 19 }, () => [100000, 100000]);
    const r = computeMetricsFromPairs(pairs);
    assert.ok(isNaN(r.VEI));
    assert.ok(r.vei_note.includes("20"));
  });

  test("N=20 -> VEI is computed", () => {
    const pairs = Array.from({ length: 20 }, (_, i) => [100000 + i * 1000, 90000 + i * 900]);
    assert.ok(isFinite(computeMetricsFromPairs(pairs).VEI));
  });
});

describe("VEI — group count boundaries", () => {
  function flatPairs(n) {
    return Array.from({ length: n }, (_, i) => [100000 + i * 1000, 90000 + i * 900]);
  }

  test("N=20  -> 2 groups", () => assert.equal(computeMetricsFromPairs(flatPairs(20)).strata.length, 2));
  test("N=50  -> 2 groups", () => assert.equal(computeMetricsFromPairs(flatPairs(50)).strata.length, 2));
  test("N=51  -> 4 groups", () => assert.equal(computeMetricsFromPairs(flatPairs(51)).strata.length, 4));
  test("N=100 -> 4 groups", () => assert.equal(computeMetricsFromPairs(flatPairs(100)).strata.length, 4));
  test("N=500 -> 4 groups", () => assert.equal(computeMetricsFromPairs(flatPairs(500)).strata.length, 4));
  test("N=501 -> 10 groups", () => assert.equal(computeMetricsFromPairs(flatPairs(501)).strata.length, 10));
});

describe("VEI — conclusion decision table", () => {
  test("Scenario 1: flat ratio throughout -> Compliant", () => {
    const pairs = Array.from({ length: 30 }, (_, i) => [100000 + i * 5000, (100000 + i * 5000) * 0.90]);
    assert.equal(computeMetricsFromPairs(pairs).conclusion, "Compliant");
  });

  test("Scenario 4: low-value over-assessed -> Regressivity", () => {
    const pairs = [
      ...Array.from({ length: 15 }, () => [100000, 130000]),
      ...Array.from({ length: 15 }, () => [900000, 630000]),
    ];
    const r = computeMetricsFromPairs(pairs);
    assert.ok(r.VEI < -10);
    assert.equal(r.conclusion, "Regressivity");
  });

  test("Scenario 5: Table 1 data -> Progressivity", () => {
    assert.equal(computeMetricsFromPairs(TABLE1).conclusion, "Progressivity");
  });
});

describe("COD", () => {
  test("perfect uniformity -> COD = 0", () => {
    const pairs = Array.from({ length: 20 }, () => [200000, 180000]);
    near(computeMetricsFromPairs(pairs).COD, 0, 0.001, "COD uniform");
  });

  test("two alternating ratios (0.8 and 1.0, n=20) -> COD = 11.11%", () => {
    const pairs = [
      ...Array.from({ length: 10 }, () => [100000, 80000]),
      ...Array.from({ length: 10 }, () => [100000, 100000]),
    ];
    near(computeMetricsFromPairs(pairs).COD, 11.11, 0.05, "COD two-group");
  });

  test("Table 1 data -> COD = 24.64%", () => {
    near(computeMetricsFromPairs(TABLE1).COD, 24.64, 0.10, "COD Table1");
  });
});

describe("PRD", () => {
  test("uniform ratio -> PRD = 1.000", () => {
    const pairs = Array.from({ length: 20 }, (_, i) => [100000 + i * 5000, (100000 + i * 5000) * 0.85]);
    near(computeMetricsFromPairs(pairs).PRD, 1.000, 0.001, "PRD uniform");
  });

  test("Table 1 data -> PRD = 0.993", () => {
    near(computeMetricsFromPairs(TABLE1).PRD, 0.993, 0.002, "PRD Table1");
  });
});

describe("Input parsing", () => {
  test("sale_price <= 0 is excluded", () => {
    const r = computeMetricsFromPairs([[0, 100000], [-50000, 80000], [300000, 270000]]);
    assert.equal(r.n, 1);
  });

  test("non-finite sale or val rows are excluded", () => {
    const r = computeMetricsFromPairs([[NaN, 100000], [100000, NaN], [200000, 180000]]);
    assert.equal(r.n, 1);
  });

  test("no valid rows -> error property is present", () => {
    assert.ok(computeMetricsFromPairs([[0, 0]]).error);
  });

  test("comma-formatted strings are parsed correctly", () => {
    const r = computeMetricsFromPairs([["200,000", "180,000"], ["300,000", "270,000"]]);
    assert.equal(r.n, 2);
    near(r.med, 0.9, 0.001, "median of parsed strings");
  });
});
