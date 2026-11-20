// Ported from CoCo OS platform/web/src/api/displayObservation.ts (MIT).

export type FaceState =
  | 'normal'
  | 'happy'
  | 'sleep'
  | 'error'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'offline'
  | 'fault';

export interface DisplayObservation {
  selected: FaceState;
  visible: FaceState | null;
  selected_revision: number;
  visible_revision: number;
  visible_valid: boolean;
  available: boolean;
  hil_active: boolean;
  inputs_stale: boolean;
  coalesced_requests: number;
  draw_budget_exhaustions: number;
  draw_failures: number;
}

const FACES: readonly string[] = [
  'normal',
  'happy',
  'sleep',
  'error',
  'listening',
  'thinking',
  'speaking',
  'offline',
  'fault',
];

/** Invalid/absent observations become null (unknown); never reuse stale visible faces. */
export function readDisplayObservation(value: unknown): DisplayObservation | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.selected !== 'string' || !FACES.includes(row.selected)) return null;
  if (row.visible !== null && (typeof row.visible !== 'string' || !FACES.includes(row.visible))) {
    return null;
  }
  if (
    ['visible_valid', 'available', 'hil_active', 'inputs_stale'].some(
      (key) => typeof row[key] !== 'boolean',
    )
  ) {
    return null;
  }
  if (
    [
      'selected_revision',
      'visible_revision',
      'coalesced_requests',
      'draw_budget_exhaustions',
      'draw_failures',
    ].some(
      (key) =>
        typeof row[key] !== 'number' ||
        !Number.isSafeInteger(row[key]) ||
        (row[key] as number) < 0 ||
        (row[key] as number) > 4294967295,
    )
  ) {
    return null;
  }
  if (row.visible_valid) {
    if (
      !row.available ||
      row.hil_active ||
      row.visible !== row.selected ||
      row.selected_revision === 0 ||
      row.selected_revision !== row.visible_revision
    ) {
      return null;
    }
  } else if (row.visible !== null) {
    return null;
  }
  return {
    selected: row.selected as FaceState,
    visible: row.visible as FaceState | null,
    selected_revision: row.selected_revision as number,
    visible_revision: row.visible_revision as number,
    visible_valid: row.visible_valid as boolean,
    available: row.available as boolean,
    hil_active: row.hil_active as boolean,
    inputs_stale: row.inputs_stale as boolean,
    coalesced_requests: row.coalesced_requests as number,
    draw_budget_exhaustions: row.draw_budget_exhaustions as number,
    draw_failures: row.draw_failures as number,
  };
}
