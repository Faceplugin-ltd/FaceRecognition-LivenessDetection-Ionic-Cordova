import { IonContent, IonIcon, IonPage, IonSpinner, IonToggle } from '@ionic/react';
import {
  cameraReverseOutline,
  imagesOutline,
} from 'ionicons/icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useHistory } from 'react-router-dom';
import {
  CaptureSession,
  faceHeldStill,
  identifyStatus,
  type FaceBox,
  type IdentifyStatus,
} from 'face-recognition-cordova';
import { S } from '../strings';
import { facesCount, score } from '../format';
import * as gallery from '../data/gallery';
import { getSettings, updateSettings, useSettings } from '../data/settings';
import { isReady, stateMessage, useEngineState } from '../engine';
import { useActiveTab, useOnTabsSurface } from '../tabVisible';
import { ResultStore } from '../data/resultStore';
import { colors, Pill } from '../ui/components';
import { ensureCameraPermission } from '../cameraPermission';
import { pickGalleryPhoto } from '../pickImage';
import StatusDialog from '../ui/StatusDialog';
import type { CallReport } from '../data/report';

/** Auto fires once one good face has stayed in place this long. */
const AUTO_STABLE_MS = 300;

/** Android `IdentifyFragment.Status` - five states, not the nine the enrolment gate has. */
const STATUS_TEXT: Record<IdentifyStatus, string> = {
  NO_FACE: S.status_no_face,
  MANY: S.status_many_faces,
  MOVE_CLOSER: S.status_move_closer,
  TOO_DARK: S.status_too_dark,
  OK: S.status_face_ok,
};

/**
 * Live camera identify with a status chip, shutter, gallery pick and Auto.
 * Attribute uses the same screen — [mode] only changes what the shutter runs.
 * Android `shell/IdentifyFragment.kt`.
 */
export default function CameraPage({ mode }: { mode: 'identify' | 'attribute' }) {
  const history = useHistory();
  const tab = useActiveTab();
  const onTabs = useOnTabsSurface();
  const settings = useSettings();
  const engine = useEngineState();

  const sessionRef = useRef<CaptureSession | null>(null);
  const boxesRef = useRef<FaceBox[]>([]);
  const stableSince = useRef<number>(0);
  const busyRef = useRef(false);

  const [status, setStatus] = useState<IdentifyStatus>('NO_FACE');
  const lastCenter = useRef<{ x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [front, setFront] = useState(true);
  const [count, setCount] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [stopped, setStopped] = useState<{
    reason: string;
    report: CallReport | null;
  } | null>(null);

  // Preview only on Identity / Attribute while that tab is front — not People,
  // Settings, result screens, or while a status dialog is open after capture.
  const active =
    onTabs &&
    stopped == null &&
    tab === (mode === 'attribute' ? 'attribute' : 'identify');

  useEffect(() => gallery.subscribe(() => setCount(gallery.count())), []);
  useEffect(() => setCount(gallery.count()), []);

  const run = useCallback(
    async (uri: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      try {
        if (mode === 'attribute') {
          ResultStore.attribute = await gallery.attributes(uri);
          history.push('/attribute-result');
          return;
        }
        const outcome = await gallery.identify(uri);
        if (outcome.kind === 'done') {
          ResultStore.last = outcome.result;
          history.push('/result');
        } else if (outcome.report) {
          // Stays busy while the status is open, so auto does not fire behind it.
          setStopped({ reason: outcome.reason, report: outcome.report });
          return;
        } else {
          setStopped({ reason: outcome.reason, report: null });
          return;
        }
      } finally {
        stableSince.current = 0;
        busyRef.current = false;
        setBusy(false);
      }
    },
    [history, mode]
  );

  // ---- the live session ----

  useEffect(() => {
    if (!active || !isReady()) return;
    let cancelled = false;
    setCameraError(null);

    const s = getSettings();
    const session = new CaptureSession({
      settings: {
        camera_lens: front ? 'front' : 'back',
        match_threshold: s.threshold,
        liveness_threshold: s.livenessThreshold,
        liveness_level: 0,
        yaw_threshold: s.yaw,
        roll_threshold: s.roll,
        pitch_threshold: s.pitch,
        // The coach does not gate on eyes; the result screens report the score instead.
        eyeclose_threshold: 1,
      },
      // The session's own CaptureState gates an enrolment capture; identify coaches on the
      // looser native rule instead, from the same boxes and the frame they were found in.
      onState: (_state, _warning, boxes, frame) => {
        if (cancelled) return;
        boxesRef.current = boxes;
        const next = identifyStatus(boxes, frame);
        setStatus(next);
        const box = boxes[0];
        if (next === 'OK' && box) {
          const held = faceHeldStill(box, lastCenter.current, frame);
          if (!held || stableSince.current === 0) stableSince.current = Date.now();
          lastCenter.current = { x: (box.x1 + box.x2) / 2, y: (box.y1 + box.y2) / 2 };
        } else {
          stableSince.current = 0;
          lastCenter.current = null;
        }
      },
      // The shutter and Auto drive capture here, not the session's own hold.
      onCaptured: () => undefined,
    });
    sessionRef.current = session;
    void (async () => {
      try {
        await ensureCameraPermission();
        if (cancelled) return;
        await session.start();
      } catch (e) {
        if (cancelled) return;
        setCameraError(e instanceof Error ? e.message : String(e));
        void session.stop();
      }
    })();

    return () => {
      cancelled = true;
      sessionRef.current = null;
      // Awaited via the live-preview queue so the next tab's start cannot race this stop.
      void session.stop();
    };
  }, [active, front, engine]);

  // ---- Auto ----

  useEffect(() => {
    if (!active || !settings.autoCapture || busy) return;
    const timer = window.setInterval(() => {
      if (
        busyRef.current ||
        stableSince.current === 0 ||
        Date.now() - stableSince.current < AUTO_STABLE_MS
      ) {
        return;
      }
      stableSince.current = 0;
      void captureNow();
    }, 100);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, settings.autoCapture, busy]);

  const captureNow = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || busyRef.current) return;
    const result = await session.captureNow(boxesRef.current);
    if (!result) {
      setStopped({ reason: gallery.NO_FACE, report: null });
      return;
    }
    // Stop the preview before leaving for the result page (MainTabs stays mounted).
    await session.stop();
    await run(result.uri);
  }, [run]);

  const pickPhoto = useCallback(async () => {
    if (busyRef.current) return;
    try {
      const uri = await pickGalleryPhoto();
      await sessionRef.current?.stop();
      await run(uri);
    } catch {
      // The user cancelled the picker.
    }
  }, [run]);

  const ready = isReady();
  const label = mode === 'attribute' ? S.tab_attribute : S.tab_identify;
  const message = cameraError ?? (!ready ? stateMessage(engine) : null);

  // Laid out like Android `fragment_identify.xml`: a title row and the bottom bar sit on the
  // app background, and only the stage between them is see-through for the camera.
  return (
    <IonPage className="live-page">
      <IonContent fullscreen className="live-content">
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 16px 8px',
              background: 'var(--fp-bg)',
            }}
          >
            <div
              style={{
                flex: 1,
                color: 'var(--fp-on-surface)',
                fontSize: 22,
                fontWeight: 600,
              }}
            >
              {label}
            </div>
            <div style={{ fontSize: 13, color: 'var(--fp-on-surface-variant)' }}>
              {facesCount(count)}
            </div>
          </div>

          <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
            <div
              style={{
                position: 'absolute',
                top: 12,
                left: 0,
                right: 0,
                display: 'flex',
                justifyContent: 'center',
              }}
            >
              {busy ? (
                <Pill color={colors.accent} size={13}>
                  <IonSpinner
                    name="dots"
                    style={{ height: 12, verticalAlign: 'middle' }}
                  />{' '}
                  {mode === 'attribute' ? S.status_attributes : S.status_identifying}
                </Pill>
              ) : (
                <Pill
                  color={
                    status === 'OK' ? colors.statusMatch : 'var(--fp-camera-chip)'
                  }
                  size={13}
                >
                  {STATUS_TEXT[status]}
                </Pill>
              )}
            </div>

            {message && (
              <div
                style={{
                  position: 'absolute',
                  left: 24,
                  right: 24,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  padding: 12,
                  borderRadius: 12,
                  background: 'var(--fp-camera-chip)',
                  color: '#fff',
                  fontSize: 13,
                  textAlign: 'center',
                }}
              >
                {message}
              </div>
            )}

            {mode === 'identify' && (
              <div style={{ position: 'absolute', left: 12, bottom: 12 }}>
                <Pill color="var(--fp-camera-chip)">
                  {S.txt_threshold_chip(score(settings.threshold))}
                </Pill>
              </div>
            )}

            <button
              onClick={() => setFront((f) => !f)}
              aria-label={S.txt_switch_camera}
              style={{
                position: 'absolute',
                right: 12,
                bottom: 12,
                width: 44,
                height: 44,
                borderRadius: 22,
                border: 0,
                background: 'var(--fp-camera-chip)',
                color: '#fff',
              }}
            >
              <IonIcon icon={cameraReverseOutline} style={{ fontSize: 22 }} />
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '12px 24px',
              // Keep gallery / shutter / Auto above the absolute tab bar.
              paddingBottom: 'calc(12px + var(--fp-tab-bar-height))',
              background: 'var(--fp-bg)',
            }}
          >
            <button
              onClick={() => void pickPhoto()}
              disabled={busy}
              style={{
                flex: 1,
                border: 0,
                background: 'transparent',
                color: 'var(--fp-on-surface)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
              }}
            >
              <IonIcon icon={imagesOutline} style={{ fontSize: 24 }} />
              <span style={{ fontSize: 12 }}>{S.gallery}</span>
            </button>

            <button
              onClick={() => void captureNow()}
              disabled={!ready || busy}
              aria-label={S.capture}
              style={{
                width: 68,
                height: 68,
                borderRadius: '50%',
                border: '4px solid var(--fp-outline-variant)',
                background:
                  ready && !busy ? 'var(--fp-primary)' : 'var(--fp-outline-variant)',
                flexShrink: 0,
              }}
            />

            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
              }}
            >
              <IonToggle
                checked={settings.autoCapture}
                onIonChange={(e) => {
                  updateSettings({ autoCapture: e.detail.checked });
                  stableSince.current = 0;
                }}
              />
              <span style={{ fontSize: 12, color: 'var(--fp-on-surface)' }}>
                {S.auto}
              </span>
            </div>
          </div>
        </div>

        <StatusDialog
          open={stopped != null}
          title={`${label} stopped`}
          reason={stopped?.reason}
          report={stopped?.report ?? null}
          onClose={() => {
            // Clearing this makes `active` true again; the session effect restarts the camera.
            setStopped(null);
          }}
        />
      </IonContent>
    </IonPage>
  );
}
