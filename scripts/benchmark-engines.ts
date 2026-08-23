/**
 * Comparative wall-clock report: leapfrog N-body vs Kepler orbital engine.
 * Run via `npm run benchmark` (after the O(N²) microbench). Not part of `npm test`.
 *
 * No performance target: the table is the result. Orbital evaluates one epoch;
 * N-body takes one Leapfrog step per physicsDt.
 */
import { G } from '../src/sim/constants';
import { OrbitalEngine } from '../src/sim/engine/orbital-engine';
import { SimulationEngine } from '../src/sim/engine/simulation-engine';
import { cartesianToKepler, keplerToCartesian } from '../src/sim/orbit/kepler-2d';
import { kuiperBeltScenario, scenarioToDocument, sunSedna } from '../src/sim/scenarios';
import type { CelestialBody, EngineKind, ScenarioPreset, SimConfig } from '../src/sim/types';

const YEAR = 365.25 * 86400;
const YEARS = [100, 1_000, 10_000] as const;

function withKind(scenario: ScenarioPreset, kind: EngineKind, extra: Partial<SimConfig> = {}) {
  const base = scenarioToDocument(scenario);
  return { ...base, config: { ...base.config, engineKind: kind, ...extra } };
}

function measureMs(fn: () => void): number {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
}

function pickProbe(bodies: readonly CelestialBody[]): { primary: CelestialBody; probe: CelestialBody } {
  const primary = bodies.reduce((a, b) => (b.mass > a.mass ? b : a));
  const sedna = bodies.find((b) => b.name === 'Sedna' && b.id !== primary.id);
  const probe = sedna ?? bodies.find((b) => b.id !== primary.id)!;
  return { primary, probe };
}

function keplerRelError(
  bodies: readonly CelestialBody[],
  probeId: string,
  primaryId: string,
  kep: { a: number },
  expected: { rx: number; ry: number },
): string {
  const after = bodies.find((b) => b.id === probeId)!;
  const sun = bodies.find((b) => b.id === primaryId)!;
  const err =
    Math.hypot(after.position.x - sun.position.x - expected.rx, after.position.y - sun.position.y - expected.ry) /
    kep.a;
  return err.toExponential(2);
}

function runCase(row: Record<string, string | number>, extra = ''): void {
  console.log(
    `[bench] ${row.scenario} ${row.engine} ${row.years}y  ${row.wallMs} ms  ${row.yearsPerSec} y/s${extra}  err=${row.relErr_a}`,
  );
}

const rows: Array<Record<string, string | number>> = [];
const scenarios = [sunSedna, kuiperBeltScenario];

for (const scenario of scenarios) {
  for (const years of YEARS) {
    const engine = new OrbitalEngine({ document: withKind(scenario, 'orbital') });
    const { primary, probe } = pickProbe(engine.getBodies());
    const kep = cartesianToKepler(
      probe.position.x - primary.position.x,
      probe.position.y - primary.position.y,
      probe.velocity.x - primary.velocity.x,
      probe.velocity.y - primary.velocity.y,
      G * primary.mass,
    );
    const ms = measureMs(() => engine.advanceBy(years * YEAR));
    let relErr = 'n/a';
    if (!('error' in kep)) {
      relErr = keplerRelError(
        engine.getBodies(),
        probe.id,
        primary.id,
        kep,
        keplerToCartesian(kep, years * YEAR),
      );
    }
    const row = {
      scenario: scenario.id,
      engine: 'orbital',
      years,
      wallMs: Number(ms.toFixed(3)),
      yearsPerSec: ms > 0 ? Number((years / (ms / 1000)).toPrecision(4)) : 'inf',
      steps: 1,
      relErr_a: relErr,
    };
    rows.push(row);
    runCase(row);
  }
}

for (const scenario of scenarios) {
  const dt = scenario.config.physicsDt ?? 7200;
  for (const years of YEARS) {
    const steps = Math.ceil((years * YEAR) / dt);
    const targetFps = 60;
    const engine = new SimulationEngine({
      document: withKind(scenario, 'nbody', {
        maxSubstepsPerFrame: steps,
        frameBudgetMs: 1e12,
        simulationTimeScale: years * YEAR * targetFps,
        collisionMode: 'ignore',
      }),
    });
    const { primary, probe } = pickProbe(engine.getBodies());
    const kep = cartesianToKepler(
      probe.position.x - primary.position.x,
      probe.position.y - primary.position.y,
      probe.velocity.x - primary.velocity.x,
      probe.velocity.y - primary.velocity.y,
      G * primary.mass,
    );
    const ms = measureMs(() => {
      engine.runFrame();
    });
    let relErr = 'n/a';
    if (!('error' in kep)) {
      relErr = keplerRelError(
        engine.getBodies(),
        probe.id,
        primary.id,
        kep,
        keplerToCartesian(kep, years * YEAR),
      );
    }
    const snap = engine.getSnapshot();
    const executed = snap.timeScale.substepsExecuted;
    const row = {
      scenario: scenario.id,
      engine: 'nbody',
      years,
      wallMs: Number(ms.toFixed(3)),
      yearsPerSec: ms > 0 ? Number((years / (ms / 1000)).toPrecision(4)) : 'inf',
      steps: executed,
      relErr_a: relErr,
    };
    rows.push(row);
    runCase(row, `  steps=${executed}`);
  }
}

console.log('\nN-body vs orbital engine (wall clock, main thread; relErr_a vs two-body Kepler)\n');
console.table(rows);

if (rows.length !== scenarios.length * YEARS.length * 2) {
  throw new Error(`expected ${scenarios.length * YEARS.length * 2} rows, got ${rows.length}`);
}
if (!rows.every((r) => typeof r.wallMs === 'number' && Number.isFinite(r.wallMs))) {
  throw new Error('non-finite wallMs in benchmark rows');
}
