import {
  IonIcon,
  IonLabel,
  IonPage,
  IonTabBar,
  IonTabButton,
  IonTabs,
  IonRouterOutlet,
} from '@ionic/react';
import {
  eyeOutline,
  peopleOutline,
  scanOutline,
  sparklesOutline,
  optionsOutline,
} from 'ionicons/icons';
import { useEffect, useState } from 'react';
import { Redirect, Route } from 'react-router-dom';
import CameraPage from './CameraPage';
import LivenessPage from './LivenessPage';
import PeoplePage from './PeoplePage';
import SettingsPage from './SettingsPage';
import { S } from '../strings';
import {
  TabProvider,
  tabFromPath,
  useRoutePath,
  type AppTab,
} from '../tabVisible';

/**
 * Bottom tabs: Identity · People · Attribute · Liveness · Settings — the same five as the
 * Android and iOS apps. Android `shell/MainActivity.kt`.
 *
 * Camera pages key off [TabProvider] so a tab change always starts/stops the preview,
 * even when the nested router outlet path lags. Prefer WillChange so the leaving
 * camera tab goes inactive before the transition finishes.
 */
export default function MainTabs() {
  const path = useRoutePath();
  const [tab, setTab] = useState<AppTab>(() => tabFromPath(path));

  useEffect(() => {
    // Ignore pushed routes (/result, /add-person, …) — MainTabs stays mounted
    // underneath and must keep the last selected camera tab.
    if (!path.startsWith('/tabs')) return;
    setTab(tabFromPath(path));
  }, [path]);

  return (
    <IonPage>
      <TabProvider tab={tab}>
        <IonTabs
          onIonTabsWillChange={(e) => {
            const next = (e.detail.tab || 'identify') as AppTab;
            setTab(next);
          }}
        >
          <IonRouterOutlet id="tabs" animated={false}>
            <Route exact path="/tabs/identify">
              <CameraPage mode="identify" />
            </Route>
            <Route exact path="/tabs/people" component={PeoplePage} />
            <Route exact path="/tabs/attribute">
              <CameraPage mode="attribute" />
            </Route>
            <Route exact path="/tabs/liveness">
              <LivenessPage />
            </Route>
            <Route exact path="/tabs/settings" component={SettingsPage} />
            <Route exact path="/tabs">
              <Redirect to="/tabs/identify" />
            </Route>
          </IonRouterOutlet>

          <IonTabBar slot="bottom">
            <IonTabButton tab="identify" href="/tabs/identify">
              <IonIcon icon={scanOutline} />
              <IonLabel>{S.tab_identify}</IonLabel>
            </IonTabButton>
            <IonTabButton tab="people" href="/tabs/people">
              <IonIcon icon={peopleOutline} />
              <IonLabel>{S.tab_people}</IonLabel>
            </IonTabButton>
            <IonTabButton tab="attribute" href="/tabs/attribute">
              <IonIcon icon={sparklesOutline} />
              <IonLabel>{S.tab_attribute}</IonLabel>
            </IonTabButton>
            <IonTabButton tab="liveness" href="/tabs/liveness">
              <IonIcon icon={eyeOutline} />
              <IonLabel>{S.tab_liveness}</IonLabel>
            </IonTabButton>
            <IonTabButton tab="settings" href="/tabs/settings">
              <IonIcon icon={optionsOutline} />
              <IonLabel>{S.tab_settings}</IonLabel>
            </IonTabButton>
          </IonTabBar>
        </IonTabs>
      </TabProvider>
    </IonPage>
  );
}
