#!/usr/bin/env node
/**
 * N-body O(N²) Leapfrog KDK benchmark
 *
 * Methodology:
 * - 200 warmup steps (not measured)
 * - 500 measured steps per run
 * - 7 runs, report median of medians + p95
 * - Init cost measured separately (bootstrap forces)
 *
 * Usage: node scripts/benchmark-nbody.mjs
 */

const G = 6.67430e-11;
const WARMUP_STEPS = 200;
const MEASURE_STEPS = 500;
const RUNS = 7;
const NS_TO_TEST = [10, 25, 50, 100, 200, 500, 1000];

function makeState(n, seed = 42) {
  let s = seed;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
  const pos = new Float64Array(n * 2);
  const vel = new Float64Array(n * 2);
  const masses = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 2] = (rand() - 0.5) * 1.5e11;
    pos[i * 2 + 1] = (rand() - 0.5) * 1.5e11;
    vel[i * 2] = (rand() - 0.5) * 3e4;
    vel[i * 2 + 1] = (rand() - 0.5) * 3e4;
    masses[i] = i === 0 ? 1.989e30 : 5.972e24 * (0.5 + rand());
  }
  return { pos, vel, masses };
}

function directForce(pos, masses, n, acc) {
  for (let i = 0; i < n; i++) {
    let ax = 0, ay = 0;
    const xi = pos[i * 2], yi = pos[i * 2 + 1];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const dx = pos[j * 2] - xi;
      const dy = pos[j * 2 + 1] - yi;
      const r2 = dx * dx + dy * dy;
      const invR3 = 1 / (r2 * Math.sqrt(r2));
      const f = G * masses[j] * invR3;
      ax += f * dx;
      ay += f * dy;
    }
    acc[i * 2] = ax;
    acc[i * 2 + 1] = ay;
  }
}

function leapfrogStep(pos, vel, masses, n, dt, acc) {
  directForce(pos, masses, n, acc);
  const half = dt * 0.5;
  for (let i = 0; i < n; i++) {
    vel[i * 2] += acc[i * 2] * half;
    vel[i * 2 + 1] += acc[i * 2 + 1] * half;
  }
  for (let i = 0; i < n; i++) {
    pos[i * 2] += vel[i * 2] * dt;
    pos[i * 2 + 1] += vel[i * 2 + 1] * dt;
  }
  directForce(pos, masses, n, acc);
  for (let i = 0; i < n; i++) {
    vel[i * 2] += acc[i * 2] * half;
    vel[i * 2 + 1] += acc[i * 2 + 1] * half;
  }
}

function percentile(sorted, p) {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

function measureOneRun(n) {
  const { pos, vel, masses } = makeState(n);
  const acc = new Float64Array(n * 2);
  const dt = 3600;

  for (let i = 0; i < WARMUP_STEPS; i++) leapfrogStep(pos, vel, masses, n, dt, acc);

  const stepTimes = [];
  for (let i = 0; i < MEASURE_STEPS; i++) {
    const t0 = performance.now();
    leapfrogStep(pos, vel, masses, n, dt, acc);
    stepTimes.push(performance.now() - t0);
  }

  stepTimes.sort((a, b) => a - b);
  return {
    median: percentile(stepTimes, 50),
    p95: percentile(stepTimes, 95),
    mean: stepTimes.reduce((a, b) => a + b, 0) / stepTimes.length,
  };
}

function measureInitCost(n) {
  const t0 = performance.now();
  const { pos, masses } = makeState(n);
  const acc = new Float64Array(n * 2);
  directForce(pos, masses, n, acc);
  return performance.now() - t0;
}

function aggregateRuns(n) {
  const initMs = measureInitCost(n);
  const runs = Array.from({ length: RUNS }, () => measureOneRun(n));
  const medians = runs.map(r => r.median).sort((a, b) => a - b);
  const p95s = runs.map(r => r.p95).sort((a, b) => a - b);
  const median = percentile(medians, 50);
  const pairs = n * (n - 1);

  return {
    n,
    pairs,
    initMs: +initMs.toFixed(4),
    medianMs: +median.toFixed(4),
    p95Ms: +percentile(p95s, 50).toFixed(4),
    minMedianMs: +medians[0].toFixed(4),
    maxMedianMs: +medians[medians.length - 1].toFixed(4),
    stepsIn8ms: Math.floor(8 / median),
    stepsIn16ms: Math.floor(16 / median),
    perPairNs: +((median * 1e6) / pairs).toFixed(2),
  };
}

console.log(`Benchmark: Leapfrog KDK, Direct O(N²), Float64Array, G SI`);
console.log(`Node ${process.version} | warmup=${WARMUP_STEPS} | measure=${MEASURE_STEPS}×${RUNS} runs\n`);

const results = NS_TO_TEST.map(aggregateRuns);
console.table(results);

const base = results[0];
console.log('\nScaling vs N=10:');
for (const r of results) {
  const timeRatio = (r.medianMs / base.medianMs).toFixed(1);
  const pairRatio = (r.pairs / base.pairs).toFixed(1);
  console.log(`  N=${String(r.n).padStart(4)}: pairs=${String(r.pairs).padStart(8)} pairRatio=${pairRatio}x timeRatio=${timeRatio}x perPair=${r.perPairNs}ns`);
}

// ---------------------------------------------------------------------------
// Effective astronomical throughput vs physicsDt (same O(N²) cost per step)
// Larger physicsDt advances more simulated time per CPU budget without changing
// the solver. Expected ratio ≈ 7200/120 = 60× at equal steps/ms.
// ---------------------------------------------------------------------------

const YEAR_S = 31_557_600;
const FRAME_BUDGET_MS = 8;
const TARGET_FPS = 60;
const EFFECTIVE_NS = [50, 100];
const PHYSICS_DTS = [120, 7200];

console.log('\nEffective time scale (frameBudgetMs=8, targetFps=60):');
console.log('Simulated years/s ≈ (steps in 8ms) × physicsDt × 60 / YEAR_S\n');

const effectiveRows = [];
for (const n of EFFECTIVE_NS) {
  const { medianMs } = aggregateRuns(n);
  const stepsInBudget = Math.max(0, Math.floor(FRAME_BUDGET_MS / medianMs));
  for (const dt of PHYSICS_DTS) {
    const simSecondsPerFrame = stepsInBudget * dt;
    const effectiveTimeScale = simSecondsPerFrame * TARGET_FPS;
    const yearsPerWallSecond = effectiveTimeScale / YEAR_S;
    effectiveRows.push({
      n,
      physicsDt: dt,
      medianMsPerStep: +medianMs.toFixed(4),
      stepsIn8ms: stepsInBudget,
      effectiveYearsPerSec: +yearsPerWallSecond.toFixed(3),
      effectiveTimeScale: +effectiveTimeScale.toFixed(0),
    });
  }
}
console.table(effectiveRows);

for (const n of EFFECTIVE_NS) {
  const a = effectiveRows.find((r) => r.n === n && r.physicsDt === 120);
  const b = effectiveRows.find((r) => r.n === n && r.physicsDt === 7200);
  if (a && b && a.effectiveYearsPerSec > 0) {
    const factor = b.effectiveYearsPerSec / a.effectiveYearsPerSec;
    console.log(
      `N=${n}: physicsDt 7200 vs 120 → ${factor.toFixed(1)}× effective years/s (expected ~60×)`,
    );
  }
}
