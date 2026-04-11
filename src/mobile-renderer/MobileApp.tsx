import { useState } from 'react';
import type React from 'react';
import { OfficeView } from './OfficeView';
import { ChatView } from './ChatView';
import { TabBar } from './TabBar';

export function MobileApp(): React.JSX.Element {
  const [tab, setTab] = useState<'office' | 'chat'>('office');
  return (
    <div className="mobile-root">
      <div className={`tab-pane ${tab === 'office' ? '' : 'hidden'}`}>
        <OfficeView active={tab === 'office'} />
      </div>
      <div className={`tab-pane ${tab === 'chat' ? '' : 'hidden'}`}>
        <ChatView />
      </div>
      <TabBar active={tab} onChange={setTab} />
    </div>
  );
}
