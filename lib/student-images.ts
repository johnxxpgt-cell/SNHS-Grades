import { MAX_AVATAR_FILE_SIZE } from "@/lib/constants";

const MAX_SOURCE_IMAGE_SIZE = 20 * 1024 * 1024;

async function imageElementFor(url: string) {
  const image = new Image();
  image.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("This browser cannot read the selected photo. Choose a JPEG or PNG image and try again."));
    image.src = url;
    if (image.complete) {
      if (image.naturalWidth > 0) resolve();
      else reject(new Error("This browser cannot read the selected photo. Choose a JPEG or PNG image and try again."));
    }
  });
  return image;
}

async function webpFromCanvas(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob | null>((resolve) => {
    try { canvas.toBlob(resolve, "image/webp", 0.82); } catch { resolve(null); }
  });
  if (blob?.type === "image/webp") return blob;

  let dataUrl = "";
  try { dataUrl = canvas.toDataURL("image/webp", 0.82); } catch { /* Report the common unsupported-format error below. */ }
  const encoded = /^data:image\/webp;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)?.[1];
  if (!encoded) throw new Error("This browser cannot convert photos to WebP. Update the browser or try a newer version.");
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: "image/webp" });
}

export async function toWebpBlob(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  if (file.size > MAX_SOURCE_IMAGE_SIZE) throw new Error("Choose a photo under 20 MB.");

  let bitmap: ImageBitmap | null = null;
  let sourceUrl = "";
  try {
    if (typeof createImageBitmap === "function") {
      try { bitmap = await createImageBitmap(file); } catch { /* Safari and some Android browsers need the image-element fallback. */ }
    }
    sourceUrl = bitmap ? "" : URL.createObjectURL(file);
    const image = bitmap ?? await imageElementFor(sourceUrl);
    const width = bitmap?.width ?? (image as HTMLImageElement).naturalWidth;
    const height = bitmap?.height ?? (image as HTMLImageElement).naturalHeight;
    if (!width || !height) throw new Error("This browser cannot read the selected photo. Choose a JPEG or PNG image and try again.");
    const scale = Math.min(1, 512 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot process the selected photo.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await webpFromCanvas(canvas);
    if (blob.size > MAX_AVATAR_FILE_SIZE) throw new Error("That photo is too large after conversion. Choose a smaller image.");
    return blob;
  } finally {
    bitmap?.close();
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  }
}
