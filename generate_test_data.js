#!/usr/bin/env node
/**
 * Synthetic CSV generator for ratio study testing.
 *
 * Generates rows with:
 *  - sale_price in [minPrice, maxPrice]
 *  - assessed_value = sale_price * (1 +/- error)
 * Where error magnitude is uniform in [0, maxError] and sign is random.
 *
 * Usage:
 *   node generate_test_data.js [--rows N] [--min 10000] [--max 3000000] [--error 0.15]
 *                              [--seed 12345] [--outfile data.csv] [--dist uniform|log]
 *
 * Defaults:
 *   rows   = 1000
 *   min    = 10000
 *   max    = 3000000
 *   error  = 0.15 (i.e., up to ±15%)
 *   dist   = log (log-uniform prices produce more low-priced sales, few high-priced)
 *
 * Notes:
 *   - Output CSV columns: sale_price,assessed_value
 *   - Values are rounded to the nearest dollar.
 *   - If --outfile is omitted, CSV is written to stdout.
 */

const fs = require('fs');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') args.help = true;
    else if (a === '--rows') args.rows = parseInt(argv[++i], 10);
    else if (a === '--min') args.min = parseFloat(argv[++i]);
    else if (a === '--max') args.max = parseFloat(argv[++i]);
    else if (a === '--error') args.error = parseFloat(argv[++i]);
    else if (a === '--seed') args.seed = String(argv[++i]);
    else if (a === '--outfile') args.outfile = String(argv[++i]);
    else if (a === '--dist') args.dist = String(argv[++i]);
    else {
      console.error(`Unknown argument: ${a}`);
      process.exit(1);
    }
  }
  return args;
}

function showHelp() {
  const help = `\nSynthetic CSV generator\n\n` +
`Usage:\n` +
`  node generate_test_data.js [--rows N] [--min 10000] [--max 3000000] [--error 0.15]\\n` +
`                             [--seed 12345] [--outfile data.csv] [--dist uniform|log]\n\n` +
`Options:\n` +
`  --rows N        Number of rows to generate (default 1000)\n` +
`  --min V         Minimum sale price (default 10000)\n` +
`  --max V         Maximum sale price (default 3000000)\n` +
`  --error E       Max absolute error fraction (default 0.15 for ±15%)\n` +
`  --seed S        Seed for deterministic RNG (string or number)\n` +
`  --outfile PATH  Write CSV to PATH (default: stdout)\n` +
`  --dist D        Price distribution: uniform or log (default: log)\n`;
  console.log(help);
}

// Mulberry32 PRNG for deterministic sequences from a seed
function mulberry32(seed) {
  let t = seed >>> 0;
  return function() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStringToInt(s) {
  let h = 2166136261 >>> 0; // FNV-1a base
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRNG(seedOpt) {
  if (!seedOpt) return Math.random;
  let seedInt;
  if (/^\d+$/.test(seedOpt)) seedInt = parseInt(seedOpt, 10) >>> 0;
  else seedInt = hashStringToInt(String(seedOpt));
  return mulberry32(seedInt);
}

function generate({ rows, min, max, maxError, dist, rng }) {
  const out = [];
  out.push('sale_price,assessed_value');

  const lnMin = Math.log(min);
  const lnMax = Math.log(max);

  for (let i = 0; i < rows; i++) {
    // Sale price
    let price;
    if (dist === 'uniform') {
      price = min + (max - min) * rng();
    } else { // log-uniform
      const u = lnMin + (lnMax - lnMin) * rng();
      price = Math.exp(u);
    }
    price = Math.round(price);
    if (price < 1) price = 1;

    // Error
    const mag = maxError * rng(); // [0, maxError)
    const sign = rng() < 0.5 ? -1 : 1;
    const err = sign * mag;

    // Assessed value
    let assessed = Math.round(price * (1 + err));
    if (assessed < 0) assessed = 0; // keep non-negative

    out.push(`${price},${assessed}`);
  }

  return out.join('\n') + '\n';
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) { showHelp(); return; }

  const rows = Number.isFinite(args.rows) ? Math.max(1, args.rows) : 1000;
  const min = Number.isFinite(args.min) ? Math.max(0, args.min) : 10000;
  const max = Number.isFinite(args.max) ? Math.max(min, args.max) : 3000000;
  const maxError = Number.isFinite(args.error) ? Math.max(0, args.error) : 0.15;
  const dist = (args.dist === 'uniform' || args.dist === 'log') ? args.dist : 'log';
  const rng = makeRNG(args.seed);

  const csv = generate({ rows, min, max, maxError, dist, rng });

  if (args.outfile) {
    fs.writeFileSync(args.outfile, csv);
    console.error(`Wrote ${rows} rows to ${args.outfile}`);
  } else {
    process.stdout.write(csv);
  }
}

if (require.main === module) {
  main();
}
