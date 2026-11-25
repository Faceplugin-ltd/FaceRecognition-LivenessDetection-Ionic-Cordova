import {
  deleteDirectory,
  deleteFiles,
  faceDetection,
  similarityMany,
  writeFaceImage,
  type FaceBox,
} from 'face-recognition-cordova';
import { isReady, serial, stateMessage } from '../engine';
import { idTag, isoNow, score } from '../format';
import {
  makeReport,
  reportToJson,
  step,
  timed,
  type CallReport,
  type CallStep,
} from './report';
import { getSettings, isLive, type FaceLimits } from './settings';

/**
 * The on-device gallery (Android `kit/FaceGallery.kt` + `GalleryDb.kt`).
 *
 * Storage: records live in `localStorage` (one key per person, plus an id list and a
 * never-reused id counter) and the photos are JPEG files written by the plugin into
 * app-private storage (`gallery/<id>_crop.jpg`, `<id>_original.jpg`). Every engine call goes
 * through the engine queue, so calls never overlap.
 *
 * The steps, their details and the thresholds are the same as the Android and iOS apps,
 * because the same status card has to read correctly on all of them.
 */

export type Box = { x1: number; y1: number; x2: number; y2: number };

export type FaceRecord = {
  id: number;
  name: string;
  note: string;
  /** ISO-8601 UTC. */
  createdAt: string;
  /** Base64 recognition template. */
  feature: string;
  cropPath: string;
  originalPath: string;
  /** `CallReport` JSON; empty for people enrolled before it was stored. */
  enrollReport: string;
};

export type Candidate = {
  id: number;
  name: string;
  note: string;
  similarity: number;
};

export type ProbeFace = {
  index: number;
  box: Box;
  /** Top `TOP_K` by similarity, highest first. */
  ranked: Candidate[];
};

export type IdentifyResult = {
  probeUri: string;
  faces: ProbeFace[];
  threshold: number;
  extractMs: number;
  searchMs: number;
  gallerySize: number;
  report: CallReport;
};

export type IdentifyOutcome =
  | { kind: 'done'; result: IdentifyResult }
  | { kind: 'rejected'; reason: string; report: CallReport | null };

export type EnrollOutcome =
  | {
      kind: 'enrolled';
      record: FaceRecord;
      report: CallReport;
      /**
       * Every already-enrolled person scoring at or above the identify threshold, highest
       * first — not just the closest. One new face can match several existing ones, and
       * hiding the rest makes the gallery look cleaner than it is.
       */
      duplicates: Candidate[];
    }
  | { kind: 'rejected'; reason: string; report: CallReport | null };

export type FaceAttributes = {
  index: number;
  box: FaceBox;
  templateBytes: number;
  closest: Candidate | null;
};

export type AttributeResult = {
  probeUri: string;
  faces: FaceAttributes[];
  threshold: number;
  gallerySize: number;
  report: CallReport;
};

/** The name a face gets when none was typed: it matches the ID shown beside it. */
export function autoName(id: number): string {
  return `Person ${id}`;
}

export const TOP_K = 100;
export const MAX_ATTRIBUTE_FACES = 10;
export const NO_FACE = 'No face found. Use a clear, front-facing photo.';
export const LIVENESS_FAILED =
  'Liveness check failed. Use a live face, not a photo or screen.';
const READ_FAIL = 'Could not read this face. Use a clear, front-facing photo.';

const K_IDS = 'gallery_v1_ids';
const K_NEXT = 'gallery_v1_next_id';
const recKey = (id: number) => `gallery_v1_rec_${id}`;
const IMAGES_DIR = 'gallery';

// ---------------------------------------------------------------- store

let records: Map<number, FaceRecord> | null = null;
let nextId = 1;
let templateCache: FaceRecord[] | null = null;
const listeners = new Set<() => void>();

function load(): Map<number, FaceRecord> {
  if (records) return records;
  const map = new Map<number, FaceRecord>();
  try {
    const ids: number[] = JSON.parse(localStorage.getItem(K_IDS) ?? '[]');
    for (const id of Array.isArray(ids) ? ids : []) {
      const raw = localStorage.getItem(recKey(id));
      if (!raw) continue;
      const o = JSON.parse(raw);
      if (!o || typeof o.id !== 'number') continue;
      map.set(o.id, {
        id: o.id,
        name: String(o.name ?? ''),
        note: String(o.note ?? ''),
        createdAt: String(o.createdAt ?? ''),
        feature: String(o.feature ?? ''),
        cropPath: String(o.cropPath ?? ''),
        originalPath: String(o.originalPath ?? ''),
        enrollReport: String(o.enrollReport ?? ''),
      });
    }
    const maxId = [...map.keys()].reduce((m, id) => Math.max(m, id), 0);
    nextId = Math.max(Number(localStorage.getItem(K_NEXT)) || 1, maxId + 1);
  } catch {
    // A corrupt store starts empty rather than blocking the app.
  }
  records = map;
  return map;
}

function persistIds(map: Map<number, FaceRecord>) {
  localStorage.setItem(K_IDS, JSON.stringify([...map.keys()]));
}

function writeRecord(r: FaceRecord) {
  localStorage.setItem(recKey(r.id), JSON.stringify(r));
}

function changed() {
  templateCache = null;
  listeners.forEach((l) => l());
}

export function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Newest first — ids increase and are never reused, so id order is insertion order. */
function sorted(): FaceRecord[] {
  return [...load().values()].sort((a, b) => b.id - a.id);
}

function matchesQuery(r: FaceRecord, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    r.name.toLowerCase().includes(needle) ||
    r.note.toLowerCase().includes(needle)
  );
}

function templates(): FaceRecord[] {
  if (!templateCache) {
    templateCache = sorted().filter((r) => r.feature.length > 0);
  }
  return templateCache;
}

// ---------------------------------------------------------------- read

export function count(query = ''): number {
  const q = query.trim();
  return sorted().filter((r) => matchesQuery(r, q)).length;
}

export function page(query: string, limit: number, offset: number): FaceRecord[] {
  const q = query.trim();
  return sorted()
    .filter((r) => matchesQuery(r, q))
    .slice(offset, offset + limit);
}

export function get(id: number): FaceRecord | null {
  return load().get(id) ?? null;
}

// ---------------------------------------------------------------- edit / delete

export function update(id: number, name: string, note: string): boolean {
  const map = load();
  const r = map.get(id);
  if (!r) return false;
  const next = { ...r, name: name.trim(), note: note.trim() };
  map.set(id, next);
  writeRecord(next);
  changed();
  return true;
}

export async function remove(id: number): Promise<boolean> {
  const map = load();
  const r = map.get(id);
  if (!r) return false;
  map.delete(id);
  localStorage.removeItem(recKey(id));
  persistIds(map);
  try {
    const paths = [r.cropPath, r.originalPath].filter((p) => p.length > 0);
    if (paths.length) await serial(() => deleteFiles(paths));
  } catch {
    // The record is gone either way; a stranded JPEG is not worth failing over.
  }
  changed();
  return true;
}

/**
 * Removes every record and every stored crop / original, and restarts ids at 1 — a freshly
 * cleared demo gallery should not look like it still remembers the last one.
 * Returns how many faces went.
 */
export async function removeAll(): Promise<number> {
  const map = load();
  const n = map.size;
  for (const id of map.keys()) localStorage.removeItem(recKey(id));
  map.clear();
  persistIds(map);
  nextId = 1;
  localStorage.setItem(K_NEXT, '1');
  try {
    await serial(() => deleteDirectory(IMAGES_DIR));
  } catch {
    // best effort
  }
  changed();
  return n;
}

// ---------------------------------------------------------------- engine flows

function facesDetail(n: number): string {
  return n === 1 ? '1 face' : `${n} faces`;
}

function boxOf(f: FaceBox): Box {
  return { x1: f.x1, y1: f.y1, x2: f.x2, y2: f.y2 };
}

function limits(): FaceLimits {
  const s = getSettings();
  return {
    match: s.threshold,
    liveness: s.livenessThreshold,
    yaw: s.yaw,
    roll: s.roll,
    pitch: s.pitch,
  };
}

/** Similarity of [feature] against the whole gallery, highest first. */
async function rank(
  feature: string,
  gallery: FaceRecord[]
): Promise<Candidate[]> {
  if (gallery.length === 0) return [];
  const scores = await serial(() =>
    similarityMany(
      feature,
      gallery.map((g) => g.feature)
    )
  );
  return gallery
    .map((g, i) => ({
      id: g.id,
      name: g.name,
      note: g.note,
      similarity: scores[i] ?? -1,
    }))
    .sort((a, b) => b.similarity - a.similarity);
}

/** Base64 length → byte count, so the status card can show the template size. */
function base64Bytes(b64: string): number {
  if (!b64) return 0;
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

/**
 * Exactly-one-face enrollment from [photoUri].
 * Steps: detection, template, duplicate check (1:N against the gallery), save.
 */
export async function enroll(
  name: string,
  note: string,
  photoUri: string
): Promise<EnrollOutcome> {
  const cleanName = name.trim();
  if (!isReady()) {
    return { kind: 'rejected', reason: stateMessage(), report: null };
  }

  const steps: CallStep[] = [];
  // One engine pass: the template comes back with the detection, from the same open image,
  // as the native kits do. The two still show as separate steps below.
  const [faces, detectStep] = await timed(
    'faceDetection',
    () =>
      serial(() =>
        faceDetection(photoUri, {
          check_pose: true,
          check_landmarks: true,
          check_quality: true,
          templates: 1,
        })
      ),
    (f) => facesDetail(f.length),
    (f) => f.length === 1
  );
  steps.push(splitTemplateTime(detectStep, faces));

  if (faces.length === 0) {
    return {
      kind: 'rejected',
      reason: NO_FACE,
      report: makeReport('enroll', steps, 'No face', '', false),
    };
  }
  if (faces.length > 1) {
    return {
      kind: 'rejected',
      reason: `${faces.length} faces found. Use a photo that shows only one person.`,
      report: makeReport('enroll', steps, `${faces.length} faces`, '', false),
    };
  }

  const face = faces[0]!;
  const feature = templateOf(face);
  steps.push(
    step(
      'templateExtraction',
      templateMs(faces),
      feature ? `${base64Bytes(feature)} bytes` : 'no template',
      feature.length > 0
    )
  );
  if (!feature) {
    return {
      kind: 'rejected',
      reason: READ_FAIL,
      report: makeReport('enroll', steps, 'template failed', '', false),
    };
  }

  const threshold = limits().match;
  const gallery = templates();
  const [ranked, dupStep] = await timed(
    'duplicateCheck',
    () => rank(feature, gallery),
    (list: Candidate[]) => {
      if (list.length === 0) return 'gallery empty';
      const over = list.filter((c) => c.similarity >= threshold);
      if (over.length === 0) {
        return `closest ${list[0]!.name} · ${idTag(list[0]!.id)} · ${score(list[0]!.similarity)}`;
      }
      return (
        over
          .map((c) => `${c.name} · ${idTag(c.id)} · ${score(c.similarity)}`)
          .join(', ') + ` · possible duplicate${over.length > 1 ? 's' : ''}`
      );
    }
  );
  steps.push(dupStep);

  const [record, saveStep] = await timed(
    'save',
    async () => {
      const id = nextId++;
      localStorage.setItem(K_NEXT, String(nextId));
      const box = boxOf(face);
      const cropPath = await serial(() =>
        writeFaceImage(photoUri, `${IMAGES_DIR}/${id}_crop.jpg`, {
          box,
          mode: 'padded',
          padding: 0.12,
        })
      );
      const originalPath = await serial(() =>
        writeFaceImage(photoUri, `${IMAGES_DIR}/${id}_original.jpg`, {
          mode: 'full',
          quality: 90,
        })
      );
      const saved: FaceRecord = {
        id,
        name: cleanName,
        note: note.trim(),
        createdAt: isoNow(),
        feature,
        cropPath,
        originalPath,
        enrollReport: '',
      };
      const map = load();
      map.set(id, saved);
      writeRecord(saved);
      persistIds(map);
      return saved;
    },
    (r: FaceRecord) => `ID ${r.id} · ${gallery.length + 1} enrolled`
  );
  steps.push(saveStep);

  // A blank name is named after the id it was just given, so the People list and the
  // identify headline never show an empty space where a name belongs.
  const finalName = cleanName || autoName(record.id);
  if (finalName !== record.name) {
    record.name = finalName;
    writeRecord(record);
  }

  const duplicates = ranked.filter((c) => c.similarity >= threshold);
  const report = makeReport(
    'enroll',
    steps,
    duplicates.length === 0
      ? `Saved ${finalName} as ${idTag(record.id)}`
      : `Saved ${finalName} as ${idTag(record.id)} · looks like ` +
        duplicates.map((c) => `${c.name} (${idTag(c.id)})`).join(', '),
    `${steps.length} of ${steps.length} · saved`
  );
  const withReport = { ...record, enrollReport: reportToJson(report) };
  load().set(record.id, withReport);
  writeRecord(withReport);
  changed();
  return { kind: 'enrolled', record: withReport, report, duplicates };
}

// ---------------------------------------------------------------- identify

export async function identify(probeUri: string): Promise<IdentifyOutcome> {
  if (!isReady()) {
    return { kind: 'rejected', reason: stateMessage(), report: null };
  }
  const s = getSettings();
  const threshold = s.threshold;
  const steps: CallStep[] = [];

  // One engine pass again: every probe face is templated from the same open image.
  const [faces, detectStep] = await timed(
    'faceDetection',
    () =>
      serial(() =>
        faceDetection(probeUri, {
          check_liveness: s.liveness,
          check_pose: true,
          check_landmarks: true,
          // Both native kits identify with eyes on; the probe's eye openness is shown
          // beside the match.
          check_eye_closeness: true,
          templates: MAX_ATTRIBUTE_FACES,
        })
      ),
    (f) => facesDetail(f.length),
    (f) => f.length > 0
  );
  steps.push(splitTemplateTime(detectStep, faces));

  if (faces.length === 0) {
    return {
      kind: 'rejected',
      reason: NO_FACE,
      report: makeReport('identify', steps, 'No face', '', false),
    };
  }

  if (s.liveness) {
    const live = faces.filter((f) => isLive(s, f.liveness)).length;
    const lowest = faces.reduce(
      (m, f) =>
        typeof f.liveness === 'number' && Number.isFinite(f.liveness)
          ? Math.min(m, f.liveness)
          : m,
      Number.POSITIVE_INFINITY
    );
    // Liveness is scored during detection; this step only applies the threshold.
    steps.push(
      step(
        'livenessCheck',
        0,
        `${live} of ${faces.length} live · lowest ${score(lowest)} / ${score(s.livenessThreshold)}`,
        live === faces.length
      )
    );
    if (live < faces.length) {
      return {
        kind: 'rejected',
        reason: LIVENESS_FAILED,
        report: makeReport('identify', steps, 'Liveness failed', '', false),
      };
    }
  }

  const extracted: { face: FaceBox; feature: string }[] = [];
  for (const face of faces) {
    const feature = templateOf(face);
    if (feature) extracted.push({ face, feature });
  }
  steps.push(
    step(
      'templateExtraction',
      templateMs(faces),
      `${extracted.length} templates`,
      extracted.length > 0
    )
  );

  if (extracted.length === 0) {
    return {
      kind: 'rejected',
      reason: READ_FAIL,
      report: makeReport('identify', steps, 'template failed', '', false),
    };
  }

  const gallery = templates();
  const [probeFaces, searchStep] = await timed(
    'similarity',
    async () => {
      const out: ProbeFace[] = [];
      for (let i = 0; i < extracted.length; i++) {
        const ranked = await rank(extracted[i]!.feature, gallery);
        out.push({
          index: i,
          box: boxOf(extracted[i]!.face),
          ranked: ranked.slice(0, TOP_K),
        });
      }
      return out;
    },
    () => `${gallery.length} enrolled · ${extracted.length} probes`
  );
  steps.push(searchStep);

  let best: number | null = null;
  for (const f of probeFaces) {
    const top = f.ranked[0]?.similarity;
    if (typeof top === 'number' && (best === null || top > best)) best = top;
  }
  const report = makeReport(
    'identify',
    steps,
    best === null
      ? 'Gallery empty'
      : `Best similarity ${score(best)} · threshold ${score(threshold)}`,
    `${steps.length} of ${steps.length} · similarity`
  );
  const searchMs = steps
    .filter((st) => st.name === 'similarity')
    .reduce((sum, st) => sum + st.ms, 0);
  const totalMs = steps.reduce((sum, st) => sum + st.ms, 0);

  return {
    kind: 'done',
    result: {
      probeUri,
      faces: probeFaces,
      threshold,
      extractMs: totalMs - searchMs,
      searchMs,
      gallerySize: gallery.length,
      report,
    },
  };
}

// ---------------------------------------------------------------- attributes

/**
 * Attribute detection on every face, then a template and a 1:N gallery search per face
 * (up to `MAX_ATTRIBUTE_FACES`), timing each call.
 */
export async function attributes(probeUri: string): Promise<AttributeResult> {
  const steps: CallStep[] = [];
  const threshold = limits().match;
  if (!isReady()) {
    return {
      probeUri,
      faces: [],
      threshold,
      gallerySize: 0,
      report: makeReport('attribute', steps, stateMessage(), '', false),
    };
  }

  const gallery = templates();
  const [found, detectStep] = await timed(
    'faceDetection',
    // Liveness is always requested here, whatever the Settings gate says: Attribute is
    // the screen that reports every value the engine can produce.
    () =>
      serial(() =>
        faceDetection(probeUri, {
          allAttributes: true,
          check_liveness: true,
          templates: MAX_ATTRIBUTE_FACES,
          sortBySize: true,
        })
      ),
    (f) => `${facesDetail(f.length)} · attributes`,
    (f) => f.length > 0
  );
  steps.push(splitTemplateTime(detectStep, found));

  // The bridge already ordered them largest first, so the templates belong to the faces
  // this screen searches.
  const ordered = found;
  const searched = ordered.slice(0, MAX_ATTRIBUTE_FACES);

  const features: string[] = [];
  if (searched.length > 0) {
    for (const f of searched) {
      features.push(templateOf(f));
    }
    steps.push(
      step(
        'templateExtraction',
        templateMs(found),
        `${features.filter((f) => f).length} of ${features.length} templates`,
        features.some((f) => f.length > 0)
      )
    );
  }

  let closest: (Candidate | null)[] = [];
  if (features.some((f) => f.length > 0)) {
    const [hits, simStep] = await timed(
      'similarity',
      async () => {
        const out: (Candidate | null)[] = [];
        for (const feature of features) {
          out.push(
            !feature || gallery.length === 0
              ? null
              : ((await rank(feature, gallery))[0] ?? null)
          );
        }
        return out;
      },
      () =>
        `${gallery.length} enrolled · ${features.filter((f) => f).length} probes`
    );
    steps.push(simStep);
    closest = hits;
  }

  const faces: FaceAttributes[] = ordered.map((box, i) => ({
    index: i,
    box,
    templateBytes: base64Bytes(features[i] ?? ''),
    closest: closest[i] ?? null,
  }));

  let bestHit: Candidate | null = null;
  for (const f of faces) {
    if (f.closest && (!bestHit || f.closest.similarity > bestHit.similarity)) {
      bestHit = f.closest;
    }
  }
  const detail =
    faces.length === 0
      ? 'No face'
      : facesDetail(faces.length) +
        (bestHit ? ` · closest ${bestHit.name} ${score(bestHit.similarity)}` : '');

  return {
    probeUri,
    faces,
    threshold,
    gallerySize: gallery.length,
    report: makeReport('attribute', steps, detail, '', faces.length > 0),
  };
}

/** The template the bridge attached to this face on the detect call, or an empty string. */
function templateOf(face: FaceBox): string {
  const value = (face as { template?: unknown }).template;
  return typeof value === 'string' ? value : '';
}

/** Template time the bridge reported per face, summed. */
function templateMs(faces: FaceBox[]): number {
  return faces.reduce((sum, f) => {
    const ms = (f as { templateMs?: unknown }).templateMs;
    return sum + (typeof ms === 'number' ? ms : 0);
  }, 0);
}

/**
 * The detect step measured the whole call, templates included. This takes the template time
 * back out so the two steps on the status card still read as separate work.
 */
function splitTemplateTime(detectStep: CallStep, faces: FaceBox[]): CallStep {
  const detectOnly = detectStep.ms - templateMs(faces);
  return { ...detectStep, ms: detectOnly > 0 ? detectOnly : detectStep.ms };
}
