import { useEffect, useState } from 'react';
import {
  getLicenseStatus,
  getMachineCode,
  init,
  lastLicenseError,
  parseLicenseStatus,
  setActivation,
  NOT_LICENSED,
  SDK_INIT_FAILED,
  SDK_LICENSE_EXPIRED,
  SDK_LICENSE_INVALID,
  SDK_NOT_ACTIVATED,
  SDK_SUCCESS,
  type LicenseStatus,
} from 'face-recognition-cordova';
import { demoLicense } from './license';
import { whenDeviceReady } from './deviceReady';

/**
 * The process-wide engine owner (Android `shell/engine`): activation with the built-in key,
 * then init, plus the one queue that serializes every SDK call and a state observable.
 *
 * The native engine is not re-entrant, so nothing calls it directly — everything goes through
 * [serial]. The camera loop uses [serialIfIdle] instead, because a frame that arrives while
 * the engine is busy is better dropped than queued behind a stale one.
 */
export type EngineState =
  | 'LOADING'
  | 'READY'
  | 'NOT_ACTIVATED'
  | 'LICENSE_INVALID'
  | 'LICENSE_EXPIRED'
  | 'FAILED'
  | 'SDK_MISSING';

let state: EngineState = 'LOADING';
let detail = '';
let machine = '';
let license: LicenseStatus = NOT_LICENSED;
let started = false;
const listeners = new Set<(s: EngineState) => void>();

function publish(s: EngineState) {
  state = s;
  listeners.forEach((l) => l(s));
}

export function engineState(): EngineState {
  return state;
}

export function isReady(): boolean {
  return state === 'READY';
}

export function machineCode(): string {
  return machine;
}

export function licenseTier(): LicenseStatus {
  return license;
}

/** Ready to show the user. */
export function stateMessage(s: EngineState = state): string {
  const withDetail = (text: string) => (detail ? `${text} ${detail}` : text);
  switch (s) {
    case 'LOADING':
      return 'Loading the face engine…';
    case 'READY':
      return license.label ? `Ready · ${license.label}` : 'Ready';
    case 'NOT_ACTIVATED':
      return withDetail('The face engine is not activated.');
    case 'LICENSE_INVALID':
      return withDetail('This license is not valid.');
    case 'LICENSE_EXPIRED':
      return withDetail('This license has expired.');
    case 'SDK_MISSING':
      return 'The Face Recognition SDK is not in this build. Run `npx cap sync`.';
    default:
      return withDetail('The face engine could not start.');
  }
}

// ---------------------------------------------------------------- the call queue

let tail: Promise<unknown> = Promise.resolve();

/** Runs [job] after every job queued before it. */
export function serial<T>(job: () => Promise<T>): Promise<T> {
  const run = tail.then(job, job);
  tail = run.catch(() => undefined);
  return run;
}

let pending = 0;

/** Like [serial], but drops the job (resolves null) when one is already queued. Camera frames. */
export function serialIfIdle<T>(job: () => Promise<T>): Promise<T | null> {
  if (pending > 0) return Promise.resolve(null);
  pending++;
  return serial(job).finally(() => {
    pending--;
  });
}

// ---------------------------------------------------------------- lifecycle

function stateForCode(code: number): EngineState {
  switch (code) {
    case SDK_SUCCESS:
      return 'READY';
    case SDK_NOT_ACTIVATED:
      return 'NOT_ACTIVATED';
    case SDK_LICENSE_INVALID:
      return 'LICENSE_INVALID';
    case SDK_LICENSE_EXPIRED:
      return 'LICENSE_EXPIRED';
    default:
      return 'FAILED';
  }
}

/** Activates with the key compiled into the app, then loads the models. Runs once. */
export function startEngine(): void {
  if (started) return;
  started = true;
  publish('LOADING');
  void serial(async () => {
    try {
      // Cordova plugins are not callable before deviceready fires.
      await whenDeviceReady();
      machine = await getMachineCode();
      let code = await setActivation(demoLicense());
      if (code !== SDK_SUCCESS) {
        detail = await lastLicenseError().catch(() => '');
        publish(stateForCode(code));
        return;
      }
      code = await init();
      if (code !== SDK_SUCCESS) {
        // An init failure is usually the license tier, and this is the only thing that says
        // which — the iOS app's stateMessage appends it the same way.
        detail = await lastLicenseError().catch(() => '');
        publish(code === SDK_INIT_FAILED ? 'FAILED' : stateForCode(code));
        return;
      }
      license = parseLicenseStatus(await getLicenseStatus());
      publish('READY');
    } catch (e) {
      const message = String((e as Error)?.message ?? e);
      // A web build, or a native build that never ran `npx cap sync`, has no plugin at all.
      publish(
        message.includes('not implemented') || message.includes('Unimplemented')
          ? 'SDK_MISSING'
          : 'FAILED'
      );
      detail = message;
    }
  });
}

/** Retry after a failure; the engine reruns activation and init. */
export function restartEngine(): void {
  started = false;
  detail = '';
  startEngine();
}

export function useEngineState(): EngineState {
  const [s, setS] = useState<EngineState>(state);
  useEffect(() => {
    listeners.add(setS);
    setS(state);
    return () => {
      listeners.delete(setS);
    };
  }, []);
  return s;
}
