import { useState } from 'react';
import BrandMark from './BrandMark';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthContext';

const GOV_DEPARTMENTS = ['Social Justice', 'Police', 'District Administration', 'Legal Aid', 'Counsellor Services', 'Ministry Dashboard'];

const tabStyle = (active) => ({
  flex: 1, textAlign: 'center', padding: '9px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
  background: active ? 'rgba(255,255,255,.08)' : 'transparent', color: active ? '#eef0f6' : '#8b91a3',
});
const inputStyle = { width: '100%', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', color: '#eef0f6', borderRadius: 9, padding: '12px 14px', fontSize: 13.5 };
const errorStyle = { fontSize: 12, color: 'oklch(0.7 0.17 55)', background: 'oklch(0.7 0.17 55 / 0.1)', border: '1px solid oklch(0.7 0.17 55 / 0.3)', borderRadius: 8, padding: 10 };
const submitStyle = { padding: 13, borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,oklch(0.58 0.19 275),oklch(0.6 0.15 235))', color: '#fff', font: '700 14px Sora,sans-serif', cursor: 'pointer', marginTop: 4 };

export default function GovLoginGateway({ onSuccess, onBack }) {
  const { login } = useAuth();
  const [method, setMethod] = useState('email');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [govEmail, setGovEmail] = useState('');
  const [govPassword, setGovPassword] = useState('');

  const [employeeDept, setEmployeeDept] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [employeePassword, setEmployeePassword] = useState('');

  const switchMethod = (m) => {
    setMethod(m);
    setError('');
  };

  const submitEmailLogin = async () => {
    if (!govEmail.trim() || !govPassword) {
      setError('Enter your government email and password.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await api.post('/api/auth/gov/email/login', { email: govEmail.trim(), password: govPassword });
      login(result.token, result.user);
      onSuccess();
    } catch (err) {
      setError(err.body?.message || 'Sign-in failed. Check your credentials and try again.');
    } finally {
      setBusy(false);
    }
  };

  const submitSso = () => {
    setError('NIC/ePramaan SSO integration is ready for connection but requires a live NIC credential exchange not available in this environment.');
  };

  const submitEmployeeLogin = async () => {
    if (!employeeDept || !employeeId || !employeePassword) {
      setError('Fill in department, employee ID and password.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await api.post('/api/auth/gov/employee/login', { department: employeeDept, employeeId: employeeId.trim(), password: employeePassword });
      login(result.token, result.user);
      onSuccess();
    } catch (err) {
      setError(err.body?.message || 'Sign-in failed. Check your credentials and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0a0c12', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <BrandMark size={44} radius={11} style={{ margin: '0 auto 14px' }} />
          <div style={{ font: '700 20px Sora,sans-serif', marginBottom: 4 }}>Government Access Gateway</div>
          <div style={{ fontSize: 13, color: '#8b91a3' }}>Secure sign-in to the TraumaSense AI Command Platform</div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 20, background: 'rgba(255,255,255,.04)', borderRadius: 10, padding: 4 }}>
          <div onClick={() => switchMethod('email')} style={tabStyle(method === 'email')}>Gov Email</div>
          <div onClick={() => switchMethod('employee')} style={tabStyle(method === 'employee')}>Employee ID</div>
        </div>

        <div style={{ background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 16, padding: 26 }}>
          {method === 'email' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: '#8b91a3', marginBottom: 6 }}>Government Email</div>
                <input value={govEmail} onChange={(e) => setGovEmail(e.target.value)} placeholder="name@department.gov.in" style={inputStyle} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#8b91a3', marginBottom: 6 }}>Password</div>
                <input type="password" value={govPassword} onChange={(e) => setGovPassword(e.target.value)} placeholder="••••••••" style={inputStyle} />
              </div>
              {error && <div style={errorStyle}>{error}</div>}
              <button onClick={submitEmailLogin} disabled={busy} style={submitStyle}>{busy ? 'Signing in…' : 'Sign In'}</button>
              <div style={{ fontSize: 11, color: '#5c6178', textAlign: 'center' }}>Only .gov.in, nic.in, police.gov.in and approved department domains are accepted.</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0', color: '#5c6178', fontSize: 11 }}>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.08)' }} />OR<div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.08)' }} />
              </div>
              <button onClick={submitSso} style={{ padding: 13, borderRadius: 9, border: '1px solid rgba(255,255,255,.15)', background: 'rgba(255,255,255,.04)', color: '#eef0f6', font: "600 13.5px 'IBM Plex Sans',sans-serif", cursor: 'pointer' }}>Continue with NIC/ePramaan SSO</button>
            </div>
          )}
          {method === 'employee' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: '#8b91a3', marginBottom: 6 }}>Department</div>
                <select value={employeeDept} onChange={(e) => setEmployeeDept(e.target.value)} style={inputStyle}>
                  <option value="" style={{ background: '#171a24' }}>Select department</option>
                  {GOV_DEPARTMENTS.map((gd) => <option key={gd} value={gd} style={{ background: '#171a24' }}>{gd}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#8b91a3', marginBottom: 6 }}>Employee ID</div>
                <input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} placeholder="e.g. GOV-88213" style={inputStyle} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#8b91a3', marginBottom: 6 }}>Password</div>
                <input type="password" value={employeePassword} onChange={(e) => setEmployeePassword(e.target.value)} placeholder="••••••••" style={inputStyle} />
              </div>
              {error && <div style={errorStyle}>{error}</div>}
              <button onClick={submitEmployeeLogin} disabled={busy} style={submitStyle}>{busy ? 'Signing in…' : 'Sign In'}</button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 18, marginTop: 22, flexWrap: 'wrap' }}>
          {['Government Access Only', 'Secure Encrypted Session', 'Audit Logged Access'].map((label) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#7d8399' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'oklch(0.72 0.15 145)' }} />{label}
            </div>
          ))}
        </div>
        <div onClick={onBack} style={{ textAlign: 'center', marginTop: 20, fontSize: 12.5, color: '#5c6178', cursor: 'pointer' }}>← Back to landing page</div>
      </div>
    </div>
  );
}
