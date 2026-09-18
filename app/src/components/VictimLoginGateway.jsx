import { useState } from 'react';
import BrandMark from './BrandMark';
import { LANGS } from '../data/constants';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthContext';

const tabStyle = (active) => ({
  flex: 1, textAlign: 'center', padding: '9px 4px', borderRadius: 8, cursor: 'pointer', fontSize: 11.5, fontWeight: 600,
  background: active ? 'rgba(255,255,255,.08)' : 'transparent', color: active ? '#eef0f6' : '#8b91a3',
});
const inputStyle = { width: '100%', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', color: '#eef0f6', borderRadius: 9, padding: '13px 14px', fontSize: 14 };
const errorStyle = { fontSize: 12, color: 'oklch(0.7 0.17 55)', background: 'oklch(0.7 0.17 55 / 0.1)', border: '1px solid oklch(0.7 0.17 55 / 0.3)', borderRadius: 8, padding: 10 };
const primaryBtn = { padding: 14, borderRadius: 10, border: 'none', background: 'oklch(0.72 0.15 145)', color: '#0d0f16', font: '700 14.5px Sora,sans-serif', cursor: 'pointer' };

export default function VictimLoginGateway({ onSuccess, onEmergency, onBack }) {
  const { login } = useAuth();
  const [method, setMethod] = useState('mobile');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [mobileNumber, setMobileNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  const [caseId, setCaseId] = useState('');
  const [caseOtp, setCaseOtp] = useState('');
  const [caseOtpSent, setCaseOtpSent] = useState(false);

  const [regName, setRegName] = useState('');
  const [regMobile, setRegMobile] = useState('');
  const [regLanguage, setRegLanguage] = useState('English');

  const switchMethod = (m) => {
    setMethod(m);
    setError('');
  };

  const sendMobileOtp = async () => {
    if (!/^\d{10}$/.test(mobileNumber.trim())) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await api.post('/api/auth/survivor/mobile/send-otp', { mobileNumber: mobileNumber.trim() });
      setOtpSent(true);
      if (result.devCode) setOtp(result.devCode); // dev-mode convenience: no SMS gateway in this environment, see server README
    } catch (err) {
      setError(err.body?.message || 'Could not send OTP. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const verifyMobileOtp = async () => {
    if (!/^\d{4,6}$/.test(otp.trim())) {
      setError('Enter the OTP sent to your mobile.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await api.post('/api/auth/survivor/mobile/verify-otp', { mobileNumber: mobileNumber.trim(), code: otp.trim() });
      login(result.token, result.user);
      onSuccess();
    } catch (err) {
      setError(err.body?.message || 'Verification failed.');
    } finally {
      setBusy(false);
    }
  };

  const sendCaseOtp = async () => {
    if (!caseId.trim()) {
      setError('Enter your Case ID.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await api.post('/api/auth/survivor/case/send-otp', { caseId: caseId.trim() });
      setCaseOtpSent(true);
      if (result.devCode) setCaseOtp(result.devCode);
    } catch (err) {
      setError(err.body?.message || 'Could not find that Case ID.');
    } finally {
      setBusy(false);
    }
  };
  const verifyCaseOtp = async () => {
    if (!/^\d{4,6}$/.test(caseOtp.trim())) {
      setError('Enter the OTP sent for this Case ID.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await api.post('/api/auth/survivor/case/verify-otp', { caseId: caseId.trim(), code: caseOtp.trim() });
      login(result.token, result.user);
      onSuccess();
    } catch (err) {
      setError(err.body?.message || 'Verification failed.');
    } finally {
      setBusy(false);
    }
  };

  const submitRegistration = async () => {
    if (!regName || !/^\d{10}$/.test(regMobile.trim())) {
      setError('Enter your name and a valid 10-digit mobile number.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await api.post('/api/auth/survivor/register', { name: regName.trim(), mobileNumber: regMobile.trim(), language: regLanguage });
      login(result.token, result.user);
      onSuccess();
    } catch (err) {
      setError(err.body?.message || 'Registration failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleEmergency = async () => {
    try {
      const result = await api.post('/api/auth/survivor/emergency', {});
      login(result.token, { role: 'VICTIM', userType: 'SURVIVOR', emergency: true });
    } catch {
      // Emergency access must never hard-block on a network error - fall through to onEmergency() regardless.
    }
    onEmergency();
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0a0c12', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 460, padding: '36px 22px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <BrandMark size={42} radius={11} background="oklch(0.72 0.15 145)" color="#0d0f16" style={{ margin: '0 auto 14px' }} />
          <div style={{ font: '700 19px Sora,sans-serif', marginBottom: 4 }}>Welcome. You are safe here.</div>
          <div style={{ fontSize: 13, color: '#8b91a3' }}>Secure access to your case, counselling and support</div>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 18, background: 'rgba(255,255,255,.04)', borderRadius: 10, padding: 4 }}>
          <div onClick={() => switchMethod('mobile')} style={tabStyle(method === 'mobile')}>Mobile OTP</div>
          <div onClick={() => switchMethod('caseid')} style={tabStyle(method === 'caseid')}>Case ID</div>
          <div onClick={() => switchMethod('register')} style={tabStyle(method === 'register')}>New Here</div>
        </div>

        <div style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 16, padding: 22 }}>
          {method === 'mobile' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12.5, color: '#8b91a3', marginBottom: 6 }}>Mobile Number</div>
                <input value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value)} placeholder="10-digit mobile number" style={inputStyle} />
              </div>
              {otpSent && (
                <div>
                  <div style={{ fontSize: 12.5, color: '#8b91a3', marginBottom: 6 }}>Enter OTP</div>
                  <input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="4-6 digit OTP" style={inputStyle} />
                </div>
              )}
              {error && <div style={errorStyle}>{error}</div>}
              {otpSent ? (
                <button onClick={verifyMobileOtp} disabled={busy} style={primaryBtn}>Verify &amp; Continue</button>
              ) : (
                <button onClick={sendMobileOtp} disabled={busy} style={primaryBtn}>Send OTP</button>
              )}
            </div>
          )}
          {method === 'caseid' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12.5, color: '#8b91a3', marginBottom: 6 }}>Case ID</div>
                <input value={caseId} onChange={(e) => setCaseId(e.target.value)} placeholder="e.g. TC-4471" style={inputStyle} />
              </div>
              {caseOtpSent && (
                <div>
                  <div style={{ fontSize: 12.5, color: '#8b91a3', marginBottom: 6 }}>Enter OTP</div>
                  <input value={caseOtp} onChange={(e) => setCaseOtp(e.target.value)} placeholder="4-6 digit OTP" style={inputStyle} />
                </div>
              )}
              {error && <div style={errorStyle}>{error}</div>}
              {caseOtpSent ? (
                <button onClick={verifyCaseOtp} disabled={busy} style={primaryBtn}>Verify &amp; Continue</button>
              ) : (
                <button onClick={sendCaseOtp} disabled={busy} style={primaryBtn}>Send OTP</button>
              )}
              <button disabled style={{ padding: 13, borderRadius: 10, border: '1px solid rgba(255,255,255,.1)', background: 'transparent', color: '#5c6178', font: "600 13px 'IBM Plex Sans',sans-serif", cursor: 'not-allowed' }}>Aadhaar-linked Verification (coming soon)</button>
            </div>
          )}
          {method === 'register' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12.5, color: '#8b91a3', marginBottom: 6 }}>Your Name</div>
                <input value={regName} onChange={(e) => setRegName(e.target.value)} placeholder="First name is fine" style={inputStyle} />
              </div>
              <div>
                <div style={{ fontSize: 12.5, color: '#8b91a3', marginBottom: 6 }}>Mobile Number</div>
                <input value={regMobile} onChange={(e) => setRegMobile(e.target.value)} placeholder="10-digit mobile number" style={inputStyle} />
              </div>
              <div>
                <div style={{ fontSize: 12.5, color: '#8b91a3', marginBottom: 6 }}>Preferred Language</div>
                <select value={regLanguage} onChange={(e) => setRegLanguage(e.target.value)} style={inputStyle}>
                  {LANGS.map((l) => <option key={l} value={l} style={{ background: '#171a24' }}>{l}</option>)}
                </select>
              </div>
              {error && <div style={errorStyle}>{error}</div>}
              <button onClick={submitRegistration} disabled={busy} style={primaryBtn}>Create Secure Access</button>
            </div>
          )}
        </div>

        <button onClick={handleEmergency} style={{ marginTop: 16, padding: 14, borderRadius: 10, border: '1px solid oklch(0.62 0.21 25 / 0.4)', background: 'oklch(0.62 0.21 25 / 0.1)', color: 'oklch(0.75 0.18 25)', font: '700 13.5px Sora,sans-serif', cursor: 'pointer' }}>
          Continue as Emergency User &middot; SOS &amp; Helpline 14566
        </button>

        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 14, marginTop: 20 }}>
          {['End-to-end encrypted', 'Privacy protected', 'Consent-based sharing'].map((label) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: '#7d8399' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'oklch(0.72 0.15 145)' }} />{label}
            </div>
          ))}
        </div>
        <div onClick={onBack} style={{ textAlign: 'center', marginTop: 18, fontSize: 12.5, color: '#5c6178', cursor: 'pointer' }}>← Back to landing page</div>
      </div>
    </div>
  );
}
