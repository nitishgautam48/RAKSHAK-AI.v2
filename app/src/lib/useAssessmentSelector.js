import { useEffect, useState } from 'react';
import { api } from './api';

// Shared by every "assessment detail" page (Victim Assessment, Voice
// Analysis, NLP Analysis, Explainable AI): lets an officer pick a real
// complaint, then loads that complaint's most recent completed AI
// assessment in full (all sub-scores + explanation + raw engine outputs).
export function useAssessmentSelector() {
  const [complaints, setComplaints] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [complaint, setComplaint] = useState(null);
  const [assessment, setAssessment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/complaints?pageSize=50')
      .then((r) => {
        setComplaints(r.items);
        if (r.items[0]) setSelectedId(r.items[0].id);
        else setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    setError('');
    setAssessment(null);
    setComplaint(null);
    Promise.all([
      api.get(`/api/complaints/${selectedId}`).then(setComplaint),
      api.get(`/api/assessments?complaintId=${selectedId}`)
        .then((list) => (list.length ? api.get(`/api/assessments/${list[0].id}`).then(setAssessment) : null)),
    ])
      .catch(() => setError('Could not load assessment.'))
      .finally(() => setLoading(false));
  }, [selectedId]);

  // Convenience: parsed raw per-engine payloads (voice/nlp/emotion/svi),
  // as sent by the AI service, from AIModelOutput.rawJson.
  const engineOutputs = {};
  if (assessment?.aiOutputs) {
    for (const o of assessment.aiOutputs) {
      try { engineOutputs[o.engine] = JSON.parse(o.rawJson); } catch { /* ignore */ }
    }
  }

  const explanation = assessment?.explanations?.[0];
  const parsedExplanation = explanation ? {
    confidence: explanation.confidence,
    reasonCodes: JSON.parse(explanation.reasonCodesJson),
    features: JSON.parse(explanation.featuresJson),
    decisionPath: JSON.parse(explanation.decisionPathJson),
  } : null;

  return { complaints, selectedId, setSelectedId, complaint, assessment, engineOutputs, explanation: parsedExplanation, loading, error };
}
