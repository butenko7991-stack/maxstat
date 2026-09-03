import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const formSource = readFileSync(resolve(process.cwd(), "client/src/components/RecordFormModal.tsx"), "utf8");
const salesSource = readFileSync(resolve(process.cwd(), "client/src/pages/SalesPage.tsx"), "utf8");
const purchasesSource = readFileSync(resolve(process.cwd(), "client/src/pages/PurchasesPage.tsx"), "utf8");
const scheduleSource = readFileSync(resolve(process.cwd(), "client/src/pages/SchedulePage.tsx"), "utf8");
const routersSource = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");

describe("выбор времени размещения", () => {
  it("показывает только варианты 1/24 и 1/48 с явным активным состоянием", () => {
    expect(formSource).toContain('const PLACEMENT_DURATION_OPTIONS = ["1/24", "1/48"] as const;');
    expect(formSource).toContain("<Label>Время размещения</Label>");
    expect(formSource).toContain("aria-pressed={selected}");
    expect(formSource.match(/<PlacementDurationField/g)).toHaveLength(2);
  });

  it("использует 1/48 по умолчанию во всех новых формах", () => {
    expect(formSource).toContain('export const DEFAULT_PLACEMENT_DURATION = "1/48";');
    expect(salesSource).toContain("tariff: DEFAULT_PLACEMENT_DURATION");
    expect(purchasesSource).toContain("tariff: DEFAULT_PLACEMENT_DURATION");
    expect(scheduleSource.match(/tariff: DEFAULT_PLACEMENT_DURATION/g)).toHaveLength(2);
    expect(routersSource).toContain('const DEFAULT_PLACEMENT_DURATION = "1/48";');
    expect(routersSource.match(/tariff: input\.tariff\?\.trim\(\) \|\| DEFAULT_PLACEMENT_DURATION/g)).toHaveLength(4);
  });

  it("не заменяет сохранённый тариф при редактировании существующей записи", () => {
    expect(salesSource).toContain('tariff: r.tariff ?? ""');
    expect(purchasesSource).toContain('direction: r.direction ?? "", tariff: r.tariff ?? ""');
    expect(scheduleSource).toContain('tariff: s.tariff ?? ""');
    expect(scheduleSource).toContain('tariff: p.tariff ?? ""');
  });
});
