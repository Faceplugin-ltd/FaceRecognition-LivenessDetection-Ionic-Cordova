import { IonButton, IonContent, IonPage, IonSpinner } from '@ionic/react';
import { useEffect } from 'react';
import { useHistory } from 'react-router-dom';
import logo from '../assets/fp_logo.png';
import {
  machineCode,
  restartEngine,
  startEngine,
  stateMessage,
  useEngineState,
} from '../engine';
import { colors } from '../ui/components';

/**
 * Starts the engine, then shows the tabs. A failure stays here with the reason and a Retry,
 * because nothing in the app works without the engine. Android `shell/SplashActivity.kt`.
 */
export default function SplashPage() {
  const history = useHistory();
  const state = useEngineState();

  useEffect(() => {
    startEngine();
  }, []);

  useEffect(() => {
    if (state === 'READY') history.replace('/tabs/identify');
  }, [state, history]);

  const loading = state === 'LOADING';

  return (
    <IonPage>
      <IonContent className="ion-padding">
        <div
          style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            gap: 20,
          }}
        >
          <img src={logo} alt="FacePlugin" style={{ height: 56 }} />
          {loading ? (
            <IonSpinner />
          ) : (
            <div style={{ fontSize: 40, color: colors.danger }}>!</div>
          )}
          <div style={{ fontSize: 15, opacity: 0.7, maxWidth: 420 }}>
            {stateMessage(state)}
          </div>
          {!loading && (
            <>
              <IonButton onClick={() => restartEngine()}>Retry</IonButton>
              <div style={{ fontSize: 11, opacity: 0.6, wordBreak: 'break-all' }}>
                Machine code: {machineCode()}
              </div>
            </>
          )}
        </div>
      </IonContent>
    </IonPage>
  );
}
