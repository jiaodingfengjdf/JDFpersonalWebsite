import { useEffect } from 'react';
import ChatScreen from './features/chat/ChatScreen';
import SettingsScreen from './features/settings/SettingsScreen';
import Drawer from './features/sidebar/Drawer';
import Toasts from './ui/Toasts';
import { initStore, useApp } from './state/store';

export default function App() {
  const state = useApp();
  const { ready, view, drawerOpen } = state;

  useEffect(() => {
    void initStore();
  }, []);

  // 任务/提醒功能已移除：不再轮询提醒，也不渲染提醒横幅
  void ready;
  void drawerOpen;

  return (
    <div className="app">
      {view === 'chat' ? <ChatScreen /> : <SettingsScreen />}
      <Drawer />
      <Toasts />
    </div>
  );
}
