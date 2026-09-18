# TraumaSense AI — local setup

Three services, run in three terminals, in this order.

## 1. AI microservice (Python, FastAPI) — port 8000

```bash
cd ai-service
uv sync              # installs deps incl. librosa + praat-parselmouth (pulls numba/llvmlite, ~1-2 min)
uv run uvicorn app.main:app --reload --port 8000
```

No `uv`? `pip install -e .` inside a Python 3.11+ venv works too (see `pyproject.toml` for the dependency list).

Health check: `curl http://localhost:8000/health`

## 2. Node backend (Express + Prisma + SQLite) — port 4000

```bash
cd server
npm install
npx prisma generate
npx prisma migrate deploy   # applies migrations to the included seeded DB at prisma/data/traumasense.db
npm run dev                 # tsx src/index.ts
```

The zip ships with `prisma/data/traumasense.db` already migrated + seeded (realistic demo data across
states/districts, victims, complaints, cases, users). If you'd rather start fresh:

```bash
npx prisma migrate reset --force   # drops + recreates + reseeds
```

`.env` is included with dev-only placeholder secrets (`dev-insecure-service-key-change-me`, etc.) — fine
for local testing, not for anything real.

Demo logins — see `server/prisma/seed.ts` for the full list, e.g.:
```
admin@traumasense.test / ChangeMe123!
```

## 3. Frontend (React + Vite) — port 5173/5183

```bash
cd app
npm install
npm run dev
```

Open the URL Vite prints (defaults to http://localhost:5173). It talks to the Node backend on :4000
(see `app/.env.example` → copy to `.env` if you need to point it elsewhere).

## Notes

- The AI microservice is stateless — no DB of its own. The Node server is the only service with a
  database, and it's the only one the frontend talks to directly; Node proxies AI calls to the
  AI microservice server-side.
- `ai-service/tests/` has real unit tests (`uv run pytest`) validating the voice DSP and NLP/SVI engines
  against synthetic-but-known ground truth — worth running after `uv sync` to confirm the environment
  is wired correctly.
- Recently changed here (session-local additions, not yet in any published TraumaSense docs): voice
  engine now uses librosa (pYIN pitch) + parselmouth/Praat (jitter/shimmer/HNR) instead of hand-rolled
  DSP; NLP engine gained an authority-power-imbalance SVI escalation and a firsthand-testimony
  priority-review flag. See `ai-service/app/engines/voice_engine.py` and `nlp_engine.py` docstrings.
