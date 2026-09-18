import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/error.js';
import { RETENTION_DAYS } from '../services/retention.service.js';

export const assistantRouter = Router();
assistantRouter.use(requireAuth);

// This is a deterministic, rule-based staff assistant: it pattern-matches the
// question against known intents and answers from real live data or fixed
// procedural knowledge. It is NOT a generative language model - it cannot
// answer arbitrary questions, and every intent below is honestly labelled.
type Intent = {
  test: RegExp;
  handle: () => Promise<string> | string;
};

const intents: Intent[] = [
  {
    test: /\bcritical\b.*\bcase/i,
    handle: async () => {
      const n = await prisma.case.count({ where: { riskLevel: 'CRITICAL', status: { not: 'CLOSED' } } });
      return `There are currently ${n} open case(s) at CRITICAL risk level.`;
    },
  },
  {
    test: /\b(open|active)\b.*\bsos\b|\bsos\b.*\balert/i,
    handle: async () => {
      const n = await prisma.sOSRequest.count({ where: { status: { not: 'RESOLVED' } } });
      return `There are ${n} unresolved SOS alert(s) right now.`;
    },
  },
  {
    test: /\bhow many\b.*\bcomplaint/i,
    handle: async () => {
      const n = await prisma.complaint.count();
      return `${n} complaint(s) are registered in the system in total.`;
    },
  },
  {
    test: /\baverage\b.*\bsvi\b|\bsvi\b.*\baverage/i,
    handle: async () => {
      const agg = await prisma.sVIScore.aggregate({ _avg: { value: true } });
      const v = Math.round((agg._avg.value ?? 0) * 10) / 10;
      return `The average Survivor Vulnerability Index (SVI) across all scored assessments is ${v}.`;
    },
  },
  {
    test: /\bwhat is\b.*\bsvi\b|\bsvi\b.*\bmean/i,
    handle: () =>
      'SVI (Survivor Vulnerability Index) is a 0-100 score computed by a documented, linear-weighted formula over fear, trauma, hopelessness, anxiety, voice stress, isolation, threat, and prior-escalation signals. It is a decision-support score, not a diagnosis - every SVI score has a full feature-by-feature breakdown in the Explainable AI Center.',
  },
  {
    test: /\bescalat/i,
    handle: () =>
      'Standard escalation workflow: 1) Complaint registered, 2) AI assessment run, 3) Case assigned to a District Officer, 4) High/Critical cases flagged for the protection unit, 5) Intervention created from an AI recommendation, 6) Case tracked to closure. You can trigger an SOS directly from the Intervention Command Center for anything needing an immediate response.',
  },
  {
    test: /\bhelpline\b|\bphone number\b|\bcall\b/i,
    handle: () => 'The National Helpline Against Atrocities is 14566, available for SC/ST victims nationwide.',
  },
  {
    test: /\bconsent\b/i,
    handle: async () => {
      const total = await prisma.victim.count();
      const granted = await prisma.consentRecord.count({ where: { scope: 'ai_assessment', granted: true } });
      return `${granted} of ${total} registered victims have granted consent for AI assessment processing. Consent is enforced at the API layer - assessments cannot run without it.`;
    },
  },
  {
    test: /\bretention\b|\bhow long\b.*\bdata\b/i,
    handle: () =>
      `Data retention periods: audit logs ${RETENTION_DAYS.auditLogs} days, voice transcripts ${RETENTION_DAYS.voiceTranscripts} days, closed complaints ${RETENTION_DAYS.closedComplaints} days. An automated sweep purges records past their window.`,
  },
  {
    test: /\brecommend/i,
    handle: async () => {
      const n = await prisma.recommendation.count();
      return `${n} AI recommendation(s) have been generated so far. Each maps a victim's risk profile to a prioritised intervention type (counselling, legal aid, shelter, police protection, etc.) with a stated rationale and confidence score - see the AI Recommendations page.`;
    },
  },
  {
    test: /\bmodel\b.*\b(accuracy|version|status)\b|\bwhich model/i,
    handle: () =>
      'All scoring engines (NLP, Voice, SVI) are rule-based or signal-processing systems with documented, versioned logic - not opaque trained models. Current versions and evaluation results are on the AI Model Monitoring page.',
  },
];

const FALLBACK =
  "I can only answer questions that match a known intent - I am a deterministic, rule-based assistant, not a generative AI model. Try asking about: critical cases, open SOS alerts, total complaints, average SVI, what SVI means, the escalation process, the helpline number, consent status, data retention, AI recommendations, or model status.";

const querySchema = z.object({ message: z.string().min(1).max(500) });

assistantRouter.post('/query', asyncHandler(async (req, res) => {
  const { message } = querySchema.parse(req.body);
  const intent = intents.find((i) => i.test.test(message));
  const reply = intent ? await intent.handle() : FALLBACK;
  res.json({ reply, matched: Boolean(intent) });
}));

// Same deterministic, rule-based design as above, but for survivors: every
// intent here is scoped to the caller's OWN victim record (from the JWT,
// never a client-supplied id) and answers about their own case, not
// system-wide statistics.
type CompanionIntent = {
  test: RegExp;
  handle: (victimId: string) => Promise<string> | string;
};

const companionIntents: CompanionIntent[] = [
  {
    test: /\b(case|complaint)\b.*\bstatus\b|\bwhat.*happening\b|\bwhat.*next\b/i,
    handle: async (victimId) => {
      const kase = await prisma.case.findFirst({ where: { victimId }, orderBy: { openedAt: 'desc' } });
      if (!kase) return "You haven't filed a complaint yet, or it hasn't been opened as a case. You can file one from the File a Complaint tab whenever you're ready.";
      return `Your case ${kase.caseNumber} is currently: ${kase.status.replace(/_/g, ' ').toLowerCase()}. You can see the full timeline in the Case Timeline tab.`;
    },
  },
  {
    test: /\b(next|upcoming)\b.*\bsessions?\b|\bcounsellors?\b|\bappointments?\b/i,
    handle: async (victimId) => {
      const session = await prisma.counsellingSession.findFirst({
        where: { victimId, status: 'scheduled', scheduledAt: { gte: new Date() } },
        orderBy: { scheduledAt: 'asc' },
        include: { counsellor: { select: { fullName: true } } },
      });
      if (!session) return 'You have no upcoming counselling session scheduled yet. Check the Counselling Center tab, or your counsellor will reach out once one is arranged.';
      return `Your next session is on ${session.scheduledAt.toLocaleString()} with ${session.counsellor.fullName} (${session.mode.replace('_', ' ')}). See the Counselling Center tab to join.`;
    },
  },
  {
    test: /\brights?\b/i,
    handle: () =>
      'You have the right to: free legal aid, protection from intimidation or retaliation, compensation under the SC/ST (Prevention of Atrocities) Act, and to be kept informed of every step in your case. See the Legal Aid tab for details specific to your case.',
  },
  {
    test: /\blegal\b|\blawyers?\b|\bcompensation\b/i,
    handle: async (victimId) => {
      const kase = await prisma.case.findFirst({ where: { victimId }, include: { legalAid: true } });
      if (kase?.legalAid && kase.legalAid.length > 0) return 'You have a legal aid record on file - see the Legal Aid tab for your representative, court case, and compensation status.';
      return 'Legal aid becomes available once your case is opened. You can see it in the Legal Aid tab as soon as it is assigned.';
    },
  },
  {
    test: /\bhelpline\b|\bphone number\b|\bcall\b/i,
    handle: () => 'The National Helpline Against Atrocities is 14566, available nationwide. If you are in immediate danger, use the Emergency tab to send an SOS right now.',
  },
  {
    test: /\b(not safe|unsafe|danger|emergency|help me now)\b/i,
    handle: () => 'Your safety matters most right now. Please go to the Emergency tab and send an SOS - it alerts responders immediately with your location if you share it. You are not alone.',
  },
  {
    test: /\bemotional support\b|\bscared\b|\bafraid\b|\bfeeling\b|\bstruggling\b|\banxious\b/i,
    handle: async (victimId) => {
      const session = await prisma.counsellingSession.findFirst({
        where: { victimId, status: 'scheduled', scheduledAt: { gte: new Date() } },
        orderBy: { scheduledAt: 'asc' },
      });
      if (session) return `It's completely understandable to feel this way. You have a counselling session already scheduled on ${session.scheduledAt.toLocaleDateString()} - your counsellor is there for exactly this. If you need to talk sooner, the Counselling Center tab has wellness resources too.`;
      return "It's completely understandable to feel this way. You don't yet have a counselling session scheduled - check the Counselling Center tab, or file a complaint if you haven't so a counsellor can be assigned to you.";
    },
  },
  {
    test: /\bdocuments?\b|\bupload|\bevidence\b/i,
    handle: () => 'You can upload documents or photos from the File a Complaint tab, and see everything you have on file in the My Documents tab.',
  },
];

const COMPANION_FALLBACK =
  "I can only help with a fixed set of topics - I am a deterministic, rule-based assistant, not a generative AI model. Try asking about: your case status, your next counselling session, your rights, legal aid, the helpline number, or how to upload a document.";

assistantRouter.post('/companion', asyncHandler(async (req, res) => {
  if (!req.user?.victimId) throw new ApiError(403, 'not_a_survivor', 'This assistant is for survivor accounts only.');
  const { message } = querySchema.parse(req.body);
  const intent = companionIntents.find((i) => i.test.test(message));
  const reply = intent ? await intent.handle(req.user.victimId) : COMPANION_FALLBACK;
  res.json({ reply, matched: Boolean(intent) });
}));
