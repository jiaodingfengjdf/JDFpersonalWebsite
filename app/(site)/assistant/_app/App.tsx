import { useEffect } from 'react';
import ChatScreen from './features/chat/ChatScreen';
import SettingsScreen from './features/settings/SettingsScreen';
import Drawer from './features/sidebar/Drawer';
import Toasts from './ui/Toasts';
import {
  hydrateAuthSession,
  hydratePublicConfig,
  initStore,
  useApp,
  type AssistantAuthSnapshot,
  type AssistantPublicConfig,
} from './state/store';

export interface AssistantAppProps {
  initialAuth?: AssistantAuthSnapshot;
  initialPublicConfig?: AssistantPublicConfig;
}

export default function App({ initialAuth, initialPublicConfig }: AssistantAppProps) {
  const { view, isAdmin, authLoaded } = useApp();

  useEffect(() => {
    if (initialPublicConfig) hydratePublicConfig(initialPublicConfig);
    if (initialAuth) hydrateAuthSession(initialAuth);
    void initStore();
  }, [initialAuth, initialPublicConfig]);

  const showSettings = view === 'settings' && isAdmin && authLoaded;

  return (
    <div className="app">
      {showSettings ? <SettingsScreen /> : <ChatScreen />}
      <Drawer />
      <Toasts />
    </div>
  );
}
