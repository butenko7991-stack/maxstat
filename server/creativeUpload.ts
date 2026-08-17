import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const mimeExtensions = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
} as const;

export type CreativeImageMime = keyof typeof mimeExtensions;

export function decodeCreativeImage(imageBase64: string, mimeType: CreativeImageMime): { buffer: Buffer; extension: string } {
  if (!Object.hasOwn(mimeExtensions, mimeType)) throw new Error("Поддерживаются PNG, JPG, WEBP и GIF");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64) || imageBase64.length % 4 === 1) {
    throw new Error("Некорректные данные изображения");
  }
  const buffer = Buffer.from(imageBase64, "base64");
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) throw new Error("Размер скриншота должен быть от 1 байта до 5 МБ");
  return { buffer, extension: mimeExtensions[mimeType] };
}

export async function saveCreativeImage(workspaceId: number, creativeId: number, imageBase64: string, mimeType: CreativeImageMime): Promise<string> {
  const { buffer, extension } = decodeCreativeImage(imageBase64, mimeType);
  const directory = path.resolve(process.cwd(), "uploads", "creatives", String(workspaceId));
  await fs.mkdir(directory, { recursive: true, mode: 0o750 });
  const filename = `${creativeId}-${crypto.randomUUID()}.${extension}`;
  await fs.writeFile(path.join(directory, filename), buffer, { mode: 0o640 });
  return `/uploads/creatives/${workspaceId}/${filename}`;
}

export async function removeCreativeImage(imagePath: string | null | undefined): Promise<void> {
  if (!imagePath?.startsWith("/uploads/creatives/")) return;
  const filePath = path.resolve(process.cwd(), imagePath.slice(1));
  const expectedRoot = path.resolve(process.cwd(), "uploads", "creatives") + path.sep;
  if (!filePath.startsWith(expectedRoot)) return;
  await fs.unlink(filePath).catch(() => undefined);
}
