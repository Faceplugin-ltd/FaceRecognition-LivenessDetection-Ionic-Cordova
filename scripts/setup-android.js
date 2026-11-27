#!/usr/bin/env node
/**
 * One-shot Android setup: build the web app and plugin TypeScript, ensure platform +
 * camera plugin, reinstall FacePlugin, prepare. After this, `npm run android` deploys.
 *
 * Always reinstalls face-recognition-cordova so native FaceSdkCompat / bridge match
 * source (a stale plugins/ copy skips detect-time templates → "template failed").
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const aar = path.join(root, 'FacePlugin', 'src', 'android', 'facerecognitionsdk.aar');
const pluginsDir = path.join(root, 'plugins');
const pluginId = 'face-recognition-cordova';
const platformPluginDir = path.join(root, 'platforms', 'android', pluginId);

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd: root, stdio: 'inherit', shell: true });
}

function rmrf(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`removed ${path.relative(root, dir)}`);
  }
}

if (!fs.existsSync(aar) || fs.statSync(aar).size === 0) {
  console.error(
    'Missing FacePlugin/src/android/facerecognitionsdk.aar\n' +
      'Run `python run_android.py` first (downloads from GitHub Releases), or place\n' +
      'the AAR from FaceRecognition-LivenessDetection-Android Releases there.\n' +
      'See FacePlugin/src/android/AAR_README.md.'
  );
  process.exit(1);
}

run('npm run build');
run('npm run plugin:build');

if (!fs.existsSync(path.join(root, 'platforms', 'android'))) {
  run('npx cordova platform add android');
} else {
  console.log('platforms/android already present');
}

if (!fs.existsSync(path.join(pluginsDir, 'cordova-plugin-camera'))) {
  run('npx cordova plugin add cordova-plugin-camera');
}

if (fs.existsSync(path.join(pluginsDir, pluginId))) {
  run(`npx cordova plugin remove ${pluginId} --nosave`);
}
// Cordova often leaves gradleReference files under platforms/android/<id>/ after
// remove; a later add then fails with "… already exists!".
rmrf(platformPluginDir);

// --force: overwrite leftover edit-config / config munge from a partial prior add.
run('npx cordova plugin add ./FacePlugin --nofetch --nosave --force');

run('npx cordova prepare android');
console.log('\nAndroid setup complete. Run: npm run android');
