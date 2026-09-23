import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { READINGS_ONLY } from "@/lib/completions";
import { listTasks } from "@/lib/labelstudio";
import { caseIdFor, normalizeConfig, type RawEvalConfig } from "@/lib/eval-config";
import {
  consensusForCase,
  decodeResult,
  type CaseConsensus,
  type Review,
} from "@/lib/consensus";

export const dynamic = "force-dynamic";

/**
 * INTERNAL OPS PREVIEW — not the client deliverable. Never send this to a client.
 *
 * This platform is the clinician-serving layer. It serves tasks from Label
 * Studio projects the HEALTH backend creates and owns, and writes annotations
 * back to LS. HEALTH pulls those annotations via its webhook and produces the
 * official client deliverable, including QA, adjudication and gold comparison.
 *
 * What this endpoint gives is a rough read of what our clinicians have
 * submitted for a pool, so ops can sanity-check serving without opening Label
 * Studio. Its consensus is a naive majority with no QA, no adjudication and no
 * gold, so it will disagree with the official deliverable — treat any conflict
 * as this being wrong.
 *
 * It still redacts identity (no clinician, database or LS ids) because ops
 * output leaks, but redaction is not what makes something deliverable.
 *
 * Authorised by OPS_API_KEY, never a clinician session.
 */

const INTERNAL_NOTICE =
  "INTERNAL OPS PREVIEW — not the client deliverable. Produced by the clinician-serving layer without QA, adjudication or gold. The official deliverable comes from the HEALTH backend.";

function unauthorized() {
  return NextResponse.json({ error: "Not authorised." }, { status: 401 });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ poolId: string }> }
) {
  const expected = process.env.OPS_API_KEY;
  if (!expected) {
    return NextResponse.json(
      { error: "Internal preview is not configured." },
      { status: 503 }
    );
  }

  const presented =
    req.headers.get("x-ops-key") ?? req.headers.get("x-delivery-key") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (presented !== expected) return unauthorized();

  const { poolId } = await params;
  const format = new URL(req.url).searchParams.get("format") ?? "json";

  const { data: pool } = await supabaseAdmin
    .from("pools")
    .select("id, name, ls_project_id, eval_config, maximum_annotations")
    .eq("id", poolId)
    .maybeSingle();

  if (!pool) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const raw = (pool.eval_config ?? null) as RawEvalConfig | null;
  const config = normalizeConfig(raw);

  // What a client is shown is readings. A flag is recorded work and is paid,
  // but it carries no judgement of the case and belongs in no deliverable.
  const { data: completions, error } = await supabaseAdmin
    .from("task_completions")
    .select("clinician_id, ls_task_id, annotation_data, completed_at")
    .eq("pool_id", pool.id)
    .in("kind", READINGS_ONLY)
    .order("completed_at", { ascending: true });

  if (error) {
    console.error("[internal-preview] completion query failed", error);
    return NextResponse.json(
      { error: "Could not assemble the report." },
      { status: 500 }
    );
  }

  // Map LS task ids to the client's own case ids; the task id itself is dropped.
  const caseIdByTask = new Map<number, string>();
  try {
    for (const task of await listTasks(pool.ls_project_id)) {
      const data = (task.data ?? {}) as Record<string, unknown>;
      caseIdByTask.set(task.id, caseIdFor(raw, data) ?? `case-${task.id}`);
    }
  } catch (err) {
    console.error("[internal-preview] LS unreachable", err);
    return NextResponse.json(
      { error: "Could not reach the case store." },
      { status: 502 }
    );
  }

  // Reviewer labels are assigned per report and carry no identity.
  const reviewerLabel = new Map<string, string>();
  const labelFor = (clinicianId: string) => {
    if (!reviewerLabel.has(clinicianId)) {
      reviewerLabel.set(clinicianId, `Reviewer ${reviewerLabel.size + 1}`);
    }
    return reviewerLabel.get(clinicianId)!;
  };

  const byTask = new Map<number, Review[]>();
  for (const row of completions ?? []) {
    const list = byTask.get(row.ls_task_id) ?? [];
    list.push({
      reviewer: labelFor(row.clinician_id),
      answers: decodeResult(row.annotation_data),
      reviewedAt: row.completed_at,
    });
    byTask.set(row.ls_task_id, list);
  }

  const cases: CaseConsensus[] = [...byTask.entries()]
    .map(([taskId, reviews]) =>
      consensusForCase(caseIdByTask.get(taskId) ?? `case-${taskId}`, raw, reviews)
    )
    .sort((a, b) => a.case_id.localeCompare(b.case_id));

  const settled = cases.filter(
    (c) => c.verdict === "unanimous" || c.verdict === "majority"
  );

  const report = {
    internal_only: true,
    notice: INTERNAL_NOTICE,
    report: {
      title: config.title ?? pool.name,
      purpose: config.purpose,
      generated_at: new Date().toISOString(),
      reviewers_per_case: pool.maximum_annotations ?? null,
    },
    summary: {
      cases_total: cases.length,
      cases_settled: settled.length,
      cases_unanimous: cases.filter((c) => c.verdict === "unanimous").length,
      cases_majority: cases.filter((c) => c.verdict === "majority").length,
      cases_split: cases.filter((c) => c.verdict === "split").length,
      cases_awaiting_review: cases.filter((c) => c.verdict === "insufficient")
        .length,
      mean_agreement:
        settled.length > 0
          ? Number(
              (
                settled.reduce((s, c) => s + (c.agreement ?? 0), 0) /
                settled.length
              ).toFixed(4)
            )
          : null,
    },
    cases,
  };

  if (format === "csv") {
    const body = `${csvCell(INTERNAL_NOTICE)}\n\n${toCsv(report)}`;
    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="INTERNAL-PREVIEW-${slug(report.report.title)}.csv"`,
        "X-Internal-Only": "true",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  }

  return NextResponse.json(report, {
    headers: { "X-Internal-Only": "true", "X-Robots-Tag": "noindex, nofollow" },
  });
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);

  // A clinician's free text reaches the client as a spreadsheet. A leading
  // =, +, - or @ is a formula to Excel and Sheets, so it is neutralised with a
  // leading apostrophe — the standard defence against CSV injection.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;

  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(report: {
  cases: CaseConsensus[];
}): string {
  const first = report.cases[0];
  if (!first) return "case_id,reviewers,verdict,agreement\n";

  const voted = first.fields.filter((f) => f.type !== "text" && f.type !== "spans");
  const texts = first.fields.filter((f) => f.type === "text");

  const header = [
    "case_id",
    "reviewers",
    "verdict",
    "agreement",
    ...voted.flatMap((f) => [f.label, `${f.label} — agreement`]),
    ...texts.map((f) => f.label),
  ];

  const rows = report.cases.map((c) => {
    const find = (name: string) => c.fields.find((f) => f.field === name);
    return [
      c.case_id,
      c.reviewers,
      c.verdict,
      c.agreement === null ? "" : c.agreement.toFixed(2),
      ...voted.flatMap((f) => {
        const r = find(f.field);
        return [r?.value ?? "", r?.agreement === null || r?.agreement === undefined ? "" : r.agreement.toFixed(2)];
      }),
      ...texts.map((f) =>
        (find(f.field)?.responses ?? []).map((r) => r.text).join(" | ")
      ),
    ];
  });

  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}
