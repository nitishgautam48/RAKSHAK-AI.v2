import { env } from '../config/env.js';
import { ApiError } from '../middleware/error.js';

export interface AssessRequest {
  narrative: string;
  languageHint?: string;
  priorEscalations?: number;
  audioBase64?: string;
}

export interface AssessResponse {
  modelVersions: Record<string, string>;
  transcript: { transcript: string; language_detected: string; confidence: number; source: string };
  // Distinct from transcript.source and voice: audio can be received and
  // yet neither transcribed by a real STT provider nor DSP-analyzed
  // (corrupt/unsupported audio, or STT not configured) - without this,
  // that state is indistinguishable from "no audio was ever submitted."
  audioReceived: boolean;
  voice: {
    speakingSpeedWpm: number | null;
    pauseFrequency: string;
    confidenceScore: number;
    voiceStress: string;
    voiceStressScore: number;
    speechTremor: string;
    fearIndicatorCount: number;
    jitterLocal: number;
    shimmerLocal: number;
    hnrDb: number;
    pitchContour: number[];
    energyContour: number[];
  } | null;
  nlp: {
    traumaScore: number;
    fearScore: number;
    isolationScore: number;
    threatScore: number;
    hopelessnessScore: number;
    vulnerabilityScore: number;
    casteTargetingScore: number;
    confidence: number;
    matchedKeywords: string[];
    suicidalIdeationFlag: boolean;
    wordCount: number;
    authorityContextDetected: boolean;
    victimTestimonyDetected: boolean;
    nativeReviewRecommended: boolean;
    nativeReviewMatchedTerms: string[];
    negationScopingApplied: boolean;
    negationDiscountedTerms: string[];
    llmUnderstanding: { model: string; rationale: string; scores: Record<string, number>; injectionSuspected: boolean } | null;
    semanticUnderstanding: {
      model: string;
      scores: Record<string, number>;
      suicidalIdeationSimilarity: number;
      topMatches: Record<string, { phrase: string; similarity: number }>;
    } | null;
    indicTranslation: { model: string; sourceLanguage: string; translatedText: string } | null;
    indicBertSemantic: {
      model: string;
      scores: Record<string, number>;
      suicidalIdeationSimilarity: number;
      topMatches: Record<string, { phrase: string; similarity: number }>;
    } | null;
  };
  emotion: {
    fear: number; anxiety: number; distress: number; sadness: number; anger: number; hope: number; neutral: number;
    dominant_emotion: string; severity_index: number;
  };
  crisisTriage: {
    level: string;
    score: number;
    emotionalDistressScore: number;
    suicidalIdeationFlag: boolean;
    threatScore: number;
    severeSignals: string[];
    elevatedSignals: string[];
    reasons: string[];
    modelVersion: string;
  };
  svi: {
    value: number; band: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL'; confidence: number; modelVersion: string;
    escalationProbability: number;
    contributions: { label: string; raw_value: number; weight: number; contribution_pct: number; direction: string }[];
    requiresPriorityReview: boolean;
  };
  recommendations: { type: string; priority: number; confidence: number; rationale: string }[];
  explanation: { confidence: number; reasonCodes: string[]; features: unknown[]; decisionPath: string[] };
  latencyMs: number;
}

export async function runAssessment(req: AssessRequest): Promise<AssessResponse> {
  const res = await fetch(`${env.aiServiceUrl}/v1/assess`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Service-Key': env.aiServiceKey },
    body: JSON.stringify({
      narrative: req.narrative,
      language_hint: req.languageHint,
      prior_escalations: req.priorEscalations ?? 0,
      audio_base64: req.audioBase64,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(502, 'ai_service_error', `AI service returned ${res.status}: ${text}`);
  }
  return (await res.json()) as AssessResponse;
}

// Thin proxy for the AI service's MLOps endpoints - the frontend never
// calls ai-service directly (it has no auth of its own beyond the shared
// service key), so Node re-exposes these under /api for the AI Model
// Monitoring page.
async function getMlops(path: string): Promise<unknown> {
  const res = await fetch(`${env.aiServiceUrl}${path}`, { headers: { 'X-Service-Key': env.aiServiceKey } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(502, 'ai_service_error', `AI service returned ${res.status}: ${text}`);
  }
  return res.json();
}

export const getMlopsRegistry = () => getMlops('/v1/mlops/registry');
export const getMlopsEval = () => getMlops('/v1/mlops/eval');
export const getMlopsVoiceEval = () => getMlops('/v1/mlops/voice-eval');
export const getMlopsDrift = () => getMlops('/v1/mlops/drift');
export const getMlopsDegradation = () => getMlops('/v1/mlops/degradation');
