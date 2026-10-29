> **Historical.** Written when tasks lived in Label Studio, which has since been
> removed. For how the platform works now, see ARCHITECTURE.md.

# Field Type & Divergence Verification

## Critical Tests (Run Before Production)

### Test 1: All Field Types Render Correctly

**Setup:**
```bash
# Seed test pool with all field types
psql $SUPABASE_URL < seed-all-field-types.sql
```

**Test:**
1. Go to `/dashboard` (logged in as test@example.com)
2. Select "Complete Field Type Test" pool
3. Verify all 5 fields render:
   - [ ] **single** (verdict) - Radio buttons with 3 options
   - [ ] **from_classes** (classification) - Radio buttons with 4 medical classifications
   - [ ] **text** (rationale) - Large textarea (5 rows)
   - [ ] **scale** (confidence) - Slider 1-5 with display value
   - [ ] **structured** (finding) - Two-step: Yes/No → then find type
4. Verify each field has a **hint** visible under the title
5. Verify **Guidelines** panel shows complete instructions

**Expected:**
- All 5 fields visible with proper styling
- No console errors
- Guidelines and hints visible

---

### Test 2: Each Field Type Submits Correct LS Format

Submit the form with each field type and verify the exact JSON format:

**Field 1: single → choices**
```json
{
  "from_name": "verdict",
  "to_name": "image",
  "type": "choices",
  "value": { "choices": ["Yes, appropriate"] }
}
```

**Field 2: from_classes → choices**
```json
{
  "from_name": "classification",
  "to_name": "image",
  "type": "choices",
  "value": { "choices": ["Acute"] }
}
```

**Field 3: text → textarea**
```json
{
  "from_name": "rationale",
  "to_name": "image",
  "type": "textarea",
  "value": { "text": ["My detailed assessment..."] }
}
```

**Field 4: scale → rating**
```json
{
  "from_name": "confidence",
  "to_name": "image",
  "type": "rating",
  "value": { "rating": 4 }
}
```

**Field 5: structured → TWO entries**
```json
{
  "from_name": "finding",
  "to_name": "image",
  "type": "choices",
  "value": { "choices": ["Yes"] }
},
{
  "from_name": "finding_finding",
  "to_name": "image",
  "type": "choices",
  "value": { "choices": ["Infection"] }
}
```

**Verification steps:**
1. Fill out all 5 fields
2. Submit
3. Check LS API: 
   ```bash
   curl -H "Authorization: Token $LS_TOKEN" \
     https://$LS_URL/api/tasks/<taskId>/annotations/ | jq '.result | map({from_name, type, value})'
   ```
4. Verify each field's format matches above
5. Repeat for different values (e.g., scale=1, structured=No, etc.)

**Expected:**
- All 5 entries in LS with exact correct format
- No format errors or missing fields

---

### Test 3: NO DIVERGENCE - Counts Must Match

**Setup:**
```sql
-- Before running any tests, verify counts match
SELECT
  (SELECT COUNT(*) FROM task_completions WHERE clinician_id = 'test-clinician-001') as local_count,
  (SELECT COUNT(*) FROM pools WHERE id = 'test-all-fields') as pool_count;

-- Should return: local_count = pool_count (or reasonably close)
```

**Test workflow:**
1. Start a fresh session (clear browser localStorage)
2. Submit **exactly 5 tasks**
3. After each submit, verify:
   ```sql
   SELECT COUNT(*) FROM task_completions 
   WHERE clinician_id = 'test-clinician-001' AND pool_id = 'test-all-fields';
   ```
4. Check LS for orphans:
   ```bash
   curl -H "Authorization: Token $LS_TOKEN" \
     https://$LS_URL/api/tasks/<taskId>/annotations/ | jq 'length'
   ```
5. Both counts must match exactly

**Expected:**
- After 5 submits: 5 DB records + 5 LS annotations
- No orphans
- No divergence

**Failure scenario to test:**
- Simulate DB failure during insert: kill DB connection mid-submit
- Verify compensating rollback deletes the LS annotation
- Check logs for `[ROLLBACK]` message
- Verify count still matches (0 DB records, 0 LS annotations)

---

### Test 4: Guidelines & Hints Render

**Verify:**
1. Guidelines panel visible with full instructions text
2. Each field shows its `hint` underneath the title
3. On mobile: Guidelines collapsible (toggle button)
4. On desktop: Guidelines sticky sidebar

**Expected:**
- Guidelines reads: "TEST RUBRIC: Judge each aspect carefully..."
- Hints visible:
  - verdict: "Assess against standard protocols"
  - classification: "Choose the most specific category"
  - rationale: "Why did you choose this? Any concerns?"
  - confidence: "1 = low confidence, 5 = very confident"
  - finding: "First: is there a finding? Then: what type?"

---

## SQL Reconciliation Query

```sql
-- Check for divergence
WITH ls_annotations AS (
  -- This would query LS API in production
  -- For now, just check local records exist
  SELECT DISTINCT ls_task_id FROM task_completions
)
SELECT
  'SUMMARY' as check_type,
  COUNT(*) as task_completions_count,
  (SELECT COUNT(DISTINCT ls_task_id) FROM task_completions) as unique_ls_tasks,
  'All records should have matching LS annotations' as expected
FROM task_completions
WHERE clinician_id = 'test-clinician-001' AND pool_id = 'test-all-fields';

-- Verify no NULL values in critical fields
SELECT
  COALESCE(COUNT(*), 0) as records_with_null_values
FROM task_completions
WHERE 
  clinician_id IS NULL 
  OR pool_id IS NULL 
  OR ls_task_id IS NULL 
  OR annotation_data IS NULL;
```

---

## Success Criteria

✅ All 5 field types render  
✅ Each field type submits exact LS format  
✅ Guidelines panel visible with instructions  
✅ Hints visible under each field  
✅ Zero divergence (counts match)  
✅ Compensating rollback works (tested via DB failure)  

---

## Logging to Watch

```
[ROLLBACK] Deleted orphan LS annotation X on task Y
```

If you see this during testing, the compensating rollback is working.

---

After running all 4 tests → OK to claim "production ready"
