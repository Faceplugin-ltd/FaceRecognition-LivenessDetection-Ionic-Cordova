<div align="center">
<img alt="FacePlugin" src="https://raw.githubusercontent.com/Faceplugin-ltd/faceplugin-assets/main/brand/logo.png" width="400"/>
</div>

#### 🌐 Company Site - [Here](https://faceplugin.com)
#### 🤗 Hugging Face - [Here](https://huggingface.co/FacePlugin-Ltd)
#### 🛟 Help Center - [Here](https://doc.faceplugin.com)
#### 🐳 Docker Hub - [Here](https://hub.docker.com/r/faceplugin/face-recognition)

# FacePlugin Face Recognition + 1:N Identification + Liveness Detection — Ionic Cordova (Fully On-Premise)

Jump: [Quick start](#quick-start) · [Get the runtimes](#get-the-runtimes) · [Run the demo](#run-the-demo) · [SDK License](#sdk-license) · [Setup on your own app](#setup-on-your-own-app) · [About SDK](#about-sdk)

## Quick start

- [ ] Clone [FaceRecognition-LivenessDetection-Ionic-Cordova](https://github.com/Faceplugin-ltd/FaceRecognition-LivenessDetection-Ionic-Cordova)
- [ ] Place the native runtimes — [Get the runtimes](#get-the-runtimes)
- [ ] `python run_android.py` (or `python run_ios.py` on macOS) with a **physical** phone plugged in
- [ ] The demo ships with license keys for `com.faceplugin.facerecognitionsdk` (Android) and `com.faceplugin.facerecognition.app` (iOS)

That is the whole setup. The scripts do the rest: `npm install`, adding the platform on the first
run, `cordova prepare`, the build, and the install onto the phone. They need Node 18+, JDK 17 and
Cordova 12 (plus Xcode 15+ on macOS) on PATH, and stop with a named hint if anything is missing.

> **iOS:** set your Team ID in `build.json` first. On Windows, do not add the iOS platform —
> add it only on macOS, after placing the frameworks.

## Introduction

FacePlugin **Face Recognition + Liveness Detection for Ionic Cordova** runs face recognition and passive liveness entirely on the device. Nothing is sent to a FacePlugin server, which is what banking, access control, and privacy-first identity apps need. Its headline capability is **1:N identification**: enroll your people once, then ask *who is this?* of a camera frame or a photo and get a ranked candidate list back — searched against the templates your app keeps on the device, so no face ever leaves it.

This repository is the whole product: the **Cordova plugin** (`FacePlugin/`, package `face-recognition-cordova`), the native bridges for Android and iOS, and an **Ionic React demo** at the repository root — so what you read here is what the demo runs.

| Folder | Purpose |
| ------ | ------- |
| Repository root | The Ionic React demo (`config.xml`, `src/`, `www/`) |
| `FacePlugin/` | The Cordova plugin you add to your own app |

The engine binaries are the same ones the native apps use, so you get identical scores on both platforms.

### Main Functionalities

| Feature | API |
| ------- | --- |
| **1:N identification** on a live camera feed | `IdentifySession` (VideoWorker) · or the raw `startVideoWorker` · `syncVideoWorkerDatabase` · `addVideoWorkerFrame` |
| Face detection (bounding box, landmarks, pose, attributes) | `faceDetection` |
| Passive liveness (anti-spoofing) | `faceDetection` with liveness, `IdentifySession` / `CaptureSession` events |
| Face image quality | `quality` |
| Face template extraction and similarity | `templateExtraction` · `similarity` |
| Guided camera capture | `CaptureSession` |
| Face crop for enrollment | `cropFace` |
| License and engine lifecycle | `getMachineCode` · `setActivation` · `init` · `getLicenseStatus` |

### Product List

| Platform | Repository |
| -------- | ---------- |
| Android | [FaceRecognition-LivenessDetection-Android](https://github.com/Faceplugin-ltd/FaceRecognition-LivenessDetection-Android) |
| iOS | [FaceRecognition-LivenessDetection-iOS](https://github.com/Faceplugin-ltd/FaceRecognition-LivenessDetection-iOS) |
| React Native | [FaceRecognition-LivenessDetection-ReactNative](https://github.com/Faceplugin-ltd/FaceRecognition-LivenessDetection-ReactNative) |
| Flutter | [FaceRecognition-LivenessDetection-Flutter](https://github.com/Faceplugin-ltd/FaceRecognition-LivenessDetection-Flutter) |
| .NET MAUI | [FaceRecognition-LivenessDetection-DotNet-MAUI](https://github.com/Faceplugin-ltd/FaceRecognition-LivenessDetection-DotNet-MAUI) |
| **Ionic Cordova** | **[FaceRecognition-LivenessDetection-Ionic-Cordova](https://github.com/Faceplugin-ltd/FaceRecognition-LivenessDetection-Ionic-Cordova)** **(this repo)** |
| Ionic Capacitor | [FaceRecognition-LivenessDetection-Ionic-Capacitor](https://github.com/Faceplugin-ltd/FaceRecognition-LivenessDetection-Ionic-Capacitor) |

### Related products

- **Face Liveness Detection — Android** — [FaceLivenessDetection-Android](https://github.com/Faceplugin-ltd/FaceLivenessDetection-Android) — liveness only
- **Face Liveness Detection — iOS** — [FaceLivenessDetection-iOS](https://github.com/Faceplugin-ltd/FaceLivenessDetection-iOS) — liveness only
- **Face Recognition — Windows** — [FaceRecognition-Windows](https://github.com/Faceplugin-ltd/FaceRecognition-Windows) — on-premise server
- **Face Recognition — Docker** — [FaceRecognition-Docker](https://github.com/Faceplugin-ltd/FaceRecognition-Docker) — on-premise server

## Before you start

| Step | What you need |
| ---- | ------------- |
| 1 | Node 18+, npm, Cordova CLI (`npx cordova` is enough), JDK 17, Android SDK. For iOS: macOS with Xcode 15+ and your Apple Team ID in `build.json` |
| 2 | The Android AAR and the iOS frameworks — see [Get the runtimes](#get-the-runtimes) |
| 3 | A **physical** phone. Emulators and the simulator have no usable camera for liveness |
| 4 | A license key for your ids ([contact us](#contact)). The demo already has keys for the ids above |

### System requirements

| Item | Minimum | Recommended |
| ---- | ------- | ----------- |
| Android | API 24, `arm64-v8a` | Android 10 or newer |
| iOS | 13.0, arm64 device | iPhone 11 or newer |
| Node | 18 | 20 |
| RAM (device) | 4 GB | 6 GB or more |

## Get the runtimes

The native binaries are too large for GitHub, so they are published on the **Android** and **iOS** release pages. Both platforms use the same engine, so take them from the same release.

### Android — `facerecognitionsdk.aar`

**[Download from the Android release](https://github.com/Faceplugin-ltd/FaceRecognition-LivenessDetection-Android/releases/tag/latest)**

```text
FacePlugin/src/android/facerecognitionsdk.aar
```

Place it **before** adding the plugin to a platform.

### iOS — frameworks

**[Download from the iOS release](https://github.com/Faceplugin-ltd/FaceRecognition-LivenessDetection-iOS/releases/tag/latest)**

```text
FacePlugin/src/ios/Frameworks/
├── facerecognitionsdk.framework
├── FacePluginSDK.framework
├── FacePPlugin.framework       (the FacePlugin xcframework ios-arm64 slice)
└── FaceDetect.framework
```

Device arm64 only.

### iOS signing (macOS)

Put your Apple Team ID in the root `build.json`:

```json
{ "ios": { "debug": { "developmentTeam": "XXXXXXXXXX" } } }
```

The Team ID is the certificate **OU** in Keychain, not the id next to your email. Free Apple IDs allow only a few simultaneous apps (`0xe8008021` means you should delete unused free-dev apps from the phone).

## Run the demo

```bash
python run_android.py     # downloads Releases assets if missing; or: python run_ios.py on macOS
```

The runner downloads the engine if needed, then runs the usual Cordova steps. By hand:

```bash
npm install
npm run setup:android                     # once — platform + camera + plugin + prepare
npm run android                           # build → cordova prepare → cordova run
```

On macOS, put your Apple team id in `build.json`, then:

```bash
npm run setup:ios                         # once — platform + camera + plugin + prepare
npm run ios
```

`npm run android` bootstraps Gradle when needed (`scripts/with-gradle.js`: system PATH, then the Gradle wrapper cache, then a portable copy under `.tools/`). Cordova needs a Gradle binary on PATH to create the platform wrapper the first time.

Keep the demo ids so the included license activates:

| Platform | Identifier |
| -------- | ---------- |
| Android `applicationId` | `com.faceplugin.facerecognitionsdk` |
| iOS bundle id | `com.faceplugin.facerecognition.app` |

The demo has five tabs:

| Tab | What it shows |
| --- | ------------- |
| **Identify** | Live 1:N against everyone enrolled, with liveness, then a ranked result |
| **People** | Enroll from photos or the capture coach, search, edit, delete |
| **Attribute** | Every face in a photo: liveness, quality, pose, expression, age, gender, landmarks |
| **Liveness** | Live anti-spoofing check on the camera feed |
| **Settings** | Match, liveness, and pose thresholds; license status |

### Screenshots

<p align="center">
<img src="https://raw.githubusercontent.com/Faceplugin-ltd/faceplugin-assets/main/screenshots/face-recognition/mobile/identify.gif" width="240" alt="FacePlugin Face Recognition — live 1:N identification with liveness"/>
&nbsp;
<img src="https://raw.githubusercontent.com/Faceplugin-ltd/faceplugin-assets/main/screenshots/face-recognition/mobile/people.gif" width="240" alt="FacePlugin Face Recognition — enroll people with the guided capture coach"/>
&nbsp;
<img src="https://raw.githubusercontent.com/Faceplugin-ltd/faceplugin-assets/main/screenshots/face-recognition/mobile/attribute.gif" width="240" alt="FacePlugin Face Recognition — face attributes, quality and landmarks from a photo"/>
</p>

<p align="center">
<img src="https://raw.githubusercontent.com/Faceplugin-ltd/faceplugin-assets/main/screenshots/face-recognition/mobile/liveness.gif" width="240" alt="FacePlugin Face Recognition — passive liveness check on the camera feed"/>
&nbsp;
<img src="https://raw.githubusercontent.com/Faceplugin-ltd/faceplugin-assets/main/screenshots/face-recognition/mobile/settings.png" width="240" alt="FacePlugin Face Recognition — match, liveness and pose thresholds in Settings"/>
</p>

## SDK License

The demo runs as it is: a FacePlugin key for `com.faceplugin.facerecognitionsdk` (Android) and `com.faceplugin.facerecognition.app` (iOS) is already in the code. Licenses are **offline** — once activated, nothing phones home — and each one is bound to your `applicationId` and bundle identifier, so your own app needs its own key.

### Set your SDK license

| What | File | What to find |
| ---- | ---- | ------------ |
| The keys | [`src/license.ts`](src/license.ts) | `ANDROID_LICENSE`, `IOS_LICENSE` |
| Where they are used | [`src/engine.ts`](src/engine.ts) | `setActivation(demoLicense())` |
| The ids they are bound to | [`config.xml`](config.xml) | `widget id`, `ios-CFBundleIdentifier` |

Find this, and put your key in place of the demo one:

```ts
const ANDROID_LICENSE =
  'FP1.RlBMMQMAAQDJx5NBpyjuxrTSuz8MAgAA…';
```

Rebuild the native app — a web reload is not enough, because activation happens once after `deviceready`. `demoLicense()` picks the Android or iOS key at runtime, so set both.

### How to get a key

[Contact us](#contact) with the id you will ship. If we ask for a machine code, `getMachineCode()` returns it. After activation, `getLicenseStatus()` reports what the key unlocks.

### License capabilities (Recognition + Liveness)

| Capability | Meaning |
| ---------- | ------- |
| **Recognition** | Detection, attributes, quality, templates, 1:1 similarity, and 1:N identification |
| **Liveness** | Passive anti-spoofing on camera frames and stills |

## Setup on your own app

You integrate from **this repository** — there is no npm package to install, and no package-server dependency to add.

1. Clone this repository and copy the `FacePlugin/` folder into your own app (or keep the clone beside it).
2. Place the Android AAR and the iOS frameworks inside that folder — [Get the runtimes](#get-the-runtimes).
3. Add the plugin from the local folder:

   ```bash
   ionic cordova plugin add ./FacePlugin
   ```

   The TypeScript API is published from the same folder as `face-recognition-cordova`, so add `"face-recognition-cordova": "file:FacePlugin"` to your `package.json`.

4. Enable Kotlin and AndroidX in `config.xml`:

   ```xml
   <preference name="GradlePluginKotlinEnabled" value="true" />
   <preference name="GradlePluginKotlinVersion" value="1.9.24" />
   <preference name="AndroidXEnabled" value="true" />
   ```

5. Set **your** `applicationId` / bundle id, and request a license for those ids.
6. Add camera and photo permissions for both platforms.

You do **not** need the demo pages in `src/`. Full wiring and result JSON: [https://doc.faceplugin.com](https://doc.faceplugin.com)

## About SDK

Activate once at start-up, then call the engine. `SDK_SUCCESS` (`0`) means success.

**1. Activate and initialize**

```ts
import {
  getMachineCode,
  setActivation,
  init,
  getLicenseStatus,
  SDK_SUCCESS,
} from 'face-recognition-cordova';

const machine = await getMachineCode();        // send this when you request a key
const code = await setActivation('FP1.…');     // bound to your applicationId / bundle id
if (code !== SDK_SUCCESS) throw new Error('activation failed');
await init();
const status = await getLicenseStatus();
```

**2. Read a face, and enroll it**

```ts
import { faceDetection, templateExtraction, cropFace, similarity } from 'face-recognition-cordova';

const faces = await faceDetection(imageUri);
if (faces.length === 1) {
  const template = await templateExtraction(imageUri, faces[0]);
  const crop = await cropFace(imageUri, faces[0]);
  // store the template and the crop in YOUR database
}

const score = await similarity(templateA, templateB);   // 1:1
```

**3. Live 1:N identification and capture**

Two session classes do the camera work for you — `IdentifySession` for live 1:N, `CaptureSession` for the guided capture coach. Both are exported from the plugin package, and the demo's camera pages are built on them.

```ts
import { IdentifySession, CaptureSession, DEFAULT_CAPTURE_SETTINGS } from 'face-recognition-cordova';

const identify = new IdentifySession({
  settings: {
    frontCamera: true,
    matchThreshold: 0.8,     // startVideoWorker's own default is 0.67
    livenessLevel: 0,
  },
  featureTemplates,          // the templates you enrolled, in your own order
  onTracking: (boxes, frame) => drawOverlay(boxes, frame),
  onMatch: (personIndex, score) => show(featureTemplates[personIndex], score),
});
await identify.start();      // preview + video worker + gallery sync
await identify.stop();
```

`CaptureSession` drives the oval capture coach the same way — it reports a `CaptureState` and a warning per frame, and `captureNow()` returns the still, the face box and a crop:

```ts
const capture = new CaptureSession({
  settings: { ...DEFAULT_CAPTURE_SETTINGS, camera_lens: 'front' },
  onState: (state, warning, boxes, frame) => coach(state, warning, boxes, frame),
  onCaptured: ({ uri, faceBox, cropB64 }) => enroll(uri, faceBox, cropB64),
});
await capture.start();
const shot = await capture.captureNow(boxes);
await capture.stop();
```

Both sessions own the camera, so start only one at a time. The raw calls underneath are still exported if you drive the camera yourself:

```ts
import { startVideoWorker, syncVideoWorkerDatabase, addVideoWorkerFrame, stopVideoWorker } from 'face-recognition-cordova';

await startVideoWorker({ matchThreshold: 0.67 });
await syncVideoWorkerDatabase(templates, 0.67);
// feed camera frames with addVideoWorkerFrame(...)
await stopVideoWorker();
```

**4. Status codes**

| Code | Constant | Meaning |
| ---- | -------- | ------- |
| 0 | `SDK_SUCCESS` | Activate / init OK |
| 1 | `SDK_LICENSE_INVALID` | Invalid license |
| 2 | `SDK_LICENSE_EXPIRED` | Expired license |
| 3 | `SDK_NOT_ACTIVATED` | Not activated |
| 4 | `SDK_INIT_FAILED` | `init()` failed |

**5. Thresholds**

Thresholds (match, liveness, pose, eye-close) are parameters you pass from TypeScript, so you can tune them for your product. Three different defaults apply, depending on where you are:

| Where | Defaults |
| ----- | -------- |
| `DEFAULT_CAPTURE_SETTINGS` — guided capture ([`FacePlugin/lib/capture/types.ts`](FacePlugin/lib/capture/types.ts)) | `match_threshold` **0.8**, `liveness_threshold` **0.5**, `liveness_level` **0**, `yaw/roll/pitch_threshold` **20**, `eyeclose_threshold` **0.5** |
| `startVideoWorker` / `syncVideoWorkerDatabase` — live 1:N ([`FacePlugin/lib/runtime.ts`](FacePlugin/lib/runtime.ts)) | `matchThreshold` **0.67** |
| The demo's Settings tab ([`src/data/settings.ts`](src/data/settings.ts)) | `threshold` **0.8**, `livenessThreshold` **0.5**, slider range **0.7 – 0.9** |

The video worker's 0.67 and capture's 0.8 are genuinely different numbers, so pick the one that belongs to the call you are making. Pass your own value and no default applies.

## Contact

<div align="left">
<a target="_blank" href="mailto:info@faceplugin.com"><img src="https://img.shields.io/badge/email-info@faceplugin.com-blue.svg?logo=gmail" alt="faceplugin.com"></a>&emsp;
<a target="_blank" href="https://t.me/FacePluginSupport"><img src="https://img.shields.io/badge/telegram-@FacePluginSupport-blue.svg?logo=telegram" alt="Telegram @FacePluginSupport"></a>&emsp;
<a target="_blank" href="https://wa.me/+14692784822"><img src="https://img.shields.io/badge/whatsapp-faceplugin-blue.svg?logo=whatsapp" alt="faceplugin.com"></a>
</div>
