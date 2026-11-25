import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonInput,
  IonModal,
  IonPage,
  IonTitle,
  IonToolbar,
} from '@ionic/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useHistory } from 'react-router-dom';
import {
  CaptureSession,
  faceDetection,
  type CaptureState,
  type FaceBox,
} from 'face-recognition-cordova';
import { f1, idTag, score } from '../format';
import * as gallery from '../data/gallery';
import { getSettings, isLive, poseOk, useSettings } from '../data/settings';
import { isReady, serial, stateMessage, useEngineState } from '../engine';
import type { CallReport } from '../data/report';
import { ensureCameraPermission } from '../cameraPermission';
import { Card, colors, Pill, Row, Section, toSrc } from '../ui/components';
import StatusCard from '../ui/StatusCard';
import StatusDialog from '../ui/StatusDialog';
import { useKeyboardOpen } from '../ui/useKeyboardOpen';

/**
 * Enroll with camera: the capture guide, then a review of the captured still.
 *
 * The review lists each check with its value and the Settings limit; name, note, Retake and
 * Enroll appear right away. Enroll is blocked while a required check fails: one face,
 * liveness (when on in Settings), and head pose. Low quality only warns.
 * Android `shell/AddPersonActivity.kt`.
 */
export default function AddPersonPage() {
  const history = useHistory();
  // Subscribed so a threshold changed on Settings re-runs the checks shown here.
  useSettings();
  const keyboardOpen = useKeyboardOpen();
  const engine = useEngineState();

  const sessionRef = useRef<CaptureSession | null>(null);
  const boxesRef = useRef<FaceBox[]>([]);

  const [status, setStatus] = useState<CaptureState>('NO_FACE');
  const [uri, setUri] = useState<string | null>(null);
  const [face, setFace] = useState<FaceBox | null>(null);
  const [faceCount, setFaceCount] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [failedReport, setFailedReport] = useState<CallReport | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [done, setDone] = useState<{
    title: string;
    reason: string | null;
    report: CallReport;
  } | null>(null);

  // ---- the capture guide ----

  useEffect(() => {
    if (uri != null || !isReady()) return;
    let cancelled = false;
    setCameraError(null);
    const s = getSettings();
    const session = new CaptureSession({
      settings: {
        camera_lens: 'front',
        match_threshold: s.threshold,
        liveness_threshold: s.livenessThreshold,
        liveness_level: 0,
        yaw_threshold: s.yaw,
        roll_threshold: s.roll,
        pitch_threshold: s.pitch,
        // No eye gate during the hold: the review below checks the still, which is enough.
        eyeclose_threshold: 1,
      },
      onState: (state, _warning, boxes) => {
        if (cancelled) return;
        boxesRef.current = boxes;
        setStatus(state);
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
  }, [uri, engine]);

  const capture = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) {
      setCameraError('Camera is not ready yet. Wait a moment and try again.');
      return;
    }
    const result = await session.captureNow(boxesRef.current);
    if (!result) {
      setCameraError('Could not capture a frame. Hold still and try again.');
      return;
    }
    setCameraError(null);
    setUri(result.uri);
    setAnalyzing(true);

    // Re-detect with every estimator on, so the review shows real values rather than
    // whatever the capture gate happened to need.
    const faces = await serial(() =>
      faceDetection(result.uri, { allAttributes: true })
    );
    const only = faces.length === 1 ? (faces[0] ?? null) : null;
    setFaceCount(faces.length);
    setFace(only);
    setAnalyzing(false);

    // Nothing to report, and the tester asked not to be stopped: enroll straight away.
    // `blocked` is worked out during render, so the checks are repeated here on the faces
    // themselves rather than read from state that has not updated yet.
    if (getSettings().skipReview && blockingReason(only, faces.length) == null) {
      await enroll(result.uri);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retake = () => {
    setUri(null);
    setFace(null);
    setFaceCount(0);
    setError(null);
    setFailedReport(null);
  };

  // ---- the checks ----

  const blocked =
    uri != null && !analyzing ? blockingReason(face, faceCount) : null;
  const warning =
    blocked == null &&
    face != null &&
    typeof face.face_quality === 'number' &&
    Number.isFinite(face.face_quality) &&
    face.face_quality < 0.5
      ? 'The face quality is low. The template will be weaker than usual.'
      : null;
  // blank one is saved as Person N, so testing is capture then Enroll with no typing.
  const canEnroll = !saving && !analyzing && uri != null && blocked == null;

  const enroll = async (withUri?: string) => {
    const photo = withUri ?? uri;
    if (photo == null) return;
    setSaving(true);
    setError(null);
    setFailedReport(null);
    const outcome = await gallery.enroll(name, note, photo);
    setSaving(false);
    if (outcome.kind === 'enrolled') {
      // The review closes first, so the status modal replaces it rather than stacking.
      setUri(null);
      setDone({
        title: `Enrolled ${outcome.record.name} as ${idTag(outcome.record.id)}`,
        // Every person over the threshold is named, not just the closest.
        reason: outcome.duplicates.length
          ? 'This face also matches ' +
            outcome.duplicates
              .map((c) => `${c.name} (${idTag(c.id)}) at ${score(c.similarity)}`)
              .join(', ') +
            '. Enroll again only if it is the same person.'
          : null,
        report: outcome.report,
      });
    } else {
      setError(outcome.reason);
      setFailedReport(outcome.report);
    }
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/tabs/people" />
          </IonButtons>
          <IonTitle>Enroll with camera</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent
        fullscreen
        style={{ '--background': 'transparent' } as React.CSSProperties}
      >
        <CaptureGuide
          status={status}
          ready={isReady() && cameraError == null}
          message={cameraError ?? (isReady() ? null : stateMessage(engine))}
          onCapture={() => void capture()}
        />
      </IonContent>

      {/* The review and the enrollment status that follows are the same modal, so the flow
          does not change shape between two consecutive steps. Dismissing is a retake: the
          capture is not yet enrolled. */}
      <IonModal isOpen={uri != null} onDidDismiss={retake}>
        <IonContent className="ion-padding">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, fontSize: 20, fontWeight: 700 }}>
              Review the capture
            </div>
            <Pill
              color={
                analyzing
                  ? colors.statusInfo
                  : blocked == null
                    ? colors.statusMatch
                    : colors.danger
              }
            >
              {analyzing
                ? 'Checking…'
                : blocked == null
                  ? 'Ready to enroll'
                  : 'Retake needed'}
            </Pill>
          </div>

          <img
            src={uri ? toSrc(uri) : ''}
            alt="Captured face"
            style={{
              width: '100%',
              // While typing the still gives up most of its height, so the fields and the
              // two buttons stay reachable on a short screen.
              height: keyboardOpen ? 96 : 220,
              objectFit: 'cover',
              borderRadius: 16,
              marginTop: 12,
              background: 'var(--ion-color-step-100, #efefef)',
              transition: 'height 150ms ease',
            }}
          />

          <div style={{ marginTop: 16 }}>
            {analyzing ? (
              <Card>
                <div style={{ opacity: 0.7 }}>Checking the capture…</div>
              </Card>
            ) : (
              <Section title="Capture checks">
                <Row
                  label="Faces"
                  value={String(faceCount)}
                  badge={faceCount === 1 ? ['Pass', 'pass'] : ['Fail', 'fail']}
                />
                {face && <FaceRows face={face} />}
              </Section>
            )}
          </div>

          {blocked && (
            <div style={{ fontSize: 13, color: colors.danger, whiteSpace: 'pre-wrap' }}>
              {blocked}
            </div>
          )}
          {warning && (
            <div style={{ fontSize: 13, color: colors.statusNoMatch }}>{warning}</div>
          )}

          <div style={{ marginTop: 12 }}>
            <IonInput
              label="Name (optional)"
              labelPlacement="stacked"
              fill="outline"
              helperText="Left blank, this face is saved as Person N, matching its ID."
              value={name}
              onIonInput={(e) => setName(String(e.detail.value ?? ''))}
            />
            <div style={{ height: 12 }} />
            <IonInput
              label="Note (optional)"
              labelPlacement="stacked"
              fill="outline"
              value={note}
              onIonInput={(e) => setNote(String(e.detail.value ?? ''))}
            />
          </div>

          {error && (
            <div style={{ color: colors.danger, marginTop: 12 }}>{error}</div>
          )}
          {failedReport && (
            <div style={{ marginTop: 12 }}>
              <StatusCard report={failedReport} title="Enrollment status" />
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, margin: '20px 0 8px' }}>
            <IonButton
              expand="block"
              fill="outline"
              style={{ flex: 1 }}
              disabled={saving}
              onClick={retake}
            >
              Retake
            </IonButton>
            <IonButton
              expand="block"
              style={{ flex: 1 }}
              disabled={!canEnroll}
              onClick={() => void enroll()}
            >
              {saving ? 'Saving…' : 'Enroll'}
            </IonButton>
          </div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            The name is what Identify shows when this face matches.
          </div>
        </IonContent>
      </IonModal>

      <StatusDialog
        open={done != null}
        title={done?.title ?? ''}
        reason={done?.reason}
        report={done?.report ?? null}
        onClose={() => {
          setDone(null);
          history.goBack();
        }}
      />
    </IonPage>
  );
}

function FaceRows({ face }: { face: FaceBox }) {
  const settings = useSettings();
  const rows: JSX.Element[] = [];

  // Liveness: the Settings threshold decides; when Liveness is off it is shown, not enforced.
  if ((face.livenessLabel ?? '').trim() !== '') {
    const live = isLive(settings, face.liveness);
    const value =
      `${live ? 'Live' : 'Spoof'} · ${score(face.liveness ?? NaN)}` +
      `  (≥ ${score(settings.livenessThreshold)})`;
    rows.push(
      settings.liveness ? (
        <Row
          key="liveness"
          label="Liveness"
          value={value}
          badge={live ? ['Pass', 'pass'] : ['Fail', 'fail']}
          score={face.liveness}
        />
      ) : (
        <Row
          key="liveness"
          label="Liveness"
          value={`${value} · not enforced`}
          score={face.liveness}
        />
      )
    );
  }

  // Quality warns only.
  const q = face.face_quality;
  if (typeof q === 'number' && Number.isFinite(q)) {
    rows.push(
      <Row
        key="quality"
        label="Face quality"
        value={score(q)}
        badge={q < 0.5 ? ['Low', 'fail'] : q < 0.75 ? ['Medium', 'warn'] : ['High', 'pass']}
        score={q}
      />
    );
  }

  // Head pose against the Settings limits.
  const ok = poseOk(settings, face.yaw ?? 0, face.roll ?? 0, face.pitch ?? 0);
  const widest = Math.max(settings.yaw, settings.roll, settings.pitch);
  rows.push(
    <Row
      key="pose"
      label="Head pose"
      value={
        `yaw ${f1(face.yaw ?? 0)}° · roll ${f1(face.roll ?? 0)}° · ` +
        `pitch ${f1(face.pitch ?? 0)}°  (±${f1(widest)}°)`
      }
      badge={ok ? ['Pass', 'pass'] : ['Over', 'fail']}
    />
  );

  return <>{rows}</>;
}

/** The oval guide over the native preview, with the coach chip and the shutter. */
function CaptureGuide({
  status,
  ready,
  message,
  onCapture,
}: {
  status: CaptureState;
  ready: boolean;
  message: string | null;
  onCapture: () => void;
}) {
  const good = status === 'CAPTURE_OK';
  const text: Record<CaptureState, string> = {
    NO_FACE: 'Put your face in the oval',
    MULTIPLE_FACES: 'More than one face',
    FIT_IN_CIRCLE: 'Fit your face in the oval',
    MOVE_CLOSER: 'Move closer',
    NO_FRONT: 'Face the camera',
    FACE_OCCLUDED: 'Face is covered',
    EYE_CLOSED: 'Open your eyes',
    SPOOFED_FACE: 'Liveness failed',
    CAPTURE_OK: 'Hold still',
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <svg
        viewBox="0 0 100 160"
        preserveAspectRatio="xMidYMid slice"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          // Otherwise the full-screen oval steals every tap from the shutter.
          pointerEvents: 'none',
        }}
      >
        <ellipse
          cx="50"
          cy="70"
          rx="33"
          ry="42"
          fill="none"
          stroke={good ? colors.statusMatch : 'rgba(255,255,255,0.8)'}
          strokeWidth="1.2"
        />
      </svg>

      {message && (
        <div
          style={{
            margin: '16px',
            padding: 12,
            borderRadius: 12,
            background: 'rgba(0,0,0,0.7)',
            color: '#fff',
            fontSize: 13,
          }}
        >
          {message}
        </div>
      )}

      <div style={{ flex: 1 }} />

      <div
        style={{
          paddingBottom: 28,
          textAlign: 'center',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <Pill color={good ? colors.statusMatch : 'rgba(0,0,0,0.55)'} size={13}>
          {text[status]}
        </Pill>
        <div style={{ marginTop: 16 }}>
          <button
            type="button"
            onClick={onCapture}
            disabled={!ready}
            aria-label="Capture"
            style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              border: '4px solid rgba(255,255,255,0.7)',
              background: ready ? '#fff' : 'rgba(255,255,255,0.4)',
              pointerEvents: 'auto',
            }}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Why this capture cannot be enrolled, or null when it can. The review and the skip-review
 * path share it, so a capture that would be shown as blocked is never silently enrolled.
 */
function blockingReason(face: FaceBox | null, faceCount: number): string | null {
  const s = getSettings();
  const reasons: string[] = [];
  if (faceCount !== 1 || !face) {
    reasons.push(
      'The still must show exactly one face. Retake with one person in frame.'
    );
  } else {
    if (
      s.liveness &&
      (face.livenessLabel ?? '').trim() !== '' &&
      !isLive(s, face.liveness)
    ) {
      reasons.push(
        'The face did not pass the liveness threshold. Use a live face, not a photo or a ' +
          'screen.\nYou can turn Liveness off in Settings to enroll anyway.'
      );
    }
    if (!poseOk(s, face.yaw ?? 0, face.roll ?? 0, face.pitch ?? 0)) {
      reasons.push('The head is turned too far. Retake facing the camera.');
    }
  }
  return reasons.length > 0 ? reasons.join('\n') : null;
}
