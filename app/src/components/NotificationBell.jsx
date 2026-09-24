import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';

// The backend's notify() (see server/src/services/notification.service.ts)
// has always persisted a real Notification row and emitted 'notification:new'
// for case assignments, HIGH/CRITICAL scores on an assigned case, SOS
// alerts, counselling scheduling, and auto-escalation - but nothing on the
// government dashboard ever consumed it. Every one of those was reaching
// the backend and sitting in the database, invisible, unless a staff member
// happened to already be on a page whose live-refresh incidentally picked
// up the underlying change. This is what actually surfaces them: a bell
// with a live-updating unread badge, present on every government page via
// Topbar.
function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    api.get('/api/notifications?pageSize=20')
      .then((r) => { setNotifications(r.items ?? []); setUnread(r.unread ?? 0); })
      .catch(() => {});
  }, []);

  // Live: a notification created while this dashboard is already open
  // (e.g. a HIGH-risk score lands on a case you're assigned to) shows up
  // immediately, not only on the next page load.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return undefined;
    const onNew = (notification) => {
      setNotifications((prev) => [notification, ...prev].slice(0, 20));
      setUnread((prev) => prev + 1);
    };
    socket.on('notification:new', onNew);
    return () => socket.off('notification:new', onNew);
  }, []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      api.patch('/api/notifications/read-all').then(() => setUnread(0)).catch(() => {});
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <div
        onClick={toggle}
        role="button"
        aria-label="Notifications"
        style={{ position: 'relative', cursor: 'pointer', color: '#8b91a3', fontSize: 17, padding: '8px 10px', borderRadius: 7, background: 'rgba(255,255,255,.04)' }}
      >
        &#128276;
        {unread > 0 && (
          <div style={{ position: 'absolute', top: 2, right: 4, minWidth: 15, height: 15, borderRadius: 8, background: 'oklch(0.62 0.21 25)', color: '#fff', fontSize: 9.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
            {unread > 9 ? '9+' : unread}
          </div>
        )}
      </div>

      {open && (
        <div style={{ position: 'absolute', top: 46, right: 0, width: 320, maxHeight: 380, overflowY: 'auto', background: '#171a24', border: '1px solid rgba(255,255,255,.1)', borderRadius: 12, padding: 14, boxShadow: '0 8px 24px rgba(0,0,0,.4)', zIndex: 500 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ font: '700 13px Sora,sans-serif' }}>Notifications</div>
            <div onClick={() => setOpen(false)} style={{ cursor: 'pointer', color: '#7d8399', fontSize: 16 }}>&times;</div>
          </div>
          {notifications.length === 0 && <div style={{ padding: '10px 0', fontSize: 12, color: '#5c6178' }}>No notifications yet.</div>}
          {notifications.map((nf) => (
            <div key={nf.id} style={{ padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,.06)', fontSize: 12.5 }}>
              <div style={{ color: '#eef0f6' }}>{nf.title}</div>
              <div style={{ color: '#8b91a3', marginTop: 2, lineHeight: 1.4 }}>{nf.body}</div>
              <div style={{ color: '#5c6178', fontSize: 11, marginTop: 3 }}>{timeAgo(nf.createdAt)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
