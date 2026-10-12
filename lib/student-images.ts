import { MAX_AVATAR_FILE_SIZE } from "@/lib/constants";

export async function toWebpBlob(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Choose a photo under 8 MB.");

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot process the selected photo.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
    if (!blob || blob.type !== "image/webp") throw new Error("This browser could not convert the photo to WebP.");
    if (blob.size > MAX_AVATAR_FILE_SIZE) throw new Error("That photo is too large after conversion. Choose a smaller image.");
    return blob;
  } finally {
    bitmap.close();
  }
}
