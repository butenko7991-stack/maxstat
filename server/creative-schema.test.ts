import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { invitationEmailColumnNeedsNullableUpgrade, isDuplicateColumnError } from "./creativeSchema";

const creativeSchemaSource = readFileSync(resolve(process.cwd(), "server/creativeSchema.ts"), "utf8");

describe("совместимые миграции креативов и проверки охватов", () => {
  it("подавляет дублирующееся поле, завёрнутое драйвером в ошибку запроса", () => {
    expect(isDuplicateColumnError({
      message: "Failed query: ALTER TABLE purchase_records ADD COLUMN reachVerifiedValue BIGINT NULL",
      cause: { code: "ER_DUP_FIELDNAME", errno: 1060, message: "Duplicate column name 'reachVerifiedValue'" },
    })).toBe(true);
  });

  it("не подавляет другие ошибки миграции", () => {
    expect(isDuplicateColumnError({ code: "ER_NO_SUCH_TABLE", errno: 1146, message: "Table does not exist" })).toBe(false);
  });

  it("добавляет isExternal до записи новых продаж на VPS", () => {
    expect(creativeSchemaSource).toContain('await addColumn("sale_records", "isExternal BOOLEAN NOT NULL DEFAULT FALSE AFTER postNotNeeded")');
  });

  it("создаёт таблицу одноразовых приглашений при запуске VPS", () => {
    expect(creativeSchemaSource).toContain("CREATE TABLE IF NOT EXISTS workspace_invitations");
    expect(creativeSchemaSource).toContain("UNIQUE KEY workspace_invitations_token_hash_unique (tokenHash)");
    expect(creativeSchemaSource).toContain("email VARCHAR(320) NULL");
    expect(creativeSchemaSource).toContain("information_schema.COLUMNS");
    expect(creativeSchemaSource).toContain("ALTER TABLE workspace_invitations MODIFY COLUMN email VARCHAR(320) NULL");
    expect(creativeSchemaSource).toContain("await ensureInvitationsSchema()");
  });

  it("меняет только прежнюю обязательную колонку email", () => {
    expect(invitationEmailColumnNeedsNullableUpgrade([[{ isNullable: "NO" }], []])).toBe(true);
    expect(invitationEmailColumnNeedsNullableUpgrade([{ isNullable: "NO" }])).toBe(true);
    expect(invitationEmailColumnNeedsNullableUpgrade([[{ isNullable: "YES" }], []])).toBe(false);
    expect(invitationEmailColumnNeedsNullableUpgrade([])).toBe(false);
  });
});
