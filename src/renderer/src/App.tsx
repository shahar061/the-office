import React, { useEffect } from 'react';
import { useAppStore } from './stores/app.store';
import { useSettingsStore } from './stores/settings.store';
import { LobbyScreen } from './screens/LobbyScreen';
import { OfficeScreen } from './screens/OfficeScreen';
import { SettingsModal } from './components/SettingsModal/SettingsModal';

export function App() {
  const screen = useAppStore((s) => s.screen);

  useEffect(() => {
    useSettingsStore.getState().load();
  }, []);

  return (
    <>
      {screen === 'office' ? <OfficeScreen /> : <LobbyScreen />}
      <SettingsModal />
    </>
  );
}
