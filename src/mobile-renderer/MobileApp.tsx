import { useEffect, useState } from 'react';
import type React from 'react';
import { OfficeView } from './OfficeView';
import { ChatView } from './ChatView';
import { TabBar } from './TabBar';
import { emitActiveTab } from './emitActiveTab';

/**
 * `true` when the WebView viewport is wider than tall. The RN host locks
 * the device to landscape in fullscreen mode, so the WebView sees a
 * landscape viewport and we can infer that it's in fullscreen canvas mode.
 */
function useIsLandscape(): boolean {
  const [landscape, setLandscape] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth > window.innerHeight,
  );
  useEffect(() => {
    const update = () => setLandscape(window.innerWidth > window.innerHeight);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);
  return landscape;
}

export function MobileApp(): React.JSX.Element {
  const [tab, setTab] = useState<'office' | 'chat'>('office');
  const landscape = useIsLandscape();
  // In landscape (fullscreen canvas), the floating chat FAB on the RN side
  // handles "go back to chat", so we hide the tab switcher and force the
  // office tab to be visible. Without this the in-WebView tab bar steals
  // ~56px at the bottom and the canvas appears cut off.
  const activeTab = landscape ? 'office' : tab;
  useEffect(() => {
    emitActiveTab(activeTab);
  }, [activeTab]);
  return (
    <div className="mobile-root">
      <div className={`tab-pane ${activeTab === 'office' ? '' : 'hidden'}`}>
        <OfficeView active={activeTab === 'office'} />
      </div>
      <div className={`tab-pane ${activeTab === 'chat' ? '' : 'hidden'}`}>
        <ChatView />
      </div>
      {!landscape && <TabBar active={tab} onChange={setTab} />}
    </div>
  );
}
