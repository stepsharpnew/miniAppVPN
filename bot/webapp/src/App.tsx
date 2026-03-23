import { useState, useEffect } from 'react';
import WebApp from '@twa-dev/sdk';
import { BottomNav, type TabId } from './components/BottomNav';
import { PurchasePage } from './pages/PurchasePage';
import { ProfilePage } from './pages/ProfilePage';
import { InstructionsPage } from './pages/InstructionsPage';
import { SupportPage } from './pages/SupportPage';

const pageStyle: React.CSSProperties = {
  transition: 'opacity 0.2s ease, transform 0.2s ease',
};

const hiddenStyle: React.CSSProperties = {
  ...pageStyle,
  opacity: 0,
  transform: 'translateY(8px)',
  pointerEvents: 'none',
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
};

const visibleStyle: React.CSSProperties = {
  ...pageStyle,
  opacity: 1,
  transform: 'translateY(0)',
};

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('purchase');

  useEffect(() => {
    WebApp.ready();
    WebApp.expand();
    WebApp.setHeaderColor('#0A0A1A');
    WebApp.setBackgroundColor('#0A0A1A');
  }, []);

  return (
    <>
      <div style={{ position: 'relative', flex: 1, overflowY: 'auto', paddingBottom: 70 }}>
        <div style={activeTab === 'purchase' ? visibleStyle : hiddenStyle}>
          <PurchasePage active={activeTab === 'purchase'} />
        </div>
        <div style={activeTab === 'profile' ? visibleStyle : hiddenStyle}>
          <ProfilePage />
        </div>
        <div style={activeTab === 'instructions' ? visibleStyle : hiddenStyle}>
          <InstructionsPage />
        </div>
        <div style={activeTab === 'support' ? visibleStyle : hiddenStyle}>
          <SupportPage />
        </div>
      </div>
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </>
  );
}
