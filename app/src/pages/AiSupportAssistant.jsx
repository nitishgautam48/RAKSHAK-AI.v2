import { useState } from 'react';
import { api } from '../lib/api';

const card = { background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 14, padding: 18 };
const SUGGESTIONS = [
  'How many critical cases are open?',
  'How many SOS alerts are unresolved?',
  'What is SVI?',
  'What is the escalation process?',
  'What is the retention policy?',
];

export default function AiSupportAssistant() {
  const [messages, setMessages] = useState([
    { from: 'assistant', text: 'I am a deterministic, rule-based staff assistant - not a generative AI model. I can answer a fixed set of questions about live system data and platform procedures. Try one of the suggestions on the right, or ask in your own words.' },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const send = async (text) => {
    const msg = (text ?? input).trim();
    if (!msg || sending) return;
    setMessages((m) => [...m, { from: 'user', text: msg }]);
    setInput('');
    setSending(true);
    try {
      const { reply } = await api.post('/api/assistant/query', { message: msg });
      setMessages((m) => [...m, { from: 'assistant', text: reply }]);
    } catch {
      setMessages((m) => [...m, { from: 'assistant', text: 'Sorry, I could not reach the assistant service.' }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="tsa-fade" style={{ display: 'grid', gridTemplateColumns: '1.6fr .9fr', gap: 16 }}>
      <div style={{ ...card, display: 'flex', flexDirection: 'column', height: 500 }}>
        <div style={{ font: '600 13px Sora,sans-serif', marginBottom: 12 }}>AI Support Assistant (rule-based)</div>
        <div className="tsa-scroll" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 4 }}>
          {messages.map((cm, i) => (
            <div
              key={i}
              style={{
                maxWidth: '80%', alignSelf: cm.from === 'user' ? 'flex-end' : 'flex-start',
                background: cm.from === 'user' ? 'oklch(0.58 0.19 275 / 0.25)' : 'rgba(255,255,255,.05)',
                borderRadius: 12, padding: '10px 14px', fontSize: 13, lineHeight: 1.5, color: '#eef0f6',
              }}
            >
              {cm.text}
            </div>
          ))}
          {sending && <div style={{ alignSelf: 'flex-start', fontSize: 11.5, color: '#5c6178' }}>Thinking…</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Ask about cases, SOS alerts, SVI, escalation, consent, retention…"
            style={{ flex: 1, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', color: '#eef0f6', borderRadius: 8, padding: '10px 12px', fontSize: 13 }}
          />
          <button onClick={() => send()} disabled={sending} style={{ padding: '0 18px', borderRadius: 8, border: 'none', background: 'oklch(0.58 0.19 275)', color: '#fff', font: "600 13px 'IBM Plex Sans',sans-serif", cursor: 'pointer', opacity: sending ? 0.6 : 1 }}>Send</button>
        </div>
      </div>

      <div style={card}>
        <div style={{ font: '600 13px Sora,sans-serif', marginBottom: 14 }}>Try Asking</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 9, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)', color: '#c4c8d4', fontSize: 12.5, cursor: 'pointer' }}
            >
              {s}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: '#5c6178', marginTop: 16, lineHeight: 1.6 }}>
          This assistant pattern-matches your question against a fixed list of known intents and answers using live database queries or fixed procedural knowledge. It does not use a large language model and cannot answer arbitrary open-ended questions.
        </div>
      </div>
    </div>
  );
}
