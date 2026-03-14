import React from 'react';
import { useAppStore } from './stores/app.store';
import { LobbyScreen } from './screens/LobbyScreen';
import { OfficeScreen } from './screens/OfficeScreen';

export function App() {
  const screen = useAppStore((s) => s.screen);

  if (screen === 'office') {
    return <OfficeScreen />;
  }

  return <LobbyScreen />;
}
