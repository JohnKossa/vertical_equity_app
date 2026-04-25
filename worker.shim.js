"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const workerPath = path.join(__dirname, "docs", "worker.js");
const workerCode = fs.readFileSync(workerPath, "utf8");

const sandbox = {
  console,
  self: {},
  postMessage() {},
  Math,
  Number,
  String,
  Array,
  Set,
  NaN,
  Infinity,
  isFinite,
  isNaN,
};

vm.createContext(sandbox);
vm.runInContext(workerCode, sandbox, { filename: "docs/worker.js" });

module.exports = {
  median: sandbox.median,
  parseNumber: sandbox.parseNumber,
  medianCIFromRatios: sandbox.medianCIFromRatios,
  computeMetricsFromPairs: sandbox.computeMetricsFromPairs,
};
