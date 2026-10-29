import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

/**
 * Label Studio is gone, and this keeps it gone: nothing the app runs may call it,
 * read its settings, or call the database function only its submit path used.
 *
 * Column names kept from it (ls_task_id, ls_annotation_id, pools.ls_project_id) are
 * not matched: they now hold task numbers and answer ids, and are renamed by a
 * later migration rather than here.
 */
const ROOTS = ["app", "lib", "components", "scripts", "proxy.ts", "vercel.json", ".env.example"];
const FORBIDDEN = /labelstudio|label_studio|LABEL_STUDIO|annotate\.senebiclabs|claim_task_slot|\/api\/annotations|Token \$\{/;

function files(path: string): string[] {
  const full = join(__dirname, "..", path);
  if (!statSync(full, { throwIfNoEntry: false })) return [];
  if (statSync(full).isFile()) return [full];
  return readdirSync(full).flatMap((name) => files(join(path, name)));
}

describe("no Label Studio dependency", () => {
  const all = ROOTS.flatMap(files);

  it("has files to check", () => {
    expect(all.length).toBeGreaterThan(20);
  });

  it.each(all.map((f) => [f]))("%s", (file) => {
    expect(readFileSync(file, "utf8")).not.toMatch(FORBIDDEN);
  });
});
