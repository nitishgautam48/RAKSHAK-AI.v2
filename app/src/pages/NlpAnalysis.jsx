import { useAssessmentSelector } from '../lib/useAssessmentSelector';
import ComplaintSelector from '../components/ComplaintSelector';
import TranscriptSourceBadge from '../components/TranscriptSourceBadge';

const card = { background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 14, padding: 22 };

function scoreLevel(v) {
  if (v >= 75) return { label: 'Critical', color: 'oklch(0.62 0.21 25)', bg: 'oklch(0.62 0.21 25 / 0.12)' };
  if (v >= 55) return { label: 'High', color: 'oklch(0.7 0.17 55)', bg: 'oklch(0.7 0.17 55 / 0.12)' };
  if (v >= 30) return { label: 'Moderate', color: 'oklch(0.8 0.15 95)', bg: 'oklch(0.8 0.15 95 / 0.12)' };
  return { label: 'Low', color: 'oklch(0.72 0.15 145)', bg: 'oklch(0.72 0.15 145 / 0.12)' };
}

export default function NlpAnalysis() {
  const { complaints, selectedId, setSelectedId, complaint, assessment, engineOutputs, loading } = useAssessmentSelector();
  const nlp = engineOutputs.nlp;
  const voiceRecording = assessment?.voiceRecording;
  // What the AI engines actually scored - assessment.sourceText, NOT
  // complaint.narrative. For a voice-only complaint with real transcription
  // enabled, those are different texts (see task #119/#121): the complaint's
  // narrative field is just a placeholder, and the real spoken transcript is
  // what produced the scores shown on this page.
  const analyzedText = assessment?.sourceText ?? complaint?.narrative;

  const indicators = nlp ? [
    ['Trauma', nlp.traumaScore], ['Fear', nlp.fearScore], ['Threat', nlp.threatScore],
    ['Isolation', nlp.isolationScore], ['Hopelessness', nlp.hopelessnessScore], ['Vulnerability', nlp.vulnerabilityScore],
  ] : [];

  return (
    <div className="tsa-fade">
      <ComplaintSelector complaints={complaints} selectedId={selectedId} onChange={setSelectedId} />
      {loading && <div style={{ color: '#7d8399', fontSize: 13 }}>Loading…</div>}

      {!loading && complaint && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ font: '600 14px Sora,sans-serif' }}>Analyzed Text</div>
                {assessment && <TranscriptSourceBadge source={voiceRecording?.transcriptSrc} hasAudio={!!voiceRecording} />}
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: '#c4c8d4', background: 'rgba(255,255,255,.03)', borderRadius: 10, padding: 16 }}>{analyzedText}</div>
              {voiceRecording?.transcriptSrc && voiceRecording.transcriptSrc !== 'operator_transcript' && analyzedText !== complaint.narrative && (
                <div style={{ fontSize: 11, color: '#5c6178', marginTop: 8 }}>
                  This is the machine transcript of the submitted audio, not the complaint's typed narrative field.
                </div>
              )}
            </div>

            {nlp && (
              <div className="tsa-card-hover" style={card}>
                <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 4 }}>Matched Indicator Keywords</div>
                <div style={{ fontSize: 11, color: '#5c6178', marginBottom: 14 }}>English + 7 Indian languages lexicon scorer &middot; {nlp.wordCount} words analyzed</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 10px' }}>
                  {nlp.matchedKeywords.length === 0 && <div style={{ color: '#5c6178', fontSize: 12.5 }}>No indicator keywords matched in this narrative.</div>}
                  {nlp.matchedKeywords.map((kw) => {
                    const isNegated = kw.startsWith('(negated)');
                    return (
                      <div
                        key={kw}
                        style={{
                          padding: '4px 12px', borderRadius: 20, fontSize: 12.5,
                          background: isNegated ? 'rgba(255,255,255,.04)' : nlp.nativeReviewMatchedTerms?.includes(kw) ? 'oklch(0.75 0.15 55 / 0.15)' : 'rgba(255,255,255,.06)',
                          color: isNegated ? '#5c6178' : nlp.nativeReviewMatchedTerms?.includes(kw) ? 'oklch(0.78 0.15 55)' : '#eef0f6',
                          textDecoration: isNegated ? 'line-through' : 'none',
                        }}
                      >
                        {kw}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {nlp?.nativeReviewRecommended && (
              <div style={{ background: 'oklch(0.75 0.15 55 / 0.1)', border: '1px solid oklch(0.75 0.15 55 / 0.35)', borderRadius: 14, padding: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'oklch(0.78 0.15 55)', marginBottom: 4 }}>⚠ Unreviewed-Language Terms Matched</div>
                <div style={{ fontSize: 12.5, color: '#eef0f6' }}>
                  This score depended on lexicon terms ({nlp.nativeReviewMatchedTerms.join(', ')}) from a language that hasn't been
                  reviewed by a native or fluent speaker yet. Treat this read with extra scrutiny pending that review - it isn't
                  suppressed or discounted, just flagged.
                </div>
              </div>
            )}

            {nlp?.negationScopingApplied && (
              <div style={{ background: 'oklch(0.7 0.17 55 / 0.1)', border: '1px solid oklch(0.7 0.17 55 / 0.35)', borderRadius: 14, padding: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'oklch(0.78 0.15 55)', marginBottom: 4 }}>🚩 Negation Scoping Applied</div>
                <div style={{ fontSize: 12.5, color: '#eef0f6' }}>
                  {nlp.negationDiscountedTerms.join(', ')} matched but appeared inside a detected negation's scope (e.g. "did not threaten"), so
                  {' '}{nlp.negationDiscountedTerms.length === 1 ? 'it was' : 'they were'} heavily discounted rather than counted at full weight -
                  shown struck through above. Negation scoping is a heuristic, not certainty, so this case has been flagged for priority human
                  review in case it discounted something it shouldn't have.
                </div>
              </div>
            )}

            {nlp?.semanticUnderstanding && (
              <div style={{ background: 'oklch(0.65 0.14 200 / 0.08)', border: '1px solid oklch(0.65 0.14 200 / 0.25)', borderRadius: 14, padding: 16 }}>
                <div style={{ fontSize: 10.5, color: 'oklch(0.75 0.13 200)', fontWeight: 600, marginBottom: 6 }}>
                  Semantic Match (paraphrase detection, free/local - see AI Model Monitoring)
                </div>
                <div style={{ fontSize: 11.5, color: '#c4c8d4', lineHeight: 1.5 }}>
                  Closest reference match: <span style={{ color: '#eef0f6' }}>"{Object.values(nlp.semanticUnderstanding.topMatches).sort((a, b) => b.similarity - a.similarity)[0]?.phrase}"</span>
                  {' '}(similarity {Object.values(nlp.semanticUnderstanding.topMatches).sort((a, b) => b.similarity - a.similarity)[0]?.similarity})
                </div>
              </div>
            )}

            {nlp?.indicTranslation && (
              <div style={{ background: 'oklch(0.65 0.14 200 / 0.08)', border: '1px solid oklch(0.65 0.14 200 / 0.25)', borderRadius: 14, padding: 16 }}>
                <div style={{ fontSize: 10.5, color: 'oklch(0.75 0.13 200)', fontWeight: 600, marginBottom: 6 }}>
                  Indic Translation Bridge (source language outside the lexicon's 8-language coverage)
                </div>
                <div style={{ fontSize: 11.5, color: '#c4c8d4', lineHeight: 1.5 }}>
                  Detected source language: <span style={{ color: '#eef0f6' }}>{nlp.indicTranslation.sourceLanguage}</span> - translated to English
                  and re-scanned so a paraphrase match was still possible instead of the lexicon finding nothing.
                </div>
              </div>
            )}

            {nlp?.indicBertSemantic && (
              <div style={{ background: 'oklch(0.7 0.15 300 / 0.08)', border: '1px solid oklch(0.7 0.15 300 / 0.25)', borderRadius: 14, padding: 16 }}>
                <div style={{ fontSize: 10.5, color: 'oklch(0.75 0.15 300)', fontWeight: 600, marginBottom: 6 }}>
                  Native-Language Semantic Match (IndicBERT, experimental - not fine-tuned for sentence-similarity, see AI Model Monitoring)
                </div>
                <div style={{ fontSize: 11.5, color: '#c4c8d4', lineHeight: 1.5 }}>
                  Closest reference match: <span style={{ color: '#eef0f6' }}>"{Object.values(nlp.indicBertSemantic.topMatches).sort((a, b) => b.similarity - a.similarity)[0]?.phrase}"</span>
                  {' '}(similarity {Object.values(nlp.indicBertSemantic.topMatches).sort((a, b) => b.similarity - a.similarity)[0]?.similarity})
                </div>
              </div>
            )}

            {nlp?.suicidalIdeationFlag && (
              <div style={{ background: 'oklch(0.62 0.21 25 / 0.12)', border: '1px solid oklch(0.62 0.21 25 / 0.35)', borderRadius: 14, padding: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'oklch(0.75 0.18 25)', marginBottom: 4 }}>Suicidal Ideation Language Flagged</div>
                <div style={{ fontSize: 12.5, color: '#eef0f6' }}>The narrative matched language patterns associated with suicidal ideation. This requires immediate human review - it is a keyword flag, not a diagnosis.</div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {nlp ? (
              <div style={card}>
                <div style={{ font: '600 14px Sora,sans-serif', marginBottom: 4 }}>NLP Category Scores</div>
                <div style={{ fontSize: 11, color: '#5c6178', marginBottom: 14 }} title="Reflects how much text there was to analyze, not how certain the model is about the severity it computed">Narrative Length Confidence {nlp.confidence}%</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {indicators.map(([label, value]) => {
                    const lvl = scoreLevel(value);
                    return (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 9, background: lvl.bg }}>
                        <div style={{ fontSize: 13, color: '#eef0f6' }}>{label}</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: lvl.color }}>{lvl.label} ({Math.round(value)})</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div style={{ ...card, textAlign: 'center', color: '#7d8399' }}>No AI assessment has been run for this complaint yet.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
