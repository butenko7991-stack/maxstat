import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const modalSource = readFileSync(
  resolve(process.cwd(), "client/src/components/RecordFormModal.tsx"),
  "utf8"
);
const scheduleSource = readFileSync(
  resolve(process.cwd(), "client/src/pages/SchedulePage.tsx"),
  "utf8"
);
const routersSource = readFileSync(
  resolve(process.cwd(), "server/routers.ts"),
  "utf8"
);

describe("ВП при создании продажи с мобильного", () => {
  it("использует явные доступные переключатели вместо нативных чекбоксов", () => {
    expect(modalSource).toContain('role="switch"');
    expect(modalSource).toContain("aria-checked={form.isMutual}");
    expect(modalSource).toContain("onClick={() => setForm((f) => ({ ...f, isMutual: !f.isMutual }))}");
    expect(modalSource).toContain("aria-checked={form.isExternal}");
    expect(modalSource).toContain("onClick={() => setForm((f) => ({ ...f, isExternal: !f.isExternal }))}");
    expect(modalSource).toContain("bg-orange-500 text-slate-950");
    expect(modalSource).toContain('backgroundColor: form.isExternal ? "#f97316" : "#0f172a"');
    expect(modalSource).toContain('{form.isExternal ? "Включена" : "Выключена"}');
    expect(modalSource).toContain("min-h-11");
  });

  it("сохраняет актуальное состояние ВП при массовом создании из расписания", () => {
    expect(scheduleSource).toContain("const bulkFormRef = useRef(bulkForm);");
    expect(scheduleSource).toContain("const f = bulkFormRef.current;");
    expect(scheduleSource).toMatch(/const f = bulkFormRef\.current;[\s\S]{0,1000}isMutual: f\.isMutual,/);
  });

  it("принимает и записывает ВП-поля для массового создания продаж", () => {
    expect(routersSource).toMatch(/bulkCreate:[\s\S]{0,1800}isMutual: z\.boolean\(\)\.optional\(\)/);
    expect(routersSource).toMatch(/bulkCreate:[\s\S]{0,3200}isMutual: input\.isMutual \?\? false/);
  });
});
