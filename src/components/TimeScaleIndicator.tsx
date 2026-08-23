import { TIME_SCALE_PRESETS } from '@/sim/constants';
import { useSimulationStore } from '@/store/simulation-store';
import { buildTimeScaleDisplay } from '@/sim/time-scale/format';

export function TimeScaleIndicator() {
  const snapshot = useSimulationStore((s) => s.snapshot);
  const setTimeScale = useSimulationStore((s) => s.setTimeScale);

  if (!snapshot) return null;

  const ts = snapshot.timeScale;
  const display = buildTimeScaleDisplay({
    requestedTimeScale: ts.requestedTimeScale,
    effectiveTimeScale: ts.effectiveTimeScale,
    isCapped: ts.isCapped,
    capReason: ts.capReason,
  });

  const kind = snapshot.engineKind ?? 'nbody';
  const compatibility = snapshot.engineCompatibility;

  return (
    <div className="time-scale-panel">
      <div className="engine-status">
        <span>
          Motor: {kind === 'orbital' ? 'Orbital' : 'N-body'}
        </span>
        {kind === 'orbital' && <span className="engine-badge">Experimental</span>}
      </div>
      {kind === 'orbital' && compatibility?.compatible && (
        <p className="engine-warning">
          El motor orbital propaga órbitas de dos cuerpos (Kepler). No incluye perturbaciones
          N-body ni colisiones.
        </p>
      )}
      {kind === 'orbital' && compatibility && !compatibility.compatible && (
        <p className="engine-error" role="alert">
          Este escenario no es compatible con el motor orbital
          {compatibility.reason ? `: ${compatibility.reason}` : '.'} El motor N-body sigue
          disponible.
        </p>
      )}

      <div className="time-scale-presets">
        {TIME_SCALE_PRESETS.map((p) => (
          <button
            key={p.label}
            className={ts.requestedTimeScale === p.value ? 'active' : ''}
            onClick={() => setTimeScale(p.value)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className={`time-scale-status ${display.status}`}>
        <div className="time-scale-lines">
          <span className="requested">{display.objectiveLine}</span>
          <span className="effective">{display.realLine}</span>
        </div>
        {display.warning && <span className="warning">⚠ {display.warning}</span>}
        {display.status === 'ok' && <span className="ok-label">✓ alcanzado</span>}
      </div>

      <div className="substeps">
        {kind === 'orbital' && compatibility?.compatible
          ? 'propagación Kepler directa (sin subpasos N-body)'
          : `physicsDt: ${ts.physicsDt}s · subpasos: ${ts.substepsExecuted} / ${ts.substepsRequested} por frame`}
        {ts.capReason && <span className="cap-reason"> ({ts.capReason})</span>}
      </div>
    </div>
  );
}
