import { IonContent, IonIcon, IonPage } from '@ionic/react';
import { cameraReverseOutline } from 'ionicons/icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CaptureSession,
  type FaceBox,
} from 'face-recognition-cordova';
import { ensureCameraPermission } from '../cameraPermission';
import { getSettings, isLive, useSettings } from '../data/settings';
import { isReady, stateMessage, useEngineState } from '../engine';
import { useActiveTab, useOnTabsSurface } from '../tabVisible';

const LIVE = '#2EE6A6';
const FAKE = '#FF6B6B';

/**
 * Liveness on its own: the camera, a box per face and that face's liveness score. There is
 * nothing to press — no shutter, no gallery, no result screen. It is the plainest possible
 * demonstration that the engine tells a live face from a photo of one.
 */
export default function LivenessPage() {
  const onTabs = useOnTabsSurface();
  const tab = useActiveTab();
  const active = onTabs && tab === 'liveness';
  const engine = useEngineState();
  const settings = useSettings();
  const sessionRef = useRef<CaptureSession | null>(null);
  const [front, setFront] = useState(true);
  const [boxes, setBoxes] = useState<FaceBox[]>([]);
  const [frame, setFrame] = useState({ w: 0, h: 0 });
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Native front preview is mirrored; engine boxes are not. Mirror X in drawing
  // space (not via SVG scaleX) so the rect lines up with the face.
  const mirrorOverlay = front;

  useEffect(() => {
    if (!active || !isReady()) return;
    let cancelled = false;
    setCameraError(null);
    setBoxes([]);

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
        // No gate on this screen: every face is drawn with whatever it scored.
        eyeclose_threshold: 1,
        // Tracking frames omit liveness; poll so Live/Fake is a real score.
        poll_liveness: true,
      },
      onState: (_state, _warning, found, size) => {
        if (cancelled) return;
        setBoxes(found);
        setFrame(size);
      },
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
      void session.stop();
    };
  }, [active, front, engine]);

  const flip = useCallback(() => setFront((f) => !f), []);

  return (
    <IonPage className="live-page">
    <IonContent fullscreen style={{ '--background': 'transparent' } as never}>
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        {(cameraError || !isReady()) && (
          <div
            style={{
              position: 'absolute',
              top: 72,
              left: 16,
              right: 16,
              zIndex: 2,
              padding: 12,
              borderRadius: 12,
              background: 'rgba(0,0,0,0.7)',
              color: '#fff',
              fontSize: 13,
              textAlign: 'center',
            }}
          >
            {cameraError ?? stateMessage(engine)}
          </div>
        )}
        <svg
          viewBox={`0 0 ${Math.max(1, frame.w)} ${Math.max(1, frame.h)}`}
          preserveAspectRatio="xMidYMid slice"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
          }}
        >
          {boxes.map((box, i) => {
            const scored =
              typeof box.liveness === 'number' && Number.isFinite(box.liveness);
            const live = scored && isLive(settings, box.liveness);
            const colour = !scored ? '#ffffff' : live ? LIVE : FAKE;
            const label = !scored
              ? 'Checking…'
              : `${live ? 'Live' : 'Fake'} ${(box.liveness ?? 0).toFixed(2)}`;
            const fw = Math.max(1, frame.w);
            const left = mirrorOverlay ? fw - box.x2 : box.x1;
            const right = mirrorOverlay ? fw - box.x1 : box.x2;
            const top = box.y1;
            const width = Math.max(0, right - left);
            const height = Math.max(0, box.y2 - box.y1);
            return (
              <g key={i}>
                <rect
                  x={left}
                  y={top}
                  width={width}
                  height={height}
                  rx={9}
                  fill="none"
                  stroke={colour}
                  strokeWidth={3}
                />
                <text
                  x={left + 4}
                  y={Math.max(14, top - 8)}
                  fill={colour}
                  fontSize={18}
                  fontWeight={600}
                >
                  {label}
                </text>
              </g>
            );
          })}
        </svg>

        <div
          style={{
            position: 'absolute',
            top: 16,
            left: 16,
            right: 16,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <div style={{ flex: 1, color: '#fff', fontSize: 22, fontWeight: 700 }}>
            Liveness
          </div>
          <IonIcon
            icon={cameraReverseOutline}
            onClick={flip}
            style={{ color: '#fff', fontSize: 26 }}
          />
        </div>

        {!isReady() || boxes.length === 0 ? (
          <div
            style={{
              position: 'absolute',
              bottom: 'calc(28px + var(--fp-tab-bar-height))',
              left: 0,
              right: 0,
              textAlign: 'center',
            }}
          >
            <span
              style={{
                background: 'rgba(0,0,0,0.55)',
                color: '#fff',
                borderRadius: 14,
                padding: '6px 14px',
                fontSize: 14,
              }}
            >
              {isReady() ? 'No face' : stateMessage(engine)}
            </span>
          </div>
        ) : null}
      </div>
    </IonContent>
    </IonPage>
  );
}
