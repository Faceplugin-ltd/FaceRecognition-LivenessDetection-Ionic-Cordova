import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
} from '@ionic/react';
import { useMemo, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { idTag, matchesCount, ms, score } from '../format';
import * as gallery from '../data/gallery';
import type { Candidate, ProbeFace } from '../data/gallery';
import { allMatches, primaryFace, ResultStore } from '../data/resultStore';
import {
  Card,
  colors,
  FaceImage,
  MetricsRow,
  MetricTile,
  Pill,
} from '../ui/components';
import MatchRow from '../ui/MatchRow';
import PersonSheet from '../ui/PersonSheet';
import StatusCard from '../ui/StatusCard';

const MAX_ROWS = 3;

/**
 * Pushed from Identify: Match / No match, Probe vs Rank 1, metrics, and the matches at or
 * above the threshold. Android `shell/ResultActivity.kt`.
 */
export default function ResultPage() {
  const history = useHistory();
  const result = ResultStore.last;
  const [openId, setOpenId] = useState<number | null>(null);
  const [openScore, setOpenScore] = useState(-1);

  // A person deleted while this screen is open drops out of the result.
  const records = useMemo(() => {
    if (!result) return new Map<number, gallery.FaceRecord | null>();
    const ids = new Set<number>();
    for (const f of result.faces) if (f.ranked[0]) ids.add(f.ranked[0].id);
    for (const m of allMatches(result)) ids.add(m.id);
    return new Map([...ids].map((id) => [id, gallery.get(id)]));
  }, [result]);

  if (!result) {
    history.replace('/tabs/identify');
    return null;
  }

  const exists = (id: number) => records.get(id) != null;
  const open = (c: Candidate) => {
    setOpenId(c.id);
    setOpenScore(c.similarity);
  };

  const primary = result.faces.length > 0 ? primaryFace(result) : null;
  const rawBest = primary?.ranked[0] ?? null;
  const best = rawBest && exists(rawBest.id) ? rawBest : null;
  const matched = best != null && best.similarity >= result.threshold;
  const matches = allMatches(result).filter((c) => exists(c.id));
  const record = best ? records.get(best.id) : null;

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/tabs/identify" />
          </IonButtons>
          <IonTitle>Identify result</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="ion-padding">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, fontSize: 22, fontWeight: 700 }}>Result</div>
          <Pill color={matched ? colors.statusMatch : colors.statusNoMatch}>
            {matched ? 'Match' : 'No match'}
          </Pill>
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
          <div style={{ flex: 1 }}>
            <FaceImage path={result.probeUri} alt="Probe" />
            <div style={{ fontSize: 12, opacity: 0.7, textAlign: 'center', marginTop: 4 }}>
              Probe
            </div>
          </div>
          <div
            style={{ flex: 1, cursor: best ? 'pointer' : undefined }}
            onClick={() => best && open(best)}
          >
            {/* Rank 1 shows the stored original photo; falls back to the crop. */}
            <FaceImage
              path={record?.originalPath || record?.cropPath}
              alt={matched ? 'Rank 1' : 'Closest'}
            />
            <div style={{ fontSize: 12, opacity: 0.7, textAlign: 'center', marginTop: 4 }}>
              {matched ? 'Rank 1' : 'Closest'}
            </div>
          </div>
        </div>

        <div
          style={{ marginTop: 16, cursor: best ? 'pointer' : undefined }}
          onClick={() => best && open(best)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>
              {best ? (record?.name ?? best.name) : 'No faces in the gallery'}
            </div>
            {best && <Pill>{idTag(best.id)}</Pill>}
          </div>
          <div style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>
            {matched
              ? `Similarity ${score(best.similarity)} is at or above the threshold ${score(result.threshold)}.`
              : `No face reaches the threshold ${score(result.threshold)}.`}
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <MetricsRow>
            <MetricTile value={ms(result.extractMs)} label="Extract ms" />
            <MetricTile value={ms(result.searchMs)} label="Search ms" />
            <MetricTile value={String(result.gallerySize)} label="Gallery size" />
          </MetricsRow>
        </div>

        {result.faces.length > 1 && (
          <div style={{ marginTop: 16 }}>
            <Card>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
                Faces in the probe
              </div>
              {result.faces.map((f) => (
                <FaceLine
                  key={f.index}
                  face={f}
                  threshold={result.threshold}
                  records={records}
                  onOpen={open}
                />
              ))}
            </Card>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 16,
          }}
        >
          <div style={{ flex: 1, fontSize: 17, fontWeight: 700 }}>
            {matchesCount(matches.length)}
          </div>
          {matches.length > MAX_ROWS && (
            <IonButton
              size="small"
              fill="clear"
              onClick={() => history.push('/matches')}
            >
              {matches.length - MAX_ROWS} more ›
            </IonButton>
          )}
        </div>

        {matches.length === 0 ? (
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            No face reaches the threshold {score(result.threshold)}.
          </div>
        ) : (
          matches.slice(0, MAX_ROWS).map((c, i) => (
            <MatchRow
              key={c.id}
              rank={i + 1}
              candidate={c}
              record={records.get(c.id)}
              onClick={() => open(c)}
            />
          ))
        )}

        <div style={{ marginTop: 16, paddingBottom: 24 }}>
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

function FaceLine({
  face,
  threshold,
  records,
  onOpen,
}: {
  face: ProbeFace;
  threshold: number;
  records: Map<number, gallery.FaceRecord | null>;
  onOpen: (c: Candidate) => void;
}) {
  const raw = face.ranked[0] ?? null;
  const best = raw && records.get(raw.id) != null ? raw : null;
  let text: string;
  if (!best) {
    text = `Face ${face.index + 1} · no gallery faces`;
  } else if (best.similarity >= threshold) {
    text =
      `Face ${face.index + 1} · ${records.get(best.id)?.name ?? best.name} · ` +
      `${idTag(best.id)} · ${score(best.similarity)}`;
  } else {
    text = `Face ${face.index + 1} · No match · closest ${score(best.similarity)}`;
  }
  return (
    <div
      onClick={() => best && onOpen(best)}
      style={{ fontSize: 14, padding: '6px 0', cursor: best ? 'pointer' : undefined }}
    >
      {text}
    </div>
  );
}
