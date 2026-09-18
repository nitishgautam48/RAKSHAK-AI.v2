import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const card = { background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 14, padding: 22 };
const ENGINE_LABEL = { nlp: 'NLP Trauma Engine', voice: 'Voice Analysis Engine', svi: 'SVI Scoring Engine' };
const ENGINE_COLOR = { nlp: 'oklch(0.7 0.17 55)', voice: 'oklch(0.65 0.14 200)', svi: 'oklch(0.62 0.21 25)' };
const ORIGIN_LABEL = { rule_based: 'Rule-based / explainable', signal_processing: 'Digital signal processing' };

function CheckBadge({ passed }) {
  return <span style={{ color: passed ? 'oklch(0.72 0.15 145)' : 'oklch(0.62 0.21 25)', fontWeight: 700, fontSize: 11 }}>{passed ? 'PASS' : 'FAIL'}</span>;
}

function RobustnessRow({ label, data }) {
  if (!data) return null;
  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}>
        <div>{label}</div>
        <div>{data.passed}/{data.total} <CheckBadge passed={data.passed === data.total} /></div>
      </div>
      <div style={{ fontSize: 11, color: '#5c6178' }}>{data.description}</div>
    </div>
  );
}

export default function AiModelMonitoring() {
  const [registry, setRegistry] = useState(null);
  const [evalData, setEvalData] = useState(null);
  const [voiceEval, setVoiceEval] = useState(null);
  const [drift, setDrift] = useState(null);
  const [agreement, setAgreement] = useState(null);
  const [auditSummary, setAuditSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/api/ai-monitoring/registry'),
      api.get('/api/ai-monitoring/eval'),
      api.get('/api/ai-monitoring/voice-eval'),
      api.get('/api/ai-monitoring/drift'),
      api.get('/api/ai-monitoring/agreement-stats'),
      api.get('/api/meta/audit-summary'),
    ])
      .then(([r, e, v, d, ag, a]) => { setRegistry(r); setEvalData(e); setVoiceEval(v); setDrift(d); setAgreement(ag); setAuditSummary(a); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const activeModels = (registry?.models ?? []).filter((m) => m.status === 'active');

  return (
    <div className="tsa-fade">
      {loading && <div style={{ color: '#7d8399', fontSize: 13, marginBottom: 16 }}>Loading…</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14, marginBottom: 16 }}>
        {activeModels.map((m) => (
          <div key={m.engine} style={{ background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 14, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div style={{ font: '600 13px Sora,sans-serif' }}>{ENGINE_LABEL[m.engine] ?? m.engine}</div>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: ENGINE_COLOR[m.engine] ?? '#5c6178', marginTop: 4, flex: 'none' }} />
            </div>
            <div style={{ fontSize: 12, color: '#8b91a3', marginBottom: 10, fontFamily: "'IBM Plex Mono',monospace" }}>{m.version}</div>
            <div style={{ fontSize: 11.5, color: '#8b91a3', marginBottom: 4 }}>Method: <span style={{ color: '#eef0f6' }}>{ORIGIN_LABEL[m.origin] ?? m.origin}</span></div>
            <div style={{ fontSize: 11.5, color: '#8b91a3' }}>Registered: <span style={{ color: '#eef0f6' }}>{new Date(m.registeredAt * 1000).toLocaleString()}</span></div>
            {m.meta?.weights && (
              <div style={{ marginTop: 10, fontSize: 10.5, color: '#5c6178' }}>
                {Object.entries(m.meta.weights).slice(0, 4).map(([k, v]) => `${k}: ${v}`).join(' · ')}
              </div>
            )}
            {m.meta?.categories && (
              <div style={{ marginTop: 10, fontSize: 10.5, color: '#5c6178' }}>{m.meta.categories.length} lexicon categories</div>
            )}
          </div>
        ))}
        {!loading && activeModels.length === 0 && <div style={{ color: '#5c6178', fontSize: 12.5 }}>No active model versions registered.</div>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr .8fr', gap: 16, marginBottom: 16 }}>
        <div style={card}>
          <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 4 }}>NLP/SVI Evaluation Results</div>
          <div style={{ fontSize: 11, color: '#5c6178', marginBottom: 14 }}>{evalData?.disclaimer}</div>
          {evalData && (
            <>
              <div style={{ display: 'flex', gap: 20, marginBottom: 14 }}>
                <div><div style={{ font: '700 22px Sora,sans-serif', color: 'oklch(0.72 0.15 145)' }}>{evalData.pass_rate}%</div><div style={{ fontSize: 11, color: '#8b91a3' }}>Pass rate</div></div>
                <div><div style={{ font: '700 22px Sora,sans-serif' }}>{evalData.passed}/{evalData.total}</div><div style={{ fontSize: 11, color: '#8b91a3' }}>Cases passed</div></div>
                <div><div style={{ font: '700 22px Sora,sans-serif', fontFamily: "'IBM Plex Mono',monospace" }}>{evalData.model_version}</div><div style={{ fontSize: 11, color: '#8b91a3' }}>SVI model version</div></div>
              </div>
              <div className="tsa-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 0, maxHeight: 260, overflowY: 'auto' }}>
                {evalData.results.map((r) => (
                  <div key={r.id} style={{ display: 'flex', gap: 14, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,.05)', fontSize: 12 }}>
                    <div style={{ width: 60, color: '#5c6178', fontFamily: "'IBM Plex Mono',monospace" }}>{r.id}</div>
                    <div style={{ flex: 1, color: '#8b91a3' }}>expected &ge; {r.expected_at_least} &middot; predicted {r.predicted_band} ({r.predicted_value})</div>
                    <CheckBadge passed={r.passed} />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div style={card}>
          <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 4 }}>Drift Detection</div>
          <div style={{ fontSize: 11, color: '#5c6178', marginBottom: 14 }}>Monitors real logged SVI scores for distribution shift</div>
          {drift?.status === 'insufficient_data' && (
            <>
              <div style={{ fontSize: 12.5, color: '#8b91a3', marginBottom: 10 }}>Not enough logged scores yet to run drift analysis.</div>
              <div style={{ background: 'rgba(255,255,255,.06)', borderRadius: 20, height: 8, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ width: `${Math.min(100, (100 * drift.count) / drift.required)}%`, height: '100%', background: 'oklch(0.7 0.17 55)' }} />
              </div>
              <div style={{ fontSize: 11, color: '#5c6178' }}>{drift.count} / {drift.required} scores collected</div>
            </>
          )}
          {drift && drift.status !== 'insufficient_data' && (
            <pre style={{ fontSize: 11, color: '#c4c8d4', whiteSpace: 'pre-wrap' }}>{JSON.stringify(drift, null, 1)}</pre>
          )}
        </div>
      </div>

      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 4 }}>Real Field Agreement</div>
        <div style={{ fontSize: 11, color: '#5c6178', marginBottom: 14 }}>
          The actual validation metric: what fraction of AI assessments that staff reviewed did they confirm vs. override? Starts empty and
          only grows from genuine use via the Confirm/Override control on the Explainable AI Center - this is the only real answer to
          whether the scoring formulas match real judgment, as opposed to the illustrative self-written harness above.
        </div>
        {agreement && agreement.totalReviews === 0 && (
          <div style={{ color: '#5c6178', fontSize: 12.5 }}>No assessments have been reviewed by staff yet.</div>
        )}
        {agreement && agreement.totalReviews > 0 && (
          <>
            <div style={{ display: 'flex', gap: 20, marginBottom: 14 }}>
              <div><div style={{ font: '700 22px Sora,sans-serif', color: 'oklch(0.72 0.15 145)' }}>{agreement.agreementRatePct}%</div><div style={{ fontSize: 11, color: '#8b91a3' }}>Agreement rate</div></div>
              <div><div style={{ font: '700 22px Sora,sans-serif' }}>{agreement.totalReviews}</div><div style={{ fontSize: 11, color: '#8b91a3' }}>Total reviews</div></div>
              <div><div style={{ font: '700 22px Sora,sans-serif', color: 'oklch(0.72 0.15 145)' }}>{agreement.confirmed}</div><div style={{ fontSize: 11, color: '#8b91a3' }}>Confirmed</div></div>
              <div><div style={{ font: '700 22px Sora,sans-serif', color: 'oklch(0.7 0.17 55)' }}>{agreement.overridden}</div><div style={{ fontSize: 11, color: '#8b91a3' }}>Overridden</div></div>
            </div>
            {agreement.recentOverrides.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {agreement.recentOverrides.map((o) => (
                  <div key={o.id} style={{ display: 'flex', gap: 14, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,.05)', fontSize: 12 }}>
                    <div style={{ width: 140, color: '#5c6178' }}>{new Date(o.createdAt).toLocaleDateString()}</div>
                    <div style={{ width: 140, color: '#8b91a3' }}>{o.reviewerName}</div>
                    <div style={{ width: 160 }}>{o.originalBand ?? '?'} &rarr; <span style={{ color: 'oklch(0.7 0.17 55)', fontWeight: 600 }}>{o.overriddenBand}</span></div>
                    <div style={{ flex: 1, color: '#c4c8d4' }}>{o.note}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div style={card}>
          <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 4 }}>NLP/SVI Robustness Checks</div>
          <div style={{ fontSize: 11, color: '#5c6178', marginBottom: 10 }}>Beyond pass/fail on hand-written cases: does the scorer behave consistently, stay stable under padding, and stay fair across demographic phrasing?</div>
          <RobustnessRow label="Consistency (same event, different wording)" data={evalData?.consistency_checks} />
          <RobustnessRow label="Stability (irrelevant filler text appended)" data={evalData?.stability_checks} />
          <RobustnessRow label="Fairness (gender/caste-context swapped)" data={evalData?.fairness_checks} />
        </div>

        <div style={card}>
          <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 4 }}>NLP Known Limitations</div>
          <div style={{ fontSize: 11, color: '#5c6178', marginBottom: 10 }}>Cases chosen to expose real blind spots of a keyword-lexicon scorer, documented rather than hidden.</div>
          <div className="tsa-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 220, overflowY: 'auto' }}>
            {evalData?.known_limitations?.results?.map((x) => (
              <div key={x.id} style={{ fontSize: 11.5, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,.05)' }}>
                <div style={{ color: '#8b91a3', marginBottom: 3 }}>{x.id} &middot; reads {x.predicted_band} ({x.predicted_value})</div>
                <div style={{ color: '#5c6178' }}>{x.why_hard}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr .8fr', gap: 16, marginBottom: 16 }}>
        <div style={card}>
          <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 4 }}>Voice Engine DSP Validation</div>
          <div style={{ fontSize: 11, color: '#5c6178', marginBottom: 14 }}>{voiceEval?.disclaimer}</div>
          {voiceEval && (
            <>
              <div style={{ display: 'flex', gap: 20, marginBottom: 14, flexWrap: 'wrap' }}>
                <div><div style={{ font: '700 22px Sora,sans-serif', color: voiceEval.all_core_checks_passed ? 'oklch(0.72 0.15 145)' : 'oklch(0.62 0.21 25)' }}>{voiceEval.all_core_checks_passed ? 'PASS' : 'FAIL'}</div><div style={{ fontSize: 11, color: '#8b91a3' }}>All core checks</div></div>
                <div><div style={{ font: '700 22px Sora,sans-serif' }}>{voiceEval.pitch_accuracy.passed}/{voiceEval.pitch_accuracy.total}</div><div style={{ fontSize: 11, color: '#8b91a3' }}>Pitch accuracy (5% tolerance)</div></div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {voiceEval.pitch_accuracy.results.map((r) => (
                  <div key={r.id} style={{ display: 'flex', gap: 14, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,.05)', fontSize: 12 }}>
                    <div style={{ flex: 1, color: '#8b91a3' }}>{r.true_hz}Hz tone &rarr; detected {r.detected_hz}Hz ({r.error_pct}% error)</div>
                    <CheckBadge passed={r.passed} />
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 14, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,.05)', fontSize: 12 }}>
                  <div style={{ flex: 1, color: '#8b91a3' }}>Gain invariance (pitch unaffected by volume)</div>
                  <CheckBadge passed={voiceEval.gain_invariance.passed} />
                </div>
                <div style={{ display: 'flex', gap: 14, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,.05)', fontSize: 12 }}>
                  <div style={{ flex: 1, color: '#8b91a3' }}>Energy monotonicity (louder &rarr; higher dB)</div>
                  <CheckBadge passed={voiceEval.energy_monotonicity.passed} />
                </div>
                <div style={{ display: 'flex', gap: 14, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,.05)', fontSize: 12 }}>
                  <div style={{ flex: 1, color: '#8b91a3' }}>Pause detection ({voiceEval.pause_detection.detected_pause_count} of {voiceEval.pause_detection.expected_pause_count} known gaps found)</div>
                  <CheckBadge passed={voiceEval.pause_detection.passed} />
                </div>
                <div style={{ display: 'flex', gap: 14, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,.05)', fontSize: 12 }}>
                  <div style={{ flex: 1, color: '#8b91a3' }}>Tremor proportional to vibrato depth</div>
                  <CheckBadge passed={voiceEval.tremor_monotonicity.passed} />
                </div>
                <div style={{ display: 'flex', gap: 14, padding: '6px 0', fontSize: 12 }}>
                  <div style={{ flex: 1, color: '#8b91a3' }}>Stress score responds to tremor ({voiceEval.stress_score_responds_to_tremor.calm_stress_score} calm vs {voiceEval.stress_score_responds_to_tremor.shaky_stress_score} shaky)</div>
                  <CheckBadge passed={voiceEval.stress_score_responds_to_tremor.passed} />
                </div>
              </div>
            </>
          )}
        </div>

        <div style={card}>
          <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 4 }}>Voice Known Limitations</div>
          <div style={{ fontSize: 11, color: '#5c6178', marginBottom: 10 }}>Genuine DSP edge cases, documented rather than hidden.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {voiceEval?.known_limitations?.map((x) => (
              <div key={x.id} style={{ fontSize: 11.5, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,.05)' }}>
                <div style={{ color: '#5c6178' }}>{x.why_hard}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={card}>
        <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 4 }}>System Audit Activity</div>
        <div style={{ fontSize: 11, color: '#5c6178', marginBottom: 14 }}>Aggregate counts only &middot; raw audit entries are restricted to administrators</div>
        {auditSummary && (
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div><div style={{ font: '700 22px Sora,sans-serif' }}>{auditSummary.total}</div><div style={{ fontSize: 11, color: '#8b91a3' }}>Total logged actions</div></div>
            {auditSummary.byAction.map((a) => (
              <div key={a.action}><div style={{ font: '700 18px Sora,sans-serif', color: '#8b91a3' }}>{a.count}</div><div style={{ fontSize: 11, color: '#8b91a3' }}>{a.action}</div></div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
