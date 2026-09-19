# TraumaSense AI — local setup

Three services, run in three terminals, in this order. This zip ships with a fully migrated + seeded
SQLite database (`server/prisma/data/traumasense.db`) and working `.env` files (dev-only placeholder
secrets, safe to use as-is for local testing) — you can be logged in and clicking around within a few
minutes.

## 1. AI microservice (Python, FastAPI) — port 8000

```bash
cd ai-service
uv sync              # installs deps incl. librosa + praat-parselmouth + faster-whisper (~1-2 min)
uv run uvicorn app.main:app --reload --port 8000
```

No `uv`? `pip install -e .` inside a Python 3.11+ venv works too (see `pyproject.toml`).

Health check: `curl http://localhost:8000/health`

Real speech-to-text (Whisper) is off by default (`STT_PROVIDER=operator_transcript` in `.env`) — flip it
to `STT_PROVIDER=whisper_local` with `WHISPER_MODEL_PATH=small` to turn it on; `faster-whisper` will
download and cache the model automatically the first time it runs (needs real internet access — see the
comment in `.env` for why this can't be exercised in every environment).

## 2. Node backend (Express + Prisma + SQLite) — port 4000

```bash
cd server
npm install
npm run prisma:generate
npm run dev                 # tsx watch src/index.ts
```

The included database already has realistic seeded demo data (states/districts, victims, complaints,
cases, government staff accounts). If you want a completely fresh database instead:

```bash
npm run prisma:migrate      # prisma migrate dev - recreates the schema
npm run db:seed             # repopulates it with the same seed data
```

**Demo login (government side):** `admin@dsje.gov.in` / `Password123!` — see `server/prisma/seed.ts`
for every other seeded account (counsellors, police officers, district officers, etc.), all using the
same password.

## 3. Frontend (React + Vite) — port 5173/5183

```bash
cd app
npm install
npm run dev
```

Open the URL Vite prints (defaults to http://localhost:5173). It talks to the Node backend on :4000;
Node proxies AI calls to the AI microservice server-side, so the frontend never talks to it directly.

## Notes

- The AI microservice is stateless - no DB of its own. The Node server is the only service with a
  database.
- `ai-service/tests/` (`uv run pytest`, 55 tests) and `server/src/__tests__/` (`npm test`, 32 tests)
  are both real, meaningful test suites - worth running after setup to confirm everything's wired
  correctly.
- `LOAD_TEST_FINDINGS.md` at the repo root documents real concurrency limits found by load-testing this
  exact codebase (SQLite write contention, voice-DSP throughput, API rate limiting) - useful reading
  before pushing this anywhere beyond local testing.
- Deferred/not yet implemented: Postgres migration, WhatsApp Business Platform integration, SMS gateway,
  and Bhashini (multilingual ASR) integration - all deliberately parked, not partially-built.
