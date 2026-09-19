# Load & Concurrency Test Findings (Task #124)

Date: 2026-09-19
Method: [`autocannon`](https://github.com/mcollina/autocannon) against the live running `ai-service` (port 8000) and `server` (port 4000), on a 4-core sandbox machine. Goal: find real bottlenecks in the assess pipeline and priority queue *before* any database migration work, per explicit instruction to defer the DB migration itself.

All numbers below are from this sandbox's hardware and are meant to show *relative* bottlenecks and failure shapes, not absolute production capacity - a bigger machine moves the numbers but not which component breaks first.

## Summary: three real findings, ranked by severity

### 1. SQLite write-transaction contention causes a hard cliff, not graceful slowdown (most severe)

`POST /api/assessments` wraps ~13 sequential `Prisma` creates in one interactive `$transaction` (`assessment.service.ts`). Under SQLite's single-writer model, concurrent transactions queue for the write lock.

| Concurrency | Result |
|---|---|
| 3 concurrent writers | 52 req/sec, p50 43ms, p99 346ms, **0 errors** |
| 6 concurrent writers | 0.6 req/sec, p50/p99 ~5050ms, **~92% requests failed** (`Socket timeout` / `Transaction already closed`) |

There is no gradual degradation between these two points - it is a cliff. Once queued transactions exceed Prisma's default 5-second interactive-transaction timeout, they fail outright, and the failure cascades (a later query lands on an already-expired transaction). **6 people submitting assessments at the same moment - not "national scale," just a handful of District Officers reviewing cases together - would start seeing failed submissions.**

This is exactly the class of problem a real database migration (Postgres, which handles concurrent writers far better than SQLite, plus connection pooling) is meant to fix - this test doesn't recommend doing that now, just confirms *why* it will matter and gives a concrete before/after number to check against once it happens. In the meantime, the transaction does more sequential work than it needs to (13 awaited creates in series); splitting it into the minimal-required transactional core plus non-critical writes done outside the transaction would raise the failure threshold without touching the database engine itself, if that's ever wanted as an interim step.

### 2. Voice-stress DSP (Whisper aside) serializes almost entirely - the real per-request cost is ~1.5-3+ seconds under any concurrency

Testing `/v1/assess` with real (synthesized) audio directly against the AI service:

| Concurrency | Result |
|---|---|
| 1 (single request) | ~0.3-0.5s (not separately isolated, but consistent with the below) |
| 5 concurrent | 2.9 req/sec, p50 **1617ms**, p99 2035ms |
| 10 concurrent | 2.6 req/sec, p50 **3224ms**, p99 3943ms |

Throughput does not improve with concurrency (stays ~3 req/sec) while latency roughly doubles - the signature of CPU-bound work (librosa pitch tracking + praat jitter/shimmer/HNR) serializing on a single `uvicorn` process with no `--workers` flag set, compounded by Python's GIL limiting true parallelism across threads for numpy-heavy code even before hitting the 4 available cores. Compare: the same pipeline with **no** audio (pure NLP/SVI/emotion, no DSP) handles 315 req/sec at the same concurrency with p50 30ms - voice DSP is not a marginal cost, it *is* the cost.

At real national scale, any burst of voice complaints arriving together would queue behind each other single-file, each taking multiple seconds, regardless of how many CPU cores the box actually has - because nothing today spreads that work across processes or a worker pool.

### 3. The general API rate limiter (300 req/min per IP) is a *third*, unrelated ceiling

`generalLimiter` (`server/src/middleware/rateLimit.ts`) applies globally, keyed by source IP, at 300 requests/minute (5 req/sec sustained). This is a reasonable default against abuse from a single unknown client, but at real deployment scale it will bite unrelated to any of the above: **any district office where multiple staff share a NAT'd office IP, or a dashboard auto-refreshing the priority queue for several logged-in staff at once, will collectively hit this ceiling** long before the SQLite or DSP limits above are ever reached, because it's counted per-IP rather than per-authenticated-user. This was discovered by accident (the first load-test run returned 27,422 HTTP 429s and 298 successes) rather than by design - worth flagging since it's an easy one to miss until a real multi-officer office trips it in production.

## What this test did *not* touch

- **The database itself was not migrated or reconfigured** - per instruction, that work stays deferred. This report exists to make that future migration's justification concrete, not to start it.
- **The rate limiter's live value was temporarily raised to 1,000,000 during testing** (to measure the SQLite/DSP layers independently of it) and **reverted immediately after** - `git diff` was checked clean before moving on. No env/config change from this task was left in place.
- Real Whisper transcription wasn't part of any of these numbers (still blocked by this sandbox's egress policy, per task #119) - the audio-bearing tests measure DSP cost only, with `STT_PROVIDER` at its default.

## Suggested order if/when this gets addressed

1. Voice DSP concurrency (#2) is the cheapest fix relative to impact: run `uvicorn` with multiple workers, or move DSP analysis to a process pool, before touching the database at all.
2. Rate limiter scope (#3) is a one-line, low-risk fix (key by authenticated user ID when available, falling back to IP for unauthenticated requests) - worth doing independently of anything else here.
3. SQLite write contention (#1) is the deepest issue and the one that actually requires the deferred database migration to fully resolve; splitting the transaction (see above) is a real but partial mitigation available before that.
