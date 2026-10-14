export type BusinessPhotoType = "exterior" | "interior" | "stock_equipment" | "applicant_at_business";
export type BusinessPhotoFiles = Partial<Record<BusinessPhotoType, File>>;
let files: BusinessPhotoFiles = {};
let consent = false;
let submittedApplicationId: string | null = null;
export function setBusinessPhotos(value: BusinessPhotoFiles, agreed: boolean) { files = value; consent = agreed; }
export function getBusinessPhotos() { return { files, consent, submittedApplicationId }; }
/** Store only the application identifier, never identity/business photos, across refreshes.
 * The server always enforces application ownership; this key is user-specific.
 */
const applicationKey = (userId: string) => "kuula:business-photo-application:" + encodeURIComponent(userId);
export function getBusinessPhotoApplicationId(userId: string): string | null {
  if (!userId) return null;
  try { return sessionStorage.getItem(applicationKey(userId)); }
  catch { return null; }
}
export function setBusinessPhotoApplicationId(value: string | null, userId?: string) {
  submittedApplicationId = value;
  if (!userId) return;
  try {
    if (value) sessionStorage.setItem(applicationKey(userId), value);
    else sessionStorage.removeItem(applicationKey(userId));
  } catch { /* Refresh recovery unavailable; continue with in-memory state. */ }
}
export function clearBusinessPhotos(userId?: string) {
  files = {}; consent = false; submittedApplicationId = null;
  if (userId) setBusinessPhotoApplicationId(null, userId);
}
export function clearAllBusinessPhotoApplicationIds() {
  try {
    for (let index = sessionStorage.length - 1; index >= 0; index--) {
      const key = sessionStorage.key(index);
      if (key?.startsWith("kuula:business-photo-application:")) sessionStorage.removeItem(key);
    }
  } catch { /* Unavailable storage is not a submission failure. */ }
}
export async function prepareBusinessPhoto(file: File): Promise<File> {
  if (file.size > 20 * 1024 * 1024) throw new Error("This photograph is too large (20MB maximum source).");
  if (!["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", ""].includes(file.type)) throw new Error("Choose a photo taken with your camera or saved as JPG, PNG or WEBP.");
  const url = URL.createObjectURL(file);
  let image: HTMLImageElement;
  try {
    image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Unable to open this image on your device."));
      element.src = url;
    });
  } finally { URL.revokeObjectURL(url); }
  const ratio = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The device cannot prepare this photo.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.85, 0.72, 0.6]) {
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size >= 32 && blob.size <= 5 * 1024 * 1024) return new File([blob], "business-photo.jpg", { type: "image/jpeg" });
  }
  throw new Error("Unable to compress this photo below 5MB.");
}
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Unable to prepare photo for upload"));
    reader.onerror = () => reject(new Error("Unable to read selected photo"));
    reader.readAsDataURL(file);
  });
}
