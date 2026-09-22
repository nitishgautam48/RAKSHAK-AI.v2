import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAssessmentListWhere } from '../routes/assessments.routes.js';

// Regression test for a real bug: GET /api/assessments?complaintId=X
// silently ignored complaintId (only victimId/caseId were ever read into
// the Prisma `where` clause), so it returned every assessment in the
// database - Prisma's findMany with an empty `where: {}` object applies no
// filter at all. Combined with `orderBy: { createdAt: 'desc' }`, callers
// taking list[0] as "the most recent assessment for this complaint" (see
// app/src/lib/useAssessmentSelector.js, used by Victim Assessment, Voice
// Analysis, NLP Analysis, and Explainable AI Center) actually got the
// single most-recently-created assessment SYSTEM-WIDE - a completely
// unrelated complaint's result, indistinguishable from "the score never
// changes no matter what I submit."

test('complaintId alone produces a where clause scoped to that complaint', () => {
  const where = buildAssessmentListWhere({ complaintId: 'complaint-123' });
  assert.deepEqual(where, { complaintId: 'complaint-123' });
});

test('an unrecognized/nonexistent complaintId still produces a real filter, not an empty one', () => {
  // This is the exact shape of the bug: the where clause must never come
  // back as {} just because the id doesn't match anything - an empty where
  // clause matches every row.
  const where = buildAssessmentListWhere({ complaintId: 'no-such-complaint-xyz' });
  assert.notDeepEqual(where, {});
  assert.equal(where.complaintId, 'no-such-complaint-xyz');
});

test('victimId, caseId, and complaintId can all combine (AND semantics)', () => {
  const where = buildAssessmentListWhere({ victimId: 'v1', caseId: 'c1', complaintId: 'cp1' });
  assert.deepEqual(where, { victimId: 'v1', caseId: 'c1', complaintId: 'cp1' });
});

test('no params at all produces an empty where clause (the intentional "list everything" case)', () => {
  const where = buildAssessmentListWhere({});
  assert.deepEqual(where, {});
});

test('omitted params are not included as undefined keys', () => {
  // A Prisma where clause with an explicit `{ complaintId: undefined }` key
  // behaves the same as omitting it, but asserting the key is truly absent
  // (not just undefined) keeps this test tightly coupled to the real bug
  // shape rather than passing by accident.
  const where = buildAssessmentListWhere({ complaintId: 'cp1' });
  assert.equal('victimId' in where, false);
  assert.equal('caseId' in where, false);
});
