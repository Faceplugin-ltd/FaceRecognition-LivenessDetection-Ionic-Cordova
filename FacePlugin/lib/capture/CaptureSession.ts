import {
  cropFace,
  exportLastLiveFrame,
  faceDetection,
  startVideoWorker,
  stopVideoWorker,
  subscribeVideoWorker,
  withLiveCameraExclusive,
  type FaceBox,
} from '../runtime';
import { workerFaceToBox } from './videoWorker';
import {
  checkFace,
  mergeEyes,
  mergeLiveness,
  warningFor,
  type CaptureState,
} from './captureLogic';
import type { CaptureResult, CaptureSettings } from './types';

export type CaptureSessionOptions = {
  settings: CaptureSettings;
  onState: (
    state: CaptureState,
    warning: string,
    boxes: FaceBox[],
    frame: { w: number; h: number }
  ) => void;
  onCaptured: (result: CaptureResult) => void;
};

export class CaptureSession {
  readonly settings: CaptureSettings;
  readonly onState: CaptureSessionOptions['onState'];
  readonly onCaptured: CaptureSessionOptions['onCaptured'];

  frameSize = { w: 480, h: 640 };
  lastBoxes: FaceBox[] = [];

  private unsubscribe: (() => void) | null = null;
  private cancelled = false;
  private capturing = false;
  private lastLiveness: FaceBox[] = [];
  private livBusy = false;
  private livTimer: ReturnType<typeof setTimeout> | null = null;
  /** True after preview + worker were brought up in start(); stop() clears it. */
  private running = false;

  constructor(opts: CaptureSessionOptions) {
    this.settings = opts.settings;
    this.onState = opts.onState;
    this.onCaptured = opts.onCaptured;
  }

  /** Native front preview is mirrored on both platforms; engine frames are not. */
  get overlayMirror(): boolean {
    return this.settings.camera_lens === 'front';
  }

  async start(): Promise<void> {
    this.cancelled = false;
    this.capturing = false;
    this.lastLiveness = [];

    // Entire bring-up is one exclusive hop so a tab switch cannot interleave
    // another session's start between preview and video-worker.
    await withLiveCameraExclusive(async ({ startPreview, stopPreview }) => {
      if (this.cancelled) return;

      await startPreview(this.settings.camera_lens === 'front');
      if (this.cancelled) {
        await stopPreview();
        return;
      }

      this.unsubscribe = subscribeVideoWorker((ev) => {
        if (this.cancelled || this.capturing || ev.type !== 'tracking') return;
        if (ev.frameWidth > 0 && ev.frameHeight > 0) {
          this.frameSize = { w: ev.frameWidth, h: ev.frameHeight };
        }
        const merged = mergeEyes(
          mergeLiveness(ev.faces.map(workerFaceToBox), this.lastLiveness),
          [],
          this.overlayMirror
        );
        this.lastBoxes = merged;
        const state = checkFace(merged, this.settings, this.frameSize);
        this.onState(state, warningFor(state), merged, this.frameSize);
      });

      try {
        await startVideoWorker({ matchThreshold: this.settings.match_threshold });
      } catch (e) {
        this.unsubscribe?.();
        this.unsubscribe = null;
        await stopPreview();
        throw e;
      }

      if (this.cancelled) {
        this.unsubscribe?.();
        this.unsubscribe = null;
        try {
          await stopVideoWorker();
        } catch {
          // already down
        }
        await stopPreview();
        return;
      }

      this.running = true;
      if (this.settings.poll_liveness) {
        this.scheduleLivenessPoll();
      }
    });
  }

  async stop(): Promise<void> {
    this.cancelled = true;
    if (this.livTimer != null) {
      clearTimeout(this.livTimer);
      this.livTimer = null;
    }

    // Enqueued synchronously so React `void session.stop()` still claims the
    // lock before the next tab's start() can.
    await withLiveCameraExclusive(async ({ stopPreview }) => {
      this.unsubscribe?.();
      this.unsubscribe = null;
      this.lastLiveness = [];
      if (this.running) {
        try {
          await stopVideoWorker();
        } catch {
          // already down
        }
        this.running = false;
      }
      await stopPreview();
    });
  }

  /** Same cadence as IdentifySession: liveness is too heavy for every tracking frame. */
  private scheduleLivenessPoll(): void {
    const tick = async () => {
      if (this.cancelled) return;
      try {
        if (!this.livBusy && !this.capturing) {
          this.livBusy = true;
          try {
            const exported = await exportLastLiveFrame();
            if (exported.uri && !this.cancelled) {
              const liv = await faceDetection(exported.uri, {
                check_liveness: true,
                check_liveness_level: this.settings.liveness_level,
              });
              if (liv.length > 0) this.lastLiveness = liv;
            }
          } catch {
            // Optional while the camera warms up.
          } finally {
            this.livBusy = false;
          }
        }
      } finally {
        if (!this.cancelled) {
          this.livTimer = setTimeout(() => void tick(), 450);
        }
      }
    };
    this.livTimer = setTimeout(() => void tick(), 200);
  }

  async captureNow(boxes: FaceBox[]): Promise<CaptureResult | null> {
    if (this.capturing) return null;
    this.capturing = true;
    try {
      // The camera and the worker keep running while the still is read and detected. Stopping
      // the worker here tore the preview down for the length of the call and left the screen
      // frozen; `capturing` already keeps the tracking events from fighting the capture.
      // preview:true ships a data: URL — Cordova Android WebView cannot show file:// in <img>.
      const exported = await exportLastLiveFrame({ preview: true });
      const uri =
        exported.dataUrl ||
        (exported.previewB64
          ? `data:image/jpeg;base64,${exported.previewB64}`
          : null) ||
        exported.uri;
      if (!uri) return null;
      if (exported.width > 0 && exported.height > 0) {
        this.frameSize = { w: exported.width, h: exported.height };
      }
      let box = boxes[0] ?? this.lastBoxes[0] ?? null;
      try {
        const detected = await faceDetection(uri, {
          allAttributes: true,
          check_liveness: true,
          check_liveness_level: this.settings.liveness_level,
        });
        box = detected[0] ?? box;
      } catch {
        // keep tracker box
      }
      if (!box) return null;
      let cropB64: string | null = null;
      try {
        cropB64 = await cropFace(uri, box);
      } catch {
        cropB64 = null;
      }
      const result = { uri, faceBox: box, cropB64 };
      this.onCaptured(result);
      return result;
    } finally {
      this.capturing = false;
    }
  }
}
