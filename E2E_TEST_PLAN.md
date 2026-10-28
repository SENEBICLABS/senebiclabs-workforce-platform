> **Historical.** Written when tasks lived in Label Studio, which has since been
> removed. For how the platform works now, see ARCHITECTURE.md.

# End-to-End Test Plan

## Quick Verification (10 minutes)

Run through this before saying "ready for review":

### Test Account
- Email: `test@example.com`
- Access: Already eligible for "Clinical Triage Assessment" pool (prod-test-pool-001)
- Agreement: Already accepted
- Calibration: Already passed

### Test Steps

**1. Open App**
```
http://localhost:3000/dashboard
```
Verify: Task pool visible with "Clinical Triage Assessment" name

**2. Start a Task**
- Click "Start Working"
- Verify:
  - [ ] Page loads with skeleton, then content appears
  - [ ] LEFT: Case shown with labeled "Patient Case" section
  - [ ] RIGHT: Guidelines panel visible with instructions
  - [ ] Questions show with hints underneath
  - [ ] Flag button present

**3. Review & Annotate**
- Read the case and guidelines
- Select an answer (e.g., "Correct — appropriate...")
- Optional: Add a rationale in Notes field
- Verify:
  - [ ] Option number (1, 2, 3) shows next to choices
  - [ ] Hints visible under "Explain your assessment" field
  - [ ] Form data persists if you refresh (Cmd+R)

**4. Submit**
- Press Cmd/Ctrl+Enter OR click "Submit Review"
- Verify:
  - [ ] Loading spinner appears
  - [ ] "✓ Saved" feedback shown for ~2 seconds
  - [ ] Next task loads instantly (no page reload)
  - [ ] Progress counter increments: "1 completed this session"
  - [ ] Session count visible in top nav

**5. Verify LS Integration**
- Check that annotation landed in Label Studio:
  ```
  curl -H "Authorization: Token $LS_TOKEN" \
    https://$LS_URL/api/tasks/<taskId>/annotations/ | jq '.'
  ```
- Verify exact format:
  ```json
  {
    "result": [
      {
        "from_name": "verdict",
        "to_name": "image",
        "type": "choices",
        "value": { "choices": ["Correct..."] }
      }
    ]
  }
  ```

**6. Test Error Handling**
- Simulate network error:
  - Open DevTools (F12) → Network tab
  - Throttle to "Offline"
  - Try to submit a task
  - Verify:
    - [ ] Error message appears (not technical)
    - [ ] Form data is preserved
    - [ ] Can turn online and retry
    - [ ] Retry succeeds

**7. Stop & See Summary**
- Click "Stop" or let browser sit
- Close browser / refresh
- Reopen → should resume where left off
- Verify:
  - [ ] Form data persists
  - [ ] Can continue or go to dashboard

**8. Dashboard View**
- Go back to `/dashboard`
- Verify:
  - [ ] Pool shows updated "X tasks completed" count
  - [ ] Can start a new session

---

## Expected Behavior

✓ **No action loses work** — form data persists on refresh  
✓ **No double-writes** — submit twice = second succeeds gracefully (idempotent)  
✓ **Every error is human-readable** — no "500 Internal Server Error" nonsense  
✓ **Annotations land in LS correctly** — exact format, matching task ID  
✓ **Clinician never waits** — next task loads instantly  
✓ **Guidelines always accessible** — one click/tap away  

---

## Logs to Check

Open server logs (`npm run dev`) and verify:
- [ ] No TypeScript errors
- [ ] No 500 errors on submit
- [ ] `[LS] Annotation X recorded on task Y` appears on successful submit
- [ ] No repeated error logs (no infinite retry loops)

---

## Success Criteria

All of these must be true:
1. ✓ Can complete a full review cycle without page reload
2. ✓ Annotation lands in LS in exact correct format
3. ✓ No data lost on refresh or network failure
4. ✓ Errors are clear and recoverable
5. ✓ Guidelines panel renders with instructions + hints
6. ✓ Progress counter updates
7. ✓ Keyboard shortcuts work (Cmd+Enter, number keys)
8. ✓ Mobile responsive (try on mobile browser or DevTools)

---

## Quick Checklist for "Ready"

- [ ] Run through all 8 test steps above
- [ ] Check server logs — no errors
- [ ] Verify LS annotation format
- [ ] Test network failure + retry
- [ ] Mobile responsive test
- [ ] Copy is warm and professional (no dev-speak)
- [ ] No broken screens (always has fallback)

Once all checked → **READY FOR PRODUCTION**
