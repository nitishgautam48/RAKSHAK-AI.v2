import { useEffect, useState } from 'react';
import Landing from './components/Landing';
import GovLoginGateway from './components/GovLoginGateway';
import VictimLoginGateway from './components/VictimLoginGateway';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import Placeholder from './components/Placeholder';
import CriticalAlertBanner from './components/CriticalAlertBanner';
import DashboardOverview from './pages/DashboardOverview';
import Complaints from './pages/Complaints';
import VictimAssessment from './pages/VictimAssessment';
import VoiceAnalysis from './pages/VoiceAnalysis';
import NlpAnalysis from './pages/NlpAnalysis';
import RiskIntelligence from './pages/RiskIntelligence';
import AiRecommendations from './pages/AiRecommendations';
import EmergencyCenter from './pages/EmergencyCenter';
import GeographicIntelligence from './pages/GeographicIntelligence';
import CounsellorWorkspace from './pages/CounsellorWorkspace';
import VictimJourneyTimeline from './pages/VictimJourneyTimeline';
import RealTimeAssessment from './pages/RealTimeAssessment';
import AiModelMonitoring from './pages/AiModelMonitoring';
import PrivacyEthics from './pages/PrivacyEthics';
import AiSupportAssistant from './pages/AiSupportAssistant';
import ChannelMonitoring from './pages/ChannelMonitoring';
import InterventionCommand from './pages/InterventionCommand';
import ExecutiveDashboard from './pages/ExecutiveDashboard';
import ExplainableAi from './pages/ExplainableAi';
import ReportsAnalytics from './pages/ReportsAnalytics';
import Settings from './pages/Settings';
import VictimPortal from './victim-portal/VictimPortal';
import { NAV, PAGE_TITLES } from './data/constants';
import { useAuth } from './lib/AuthContext';

const PAGE_COMPONENTS = {
  dashboard: DashboardOverview,
  complaints: Complaints,
  assessment: VictimAssessment,
  voice: VoiceAnalysis,
  nlp: NlpAnalysis,
  risk: RiskIntelligence,
  reco: AiRecommendations,
  emergency: EmergencyCenter,
  geo: GeographicIntelligence,
  counsellor: CounsellorWorkspace,
  realtime: RealTimeAssessment,
  journey: VictimJourneyTimeline,
  aimodels: AiModelMonitoring,
  privacy: PrivacyEthics,
  assistant: AiSupportAssistant,
  channels: ChannelMonitoring,
  command: InterventionCommand,
  executive: ExecutiveDashboard,
  xai: ExplainableAi,
  reports: ReportsAnalytics,
  settings: Settings,
};

export default function App() {
  const { user, loading, logout } = useAuth();
  const [screen, setScreen] = useState('landing'); // 'landing' | 'govlogin' | 'app' | 'victimlogin' | 'victim'
  const [victimInitialTab, setVictimInitialTab] = useState('dashboard');
  const [page, setPage] = useState('dashboard');
  const [lang, setLang] = useState('English');
  const [selectedVictimIdx, setSelectedVictimIdx] = useState(0);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Rehydrate straight into the right shell on a page refresh if a valid
  // session token is already stored (see AuthContext's GET /api/auth/me).
  useEffect(() => {
    if (loading || !user) return;
    if (user.userType === 'GOVERNMENT' && screen === 'landing') setScreen('app');
    if (user.userType === 'SURVIVOR' && screen === 'landing') setScreen('victim');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user]);

  const handleLogout = () => {
    logout();
    setScreen('landing');
  };

  const selectVictim = (idx) => {
    setSelectedVictimIdx(idx);
    setPage('assessment');
  };

  if (screen === 'landing') {
    return (
      <Landing
        onEnterPlatform={() => setScreen('govlogin')}
        onEnterVictimPortal={() => setScreen('victimlogin')}
      />
    );
  }

  if (screen === 'govlogin') {
    return <GovLoginGateway onSuccess={() => setScreen('app')} onBack={() => setScreen('landing')} />;
  }

  if (screen === 'victimlogin') {
    return (
      <VictimLoginGateway
        onSuccess={() => { setVictimInitialTab('dashboard'); setScreen('victim'); }}
        onEmergency={() => { setVictimInitialTab('emergency'); setScreen('victim'); }}
        onBack={() => setScreen('landing')}
      />
    );
  }

  if (screen === 'victim') {
    return <VictimPortal initialTab={victimInitialTab} onBack={handleLogout} />;
  }

  const PageComponent = PAGE_COMPONENTS[page];
  const navLabel = NAV.find((n) => n.key === page)?.label ?? page;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0d0f16', color: '#eef0f6', fontFamily: "'IBM Plex Sans',sans-serif" }}>
      <CriticalAlertBanner onViewCase={() => setPage('command')} />
      <div
        className={`tsa-sidebar-backdrop${mobileSidebarOpen ? ' tsa-sidebar-open' : ''}`}
        onClick={() => setMobileSidebarOpen(false)}
      />
      <Sidebar
        page={page}
        onSelectPage={setPage}
        onExit={handleLogout}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />
      <div className="tsa-maincol" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Topbar
          title={PAGE_TITLES[page]}
          role={user?.role}
          userName={user?.fullName}
          lang={lang}
          onLangChange={(e) => setLang(e.target.value)}
          onLogout={handleLogout}
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
        />
        <div className="tsa-scroll" style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
          {PageComponent ? (
            <PageComponent selectedVictimIdx={selectedVictimIdx} onSelectVictim={selectVictim} />
          ) : (
            <Placeholder label={navLabel} />
          )}
        </div>
      </div>
    </div>
  );
}
