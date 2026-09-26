"use client";

import { Card } from "@/components/ui/Card";
import type { EarlierAnswer, Field } from "@/lib/api";

/**
 * What the earlier clinicians decided, shown to the senior settling the case.
 *
 * Deciding blind would defeat the point: the senior is not a third independent
 * reader, they are the person weighing a disagreement, and they need to see
 * what it was. What they must not see is who held which view. An author's name
 * would turn a clinical question into a question about colleagues, which is
 * exactly what moving this out of a meeting was meant to avoid.
 *
 * So nothing here renders an identity, and none is sent: HEALTH hands over the
 * answers without authors and the route passes them on as they arrived. The
 * readings are numbered in the order they came, and the numbers carry no
 * meaning beyond telling two columns apart.
 *
 * The shape is deliberately forgiving. These answers come from another service
 * and are rendered rather than trusted: an unexpected value is shown as text
 * rather than dropped, because a senior noticing something odd is better than a
 * senior silently missing half a disagreement.
 */

function valueOf(raw: unknown): string {
  if (raw === null || raw === undefined || raw === "") return "—";
  if (Array.isArray(raw)) return raw.map(valueOf).join(", ");
  if (typeof raw === "object") return JSON.stringify(raw);
  return String(raw);
}

/** The answers map, wherever this reading happens to keep it. */
function answersOf(reading: EarlierAnswer): Record<string, unknown> {
  if (reading.answers && typeof reading.answers === "object") {
    return reading.answers as Record<string, unknown>;
  }
  // No nested answers: treat the reading itself as the map, minus the
  // bookkeeping HEALTH attaches to it.
  const { answers: _ignored, ...rest } = reading;
  void _ignored;
  return rest as Record<string, unknown>;
}

export function EarlierAnswers({
  readings,
  fields,
  agreement,
}: {
  readings: EarlierAnswer[];
  fields: Field[];
  agreement?: number | null;
}) {
  if (readings.length === 0) return null;

  // Every field either side answered, in the pool's own order, so the two
  // readings line up row by row and a difference is visible rather than hunted.
  const named = new Map(fields.map((f) => [f.name, f.title]));
  const keys: string[] = [];
  for (const field of fields) {
    if (readings.some((r) => answersOf(r)[field.name] !== undefined)) {
      keys.push(field.name);
    }
  }
  for (const reading of readings) {
    for (const key of Object.keys(answersOf(reading))) {
      if (!keys.includes(key)) keys.push(key);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-section text-ink">What the earlier readings said</h2>
        {typeof agreement === "number" && (
          <span className="tnum text-[15px] text-muted">
            {Math.round(agreement * 100)}% agreement
          </span>
        )}
      </div>
      <p className="mt-1 text-body text-muted">
        Two clinicians read this case and did not reach the same answer. Their
        reasoning is below, without names: you are weighing the judgements, not
        the people who made them.
      </p>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[32rem] border-collapse text-left">
          <thead>
            <tr>
              <th className="w-1/3 border-b border-hairline pb-2 text-label uppercase text-muted">
                Field
              </th>
              {readings.map((_, i) => (
                <th
                  key={i}
                  className="border-b border-hairline pb-2 text-label uppercase text-muted"
                >
                  Reading {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => {
              const values = readings.map((r) => valueOf(answersOf(r)[key]));
              const differs = new Set(values).size > 1;
              return (
                <tr key={key}>
                  <th
                    scope="row"
                    className="border-b border-hairline py-2.5 pr-4 align-top text-[15px] font-semibold text-ink"
                  >
                    {named.get(key) ?? key}
                  </th>
                  {values.map((value, i) => (
                    <td
                      key={i}
                      className={`border-b border-hairline py-2.5 pr-4 align-top text-[15px] leading-relaxed ${
                        differs ? "font-semibold text-ink" : "text-muted"
                      }`}
                    >
                      {value}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-[14px] text-muted">
        Where they differ, the answers are shown in bold. Your decision is the
        final answer for this case, whether or not it matches either of them.
      </p>
    </Card>
  );
}
