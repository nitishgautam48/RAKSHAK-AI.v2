import type { PrismaClient, InterventionType, RiskLevel } from '@prisma/client';
import type { AssessResponse } from './ai.service.js';

export interface PersistAssessmentInput {
  victimId: string;
  complaintId?: string;
  caseId?: string;
  narrative: string;
  actorId: string | null; // null for system/seed-generated or emergency-token-originated assessments
}

// Shared by the live /api/assessments route and the seed script, so seeded
// demo data is produced by the exact same real AI pipeline + persistence
// path a live assessment goes through - seeded dashboards show genuinely
// computed scores, not hand-authored numbers.
export async function persistAssessment(prisma: PrismaClient, input: PersistAssessmentInput, ai: AssessResponse) {
  return prisma.$transaction(async (tx) => {
    const created = await tx.assessment.create({
      data: {
        victimId: input.victimId,
        complaintId: input.complaintId,
        caseId: input.caseId,
        sourceText: input.narrative,
        status: 'completed',
      },
    });

    if (ai.voice) {
      await tx.voiceRecording.create({
        data: {
          assessmentId: created.id,
          storageKey: `inline:${created.id}`,
          languageCode: ai.transcript.language_detected,
          transcript: ai.transcript.transcript,
          transcriptSrc: ai.transcript.source,
        },
      });
    }

    await tx.emotionScore.create({
      data: {
        assessmentId: created.id,
        fear: ai.emotion.fear,
        anxiety: ai.emotion.anxiety,
        distress: ai.emotion.distress,
        sadness: ai.emotion.sadness,
        anger: ai.emotion.anger,
        hope: ai.emotion.hope,
        neutral: ai.emotion.neutral,
        dominantEmotion: ai.emotion.dominant_emotion,
        severityIndex: ai.emotion.severity_index,
      },
    });
    await tx.traumaScore.create({ data: { assessmentId: created.id, score: ai.nlp.traumaScore, confidence: ai.nlp.confidence } });
    await tx.fearScore.create({ data: { assessmentId: created.id, score: ai.nlp.fearScore, confidence: ai.nlp.confidence } });
    await tx.stressScore.create({
      data: {
        assessmentId: created.id,
        score: ai.svi.value,
        confidence: ai.svi.confidence,
        voiceStress: ai.voice?.voiceStressScore,
      },
    });
    await tx.isolationScore.create({ data: { assessmentId: created.id, score: ai.nlp.isolationScore, confidence: ai.nlp.confidence } });
    await tx.threatIndicator.create({
      data: {
        assessmentId: created.id,
        score: ai.nlp.threatScore,
        retaliationRisk: ai.svi.escalationProbability,
        keywordsJson: JSON.stringify(ai.nlp.matchedKeywords),
      },
    });
    await tx.riskScore.create({
      data: {
        assessmentId: created.id,
        level: ai.svi.band as RiskLevel,
        score: ai.svi.value,
        escalationProbability: ai.svi.escalationProbability,
      },
    });
    await tx.sVIScore.create({
      data: {
        assessmentId: created.id,
        value: ai.svi.value,
        band: ai.svi.band as RiskLevel,
        modelVersion: ai.svi.modelVersion,
      },
    });

    for (const engine of ['voice', 'nlp', 'emotion', 'svi'] as const) {
      const payload = ai[engine];
      if (!payload) continue;
      await tx.aIModelOutput.create({
        data: {
          assessmentId: created.id,
          engine,
          modelVersion: ai.modelVersions[engine] ?? 'unknown',
          rawJson: JSON.stringify(payload),
          latencyMs: ai.latencyMs,
        },
      });
    }

    await tx.aIExplanation.create({
      data: {
        assessmentId: created.id,
        confidence: ai.explanation.confidence,
        reasonCodesJson: JSON.stringify(ai.explanation.reasonCodes),
        featuresJson: JSON.stringify(ai.explanation.features),
        decisionPathJson: JSON.stringify(ai.explanation.decisionPath),
      },
    });

    for (const rec of ai.recommendations) {
      await tx.recommendation.create({
        data: {
          assessmentId: created.id,
          type: rec.type as InterventionType,
          priority: rec.priority,
          rationale: rec.rationale,
          confidence: rec.confidence,
        },
      });
    }

    if (input.complaintId) {
      await tx.complaint.update({ where: { id: input.complaintId }, data: { riskLevel: ai.svi.band as RiskLevel } });
    }
    let caseRecord = null;
    if (input.caseId) {
      caseRecord = await tx.case.update({ where: { id: input.caseId }, data: { riskLevel: ai.svi.band as RiskLevel } });
      await tx.caseTimeline.create({
        data: {
          caseId: input.caseId,
          actorId: input.actorId,
          eventType: 'ai_assessment',
          summary: `AI assessment completed: SVI ${ai.svi.value} (${ai.svi.band}).`,
          metaJson: JSON.stringify({ assessmentId: created.id, sviValue: ai.svi.value, band: ai.svi.band }),
        },
      });
    }

    return { ...created, caseRecord };
  });
}
