#!/usr/bin/env node
/**
 * Prepare the iOS Cordova platform from the local FacePlugin.
 *
 * Cordova copies the plugin into plugins/ and platforms/ at add time and does
 * not refresh those trees on later FacePlugin edits. Without a reinstall,
 * enroll/identify keep the old detect path that never attaches templates —
 * every capture then fails with "template failed".
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const frameworks = path.join(
  root,
  'FacePlugin',
  'src',
  'ios',
  'Frameworks',
  'facerecognitionsdk.framework'
);

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd: root, stdio: 'inherit', shell: true });
}

if (!fs.existsSync(frameworks)) {
  console.error(
    'Missing FacePlugin/src/ios/Frameworks/facerecognitionsdk.framework\n' +
      'Download the iOS runtimes (see README → Get the runtimes) and place them there.'
  );
  process.exit(1);
}

run('npm run build');
run('npm run plugin:build');

if (!fs.existsSync(path.join(root, 'platforms', 'ios'))) {
  run('npx cordova platform add ios');
} else {
  console.log('platforms/ios already present');
}

const pluginsDir = path.join(root, 'plugins');
if (!fs.existsSync(path.join(pluginsDir, 'cordova-plugin-camera'))) {
  run('npx cordova plugin add cordova-plugin-camera');
}

// Always reinstall from ./FacePlugin so native FaceSdkCompat / bridge match source.
if (fs.existsSync(path.join(pluginsDir, 'face-recognition-cordova'))) {
  run('npx cordova plugin remove face-recognition-cordova --nosave');
}
run('npx cordova plugin add ./FacePlugin --nofetch --nosave');

run('npx cordova prepare ios');
console.log('\niOS setup complete. Run: python run_ios.py');
