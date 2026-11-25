import { useEffect, useState } from 'react';

/**
 * Persisted demo settings (Android `shell/data/AppSettings.kt`).
 *
 * Defaults are the engine operating points: match 0.80, liveness 0.5, head pose ±20°, with
 * the liveness gate off until the user turns it on. The library reads none of this itself —
 * every threshold it checks against is passed in as `FaceLimits`.
 *
 * Stored in `localStorage`: this is a WebView app, the payload is a handful of numbers, and a
 * synchronous read means the first screen does not render with the wrong threshold.
 */
export type AppSettings = {
  threshold: number;
  liveness: boolean;
  livenessThreshold: number;
  yaw: number;
  roll: number;
  pitch: number;
  autoCapture: boolean;
  /**
   * Skip the post-capture review when every check passes. Off by default: the review is
   * where the SDK is seen refusing a bad capture, which is worth showing a customer.
   */
  skipReview: boolean;
};

export const MIN_THRESHOLD = 0.7;
export const MAX_THRESHOLD = 0.9;

export const DEFAULT_SETTINGS: AppSettings = {
  threshold: 0.8,
  liveness: false,
  livenessThreshold: 0.5,
  yaw: 20,
  roll: 20,
  pitch: 20,
  autoCapture: false,
  skipReview: false,
};

const KEY = 'face_recognition_demo_settings_v1';

let current: AppSettings = { ...DEFAULT_SETTINGS };
let loaded = false;
const listeners = new Set<(s: AppSettings) => void>();

function clamp(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

/** Snapped to two decimals so the slider and the shown value never disagree. */
export function clampThreshold(v: number): number {
  return Math.round(clamp(v, MIN_THRESHOLD, MAX_THRESHOLD, 0.8) * 100) / 100;
}

function sanitize(p: Partial<AppSettings> | null | undefined): AppSettings {
  const d = DEFAULT_SETTINGS;
  return {
    threshold: clampThreshold(p?.threshold ?? d.threshold),
    liveness: typeof p?.liveness === 'boolean' ? p.liveness : d.liveness,
    livenessThreshold: clamp(p?.livenessThreshold, 0, 1, d.livenessThreshold),
    yaw: clamp(p?.yaw, 0, 90, d.yaw),
    roll: clamp(p?.roll, 0, 90, d.roll),
    pitch: clamp(p?.pitch, 0, 90, d.pitch),
    autoCapture:
      typeof p?.autoCapture === 'boolean' ? p.autoCapture : d.autoCapture,
    skipReview:
      typeof p?.skipReview === 'boolean' ? p.skipReview : d.skipReview,
  };
}

export function loadSettings(): AppSettings {
  if (loaded) return current;
  try {
    const raw = localStorage.getItem(KEY);
    current = sanitize(raw ? JSON.parse(raw) : null);
  } catch {
    current = { ...DEFAULT_SETTINGS };
  }
  loaded = true;
  return current;
}

export function getSettings(): AppSettings {
  return loaded ? current : loadSettings();
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  current = sanitize({ ...getSettings(), ...patch });
  loaded = true;
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // A full or blocked store only costs the user their settings next launch.
  }
  listeners.forEach((l) => l(current));
  return current;
}

/** Restores every default except Auto, which is a camera preference (Android reset). */
export function resetSettings(): AppSettings {
  return updateSettings({
    ...DEFAULT_SETTINGS,
    autoCapture: getSettings().autoCapture,
  });
}

/** Every threshold the checks use, in the shape the kit expects. */
export type FaceLimits = {
  match: number;
  liveness: number;
  yaw: number;
  roll: number;
  pitch: number;
};

export function limitsOf(s: AppSettings): FaceLimits {
  return {
    match: s.threshold,
    liveness: s.livenessThreshold,
    yaw: s.yaw,
    roll: s.roll,
    pitch: s.pitch,
  };
}

/**
 * The one liveness rule (Identify, Attribute, Add person): live when the score is at or above
 * the liveness threshold in Settings. The SDK's own Live/Fake label uses a fixed 0.5 and is
 * ignored, so that moving the slider actually changes the verdict.
 */
export function isLive(
  s: AppSettings,
  value: number | null | undefined
): boolean {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value + 0.0001 >= s.livenessThreshold
  );
}

/** True when the head is within the limits of facing the camera. */
export function poseOk(
  s: AppSettings,
  yaw: number,
  roll: number,
  pitch: number
): boolean {
  return (
    Math.abs(yaw) <= s.yaw &&
    Math.abs(roll) <= s.roll &&
    Math.abs(pitch) <= s.pitch
  );
}

export function useSettings(): AppSettings {
  const [s, setS] = useState<AppSettings>(getSettings);
  useEffect(() => {
    listeners.add(setS);
    setS(getSettings());
    return () => {
      listeners.delete(setS);
    };
  }, []);
  return s;
}
