export const SOURCE_ACCEPT =
  "application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png";

export function getSourceFormat(name: string) {
  const extension = name.split(".").pop()?.toLowerCase();
  if (extension === "pdf") return "pdf";
  if (extension === "png") return "png";
  if (extension === "jpg" || extension === "jpeg") return "jpeg";
  return null;
}

export function hasImageSignature(bytes: Uint8Array, format: "png" | "jpeg") {
  const signature =
    format === "png" ? [137, 80, 78, 71, 13, 10, 26, 10] : [255, 216, 255];
  return signature.every((byte, index) => bytes[index] === byte);
}
