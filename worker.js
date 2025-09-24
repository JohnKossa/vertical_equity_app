// worker.js — computes metrics off the main thread

// ---------- Utilities ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function quantileSorted(sorted, p) {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * p;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  } else {
    return sorted[base];
  }
}

function median(values) {
  if (!values.length) return NaN;
  const a = values.slice().sort((x,y)=>x-y);
  const n = a.length;
  const mid = Math.floor(n/2);
  if (n % 2) return a[mid];
  return (a[mid-1] + a[mid]) / 2;
}

function sum(a){ return a.reduce((s,x)=>s+x,0); }
function mean(a){ return a.length? sum(a)/a.length : NaN; }

function parseNumber(v){
  if (v === null || v === undefined) return NaN;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  if (!s) return NaN;
  const t = s.replace(/,/g, '');
  const x = Number(t);
  return isFinite(x) ? x : NaN;
}

// ---------- PRB: OLS with HC3 robust SE ----------
function normalCDF(x){
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x*x/2);
  let p = d * t * (0.3193815 + t*(-0.3565638 + t*(1.781478 + t*(-1.821256 + t*1.330274))));
  if (x > 0) p = 1 - p; else p = p;
  return p;
}

function prbHC3(sale, ratio){
  const n = ratio.length;
  if (n < 3) return {slope: NaN, p: NaN};
  const x = sale.map(s => Math.log(s));
  let sum1=0, sumx=0, sumxx=0, sumy=0, sumxy=0;
  for (let i=0;i<n;i++){
    const xi = x[i]; const yi = ratio[i];
    sum1 += 1; sumx += xi; sumxx += xi*xi; sumy += yi; sumxy += xi*yi;
  }
  const det = sum1*sumxx - sumx*sumx;
  if (Math.abs(det) < 1e-12) return {slope: NaN, p: NaN};
  const inv00 =  sumxx/det, inv01 = -sumx/det, inv11 = sum1/det;
  const beta0 = inv00*sumy + inv01*sumxy;
  const beta1 = inv01*sumy + inv11*sumxy;
  const e = new Array(n); const h = new Array(n);
  for (let i=0;i<n;i++){
    const xi = x[i]; const yi = ratio[i];
    const yhat = beta0 + beta1*xi; e[i] = yi - yhat;
    const v0 = inv00 + inv01*xi; const v1 = inv01 + inv11*xi;
    h[i] = v0*1 + v1*xi;
  }
  let S00=0,S01=0,S11=0;
  for (let i=0;i<n;i++){
    const xi = x[i];
    const w = e[i]*e[i] / Math.pow(1 - Math.min(h[i], 0.999999), 2);
    S00 += w; S01 += w*xi; S11 += w*xi*xi;
  }
  const M00=S00, M01=S01, M11=S11;
  const V11 = (inv01*(M00*inv01 + M01*inv11) + inv11*(M01*inv01 + M11*inv11));
  const se1 = Math.sqrt(Math.max(V11, 0));
  const slope = beta1;
  const z = se1 > 0 ? Math.abs(slope / se1) : NaN;
  const p = isFinite(z) ? 2*(1 - normalCDF(z)) : NaN;
  return {slope, p};
}

// ---------- Bootstrap median CI with progress (deterministic) NOT CURRENTLY USED----------
function bootstrapMedianCI90WithProgress(values, seed=20250101, resamples=10000, progressBase=0, progressSpan=1){
  const n = values.length;
  if (n === 0) return {low: NaN, high: NaN};
  const uniq = new Set(values.map(v=>+v)).size;
  const baseMed = median(values);
  if (uniq === 1) return {low: baseMed, high: baseMed};
  const rng = mulberry32(seed >>> 0);
  const meds = new Array(resamples);
  const tick = Math.max(250, Math.floor(resamples/100));
  for (let b=0; b<resamples; b++){
    const sample = new Array(n);
    for (let i=0;i<n;i++) sample[i] = values[Math.floor(rng()*n)];
    meds[b] = median(sample);
    if (b && (b % tick) === 0){
      const p = progressBase + (b / resamples) * progressSpan;
      postMessage({ type: 'progress', p });
    }
  }
  meds.sort((x,y)=>x-y);
  const low = quantileSorted(meds, 0.05);
  const high = quantileSorted(meds, 0.95);
  postMessage({ type: 'progress', p: progressBase + progressSpan });
  return {low, high};
}

function medianCIFromRatios(ratiosIn, { confidence = 0.95 } = {}) {
  if (!Array.isArray(ratiosIn)) {
    throw new Error("Provide an array of ratios (assessed/sale).");
  }

  // Clean & sort
  const ratios = ratiosIn.filter(x => isFinite(x) && x > 0).slice().sort((a, b) => a - b);
  const n = ratios.length;
  if (n === 0) return { n: 0, median: NaN, lower: NaN, upper: NaN };

  // z per spec
  const z = confidence === 0.90 ? 1.64 : 1.96;

  // Rank offset
  let rBase = (z * Math.sqrt(n)) / 2;
  if (n % 2 === 0) rBase += 0.5;
  const r = Math.ceil(rBase);


  // Confidence limits via order stats
  let lowerPos1B, upperPos1B; // 1-based positions
  if (n % 2 === 1) {
    const m = (n + 1) / 2;
    lowerPos1B = m - r;
    upperPos1B = m + r;
  } else {
    const left = n / 2;
    const right = n / 2 + 1;
    lowerPos1B = right - r;
    upperPos1B = left + r;
  }

  // clamp to [1, n] and convert to 0-based
  const lowerIdx = Math.max(1, Math.min(n, lowerPos1B)) - 1;
  const upperIdx = Math.max(1, Math.min(n, upperPos1B)) - 1;

  return {
    low: ratios[lowerIdx],
    high: ratios[upperIdx],
  };
}

// ---------- VEI ----------
function computeVEIWithCI(sale, val, ratios, sampleMedian){
  const N = ratios.length;
  if (N < 10){
    return { VEI: NaN, VEI_significance: NaN, strata: [], vei_note: 'Cannot compute VEI: N < 10' };
  }
  let G = 10; if (N <= 50) G = 2; else if (N <= 500) G = 4;
  const proxy = sale.map((s,i)=> 0.5*s + 0.5*(val[i] / sampleMedian));
  const idx = Array.from({length:N}, (_,i)=>i).sort((i,j)=> proxy[i]===proxy[j]? i-j : proxy[i]-proxy[j]);
  const base = Math.floor(N / G); let remainder = N % G; const groups = []; let start=0;
  for (let g=0; g<G; g++){
    let size = base + (remainder > 0 ? 1 : 0); if (remainder > 0) remainder--;
    let end = start + size; while (end < N && proxy[idx[end-1]] === proxy[idx[end]]) end++;
    groups.push(idx.slice(start,end)); start = end; if (start >= N) break;
  }
  if (groups.length && groups[groups.length-1].length === 0) groups.pop();

  const strata = [];
  for (let i=0; i<groups.length; i++){
    const group = groups[i];
    const r = group.map(k=>ratios[k]);
    const m = median(r);
    const ci = r.length >= 2 ? medianCIFromRatios(r) : {low: NaN, high: NaN};
    strata.push({ n: r.length, median: m, ci_low: ci.low, ci_high: ci.high });
  }
  if (strata.length < 2){
    return { VEI: NaN, VEI_significance: NaN, strata, vei_note: 'Insufficient strata after tie handling.' };
  }
  const first = strata[0];
  const last = strata[strata.length-1];
  const VEI = ((last.median - first.median) / sampleMedian) * 100;
  const VEI_significance = ((last.ci_high - first.ci_low) / sampleMedian) * 100;
  return { VEI, VEI_significance, strata, vei_note: '' };
}

// ---------- Main compute ----------
function computeMetricsFromPairs(pairs){
  const filtered = [];
  let ignored = 0, excludedNonPos = 0;
  for (const [saleRaw, valRaw] of pairs){
    const sale = parseNumber(saleRaw);
    const val = parseNumber(valRaw);
    if (!isFinite(sale) || !isFinite(val)) { ignored++; continue; }
    if (sale <= 0) { excludedNonPos++; continue; }
    filtered.push({sale, val});
  }
  const sale = filtered.map(r=>r.sale);
  const val = filtered.map(r=>r.val);
  const ratios = filtered.map(r=> r.val / r.sale);
  const n = ratios.length;
  const messages = [];
  messages.push(`${pairs.length} rows read. ${ignored} ignored for empty/non-numeric fields. ${excludedNonPos} excluded for sale_price ≤ 0.`);
  if (n === 0) return {messages, n, error:"No valid rows after exclusions."};

  const med = median(ratios);
  // Overall median CI (posts progress up to ~0.8)
  const ci = medianCIFromRatios(ratios);
  const deviations = ratios.map(x=>Math.abs(x - med));
  const COD = 100 * (median(deviations) / med);
  const meanRatio = mean(ratios);
  const weightedMeanRatio = sum(val) / sum(sale);
  const PRD = meanRatio / weightedMeanRatio;

  let PRB_slope = NaN, PRB_p = NaN;
  if (n >= 3 && new Set(sale).size > 1){
    const prb = prbHC3(sale, ratios);
    PRB_slope = prb.slope;
    PRB_p = prb.p;
  } else {
    messages.push('PRB cannot be computed: need N ≥ 3 and variation in sale_price.');
  }

  const vei = computeVEIWithCI(sale, val, ratios, med);

  return {messages, n, med, ci, COD, PRD, PRB_slope, PRB_p, ...vei};
}

// ---------- Worker messaging ----------
self.onmessage = (e) => {
  const { type } = e.data || {};
  if (type === 'compute'){
    try {
      const { pairs } = e.data;
      postMessage({ type: 'progress', p: 0.05, msg: 'Parsing and filtering rows…' });
      const out = computeMetricsFromPairs(pairs);
      postMessage({ type: 'done', result: out });
    } catch (err) {
      postMessage({ type: 'error', error: String(err && err.message || err) });
    }
  }
};
