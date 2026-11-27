#!/usr/bin/env node
/**
 * Cordova after_prepare / before_build / before_run:
 * - Sync FacePlugin Android sources into plugins/ + platforms/ (Cordova does not
 *   refresh source-file copies when the local plugin changes).
 * - Disable Jetifier (huge AARs OOM Jetifier), raise heap, fix splash colors.
 */
const fs = require('fs');
const path = require('path');

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function syncAndroidSources(projectRoot) {
  const facePluginAndroid = path.join(
    projectRoot,
    'FacePlugin',
    'src',
    'android'
  );
  if (!fs.existsSync(facePluginAndroid)) return;

  // Cordova copies source-file entries once, when the plugin is installed. Later
  // Kotlin files (FaceSdkCompat, FolderImages) stay out of that copy, and the
  // installed hook is itself a stale snapshot, so sync every .kt here.
  const files = fs
    .readdirSync(facePluginAndroid)
    .filter((name) => name.endsWith('.kt'))
    .sort();
  const pluginDest = path.join(
    projectRoot,
    'plugins',
    'face-recognition-cordova',
    'src',
    'android'
  );
  const platformDest = path.join(
    projectRoot,
    'platforms',
    'android',
    'app',
    'src',
    'main',
    'java',
    'com',
    'facerecognitionsdk'
  );

  let copied = 0;
  for (const name of files) {
    const src = path.join(facePluginAndroid, name);
    if (!fs.existsSync(src)) continue;
    if (fs.existsSync(path.dirname(pluginDest))) {
      copyFile(src, path.join(pluginDest, name));
      copied += 1;
    }
    if (fs.existsSync(path.dirname(platformDest))) {
      copyFile(src, path.join(platformDest, name));
      copied += 1;
    }
  }
  if (copied > 0) {
    console.log(
      `[face-recognition-cordova] Synced ${files.join(', ')} → plugins/platforms`
    );
  }
}

/**
 * Cordova's resource-file often skips the ~80 MB engine AAR (or leaves a stale
 * empty libs/). Gradle flatDir looks at app/src/main/libs, so copy it here on
 * every prepare / before_build / before_run.
 */
function requireEngine(projectRoot, androidDir) {
  const src = path.join(projectRoot, 'FacePlugin', 'src', 'android', 'facerecognitionsdk.aar');
  if (!fs.existsSync(src) || fs.statSync(src).size === 0) {
    throw new Error(
      [
        '[face-recognition-cordova] missing the Face Recognition Android runtime:',
        '  FacePlugin/src/android/facerecognitionsdk.aar',
        '',
        'Run `python run_android.py` (downloads from GitHub Releases) or place',
        'facerecognitionsdk.aar from FaceRecognition-LivenessDetection-Android',
        'Releases into FacePlugin/src/android/, then prepare again.',
      ].join('\n')
    );
  }
  const dest = path.join(androidDir, 'app', 'src', 'main', 'libs', 'facerecognitionsdk.aar');
  if (fs.existsSync(dest) && fs.statSync(dest).size === fs.statSync(src).size) return;
  copyFile(src, dest);
  console.log('[face-recognition-cordova] copied the engine AAR into app/src/main/libs');
}

/** Keep build-extras (CameraX + flatDir AAR) fresh even when gradleReference was never installed. */
function syncBuildExtras(projectRoot, androidDir) {
  const src = path.join(projectRoot, 'FacePlugin', 'src', 'android', 'build-extras.gradle');
  if (!fs.existsSync(src)) return;
  const pluginDest = path.join(
    projectRoot,
    'plugins',
    'face-recognition-cordova',
    'src',
    'android',
    'build-extras.gradle'
  );
  if (fs.existsSync(path.dirname(path.dirname(pluginDest)))) {
    copyFile(src, pluginDest);
  }
  // cordova-android applies both app/build-extras.gradle and ../build-extras.gradle.
  copyFile(src, path.join(androidDir, 'app', 'build-extras.gradle'));
  copyFile(src, path.join(androidDir, 'build-extras.gradle'));
}

function prepareAndroid(projectRoot) {
  const androidDir = path.join(projectRoot, 'platforms', 'android');
  if (!fs.existsSync(androidDir)) return;

  requireEngine(projectRoot, androidDir);
  syncAndroidSources(projectRoot);
  syncBuildExtras(projectRoot, androidDir);

  const gp = path.join(androidDir, 'gradle.properties');
  if (fs.existsSync(gp)) {
    let text = fs.readFileSync(gp, 'utf8');
    const ensure = (key, value) => {
      const re = new RegExp(`^\\s*${key}=.*$`, 'm');
      if (re.test(text)) text = text.replace(re, `${key}=${value}`);
      else text += `\n${key}=${value}\n`;
    };
    ensure('android.useAndroidX', 'true');
    ensure('android.enableJetifier', 'false');
    ensure('org.gradle.jvmargs', '-Xmx4096m -Dfile.encoding=UTF-8');
    fs.writeFileSync(gp, text);
    console.log('[face-recognition-cordova] gradle.properties: Jetifier off, heap 4g');
  }

  const colors = path.join(androidDir, 'app', 'src', 'main', 'res', 'values', 'colors.xml');
  if (fs.existsSync(colors)) {
    let text = fs.readFileSync(colors, 'utf8');
    const fixed = text.replace(/>0x([0-9a-fA-F]{8})</g, '>#$1<');
    if (fixed !== text) {
      fs.writeFileSync(colors, fixed);
      console.log('[face-recognition-cordova] Fixed colors.xml hex format');
    }
  }
}

module.exports = function (ctx) {
  const projectRoot =
    (ctx && ctx.opts && ctx.opts.projectRoot) ||
    process.argv[2] ||
    process.cwd();
  prepareAndroid(projectRoot);
};

if (require.main === module) {
  prepareAndroid(process.argv[2] || process.cwd());
}
