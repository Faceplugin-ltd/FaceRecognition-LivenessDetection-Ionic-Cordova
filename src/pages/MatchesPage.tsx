import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
} from '@ionic/react';
import { useMemo, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { matchesCount } from '../format';
import * as gallery from '../data/gallery';
import { allMatches, ResultStore } from '../data/resultStore';
import MatchRow from '../ui/MatchRow';
import PersonSheet from '../ui/PersonSheet';

/** The "N more ›" target: every match at or above the threshold. */
export default function MatchesPage() {
  const history = useHistory();
  const result = ResultStore.last;
  const [openId, setOpenId] = useState<number | null>(null);
  const [openScore, setOpenScore] = useState(-1);

  const rows = useMemo(() => {
    if (!result) return [];
    // A person deleted while this screen is open drops out of the list.
    return allMatches(result)
      .map((c) => ({ candidate: c, record: gallery.get(c.id) }))
      .filter((r) => r.record != null);
  }, [result]);

  if (!result) {
    history.replace('/tabs/identify');
    return null;
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/result" />
          </IonButtons>
          <IonTitle>Matches</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="ion-padding">
        <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 8 }}>
          {matchesCount(rows.length)}
        </div>
        {rows.map((r, i) => (
          <MatchRow
            key={r.candidate.id}
            rank={i + 1}
            candidate={r.candidate}
            record={r.record}
            onClick={() => {
              setOpenId(r.candidate.id);
              setOpenScore(r.candidate.similarity);
            }}
          />
        ))}
        <PersonSheet
          id={openId}
          similarity={openScore}
          onClose={() => setOpenId(null)}
        />
      </IonContent>
    </IonPage>
  );
}
