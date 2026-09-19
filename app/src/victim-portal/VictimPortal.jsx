import { useEffect, useState } from 'react';
import BrandMark from '../components/BrandMark';
import { api } from '../lib/api';
import { VICTIM_TABS } from '../data/constants';

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
import VictimDashboard from './VictimDashboard';
import FileComplaint from './FileComplaint';
import CaseTimeline from './CaseTimeline';
import CounsellingCenter from './CounsellingCenter';
import LegalAid from './LegalAid';
import MyDocuments from './MyDocuments';
import EmergencySupport from './EmergencySupport';
import AiCompanion from './AiCompanion';

const TAB_COMPONENTS = {
  dashboard: VictimDashboard,
  complaint: FileComplaint,
  timeline: CaseTimeline,
  counselling: CounsellingCenter,
  legal: LegalAid,
  documents: MyDocuments,
  emergency: EmergencySupport,
  companion: AiCompanion,
};

export default function VictimPortal({ onBack, initialTab = 'dashboard' }) {
  const [tab, setTab] = useState(initialTab);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    api.get('/api/notifications?pageSize=20')
      .then((r) => { setNotifications(r.items ?? []); setUnread(r.unread ?? 0); })
      .catch(() => {});
  }, []);

  const openNotifications = () => {
    const next = !notifOpen;
    setNotifOpen(next);
    if (next && unread > 0) {
      api.patch('/api/notifications/read-all').then(() => setUnread(0)).catch(() => {});
    }
  };

  const TabComponent = TAB_COMPONENTS[tab];

  return (
    <div style={{ minHeight: '100vh', background: '#0a0c12', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 460, minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#0d0f16', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 20px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
          <div onClick={onBack} style={{ cursor: 'pointer', color: '#8b91a3', fontSize: 18 }}>←</div>
          <BrandMark size={28} radius={8} />
          <div style={{ font: '700 15px Sora,sans-serif', flex: 1 }}>Support Portal</div>
          <div onClick={openNotifications} style={{ position: 'relative', cursor: 'pointer', color: '#8b91a3', fontSize: 16 }}>
            &#128276;
            {unread > 0 && <div style={{ position: 'absolute', top: -3, right: -4, width: 8, height: 8, borderRadius: '50%', background: 'oklch(0.62 0.21 25)' }} />}
          </div>
        </div>

        {notifOpen && (
          <div style={{ position: 'absolute', top: 64, right: 20, left: 20, zIndex: 30, background: '#171a24', border: '1px solid rgba(255,255,255,.1)', borderRadius: 14, padding: 14, boxShadow: '0 20px 40px -12px rgba(0,0,0,.6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ font: '600 12.5px Sora,sans-serif', color: '#8b91a3' }}>Notifications</div>
              <div onClick={() => setNotifOpen(false)} style={{ cursor: 'pointer', color: '#7d8399', fontSize: 14 }}>&times;</div>
            </div>
            {notifications.length === 0 && <div style={{ padding: '10px 0', fontSize: 12, color: '#5c6178' }}>No notifications yet.</div>}
            {notifications.map((nf) => (
              <div key={nf.id} style={{ padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,.06)', fontSize: 12.5 }}>
                <div style={{ color: '#eef0f6' }}>{nf.title}</div>
                <div style={{ color: '#5c6178', fontSize: 11 }}>{timeAgo(nf.createdAt)}</div>
              </div>
            ))}
          </div>
        )}

        <div className="tsa-scroll" style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 100px' }}>
          <TabComponent />
        </div>

        <div className="tsa-scroll" style={{ position: 'sticky', bottom: 0, display: 'flex', overflowX: 'auto', background: 'rgba(10,12,18,.92)', backdropFilter: 'blur(16px)', borderTop: '1px solid rgba(255,255,255,.08)', padding: '10px 4px' }}>
          {VICTIM_TABS.map((vtab) => {
            const active = tab === vtab.key;
            const isEmergency = vtab.key === 'emergency';
            const color = active ? (isEmergency ? 'oklch(0.62 0.21 25)' : 'oklch(0.68 0.14 200)') : (isEmergency ? 'oklch(0.62 0.21 25)' : '#7d8399');
            return (
              <div
                key={vtab.key}
                onClick={() => { setTab(vtab.key); setNotifOpen(false); }}
                style={{ flex: 'none', width: 76, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, cursor: 'pointer' }}
              >
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                <div style={{ fontSize: 9.5, fontWeight: active ? 700 : 500, color, textAlign: 'center' }}>{vtab.label}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
