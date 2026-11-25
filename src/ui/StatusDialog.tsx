import { IonButton, IonContent, IonModal } from '@ionic/react';
import type { CallReport } from '../data/report';
import StatusCard from './StatusCard';

/**
 * The dialog for an action that stopped: the reason on top, then the status card showing
 * which call stopped it. Android `StatusCard.showDialog`.
 */
export default function StatusDialog({
  open,
  title,
  reason,
  report,
  onClose,
}: {
  open: boolean;
  title: string;
  reason?: string | null;
  report: CallReport | null;
  onClose: () => void;
}) {
  return (
    <IonModal
      isOpen={open}
      onDidDismiss={onClose}
      // Full screen rather than a breakpoint sheet: a sheet has to be told how tall it is,
      // which goes wrong as soon as the keyboard or a different screen size changes the
      // answer. A plain modal lets the platform size it and scroll its own content.
    >
      <IonContent className="ion-padding">
        <div style={{ fontSize: 20, fontWeight: 700 }}>{title}</div>
        {reason && reason.trim() !== '' && (
          <div style={{ fontSize: 15, marginTop: 12 }}>{reason}</div>
        )}
        {report && (
          <div style={{ marginTop: 12 }}>
            <StatusCard report={report} />
          </div>
        )}
        <IonButton expand="block" style={{ margin: '20px 0' }} onClick={onClose}>
          Done
        </IonButton>
      </IonContent>
    </IonModal>
  );
}
