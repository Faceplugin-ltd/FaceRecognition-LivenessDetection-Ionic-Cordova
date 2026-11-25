import { IonApp, IonRouterOutlet, setupIonicReact } from '@ionic/react';
import { IonReactHashRouter } from '@ionic/react-router';
import { Redirect, Route } from 'react-router-dom';
import AddPersonPage from './pages/AddPersonPage';
import AttributeResultPage from './pages/AttributeResultPage';
import ImportPage from './pages/ImportPage';
import MainTabs from './pages/MainTabs';
import MatchesPage from './pages/MatchesPage';
import ResultPage from './pages/ResultPage';
import SplashPage from './pages/SplashPage';

setupIonicReact({ mode: 'md' });

/**
 * The demo app: a splash while the engine starts, then the five tabs, with the pushed
 * screens (Add person, Import, the two result screens and the matches list) above them.
 *
 * Hash routing is required on Cordova: the page is loaded from
 * file:///android_asset/www/, and browser history cannot route that.
 */
export default function App() {
  return (
    <IonApp>
      <IonReactHashRouter>
        <IonRouterOutlet id="main" animated={false}>
          <Route exact path="/splash" component={SplashPage} />
          <Route path="/tabs" component={MainTabs} />
          <Route exact path="/add-person" component={AddPersonPage} />
          <Route exact path="/import" component={ImportPage} />
          <Route exact path="/result" component={ResultPage} />
          <Route exact path="/attribute-result" component={AttributeResultPage} />
          <Route exact path="/matches" component={MatchesPage} />
          <Route exact path="/">
            <Redirect to="/splash" />
          </Route>
        </IonRouterOutlet>
      </IonReactHashRouter>
    </IonApp>
  );
}
