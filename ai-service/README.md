# TraumaSense AI — backend

FastAPI backend for the TraumaSense AI platform: auth/RBAC, victim & complaint
case management, AI-assisted voice/NLP/risk assessment, consent tracking,
audit logging, and data retention policies.

## Run it

```bash
uv sync
uv run python -m app.seed        # one-time: creates demo users, victims, complaints
uv run uvicorn app.main:app --reload --port 8000
```

Open http://127.0.0.1:8000/docs for interactive API docs.

Seed login (any role — see `app/seed.py` for all 5 accounts):

```
email: admin@traumasense.test
password: ChangeMe123!
```

## Configuration

Copy `.env.example` to `.env` to override anything. With no `.env` at all:

- **Database**: a local libSQL file is created at `data/traumasense.db`. Set
  `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` to point the same code at a real
  Turso database instead — no code changes needed.
- **Secrets** (`JWT_SECRET`, `ENCRYPTION_KEY`): auto-generated on first run
  and persisted to `data/.dev-secrets.env` so they survive restarts. This is
  a development convenience only — set both explicitly outside `development`.
- **AI provider**: defaults to `AI_PROVIDER=mock`, a zero-cost deterministic
  stand-in for real transcription/NLP (see `app/ai/mock.py`). To integrate a
  real provider, implement `app.ai.interface.AIService` and register it in
  `app/ai/__init__.py::get_ai_service()`.

## What's implemented

- **Auth**: register/login (JWT bearer tokens), 5 roles matching the
  frontend (Administrator, Helpline Operator, District Officer, Counsellor,
  Law Enforcement Officer), `require_roles(...)` dependency for RBAC.
- **Case data**: victims, complaints, voice/NLP/psychological assessments,
  risk classification (SVI score + band), recommendations.
- **AI pipeline**: `POST /assessments/voice` and `/assessments/nlp` call the
  pluggable AI service; `POST /risk/{complaint_id}/compute` combines the
  latest assessments into an SVI score and auto-generates recommendations.
- **Privacy & compliance**:
  - Field-level encryption (Fernet) for PII columns (victim name, address,
    incident description, narrative, voice transcripts) — see `app/crypto.py`.
  - Consent enforcement (`app/consent.py`): sensitive endpoints 403 unless
    the victim has an "Obtained" consent record for that data category.
  - Audit logging (`app/audit.py`): every read/write to case data is
    recorded with actor, action, resource, and detail; readable only by
    Administrators at `GET /audit-log`.
  - Retention policies (`app/routers/retention.py`): configurable
    per-category retention windows, applied via `POST /retention/apply`
    (purges old audit logs, redacts old audio transcripts and closed-case
    narratives past their window).

## Not yet wired up

- The React frontend still runs on its own local mock data (see `../app`) —
  it does not call this API yet.
- No real AI provider is implemented, only the mock.
- No background scheduler for retention — `/retention/apply` is
  admin-triggered; wire it to a cron/scheduled task for production.
