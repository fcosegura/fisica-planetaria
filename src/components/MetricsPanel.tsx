import { useEffect, useRef, useState } from 'react';
import { useSimulationStore } from '@/store/simulation-store';

function fmt(n: number, digits = 4): string {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1e20) return n.toExponential(digits);
  if (Math.abs(n) >= 1e6) return n.toExponential(digits);
  return n.toPrecision(digits);
}

export function MetricsPanel() {
  const snapshot = useSimulationStore((s) => s.snapshot);
  const playing = useSimulationStore((s) => s.playing);
  const [displaySnapshot, setDisplaySnapshot] = useState(snapshot);
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    if (!snapshot) return;
    const now = performance.now();
    // Update immediately on pause / step, or throttle to ~120ms when running
    if (!playing || now - lastUpdateRef.current >= 120) {
      lastUpdateRef.current = now;
      setDisplaySnapshot(snapshot);
    } else {
      const remaining = 120 - (now - lastUpdateRef.current);
      const timer = setTimeout(() => {
        lastUpdateRef.current = performance.now();
        setDisplaySnapshot(snapshot);
      }, remaining);
      return () => clearTimeout(timer);
    }
  }, [snapshot, playing]);

  const active = displaySnapshot ?? snapshot;
  if (!active) return null;

  const d = active.diagnostics;
  const i = d.initial;

  return (
    <div className="metrics-panel">
      <h3>Métricas de conservación</h3>
      <div className="metric-row">
        <span>Tiempo sim</span>
        <span>{fmt(active.time / 86400, 3)} días</span>
      </div>
      <div className="metric-row">
        <span>Paso</span>
        <span>{active.step}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Magnitud</th>
            <th>Actual</th>
            <th>Inicial</th>
            <th>Error rel.</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>E cinética (J)</td>
            <td>{fmt(d.kineticEnergy)}</td>
            <td>{fmt(i.kineticEnergy)}</td>
            <td>—</td>
          </tr>
          <tr>
            <td>E potencial (J)</td>
            <td>{fmt(d.potentialEnergy)}</td>
            <td>{fmt(i.potentialEnergy)}</td>
            <td>—</td>
          </tr>
          <tr>
            <td>E total (J)</td>
            <td>{fmt(d.totalEnergy)}</td>
            <td>{fmt(i.totalEnergy)}</td>
            <td className={d.relativeEnergyError > 1e-3 ? 'warn' : ''}>
              {d.relativeEnergyError.toExponential(2)}
            </td>
          </tr>
          <tr>
            <td>Momento |P|</td>
            <td>{fmt(Math.hypot(d.linearMomentum.x, d.linearMomentum.y))}</td>
            <td>{fmt(Math.hypot(i.linearMomentum.x, i.linearMomentum.y))}</td>
            <td>{d.relativeMomentumError.toExponential(2)}</td>
          </tr>
          <tr>
            <td>Momento angular L</td>
            <td>{fmt(d.angularMomentum)}</td>
            <td>{fmt(i.angularMomentum)}</td>
            <td>{d.relativeAngularMomentumError.toExponential(2)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
