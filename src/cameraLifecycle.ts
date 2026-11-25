import { stopLivePreview } from 'face-recognition-cordova';

/**
 * Ensure native preview is stopped when leaving Identify/Capture (Ion keeps pages mounted).
 * Goes through the same exclusive live-camera queue as CaptureSession.stop().
 */
export async function ensureCameraStopped(): Promise<void> {
  try {
    await stopLivePreview();
  } catch {
    /* already stopped / not started */
  }
}
