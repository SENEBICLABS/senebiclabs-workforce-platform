# Senebiclabs Workforce Platform

A clinician-facing task review platform for licensed medical professionals. Built with Next.js and Supabase. See ARCHITECTURE.md for how it fits with the HEALTH backend.

## Architecture

- **Frontend:** Next.js 14 (App Router), React 19, TailwindCSS
- **Backend:** Next.js API routes (server-side)
- **Database:** Supabase (Postgres)
- **Tasks:** HEALTH's task store, in the shared database (`lib/taskstore.ts`)
- **Auth:** Passwordless magic links (JWT-based)

## Prerequisites

- **Node.js 18+** (Next.js 16 requires this)
- **npm** or **yarn**

## Setup

### 1. Database

Copy the SQL from `database.sql` and run it in your Supabase SQL editor to create all tables and policies.

### 2. Environment Variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

Required env vars:
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `MAGIC_LINK_SECRET` - Secret for signing magic links (generate a random string)
- `JWT_SECRET` - Secret for signing JWTs (generate a random string)

### 3. Install Dependencies

```bash
npm install
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## User Flow

1. **Sign Up** (`/`) - Clinician enters email
2. **Verify** (`/auth/verify?token=...`) - Click magic link to verify
3. **Dashboard** (`/dashboard`) - View eligible pools
4. **Calibration** (`/calibration`) - Complete qualification test to become eligible
5. **Tasks** (`/tasks?poolId=...`) - Pull and complete tasks one at a time

## API Endpoints

### Auth
- `POST /api/auth/signup` - Send magic link
- `POST /api/auth/verify` - Verify magic link token

### Dashboard
- `GET /api/dashboard` - List eligible pools

### Calibration
- `POST /api/calibration/submit` - Submit calibration answers

### Tasks
- `POST /api/tasks/start` - Get first task for a pool
- `POST /api/tasks/submit` - Submit annotation, get next task

## Security

- **Confidentiality Gate:** All endpoints verify clinician eligibility server-side
- **Session Tokens:** JWT-based sessions stored in httpOnly cookies
- **Task Gating:** Clinicians can only see tasks from eligible pools they haven't completed
- **Task Store:** All task reads and answer writes happen server-side; a clinician never reaches the database directly

## Database Schema

See `database.sql` for full schema. Key tables:
- `clinicians` - User accounts
- `pools` - Task categories (each serves one HEALTH project)
- `pool_eligibility` - Access control (THE CONFIDENTIALITY GATE)
- `calibration_attempts` - Qualification scores
- `task_completions` - Audit trail
- `sessions` - Auth tokens

## Next Steps

1. Set up Supabase database
2. Add env vars
4. Add email service for magic links (currently logged to console)
5. Add pool data and calibration items to database
6. Test end-to-end flow
