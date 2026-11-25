import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useHistory } from 'react-router-dom';

/** Which bottom tab is selected — more reliable than the nested outlet path. */
export type AppTab =
  | 'identify'
  | 'people'
  | 'attribute'
  | 'liveness'
  | 'settings';

const TabContext = createContext<AppTab>('identify');

export function TabProvider({
  tab,
  children,
}: {
  tab: AppTab;
  children: ReactNode;
}) {
  return <TabContext.Provider value={tab}>{children}</TabContext.Provider>;
}

export function useActiveTab(): AppTab {
  return useContext(TabContext);
}

/**
 * True while a bottom-tab page is the front screen. Pushed routes (/result,
 * /add-person, …) keep MainTabs mounted underneath — camera pages must treat
 * those as inactive so the preview stops.
 */
export function useOnTabsSurface(): boolean {
  const path = useRoutePath();
  return path.startsWith('/tabs');
}

/**
 * Path of the screen the user is on, such as `/tabs/identify`.
 *
 * Prefer [useActiveTab] for camera start/stop. This remains for pages that need the full path.
 */
function resolvePath(pathname: string, hash: string): string {
  if (pathname.startsWith('/tabs')) return pathname;
  if (hash.startsWith('#/')) return hash.slice(1).split('?')[0] ?? '';
  return pathname;
}

export function useRoutePath(): string {
  const history = useHistory();
  const [path, setPath] = useState(() =>
    resolvePath(
      history.location?.pathname ?? '',
      typeof window !== 'undefined' ? window.location.hash : ''
    )
  );

  useEffect(() => {
    const sync = () => {
      setPath(
        resolvePath(
          history.location?.pathname ?? '',
          typeof window !== 'undefined' ? window.location.hash : ''
        )
      );
    };
    sync();
    const unlisten = history.listen(() => sync());
    window.addEventListener('hashchange', sync);
    return () => {
      unlisten();
      window.removeEventListener('hashchange', sync);
    };
  }, [history]);

  return path;
}

export function tabFromPath(path: string): AppTab {
  if (path.includes('/tabs/people')) return 'people';
  if (path.includes('/tabs/attribute')) return 'attribute';
  if (path.includes('/tabs/liveness')) return 'liveness';
  if (path.includes('/tabs/settings')) return 'settings';
  return 'identify';
}
