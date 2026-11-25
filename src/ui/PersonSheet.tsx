import {
  IonButton,
  IonContent,
  IonInput,
  IonModal,
  useIonAlert,
} from '@ionic/react';
import { useEffect, useState } from 'react';
import { enrolledDateTime, idTag, score } from '../format';
import * as gallery from '../data/gallery';
import type { FaceRecord } from '../data/gallery';
import { reportFromJson } from '../data/report';
import { Card, colors, FaceImage, Pill, Row } from './components';
import StatusCard from './StatusCard';

/**
 * Face detail sheet, opened from a result, the matches list or the People list.
 * [similarity] below zero hides the Similarity row (the People list has no score).
 */
export default function PersonSheet({
  id,
  similarity = -1,
  onClose,
}: {
  id: number | null;
  similarity?: number;
  onClose: () => void;
}) {
  const [record, setRecord] = useState<FaceRecord | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [presentAlert] = useIonAlert();

  useEffect(() => {
    if (id == null) {
      setRecord(null);
      return;
    }
    const r = gallery.get(id);
    setRecord(r);
    setName(r?.name ?? '');
    setNote(r?.note ?? '');
    setEditing(false);
  }, [id]);

  const save = () => {
    if (!record) return;
    if (!name.trim()) {
      void presentAlert({ message: 'Enter a name.', buttons: ['OK'] });
      return;
    }
    gallery.update(record.id, name, note);
    setRecord(gallery.get(record.id));
    setEditing(false);
  };

  const confirmDelete = () => {
    if (!record) return;
    void presentAlert({
      header: 'Delete this face?',
      message: `${record.name} and the stored photos are removed from this device.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          role: 'destructive',
          handler: () => {
            void gallery.remove(record.id).then(onClose);
          },
        },
      ],
    });
  };

  const report = record ? reportFromJson(record.enrollReport) : null;

  return (
    <IonModal isOpen={id != null} onDidDismiss={onClose} initialBreakpoint={0.9} breakpoints={[0, 0.9, 1]}>
      <IonContent className="ion-padding">
        {!record ? (
          <div style={{ padding: 24, textAlign: 'center', opacity: 0.7 }}>
            That face is no longer in the gallery.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, fontSize: 20, fontWeight: 700 }}>
                {record.name}
              </div>
              <Pill>{idTag(record.id)}</Pill>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
              <div style={{ flex: 1 }}>
                <FaceImage path={record.cropPath} alt="Face crop" />
                <div style={{ fontSize: 11, opacity: 0.7, textAlign: 'center', marginTop: 4 }}>
                  Face crop
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <FaceImage path={record.originalPath} alt="Enrolled photo" />
                <div style={{ fontSize: 11, opacity: 0.7, textAlign: 'center', marginTop: 4 }}>
                  Enrolled photo
                </div>
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              {editing ? (
                <Card>
                  <IonInput
                    label="Name"
                    labelPlacement="stacked"
                    value={name}
                    onIonInput={(e) => setName(String(e.detail.value ?? ''))}
                  />
                  <IonInput
                    label="Note"
                    labelPlacement="stacked"
                    value={note}
                    onIonInput={(e) => setNote(String(e.detail.value ?? ''))}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <IonButton expand="block" fill="outline" style={{ flex: 1 }} onClick={() => setEditing(false)}>
                      Cancel
                    </IonButton>
                    <IonButton expand="block" style={{ flex: 1 }} onClick={save}>
                      Save
                    </IonButton>
                  </div>
                </Card>
              ) : (
                <Card>
                  <Row label="Note" value={record.note || 'No note'} />
                  <Row label="Enrolled" value={enrolledDateTime(record.createdAt)} />
                  {similarity >= 0 && (
                    <Row
                      label="Similarity"
                      value={score(similarity)}
                      score={similarity}
                    />
                  )}
                </Card>
              )}
            </div>

            <div style={{ marginTop: 12 }}>
              {report ? (
                <StatusCard report={report} title="Enrollment status" />
              ) : (
                <Card>
                  <div style={{ fontSize: 13, opacity: 0.7 }}>
                    This face was enrolled before call reports were stored, so there is no
                    status to show.
                  </div>
                </Card>
              )}
            </div>

            {!editing && (
              <div style={{ display: 'flex', gap: 12, margin: '16px 0 24px' }}>
                <IonButton expand="block" fill="outline" style={{ flex: 1 }} onClick={() => setEditing(true)}>
                  Edit
                </IonButton>
                <IonButton
                  expand="block"
                  fill="outline"
                  style={{ flex: 1, '--color': colors.danger } as React.CSSProperties}
                  onClick={confirmDelete}
                >
                  Delete
                </IonButton>
              </div>
            )}
          </>
        )}
      </IonContent>
    </IonModal>
  );
}
