import { describe, expect, it } from "vitest";
import { decodeCreativeImage } from "./creativeUpload";

describe("загрузка скриншотов креативов", () => {
  it("декодирует допустимый PNG-скриншот", () => {
    const image = decodeCreativeImage("iVBORw0KGgo=", "image/png");
    expect(image.extension).toBe("png");
    expect(image.buffer.length).toBeGreaterThan(0);
  });

  it("не принимает некорректную base64-строку или неподдерживаемый тип", () => {
    expect(() => decodeCreativeImage("not base64!", "image/png")).toThrow("Некорректные данные изображения");
    expect(() => decodeCreativeImage("iVBORw0KGgo=", "image/svg+xml" as never)).toThrow("Поддерживаются");
  });
});
