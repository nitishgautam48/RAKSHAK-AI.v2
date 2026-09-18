# TraumaSense AI

An AI-assisted trauma detection and case-management platform built for India's
National Helpline Against Atrocities (14566), serving SC/ST victims of
caste-based violence. It gives government officers (helpline operators,
police, district officers, counsellors, legal officers, administrators) a
command platform, and gives survivors a mobile-first portal for their own
case, counselling and legal aid — both reading and writing the same shared
database in real time.

> The original Claude Design handoff notes (`chats/`, `project/`) are kept
> for history; this README describes the system as actually built.

## Architecture

```
                    ┌─────────────────────┐
  Government   ───▶ │                     │
  Platform (app/)    │   server/           │ ───▶ SQLite (Prisma)
                     │   Node + Express    │
  Survivor     ───▶ │   + Socket.IO       │ ───▶ ai-service/
  Portal (app/)      │   (owns all data)   │      FastAPI, stateless
                    └─────────────────────┘      AI compute
```

- **`app/`** — React + Vite frontend. One codebase serves both the
  Government Platform and the Survivor Portal, gated by login.
- **`server/`** — Node.js + Express + TypeScript + Prisma + SQLite. Owns
  every table, all auth/RBAC, REST APIs, Socket.IO real-time sync, file
  storage, encryption, audit logging, consent and retention.
- **`ai-service/`** — Python + FastAPI. Stateless AI compute only (voice
  DSP, NLP/SVI/recommendation/explainability engines). Called by `server/`
  over HTTP with a shared secret; never touches the database directly.

Government officers and survivors are both real, authenticated users of the
same backend. When an officer updates a case, every subscribed client
(including that survivor's portal session) gets the update over Socket.IO
without a page refresh — and vice versa for anything a survivor is allowed
to trigger (e.g. an SOS).

## Running locally

Three services, three terminals:

```bash
# 1. AI microservice
cd ai-service
uv sync
uv run uvicorn app.main:app --port 8000

# 2. Backend
cd server
npm install
npx prisma migrate deploy   # or: npx prisma db push
npx tsx prisma/seed.ts       # optional: national-scale demo data
npm run dev                  # http://localhost:4000

# 3. Frontend
cd app
npm install
npm run dev                  # http://localhost:5173
```

Copy each service's `.env.example` to `.env` first. Seeded government login:
`admin@dsje.gov.in` / `Password123!` (see `server/prisma/seed.ts` for the
full roster — one account per role).

## Running with Docker

```bash
cp server/.env.example server/.env        # edit secrets
cp ai-service/.env.example ai-service/.env
docker compose up --build
```

Brings up `ai-service` (:8000), `server` (:4000), and `app` (:8080, nginx).

## Database: SQLite now, PostgreSQL-ready

`server/prisma/schema.prisma` uses only types and relations that exist
identically in PostgreSQL. Migrating is a two-line change:

```prisma
datasource db {
  provider = "postgresql"   // was "sqlite"
  url      = env("DATABASE_URL")
}
```

...plus a `DATABASE_URL` pointing at a real Postgres instance and
`prisma migrate deploy`. No model, route or service code changes.

## Testing

```bash
cd server && npm test        # node:test - encryption, code generators
cd ai-service && uv run pytest   # engine correctness (monotonicity, bounds, keyword traceability)
```

## What's real, what's honestly not

This was built end-to-end and verified live in a browser (auth →
complaint → real AI assessment → case update → real-time sync to the
survivor portal → SOS → real-time sync back to the government dashboard).
Some things are deliberately **not** faked, with the reasoning below.

**AI engines — real computation, not a trained clinical model.** There is
no ethically-sourced, labeled dataset of SC/ST atrocity victims' voice/text
with ground-truth trauma scores (building one needs clinical partnerships,
informed consent and IRB review, not code), and the environment this was
built in blocks every model-weight host (huggingface.co, Whisper's CDN,
OpenAI/AssemblyAI APIs — all return a 403 org-policy-denied). So instead of
faking a "trained model":
- **Voice Analysis** (`ai-service/app/engines/voice_engine.py`) runs real
  DSP — autocorrelation pitch tracking, RMS energy, silence-interval
  detection — over actual uploaded audio bytes. No model weights needed.
- **NLP Trauma Engine** (`nlp_engine.py`) is a transparent, weighted
  English+Hindi keyword lexicon with documented scoring math, not a black
  box. Its regression-test set passes 100% (`ai-service/app/mlops/evaluation.py`).
- **SVI/Recommendation/Explainability** are documented linear formulas
  (`svi_engine.py`'s `WEIGHTS`), so the "feature contribution" breakdown
  shown in the UI is an *exact* decomposition of the real number, not a
  SHAP approximation of a hidden model.
- **Speech-to-text** defaults to the transcript a helpline operator or
  survivor types (`speech_engine.py`'s `OperatorTranscriptProvider`) — how
  real 14566-style helplines already work — with a real, working
  `LocalWhisperProvider` ready to activate the moment model weights are
  reachable (`WHISPER_MODEL_PATH`).

**MLOps** (`ai-service/app/mlops/`) is a real, working scaffold — model/
dataset registry with versioning, an evaluation harness, drift detection
over actual logged scores — built to be pointed at trained checkpoints
later without an architecture change, not dressed-up static text.

**Fully wired to the live backend:** authentication (all 4 government +
4 survivor flows), Dashboard Overview, Complaints, Real-Time Assessment
(the actual AI pipeline), Emergency Center / SOS, Survivor Dashboard,
Survivor Legal Aid, Survivor Emergency SOS.

**Not yet wired** (still render illustrative/static data, clearly marked
in the UI where practical): Voice/NLP detail pages, Risk Intelligence
trend charts, Executive Dashboard charts beyond KPIs, Geographic
Intelligence map, Counsellor Workspace, Victim Journey Timeline, AI Model
Monitoring, Reports & Analytics, Privacy & Ethics Center, AI Support
Assistant, Channel Monitoring, Intervention Command Center, Settings. The
REST APIs these would need already exist (documents, legal aid,
counselling, GIS, analytics) — this is frontend wiring work, not backend
work.

**Video Intelligence Engine, SMS/WhatsApp/Email delivery**: interfaces are
defined (`notify()`'s channel adapters, the `VideoRecording` schema, the
Socket.IO video-signaling relay in `counselling.routes.ts`) but the actual
providers (Twilio/MSG91, WhatsApp Business API, MediaPipe/OpenFace) need
credentials or model access this environment doesn't have. The dev
notification adapter logs to the server console instead of sending.
