import { TIME_SCALE_PRESETS } from '../constants';

export function formatTimeScaleLabel(scale: number): string {
  const preset = TIME_SCALE_PRESETS.find((p) => p.value === scale);
  if (preset) return preset.label;
  if (scale >= 86400) return `${(scale / 86400).toFixed(2)} días/s`;
  if (scale >= 3600) return `${(scale / 3600).toFixed(1)} h/s`;
  return `${scale.toFixed(0)}×`;
}

/** Format an effective rate using the same units as the requested preset. */
export function formatEffectiveTimeScale(requested: number, effective: number): string {
  if (requested >= 31_557_600) return `${(effective / 31_557_600).toFixed(2)} años/s`;
  if (requested >= 86400) return `${(effective / 86400).toFixed(2)} días/s`;
  if (requested <= 0) return '0×';
  return `${(effective / requested).toFixed(2)}×`;
}

export interface TimeScaleDisplayLines {
  objectiveLine: string;
  realLine: string;
  status: 'ok' | 'capped' | 'idle';
  warning: string | null;
}

/**
 * Build honest Objetivo/Real copy. Never presents requested as achieved when capped or idle.
 */
export function buildTimeScaleDisplay(input: {
  requestedTimeScale: number;
  effectiveTimeScale: number;
  isCapped: boolean;
  capReason: 'budget' | 'maxSubsteps' | 'incompatible' | null;
}): TimeScaleDisplayLines {
  const objectiveLabel = formatTimeScaleLabel(input.requestedTimeScale);
  const realLabel = formatEffectiveTimeScale(
    input.requestedTimeScale,
    input.effectiveTimeScale,
  );
  const objectiveLine = `Objetivo: ${objectiveLabel}`;

  if (input.isCapped) {
    const reason =
      input.capReason === 'maxSubsteps'
        ? 'límite de subpasos'
        : input.capReason === 'budget'
          ? 'presupuesto CPU'
          : input.capReason === 'incompatible'
            ? 'escenario incompatible'
            : 'CPU';
    return {
      objectiveLine,
      realLine: `Real: ${realLabel}`,
      status: 'capped',
      warning: `LIMITADO (${reason})`,
    };
  }

  // Idle / paused: effective 0 must not claim the target was reached.
  if (input.effectiveTimeScale <= 0) {
    return {
      objectiveLine,
      realLine: 'Real: —',
      status: 'idle',
      warning: null,
    };
  }

  return {
    objectiveLine,
    realLine: `Real: ${realLabel}`,
    status: 'ok',
    warning: null,
  };
}
