import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const salesPageSource = readFileSync(
  resolve(process.cwd(), "client/src/pages/SalesPage.tsx"),
  "utf8"
);

describe("SalesPage — сохранение ВП", () => {
  it("синхронизирует форму с ref при каждом изменении", () => {
    expect(salesPageSource).toContain("const formRef = useRef<SaleFormData>(EMPTY_FORM);");
    expect(salesPageSource).toContain("formRef.current = next;");
    expect(salesPageSource).toMatch(/const previous = formRef\.current;[\s\S]{0,300}formRef\.current = next;[\s\S]{0,200}setForm\(next\);/);
    expect(salesPageSource).toContain("setForm={(updater) => { setConflictError(null); updateForm(updater); }}");
  });

  it("формирует payload продажи из актуального состояния формы", () => {
    expect(salesPageSource).toContain("const currentForm = formRef.current;");
    expect(salesPageSource).toMatch(/const currentForm = formRef\.current;[\s\S]{0,1300}isMutual: currentForm\.isMutual,/);
  });
});
