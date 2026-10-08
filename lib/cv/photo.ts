import "server-only";
import sharp from "sharp";

export async function normalizePhoto(buffer: Buffer): Promise<string> {
  if (!buffer.length || buffer.length > 5 * 1024 * 1024) throw new Error("Choisissez une image de moins de 5 Mo.");
  const image = sharp(buffer, { limitInputPixels: 25000000 });
  const meta = await image.metadata();
  if (!["jpeg", "png", "webp"].includes(meta.format ?? "") || (meta.pages ?? 1) > 1) {
    throw new Error("Choisissez une photo JPG, PNG ou WebP non animée.");
  }
  const jpeg = await image.rotate().resize(480, 600, { fit: "cover", position: "centre" }).flatten({ background: "#ffffff" }).jpeg({ quality: 85 }).toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}
