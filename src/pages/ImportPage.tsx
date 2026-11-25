import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonPage,
  IonProgressBar,
  IonTitle,
  IonToolbar,
} from '@ionic/react';
import { useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { idTag, ms, score, stripExtension } from '../format';
import * as gallery from '../data/gallery';
import type { EnrollOutcome } from '../data/gallery';
import type { CallReport } from '../data/report';
import { totalMs } from '../data/report';
import { ResultStore } from '../data/resultStore';
import { colors, MetricsRow, MetricTile, Pill } from '../ui/components';
import StatusCard from '../ui/StatusCard';

type ImportRow = {
  fileName: string;
  subtitle: string;
  enrolled: boolean;
  report: CallReport | null;
};

/**
 * Import photos: each photo becomes one person named after the file.
 * Photos with no face, or more than one, are skipped with the reason.
 */
export default function ImportPage() {
  const history = useHistory();
  const location = useLocation<{ paths?: string[] }>();
  // Prefer the store: Ionic often drops history state when the page mounts.
  const paths =
    (location.state?.paths?.length ? location.state.paths : null) ??
    ResultStore.importPaths ??
    [];

  const [rows, setRows] = useState<ImportRow[]>([]);
  const [enrolled, setEnrolled] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [spentMs, setSpentMs] = useState(0);
  const [index, setIndex] = useState(0);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  const total = paths.length;
  const done = enrolled + skipped;
  const average = done === 0 ? '–' : ms(spentMs / done);

  const start = async () => {
    setStarted(true);
    for (let i = 0; i < paths.length; i++) {
      setIndex(i);
      const path = paths[i]!;
      const fileName =
        path.startsWith('data:')
          ? `photo_${i + 1}.jpg`
          : path.split('/').pop() ?? `photo_${i + 1}.jpg`;
      const outcome = await gallery.enroll(
        stripExtension(fileName),
        '',
        path
      );
      addResult(fileName, outcome);
    }
    setIndex(paths.length);
    setFinished(true);
    ResultStore.importPaths = [];
  };

  const addResult = (fileName: string, outcome: EnrollOutcome) => {
    if (outcome.kind === 'enrolled') {
      const { record, report, duplicates } = outcome;
      let subtitle = `${record.name} · ${idTag(record.id)}`;
      if (duplicates.length) {
        // Bulk enroll names every match over the threshold, as Enroll with camera does.
        subtitle +=
          ' · Duplicate check: ' +
          duplicates
            .map((c) => `${c.name} ${idTag(c.id)} ${score(c.similarity)}`)
            .join(', ');
      }
      setEnrolled((n) => n + 1);
      setSpentMs((t) => t + totalMs(report));
      setRows((r) => [
        { fileName, subtitle, enrolled: true, report },
        ...r,
      ]);
    } else {
      setSkipped((n) => n + 1);
      setSpentMs((t) => t + (outcome.report ? totalMs(outcome.report) : 0));
      setRows((r) => [
        {
          fileName,
          subtitle: outcome.reason,
          enrolled: false,
          report: outcome.report,
        },
        ...r,
      ]);
    }
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/tabs/people" />
          </IonButtons>
          <IonTitle>Bulk enroll from photos</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="ion-padding">
        <div style={{ fontSize: 22, fontWeight: 700 }}>
          {total === 0
            ? 'No images selected'
            : finished
              ? `Imported ${total} ${total === 1 ? 'photo' : 'photos'}`
              : `Import ${total} ${total === 1 ? 'photo' : 'photos'}?`}
        </div>

        {!started && total > 0 && (
          <div style={{ fontSize: 15, opacity: 0.7, marginTop: 8 }}>
            Each photo becomes one person, named after the file. Photos with no face or more
            than one face are skipped.
          </div>
        )}

        {started && (
          <>
            <div style={{ marginTop: 12 }}>
              <IonProgressBar value={total === 0 ? 0 : index / total} />
            </div>
            <div style={{ fontSize: 15, marginTop: 8 }}>
              {finished
                ? `${total} of ${total} · Done`
                : `${index + 1} of ${total} · ${(paths[index] ?? '').split('/').pop()}`}
            </div>
            <div style={{ marginTop: 12 }}>
              <MetricsRow>
                <MetricTile value={String(enrolled)} label="Enrolled" />
                <MetricTile value={String(skipped)} label="Skipped" />
                <MetricTile value={average} label="Avg ms / photo" />
              </MetricsRow>
            </div>
          </>
        )}

        {rows.length > 0 && (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 20,
              }}
            >
              <div style={{ fontSize: 17, fontWeight: 700 }}>Results</div>
              <Pill>{rows.length}</Pill>
            </div>

            {rows.map((row, i) => (
              <div key={`${row.fileName}-${i}`}>
                <div
                  onClick={() => setExpanded(expanded === i ? null : i)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 0',
                    cursor: row.report ? 'pointer' : undefined,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 15,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {row.fileName}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
                      {row.subtitle}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <Pill
                      size={11}
                      color={row.enrolled ? colors.statusMatch : colors.danger}
                    >
                      {row.enrolled ? 'Enrolled' : 'Skipped'}
                    </Pill>
                    {row.report && (
                      <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
                        {ms(totalMs(row.report))} ms
                      </div>
                    )}
                  </div>
                </div>
                {expanded === i && row.report && (
                  <div style={{ marginBottom: 12 }}>
                    <StatusCard report={row.report} title="Enrollment status" />
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        <IonButton
          expand="block"
          style={{ marginTop: 20 }}
          disabled={started && !finished}
          onClick={() =>
            total === 0 || finished ? history.goBack() : void start()
          }
        >
          {total === 0 || finished ? 'Done' : 'Start import'}
        </IonButton>
      </IonContent>
    </IonPage>
  );
}
