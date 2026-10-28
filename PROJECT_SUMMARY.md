> **Historical.** Written when tasks lived in Label Studio, which has since been
> removed. For how the platform works now, see ARCHITECTURE.md.

# Senebiclabs Workforce Platform — Build Summary

## ✅ Complete Platform Built

The entire clinician-facing workforce platform has been implemented with:
- Passwordless authentication
- Calibration system
- Task queue management
- Label Studio integration
- Complete Remotask-style UX

---

## 📁 Project Structure

```
app/
├── api/                          # Backend API routes
│   ├── auth/
│   │   ├── signup/route.ts      # Send magic link
│   │   └── verify/route.ts      # Verify token & create session
│   ├── calibration/
│   │   └── submit/route.ts      # Score calibration answers
│   ├── dashboard/route.ts       # List eligible pools
│   └── tasks/
│       ├── start/route.ts       # Get first task for pool
│       └── submit/route.ts      # Submit annotation, get next task
│
├── auth/
│   └── verify/page.tsx          # Magic link verification page
│
├── dashboard/page.tsx           # Main dashboard (Remotask-style)
├── calibration/page.tsx         # Calibration test page
├── tasks/page.tsx               # Full-screen task loop
├── page.tsx                     # Signup page
└── layout.tsx

lib/
├── auth.ts                      # JWT & magic link utils
├── labelstudio.ts               # Label Studio API client
├── middleware.ts                # Auth middleware
└── supabase.ts                  # Supabase client

database.sql                     # Schema with RLS policies
.env.example                     # Environment variable template
README.md                        # Setup & architecture docs
```

---

## 🔐 Security Features

### Confidentiality Gate (The Core)
Every protected endpoint enforces three checks:

1. **Is clinician logged in?** — Token verification
2. **Are they eligible?** — `pool_eligibility` table check
3. **Have they done this task?** — `task_completions` check

All server-side. Clinician browser never knows what it can't see.

### Session & Auth
- Passwordless magic links (JWT-signed, 24hr expiry)
- Session tokens (JWT, 7-day expiry)
- httpOnly cookies (XSS protection)
- Row-level security policies in Supabase

---

## 🗄️ Database Schema

### Tables
- **clinicians** — User accounts (email, id, created_at)
- **pools** — Task categories (maps to LS projects: name, ls_project_id, calibration_items JSON)
- **pool_eligibility** — **THE GATE** (clinician_id, pool_id, eligible bool, eligible_since)
- **calibration_attempts** — Qualification scores (clinician_id, pool_id, score, passed, attempted_at)
- **task_completions** — Audit trail (clinician_id, pool_id, ls_task_id, annotation_data JSON, completed_at)
- **sessions** — Auth tokens (clinician_id, token, expires_at)

### Security
- RLS enabled on all tables
- Policies prevent cross-clinician data access
- Foreign keys cascade deletes
- Indexes on common queries (eligibility, task completion lookups)

---

## 🔗 API Endpoints

### Authentication
```
POST /api/auth/signup
  Body: { email: "clinician@example.com" }
  → Returns: { success, message, magicLinkToken (dev only) }
  
POST /api/auth/verify
  Body: { token: "jwt_from_magic_link" }
  → Returns: { success, sessionToken, email }
  → Sets: httpOnly cookie "sessionToken"
```

### Dashboard
```
GET /api/dashboard
  Headers: { Authorization: "Bearer <sessionToken>" }
  → Returns: { pools: [{id, name, lsProjectId, tasksCompleted}], email }
```

### Calibration
```
POST /api/calibration/submit
  Headers: { Authorization: "Bearer <sessionToken>" }
  Body: { poolId: "uuid", answers: [{itemId, answer}] }
  → Returns: { passed: bool, score: 0-100, correctAnswers, totalQuestions }
  → Side effect: If passed, marks clinician eligible in pool_eligibility
```

### Tasks
```
POST /api/tasks/start
  Headers: { Authorization: "Bearer <sessionToken>" }
  Body: { poolId: "uuid" }
  → Returns: { task: {id, data, annotations}, poolId }
  → Server checks: clinician eligible for this pool?
  
POST /api/tasks/submit
  Headers: { Authorization: "Bearer <sessionToken>" }
  Body: { poolId: "uuid", taskId: number, annotation: {...} }
  → Returns: { success, nextTask: {...} or { success, nextTask: null, message: "no more tasks" } }
  → Side effects: 
    - Submits annotation to Label Studio
    - Records completion in task_completions
```

---

## 🎬 User Flow (Remotask-style)

### 1. **Signup** (`/`)
   - Enter email → click "Send Magic Link"
   - Email sent (dev: logged to console, prod: via SendGrid/Resend)

### 2. **Verify** (`/auth/verify?token=...`)
   - Click magic link in email
   - Token verified → session created → redirect to dashboard

### 3. **Dashboard** (`/dashboard`)
   - See eligible pools (or empty state: "take calibration first")
   - Click pool card → start working

### 4. **Calibration** (`/calibration`)
   - Select pool
   - Answer calibration questions
   - Auto-scored → if pass (80%+), marked eligible
   - If fail, try again

### 5. **Task Loop** (`/tasks?poolId=...`)
   - First task auto-loads
   - (UI placeholder: Label Studio widget here)
   - Submit → next task auto-loads (or "no more tasks")
   - Click "Stop Working" → back to dashboard

---

## 🏗️ Tech Stack

- **Frontend:** React 19, Next.js 14 (App Router), TailwindCSS
- **Backend:** Next.js API Routes
- **Database:** Supabase (Postgres) + RLS
- **Auth:** JWT (jose library)
- **Task Canvas:** Label Studio (REST API integration, widget to be embedded)
- **Secrets:** Environment variables (.env.local)

---

## 🚀 Next Steps Before Launch

### Critical
1. ✅ Database schema created (run database.sql in Supabase)
2. ✅ API endpoints built
3. ✅ Auth system built
4. ❌ **Email service** — Add SendGrid/Resend to `/api/auth/signup` (currently logs to console)
5. ❌ **Label Studio widget** — Integrate `@label-studio/frontend` or use iframe in `/app/tasks/page.tsx`
6. ❌ **Pools & calibrations** — Add test data to `pools` table with calibration_items JSON
7. ❌ **Test end-to-end** — Signup → verify → calibration → task loop

### Nice-to-have
- Task scoring/rating system (affects which tasks clinicians see)
- Earnings tracking & payout
- Clinician stats dashboard
- Admin panel for pool management

---

## 📝 Environment Variables Required

```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx

LABEL_STUDIO_API_URL=https://annotate.senebiclabs.com
LABEL_STUDIO_API_TOKEN=xxx

MAGIC_LINK_SECRET=generate_random_string_32_chars
JWT_SECRET=generate_random_string_32_chars
MAGIC_LINK_EXPIRY_HOURS=24

# For email (add to signup route)
SENDGRID_API_KEY=xxx
FROM_EMAIL=noreply@senebiclabs.com
```

---

## ⚡ Key Design Decisions

### 1. **Single Label Studio Service Account**
Not per-clinician LS users. Why?
- Prevents clinicians from directly accessing LS
- Simpler account management
- We own all task completion tracking
- Easier to enforce "one task at a time"

### 2. **Server-side Gating Only**
Pool eligibility checked on backend. Why?
- UI hiding is not security (client always lies)
- Task data never sent to ineligible clinicians
- Audit trail in DB (who did what, when)

### 3. **JWT Sessions, not Supabase Auth**
Why? Control over token lifetime & payload. Simpler magic link flow.

### 4. **Calibration as JSON in Pool**
Why? Easy to configure per-pool. No separate calibration table per pool.

---

## 📊 Database Queries (Examples)

### Get eligible pools for clinician
```sql
SELECT p.* FROM pools p
  JOIN pool_eligibility e ON p.id = e.pool_id
  WHERE e.clinician_id = ? AND e.eligible = true
```

### Get next available task
```sql
SELECT * FROM tasks WHERE project_id = ?
  AND id NOT IN (
    SELECT ls_task_id FROM task_completions 
    WHERE clinician_id = ? AND pool_id = ?
  )
LIMIT 1
```

### Mark task complete
```sql
INSERT INTO task_completions 
  (clinician_id, pool_id, ls_task_id, annotation_data)
VALUES (?, ?, ?, ?)
```

---

## 🧪 Testing Checklist

- [ ] Database tables created in Supabase
- [ ] Env vars configured in `.env.local`
- [ ] Dependencies installed (`npm install`)
- [ ] Dev server runs (`npm run dev`)
- [ ] Signup → verify → dashboard flow works
- [ ] Calibration submit & eligibility marking works
- [ ] Task start/submit endpoints return correct task data
- [ ] Next task auto-loads after submit
- [ ] Clinician can't see ineligible pools
- [ ] Clinician can't access tasks they've already done
- [ ] Email service sends actual emails (dev → console, prod → SendGrid)

---

## 📖 Architecture Notes

**The Confidentiality Gate is everything.** Every line of code in the API endpoints is there to enforce one rule: **"Serve this clinician only the task they should see right now, and never leak data about other clinicians or pools."**

This is why we check eligibility server-side, never send a task list, and require a fresh request for each task. It's why pool_eligibility is the most important table — it's your permission matrix.

Label Studio is invisible by design. Clinicians never know it exists. They sign in to Senebiclabs, see our UI, and work on our platform. LS is the engine; our app is the interface.
