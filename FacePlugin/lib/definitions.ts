export interface FaceRecognitionSdkPlugin {
  getMachineCode(): Promise<{ value: string }>;
  getLicenseStatus(): Promise<{ value: string }>;
  setActivation(options: { license: string }): Promise<{ value: number }>;
  init(): Promise<{ value: number }>;
  deinit(): Promise<void>;
  lastLicenseError(): Promise<{ value: string }>;
  setLandmarkMode(options: { mode: number }): Promise<{ value: number }>;
  getLandmarkMode(): Promise<{ value: number }>;
  detect(options: {
    image: string;
    crop?: boolean;
    flags?: number;
  }): Promise<{ value: string }>;
  faceDetection(options: {
    image: string;
    param?: string | null;
  }): Promise<{ value: string }>;
  templateExtraction(options: {
    image: string;
    faceBox: string;
  }): Promise<{ value: string }>;
  cropFace(options: {
    image: string;
    faceBox: string;
  }): Promise<{ value: string }>;
  extractFeature(options: { image: string }): Promise<{ value: string }>;
  similarity(options: {
    feature1: string;
    feature2: string;
  }): Promise<{ value: number }>;
  /** 1:N similarity in one call; `value` is a JSON array of scores (-1 for a bad candidate). */
  similarityMany(options: {
    probe: string;
    candidates: string[];
  }): Promise<{ value: string }>;
  /** Writes a JPEG (optionally a face crop) into app storage; `value` is its file:// URI. */
  writeFaceImage(options: {
    image: string;
    path: string;
    options?: string;
  }): Promise<{ value: string }>;
  /** Deletes each path; `value` is the number removed. */
  deleteFiles(options: { paths: string[] }): Promise<{ value: number }>;
  /** Empties a directory but keeps it; `value` is the number removed. */
  deleteDirectory(options: { path: string }): Promise<{ value: number }>;
  quality(options: {
    image: string;
    crop?: boolean;
  }): Promise<{ value: string }>;
  startVideoWorker(options?: { config?: string }): Promise<{ value: number }>;
  stopVideoWorker(): Promise<void>;
  syncVideoWorkerDatabase(options: {
    features: string[];
    matchThreshold?: number;
  }): Promise<{ value: number }>;
  probeLiveImage(options: { image: string }): Promise<{
    width: number;
    height: number;
  }>;
  applyLiveFrame(options: {
    image: string;
    rotateDegrees: number;
    maxEdge: number;
    feedWorker: boolean;
  }): Promise<{
    ingested: boolean;
    width: number;
    height: number;
    uri?: string | null;
  }>;
  exportLastLiveFrame(options?: {
    preview?: boolean;
  }): Promise<{
    ingested: boolean;
    width: number;
    height: number;
    uri?: string | null;
    /** Full-frame data:image/jpeg;base64,… for Cordova WebView <img> / detect. */
    dataUrl?: string | null;
    /** Compact JPEG base64 (no data: prefix) for Cordova WebView <img>. */
    previewB64?: string | null;
    previewDataUrl?: string | null;
  }>;
  /** Decode file:// / content:// to a data URL the WebView can show in <img>. */
  readImageDataUrl(options: { image: string }): Promise<{ value: string }>;
  writeStatus(options: { payload: string }): Promise<void>;
  estimatorStatus(): Promise<{ value: string }>;
  startLivePreview(options?: { frontCamera?: boolean }): Promise<void>;
  stopLivePreview(): Promise<void>;
  takeLiveSnapshot(): Promise<{ uri: string; path: string }>;
  pickFolderImages(): Promise<{ uri: string; fileName: string }[]>;
  addListener(
    eventName: 'FaceRecognitionVideoWorkerEvent',
    listener: (event: { json: string }) => void
  ): Promise<{ remove: () => Promise<void> }>;
}
