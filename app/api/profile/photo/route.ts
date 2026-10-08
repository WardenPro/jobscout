import { NextRequest, NextResponse } from "next/server";
import { normalizePhoto } from "@/lib/cv/photo";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (Number(req.headers.get("content-length")) > 6 * 1024 * 1024) {
    return NextResponse.json({ error: "Choisissez une image de moins de 5 Mo." }, { status: 413 });
  }
  try {
    const form = await req.formData();
    const file = form.get("photo");
    if (!(file instanceof File) || file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "Choisissez une photo JPG, PNG ou WebP de moins de 5 Mo." }, { status: 400 });
    }
    const photo = await normalizePhoto(Buffer.from(await file.arrayBuffer()));
    return NextResponse.json({ photo });
  } catch {
    return NextResponse.json({ error: "Image illisible ou trop grande. Choisissez une photo JPG, PNG ou WebP de moins de 5 Mo (25 mégapixels maximum)." }, { status: 400 });
  }
}
