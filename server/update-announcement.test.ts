import { describe, expect, it } from "vitest";
import { UPDATE_ANNOUNCEMENT_VERSION, shouldShowUpdateAnnouncement } from "../client/src/lib/updateAnnouncement";

describe("уведомление об обновлении", () => {
  it("показывается пользователю, который ещё не видел текущую версию", () => {
    expect(shouldShowUpdateAnnouncement(null)).toBe(true);
    expect(shouldShowUpdateAnnouncement("старый-выпуск")).toBe(true);
  });

  it("не показывается повторно после закрытия на текущей версии", () => {
    expect(shouldShowUpdateAnnouncement(UPDATE_ANNOUNCEMENT_VERSION)).toBe(false);
  });
});
