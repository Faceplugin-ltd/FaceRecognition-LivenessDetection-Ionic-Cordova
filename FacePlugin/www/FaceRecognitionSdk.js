var exec = require('cordova/exec');

/** Thin Cordova exec wrapper — prefer the TypeScript npm API (src/runtime.ts). */
exports._native = function (action, args) {
  return new Promise(function (resolve, reject) {
    exec(resolve, reject, 'FaceRecognitionSdk', action, args || []);
  });
};
