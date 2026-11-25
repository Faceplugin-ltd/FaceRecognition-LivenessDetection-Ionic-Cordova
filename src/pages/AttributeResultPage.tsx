import {
  IonBackButton,
  IonButtons,
  IonChip,
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
} from '@ionic/react';
import { useState } from 'react';
import { useHistory } from 'react-router-dom';
import type { FaceBox } from 'face-recognition-cordova';
import { f1, facesCount, idTag, ms, score } from '../format';
import type { FaceAttributes } from '../data/gallery';
import { MAX_ATTRIBUTE_FACES } from '../data/gallery';
import { ResultStore } from '../data/resultStore';
import { isLive, useSettings, type AppSettings } from '../data/settings';
import { totalMs } from '../data/report';
import {
  Card,
  colors,
  MetricsRow,
  MetricTile,
  Pill,
  Row,
  Section,
  toSrc,
  type BadgeKind,
} from '../ui/components';
import PersonSheet from '../ui/PersonSheet';
import StatusCard from '../ui/StatusCard';

const NOT_COMPUTED = 'Not computed';
/** Inner-lip gap / mouth width at or above which the mouth reads as open. */
/** Eyes read as open at or above this score. */
const EYE_OPEN = 0.25;
const MOUTH_OPEN = 0.25;
const MOUTH_SLIGHT = 0.1;

/**
 * Every face in the photo with every value the SDK returns: liveness, quality, pose, eyes,
 * age, gender, landmarks, box, gallery closest match. Each gated value is checked against the
 * limits in Settings. The call status card is at the bottom.
 * Android `shell/AttributeResultActivity.kt`.
 */
export default function AttributeResultPage() {
  const history = useHistory();
  const settings = useSettings();
  const result = ResultStore.attribute;
  const [selected, setSelected] = useState(0);
  const [openId, setOpenId] = useState<number | null>(null);
  const [openScore, setOpenScore] = useState(-1);
  if (!result) {
    history.replace('/tabs/attribute');
    return null;
  }

  const faces = result.faces;
  const n = faces.length;
  const face = n === 0 ? null : (faces[Math.min(selected, n - 1)] ?? null);
  const detectMs = result.report.steps
    .filter((s) => s.name === 'faceDetection')
    .reduce((sum, s) => sum + s.ms, 0);

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/tabs/attribute" />
          </IonButtons>
          <IonTitle>Attribute result</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="ion-padding">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, fontSize: 22, fontWeight: 700 }}>Attributes</div>
          <Pill color={n === 0 ? colors.danger : colors.statusMatch}>
            {n === 0 ? 'No face found' : facesCount(n)}
          </Pill>
        </div>
        <div style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>
          {n === 0
            ? 'Point the camera at a face, or pick a photo that shows one.'
            : n > MAX_ATTRIBUTE_FACES
              ? `Only the largest ${MAX_ATTRIBUTE_FACES} faces are searched against the gallery.`
              : 'Tap a face to see its values.'}
        </div>

        <div style={{ position: 'relative', marginTop: 12 }}>
          <img
            src={toSrc(result.probeUri)}
            alt="Probe"
            style={{
              width: '100%',
              borderRadius: 16,
              display: 'block',
              background: 'var(--ion-color-step-100, #efefef)',
            }}
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <MetricsRow>
            <MetricTile value={String(n)} label="Faces" />
            <MetricTile value={ms(detectMs)} label="Detect ms" />
            <MetricTile value={ms(totalMs(result.report))} label="Total ms" />
          </MetricsRow>
        </div>

        {n > 1 && (
          <div style={{ marginTop: 12, overflowX: 'auto', whiteSpace: 'nowrap' }}>
            {faces.map((f) => (
              <IonChip
                key={f.index}
                outline={f.index !== selected}
                color={f.index === selected ? 'primary' : 'medium'}
                onClick={() => setSelected(f.index)}
              >
                Face {f.index + 1}
              </IonChip>
            ))}
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          {!face ? (
            <Section title="Result">
              <Row label="Status" value="No face found" badge={['Failed', 'fail']} />
            </Section>
          ) : (
            <>
              <Header face={face} settings={settings} />
              <div style={{ height: 12 }} />
              <Sections
                face={face}
                settings={settings}
                threshold={result.threshold}
                gallerySize={result.gallerySize}
                onOpenMatch={(id, sim) => {
                  setOpenId(id);
                  setOpenScore(sim);
                }}
              />
            </>
          )}
        </div>

        <div style={{ paddingBottom: 24 }}>
          <StatusCard report={result.report} />
        </div>

        <PersonSheet
          id={openId}
          similarity={openScore}
          onClose={() => setOpenId(null)}
        />
      </IonContent>
    </IonPage>
  );
}

function genderText(b: FaceBox): string {
  const label = (b.genderLabel ?? '').trim();
  if (label) return label;
  if (typeof b.gender !== 'number') return '';
  return Math.round(b.gender) === 0 ? 'Male' : 'Female';
}

function hasLiveness(b: FaceBox): boolean {
  return (b.livenessLabel ?? '').trim() !== '';
}

function Header({
  face,
  settings,
}: {
  face: FaceAttributes;
  settings: AppSettings;
}) {
  const b = face.box;
  const live = isLive(settings, b.liveness);
  const subtitle = [
    typeof b.age === 'number' && b.age > 0 ? `${Math.round(b.age)} years` : '',
    genderText(b),
    (b.emotionLabel ?? '').trim(),
    hasLiveness(b) ? (live ? 'Live' : 'Spoof') : '',
  ]
    .filter(Boolean)
    .join(' · ');

  // Pass/fail of each gated value the engine computed.
  const gates = [
    ...(hasLiveness(b) ? [live] : []),
    Math.abs(b.yaw ?? 0) <= settings.yaw,
    Math.abs(b.roll ?? 0) <= settings.roll,
    Math.abs(b.pitch ?? 0) <= settings.pitch,
  ];
  const failed = gates.filter((ok) => !ok).length;

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>Face {face.index + 1}</div>
          <div style={{ fontSize: 13, opacity: 0.7, marginTop: 2 }}>
            {subtitle || NOT_COMPUTED}
          </div>
        </div>
        <Pill
          size={11}
          color={failed === 0 ? colors.statusMatch : colors.statusNoMatch}
        >
          {failed === 0
            ? 'All checks pass'
            : `${failed} ${failed === 1 ? 'check' : 'checks'} failed`}
        </Pill>
      </div>
    </Card>
  );
}

function Sections({
  face,
  settings,
  threshold,
  gallerySize,
  onOpenMatch,
}: {
  face: FaceAttributes;
  settings: AppSettings;
  threshold: number;
  gallerySize: number;
  onOpenMatch: (id: number, similarity: number) => void;
}) {
  const b = face.box;
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;

  const q = num(b.face_quality);
  const liveness = num(b.liveness);
  const mouth = num(b.mouth_opened);
  const closest = face.closest;

  const poseRow = (label: string, value: number | null, limit: number) =>
    value == null ? (
      <Row label={label} value={NOT_COMPUTED} />
    ) : (
      <Row
        label={label}
        value={`${f1(value)}°  (±${f1(limit)}°)`}
        badge={Math.abs(value) <= limit ? ['Pass', 'pass'] : ['Over', 'fail']}
      />
    );

  /** One eye, with its open score read against EYE_OPEN. */
  const eyeRow = (label: string, closed: number | null, engineLabel?: string) => {
    if (closed == null) {
      const text = (engineLabel ?? '').trim();
      return <Row key={label} label={label} value={text || NOT_COMPUTED} />;
    }
    const open = Math.max(0, Math.min(1, 1 - closed));
    const isOpen = open >= EYE_OPEN;
    const word = isOpen ? 'Open' : 'Closed';
    return (
      <Row
        key={label}
        label={label}
        value={`${word} · ${score(open)}  (≥ ${score(EYE_OPEN)})`}
        badge={[word, isOpen ? 'pass' : 'warn']}
        score={open}
      />
    );
  };

  const extras = Object.entries(b.attributes ?? {}).filter(
    ([k, v]) =>
      !['Age', 'Gender', 'Emotion', 'Liveness2D', 'FaceQuality', 'EyesLeft', 'EyesRight'].includes(k) &&
      v.trim() !== '' &&
      v.length < 400
  );

  const landmarkText = () => {
    const pts = b.landmarks ?? [];
    const count = b.landmarkCount ?? 0;
    const lines: string[] = [];
    for (let i = 0; i < count && i * 2 + 1 < pts.length; i++) {
      lines.push(`${i + 1}:  ${f1(pts[i * 2]!)}, ${f1(pts[i * 2 + 1]!)}`);
    }
    return lines.join('\n');
  };

  return (
    <>
      <Section title="Authenticity">
        {hasLiveness(b) && liveness != null ? (
          <Row
            label="Liveness"
            value={
              `${isLive(settings, liveness) ? 'Live' : 'Spoof'} · ${score(liveness)}` +
              `  (≥ ${score(settings.livenessThreshold)})`
            }
            badge={isLive(settings, liveness) ? ['Pass', 'pass'] : ['Fail', 'fail']}
            score={liveness}
          />
        ) : (
          <Row label="Liveness" value={NOT_COMPUTED} />
        )}
      </Section>

      <Section title="Person">
        <Row
          label="Age"
          value={
            typeof b.age === 'number' && b.age > 0
              ? String(Math.round(b.age))
              : NOT_COMPUTED
          }
        />
        <Row label="Gender" value={genderText(b) || NOT_COMPUTED} />
      </Section>

      <Section title="Quality">
        {q == null ? (
          <Row label="Face quality" value={NOT_COMPUTED} />
        ) : (
          <Row
            label="Face quality"
            value={score(q)}
            badge={
              (q < 0.5
                ? ['Low', 'fail']
                : q < 0.75
                  ? ['Medium', 'warn']
                  : ['High', 'pass']) as [string, BadgeKind]
            }
            score={q}
          />
        )}
        {num(b.face_luminance) != null && (
          <Row
            label="Luminance"
            value={score(b.face_luminance!)}
            score={b.face_luminance}
          />
        )}
      </Section>

      <Section title="Head pose">
        {poseRow('Yaw', num(b.yaw), settings.yaw)}
        {poseRow('Roll', num(b.roll), settings.roll)}
        {poseRow('Pitch', num(b.pitch), settings.pitch)}
      </Section>

      {/* Eye-open scores read against EYE_OPEN. Not a Settings threshold: the engine's own
          label uses a fixed 0.5, which calls a half-open eye closed. */}
      <Section title="Eyes">
        {eyeRow('Left eye', num(b.left_eye_closed), b.eyesLeftLabel)}
        {eyeRow('Right eye', num(b.right_eye_closed), b.eyesRightLabel)}
      </Section>

      <Section title="Expression">
        <Row
          label="Emotion"
          value={(b.emotionLabel ?? '').trim() || NOT_COMPUTED}
          badge={
            (b.emotionLabel ?? '').trim()
              ? [(b.emotionLabel ?? '').trim(), 'info']
              : undefined
          }
        />
        {mouth == null ? (
          <Row label="Mouth" value={NOT_COMPUTED} />
        ) : (
          <Row
            label="Mouth"
            value={`${mouthWord(mouth)} · ${score(mouth)}`}
            badge={[mouthWord(mouth), mouthBadge(mouth)]}
            score={mouth}
          />
        )}
      </Section>

      <Section title="Gallery">
        {gallerySize === 0 ? (
          <Row label="Closest match" value="No faces in the gallery" />
        ) : face.templateBytes === 0 ? (
          <Row label="Closest match" value="No template" />
        ) : !closest ? (
          <Row label="Closest match" value="No faces in the gallery" />
        ) : (
          <Row
            label="Closest match"
            value={
              `${closest.name} · ${idTag(closest.id)}\n${score(closest.similarity)}` +
              `  (≥ ${score(threshold)})`
            }
            badge={
              closest.similarity >= threshold
                ? ['Match', 'pass']
                : ['No match', 'warn']
            }
            score={closest.similarity}
            preWrap
            onClick={() => onOpenMatch(closest.id, closest.similarity)}
          />
        )}
        <Row
          label="Template"
          value={face.templateBytes > 0 ? `${face.templateBytes} bytes` : 'No template'}
        />
      </Section>

      <Section title="Geometry">
        <Row
          label="Box"
          value={`${Math.round(b.x1)}, ${Math.round(b.y1)} → ${Math.round(b.x2)}, ${Math.round(b.y2)}`}
        />
        <Row
          label="Size"
          value={`${Math.round(b.x2 - b.x1)} × ${Math.round(b.y2 - b.y1)} px`}
        />
        <Row
          label="Landmarks"
          value={
            (b.landmarkCount ?? 0) > 0 ? `${b.landmarkCount} points` : NOT_COMPUTED
          }
        />
        {(b.landmarkCount ?? 0) > 0 && (
          <Row label="Positions" value={landmarkText()} preWrap />
        )}
      </Section>

      {extras.length > 0 && (
        <Section title="More from the engine">
          {extras.map(([k, v]) => (
            <Row key={k} label={k} value={v} />
          ))}
        </Section>
      )}
    </>
  );
}

function mouthWord(m: number): string {
  return m >= MOUTH_OPEN ? 'Open' : m >= MOUTH_SLIGHT ? 'Slightly open' : 'Closed';
}

function mouthBadge(m: number): BadgeKind {
  return m >= MOUTH_OPEN ? 'warn' : m >= MOUTH_SLIGHT ? 'info' : 'pass';
}
