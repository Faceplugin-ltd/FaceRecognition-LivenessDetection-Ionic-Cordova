import {
  convertFileSrc,
  pickFolderImages as nativePickFolder,
  readImageDataUrl,
} from 'face-recognition-cordova';

/** file:// → data: cache so People / Result tiles do not re-decode every render. */
const displaySrcCache = new Map<string, string>();

declare global {
  interface Navigator {
    camera?: {
      getPicture: (
        success: (data: string) => void,
        error: (err: string) => void,
        options?: Record<string, unknown>
      ) => void;
      DestinationType?: { FILE_URI: number; DATA_URL: number };
      PictureSourceType?: {
        PHOTOLIBRARY: number;
        CAMERA: number;
        SAVEDPHOTOALBUM: number;
      };
      EncodingType?: { JPEG: number; PNG: number };
      MediaType?: { PICTURE: number };
    };
  }
}

/**
 * Cordova WebView (https://localhost) cannot load content:// or raw file:// in <img>.
 * Prefer DATA_URL so gallery preview, measureImage, and native detect/crop share one payload.
 */
export async function pickGalleryPhoto(): Promise<string> {
  const cam = navigator.camera;
  if (!cam?.getPicture) {
    throw new Error(
      'cordova-plugin-camera is not available. Run on a Cordova device build.'
    );
  }
  const DestinationType = cam.DestinationType ?? { FILE_URI: 1, DATA_URL: 0 };
  const PictureSourceType = cam.PictureSourceType ?? {
    PHOTOLIBRARY: 0,
    CAMERA: 1,
    SAVEDPHOTOALBUM: 2,
  };
  const EncodingType = cam.EncodingType ?? { JPEG: 0, PNG: 1 };
  const MediaType = cam.MediaType ?? { PICTURE: 0 };

  const data = await new Promise<string>((resolve, reject) => {
    cam.getPicture(
      (raw) => resolve(raw),
      (err) => reject(new Error(String(err || 'No photo selected'))),
      {
        quality: 90,
        destinationType: DestinationType.DATA_URL,
        sourceType: PictureSourceType.PHOTOLIBRARY,
        encodingType: EncodingType.JPEG,
        mediaType: MediaType.PICTURE,
        correctOrientation: true,
        targetWidth: 1280,
        targetHeight: 1280,
      }
    );
  });

  if (!data) throw new Error('No photo selected');
  if (data.startsWith('data:')) return data;
  return `data:image/jpeg;base64,${data}`;
}

/** The most photos one import run will take, so the page cannot hold an unbounded set. */
export const MAX_IMPORT_PHOTOS = 50;

/**
 * Several photos at once, for Bulk enroll from photos. Each becomes one person.
 *
 * `cordova-plugin-camera` picks one photo at a time, so this uses a file input instead and
 * hands the engine data URIs, which its image loader accepts the same as a path. That keeps
 * the photos in memory, hence [MAX_IMPORT_PHOTOS].
 */
export async function pickImages(): Promise<string[]> {
  try {
    const files = await chooseFiles();
    const out: string[] = [];
    for (const file of files.slice(0, MAX_IMPORT_PHOTOS)) {
      const uri = await readAsDataUri(file);
      if (uri) out.push(uri);
    }
    return out;
  } catch {
    // The user cancelling the picker is the common case.
    return [];
  }
}

export async function pickFolderImages(): Promise<string[]> {
  try {
    const items = await nativePickFolder();
    return items
      .map((i) => i.uri)
      .filter((p) => p.length > 0)
      .slice(0, MAX_IMPORT_PHOTOS);
  } catch {
    return [];
  }
}

function chooseFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.style.display = 'none';
    input.onchange = () => {
      resolve(Array.from(input.files ?? []));
      input.remove();
    };
    // A cancelled picker fires no change event on some WebViews, so the element is left to
    // the page; it is display:none and harmless.
    document.body.appendChild(input);
    input.click();
  });
}

function readAsDataUri(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

export function thumbSrc(b64: string | null | undefined): string | undefined {
  if (!b64) return undefined;
  return b64.startsWith('data:') ? b64 : `data:image/jpeg;base64,${b64}`;
}

export function displayUri(uri: string | null | undefined): string | undefined {
  if (!uri) return undefined;
  if (
    uri.startsWith('data:') ||
    uri.startsWith('blob:') ||
    uri.startsWith('http')
  ) {
    return uri;
  }
  const cached = displaySrcCache.get(uri);
  if (cached) return cached;
  try {
    return convertFileSrc(uri);
  } catch {
    return uri;
  }
}

/**
 * Cordova Android serves https://localhost, so <img src="file://…"> is blocked.
 * Prefer a cached data URL from native; fall back to convertFileSrc (iOS / Capacitor).
 */
export async function resolveDisplaySrc(
  uri: string | null | undefined
): Promise<string> {
  if (!uri) return '';
  if (
    uri.startsWith('data:') ||
    uri.startsWith('blob:') ||
    uri.startsWith('http://') ||
    uri.startsWith('https://')
  ) {
    return uri;
  }
  const cached = displaySrcCache.get(uri);
  if (cached) return cached;
  try {
    const dataUrl = await readImageDataUrl(uri);
    if (dataUrl && dataUrl !== uri) {
      displaySrcCache.set(uri, dataUrl);
      return dataUrl;
    }
  } catch {
    // Native bridge unavailable (browser) or decode failed.
  }
  try {
    const converted = convertFileSrc(uri);
    if (converted) {
      displaySrcCache.set(uri, converted);
      return converted;
    }
  } catch {
    /* keep uri */
  }
  return uri;
}

export async function measureImage(
  uri: string
): Promise<{ w: number; h: number }> {
  const src = await resolveDisplaySrc(uri);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () =>
      resolve({
        w: img.naturalWidth || img.width,
        h: img.naturalHeight || img.height,
      });
    img.onerror = () => resolve({ w: 0, h: 0 });
    img.src = src;
  });
}

/** Match native ImageUtils.ENGINE_MAX_SIDE — face boxes are in this prepared space. */
export const ENGINE_MAX_SIDE = 1280;

export function engineImageSize(
  w: number,
  h: number,
  maxSide: number = ENGINE_MAX_SIDE
): { w: number; h: number } {
  if (w <= 0 || h <= 0) return { w, h };
  const edge = Math.max(w, h);
  if (edge <= maxSide) return { w, h };
  const scale = maxSide / edge;
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}
