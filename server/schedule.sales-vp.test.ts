import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const schedulePageSource = readFileSync(
  resolve(process.cwd(), "client/src/pages/SchedulePage.tsx"),
  "utf8"
);
const dbSource = readFileSync(resolve(process.cwd(), "server/db.ts"), "utf8");

describe("SchedulePage — ВП в продажах", () => {
  it("synchronizes create-sale ref immediately when the form changes", () => {
    expect(schedulePageSource).toMatch(/const updateSaleForm = useCallback\([\s\S]{0,500}saleFormRef\.current = next;/);
    expect(schedulePageSource).toMatch(/const previous = saleFormRef\.current;[\s\S]{0,300}saleFormRef\.current = next;[\s\S]{0,200}setSaleForm\(next\);/);
    expect(schedulePageSource).toContain("setForm={(updater: any) => { setConflictError(null); updateSaleForm(updater); }}");
  });

  it("uses the latest create-sale form state when submitting", () => {
    expect(schedulePageSource).toContain("const saleFormRef = useRef(saleForm);");
    expect(schedulePageSource).toContain("const f = saleFormRef.current;");
    expect(schedulePageSource).toMatch(/const f = saleFormRef\.current;[\s\S]{0,900}isMutual: f\.isMutual,/);
  });

  it("uses the latest edit-sale form state when submitting", () => {
    expect(schedulePageSource).toContain("const editSaleFormRef = useRef(editSaleForm);");
    expect(schedulePageSource).toContain("const f = editSaleFormRef.current;");
    expect(schedulePageSource).toMatch(/const f = editSaleFormRef\.current;[\s\S]{0,900}isMutual: f\.isMutual,/);
  });

  it("получает isExternal из данных расписания и выделяет внешнюю продажу оранжевым", () => {
    expect(dbSource).toContain("isExternal: saleRecords.isExternal");
    expect(schedulePageSource).toContain("const isExternalSale = records[0]?.isExternal === true;");
    expect(schedulePageSource).toContain("bg-orange-500/20");
    expect(schedulePageSource).toContain("🌐 Внешняя");
  });
});
