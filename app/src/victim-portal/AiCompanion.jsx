import { useState } from 'react';
import { api } from '../lib/api';

const QUICK_ACTIONS = ['Legal guidance', 'Case progress', 'What happens next?', 'I need emotional support'];

export default function AiCompanion() {
  const [messages, setMessages] = useState([
    { from: 'companion', text: 'Hello, I am here for you. I can answer real questions about your case, legal rights, and upcoming sessions - I am a rule-based assistant, not a generative AI, so I only cover a fixed set of topics. Ask below, or simply talk about how you are feeling.' },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const send = async (presetText) => {
    const text = (typeof presetText === 'string' ? presetText : input).trim();
    if (!text || sending) return;
    setMessages((m) => [...m, { from: 'victim', text }]);
    setInput('');
    setSending(true);
    try {
      const { reply } = await api.post('/api/assistant/companion', { message: text });
      setMessages((m) => [...m, { from: 'companion', text: reply }]);
    } catch {
      setMessages((m) => [...m, { from: 'companion', text: 'Sorry, I could not reach the assistant service. If this is urgent, please use the Emergency tab.' }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="tsa-fade" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 180px)' }}>
      <div style={{ font: '700 20px Sora,sans-serif', marginBottom: 12 }}>AI Companion</div>
      <div className="tsa-scroll" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 10 }}>
        {messages.map((vm, i) => (
          <div
            key={i}
            style={{
              maxWidth: '80%', alignSelf: vm.from === 'victim' ? 'flex-end' : 'flex-start',
              background: vm.from === 'victim' ? 'oklch(0.58 0.19 275 / 0.25)' : 'rgba(255,255,255,.06)',
              borderRadius: 14, padding: '12px 15px', fontSize: 14, lineHeight: 1.5,
            }}
          >
            {vm.text}
          </div>
        ))}
        {sending && <div style={{ alignSelf: 'flex-start', fontSize: 12, color: '#7d8399' }}>Thinking…</div>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        {QUICK_ACTIONS.map((qa) => (
          <div key={qa} onClick={() => send(qa)} style={{ padding: '8px 13px', borderRadius: 20, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', fontSize: 12.5, cursor: 'pointer' }}>{qa}</div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Type how you feel or ask a question..."
          style={{ flex: 1, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', color: '#eef0f6', borderRadius: 10, padding: '12px 14px', fontSize: 14 }}
        />
        <button onClick={() => send()} disabled={sending} style={{ padding: '0 18px', borderRadius: 10, border: 'none', background: 'oklch(0.58 0.19 275)', color: '#fff', font: "600 14px 'IBM Plex Sans',sans-serif", cursor: 'pointer', opacity: sending ? 0.6 : 1 }}>Send</button>
      </div>
    </div>
  );
}
