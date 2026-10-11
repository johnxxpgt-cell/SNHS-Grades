import { MAX_AVATAR_DATA_URL_LENGTH } from "@/lib/constants";

export { MAX_AVATAR_DATA_URL_LENGTH };

export async function toWebpDataUrl(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Choose a photo under 8 MB.");

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot process the selected photo.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/webp", 0.82);
  if (!dataUrl.startsWith("data:image/webp;base64,") || dataUrl.length > MAX_AVATAR_DATA_URL_LENGTH) {
    throw new Error("That photo is too large after conversion. Choose a smaller image.");
  }
  return dataUrl;
}
