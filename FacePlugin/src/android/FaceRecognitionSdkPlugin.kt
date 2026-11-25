package com.facerecognitionsdk

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Rect
import android.graphics.Color
import android.os.SystemClock
import android.util.Base64
import android.util.Size
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.faceplugin.facerecognitionsdk.FaceRecognitionSDK
import org.apache.cordova.CallbackContext
import org.apache.cordova.CordovaPlugin
import org.apache.cordova.PermissionHelper
import org.apache.cordova.PluginResult
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.concurrent.Executors

class FaceRecognitionSdkPlugin : CordovaPlugin() {

  companion object {
    /** The app's own background, so an opaque WebView is not a black rectangle. */
    private const val APP_BACKGROUND = 0xFF1C1B1F.toInt()

    private const val REQ_CAMERA = 90212
    private const val REQ_FOLDER = 0x4652
    private const val TAG = "FaceRecCordova"
  }

  private val executor = Executors.newSingleThreadExecutor()
  private val analysisExecutor = Executors.newSingleThreadExecutor()
  @Volatile private var lastLiveBitmap: Bitmap? = null
  @Volatile private var nativesLoaded = false
  @Volatile private var analysisBusy = false
  @Volatile private var lastAnalysisMs = 0L

  private var cameraProvider: ProcessCameraProvider? = null
  private var previewView: PreviewView? = null
  private var previewHost: FrameLayout? = null
  private var pendingCameraCallback: CallbackContext? = null
  private var pendingFrontCamera: Boolean = true
  private var pendingStartAfterPermission: Boolean = false
  private var folderCallback: CallbackContext? = null

  /** Cordova keepCallback for VideoWorker events (Capacitor notifyListeners equivalent). */
  private var videoWorkerCallback: CallbackContext? = null

  override fun pluginInitialize() {
    preloadNatives()
  }

  override fun execute(action: String, args: JSONArray, callbackContext: CallbackContext): Boolean {
    val opts = args.optJSONObject(0) ?: JSONObject()
    when (action) {
      "getMachineCode" -> getMachineCode(callbackContext)
      "getLicenseStatus" -> getLicenseStatus(callbackContext)
      "setActivation" -> setActivation(opts, callbackContext)
      "init" -> init(callbackContext)
      "deinit" -> deinit(callbackContext)
      "lastLicenseError" -> lastLicenseError(callbackContext)
      "setLandmarkMode" -> setLandmarkMode(opts, callbackContext)
      "getLandmarkMode" -> getLandmarkMode(callbackContext)
      "detect" -> detect(opts, callbackContext)
      "faceDetection" -> faceDetection(opts, callbackContext)
      "templateExtraction" -> templateExtraction(opts, callbackContext)
      "cropFace" -> cropFace(opts, callbackContext)
      "extractFeature" -> extractFeature(opts, callbackContext)
      "similarity" -> similarity(opts, callbackContext)
      "similarityMany" -> similarityMany(opts, callbackContext)
      "writeFaceImage" -> writeFaceImage(opts, callbackContext)
      "deleteFiles" -> deleteFiles(opts, callbackContext)
      "deleteDirectory" -> deleteDirectory(opts, callbackContext)
      "quality" -> quality(opts, callbackContext)
      "startVideoWorker" -> startVideoWorker(opts, callbackContext)
      "stopVideoWorker" -> stopVideoWorker(callbackContext)
      "syncVideoWorkerDatabase" -> syncVideoWorkerDatabase(opts, callbackContext)
      "probeLiveImage" -> probeLiveImage(opts, callbackContext)
      "applyLiveFrame" -> applyLiveFrame(opts, callbackContext)
      "exportLastLiveFrame" -> exportLastLiveFrame(opts, callbackContext)
      "readImageDataUrl" -> readImageDataUrl(opts, callbackContext)
      "writeStatus" -> writeStatus(opts, callbackContext)
      "estimatorStatus" -> estimatorStatus(callbackContext)
      "startLivePreview" -> startLivePreview(opts, callbackContext)
      "stopLivePreview" -> stopLivePreview(callbackContext)
      "takeLiveSnapshot" -> takeLiveSnapshot(callbackContext)
      "pickFolderImages" -> pickFolderImages(callbackContext)
      "addVideoWorkerListener" -> addVideoWorkerListener(callbackContext)
      "removeVideoWorkerListener" -> removeVideoWorkerListener(callbackContext)
      "requestCameraPermission" -> requestCameraPermission(callbackContext)
      else -> return false
    }
    return true
  }

  override fun onRequestPermissionResult(
    requestCode: Int,
    permissions: Array<out String>?,
    grantResults: IntArray?
  ) {
    if (requestCode != REQ_CAMERA) return
    val cb = pendingCameraCallback ?: return
    val startAfter = pendingStartAfterPermission
    pendingCameraCallback = null
    pendingStartAfterPermission = false
    val granted =
      grantResults != null &&
        grantResults.isNotEmpty() &&
        grantResults[0] == PackageManager.PERMISSION_GRANTED
    if (!granted) {
      cb.error("E_CAMERA: Camera permission denied")
      return
    }
    if (startAfter) {
      beginLivePreview(pendingFrontCamera, cb)
    } else {
      cb.success()
    }
  }

  fun requestCameraPermission(callbackContext: CallbackContext) {
    val activity = cordova.activity
    if (activity == null) {
      callbackContext.error("E_CAMERA: No activity")
      return
    }
    if (
      ContextCompat.checkSelfPermission(activity, Manifest.permission.CAMERA) ==
        PackageManager.PERMISSION_GRANTED
    ) {
      callbackContext.success()
      return
    }
    pendingStartAfterPermission = false
    pendingCameraCallback = callbackContext
    PermissionHelper.requestPermission(this, REQ_CAMERA, Manifest.permission.CAMERA)
  }

  private fun preloadNatives() {
    if (nativesLoaded) return
    val names = arrayOf(
      "c++_shared",
      "onnxruntime",
      "FaceRecognitionEngine",
      "FaceRecognitionEngine_jni",
      "FaceRecognitionSDK"
    )
    val libDir = cordova.context.applicationInfo.nativeLibraryDir
    for (name in names) {
      try {
        System.loadLibrary(name)
        android.util.Log.i(TAG, "preload ok: $name")
      } catch (e: UnsatisfiedLinkError) {
        android.util.Log.w(TAG, "preload loadLibrary failed: $name", e)
        try {
          System.load("$libDir/lib$name.so")
          android.util.Log.i(TAG, "preload ok path: lib$name.so")
        } catch (e2: UnsatisfiedLinkError) {
          android.util.Log.e(TAG, "preload failed: lib$name.so", e2)
        }
      }
    }
    nativesLoaded = true
  }

  fun getMachineCode(callbackContext: CallbackContext) {
    executor.execute {
      try {
        preloadNatives()
        val mc = FaceRecognitionSDK.machineCode(cordova.context.applicationContext) ?: ""
        callbackContext.success(value(mc))
      } catch (t: Throwable) {
        reject(callbackContext, "E_MACHINE_CODE", t)
      }
    }
  }

  fun getLicenseStatus(callbackContext: CallbackContext) {
    executor.execute {
      try {
        preloadNatives()
        callbackContext.success(value(FaceSdkCompat.licenseStatusJson()))
      } catch (t: Throwable) {
        reject(callbackContext, "E_LICENSE_STATUS", t)
      }
    }
  }

  fun setActivation(opts: JSONObject, callbackContext: CallbackContext) {
    val license = opts.stringOrNull("license")
    if (license.isNullOrBlank()) {
      callbackContext.error("E_ACTIVATION: license is required")
      return
    }
    executor.execute {
      try {
        preloadNatives()
        val code = FaceRecognitionSDK.activate(cordova.context.applicationContext, license)
        callbackContext.success(value(code))
      } catch (t: Throwable) {
        reject(callbackContext, "E_ACTIVATION", t)
      }
    }
  }

  fun init(callbackContext: CallbackContext) {
    executor.execute {
      try {
        preloadNatives()
        val code = FaceRecognitionSDK.init(cordova.context.applicationContext)
        callbackContext.success(value(code))
      } catch (t: Throwable) {
        reject(callbackContext, "E_INIT", t)
      }
    }
  }

  fun deinit(callbackContext: CallbackContext) {
    executor.execute {
      try {
        FaceSdkCompat.clearDetectedFaces()
        FaceRecognitionSDK.close()
        callbackContext.success()
      } catch (t: Throwable) {
        reject(callbackContext, "E_DEINIT", t)
      }
    }
  }

  fun lastLicenseError(callbackContext: CallbackContext) {
    try {
      callbackContext.success(value(FaceRecognitionSDK.lastLicenseError() ?: ""))
    } catch (t: Throwable) {
      reject(callbackContext, "E_LICENSE_ERROR", t)
    }
  }

  fun setLandmarkMode(opts: JSONObject, callbackContext: CallbackContext) {
    val mode = if (opts.has("mode")) opts.getInt("mode") else 14
    executor.execute {
      try {
        callbackContext.success(value(0.also { @Suppress("UNUSED_EXPRESSION") mode }))
      } catch (t: Throwable) {
        reject(callbackContext, "E_LANDMARK", t)
      }
    }
  }

  fun getLandmarkMode(callbackContext: CallbackContext) {
    executor.execute {
      try {
        callbackContext.success(value(0))
      } catch (t: Throwable) {
        reject(callbackContext, "E_LANDMARK", t)
      }
    }
  }

  fun detect(opts: JSONObject, callbackContext: CallbackContext) {
    val imageUri = opts.stringOrNull("image")
    if (imageUri.isNullOrBlank()) {
      callbackContext.error("E_IMAGE: image is required")
      return
    }
    val crop = if (opts.has("crop")) opts.getBoolean("crop") else false
    val flags = if (opts.has("flags")) opts.getInt("flags") else -1
    executor.execute {
      try {
        val bitmap = loadEngineBitmap(imageUri) ?: run {
          callbackContext.error("E_IMAGE: Could not decode image: $imageUri")
          return@execute
        }
        @Suppress("UNUSED_EXPRESSION") crop
        val json = FaceSdkCompat.detectJsonForFlags(bitmap, flags)
        callbackContext.success(value(json ?: "{}"))
      } catch (t: Throwable) {
        reject(callbackContext, "E_DETECT", t)
      }
    }
  }

  fun faceDetection(opts: JSONObject, callbackContext: CallbackContext) {
    val imageUri = opts.stringOrNull("image")
    if (imageUri.isNullOrBlank()) {
      callbackContext.error("E_IMAGE: image is required")
      return
    }
    val paramJson = opts.stringOrNull("param")
    executor.execute {
      try {
        val bitmap = loadEngineBitmap(imageUri) ?: run {
          callbackContext.error("E_IMAGE: Could not decode image: $imageUri")
          return@execute
        }
        callbackContext.success(value(FaceSdkCompat.detectJson(bitmap, paramJson)))
      } catch (t: Throwable) {
        reject(callbackContext, "E_FACE_DETECTION", t)
      }
    }
  }

  fun templateExtraction(opts: JSONObject, callbackContext: CallbackContext) {
    val imageUri = opts.stringOrNull("image")
    val faceBoxJson = opts.stringOrNull("faceBox")
    if (imageUri.isNullOrBlank() || faceBoxJson.isNullOrBlank()) {
      callbackContext.error("E_TEMPLATE: image and faceBox are required")
      return
    }
    executor.execute {
      try {
        val bitmap = loadEngineBitmap(imageUri) ?: run {
          callbackContext.error("E_IMAGE: Could not decode image: $imageUri")
          return@execute
        }
        val bytes = FaceSdkCompat.templateBase64(bitmap, faceBoxJson)
          .let { if (it.isEmpty()) null else Base64.decode(it, Base64.DEFAULT) }
        if (bytes == null) {
          callbackContext.error("E_TEMPLATE: templateExtraction returned null")
          return@execute
        }
        callbackContext.success(value(Base64.encodeToString(bytes, Base64.NO_WRAP)))
      } catch (t: Throwable) {
        reject(callbackContext, "E_TEMPLATE", t)
      }
    }
  }

  fun cropFace(opts: JSONObject, callbackContext: CallbackContext) {
    val imageUri = opts.stringOrNull("image")
    val faceBoxJson = opts.stringOrNull("faceBox")
    if (imageUri.isNullOrBlank() || faceBoxJson.isNullOrBlank()) {
      callbackContext.error("E_CROP: image and faceBox are required")
      return
    }
    executor.execute {
      try {
        val bitmap = loadEngineBitmap(imageUri) ?: run {
          callbackContext.error("E_IMAGE: Could not decode image: $imageUri")
          return@execute
        }
        val cropped = FaceSdkCompat.cropFaceBase64(bitmap, faceBoxJson)
          .let { if (it.isEmpty()) null else it } ?: run {
          callbackContext.error("E_CROP: cropFace returned null")
          return@execute
        }
        callbackContext.success(value(cropped))
      } catch (t: Throwable) {
        reject(callbackContext, "E_CROP", t)
      }
    }
  }

  fun extractFeature(opts: JSONObject, callbackContext: CallbackContext) {
    val imageUri = opts.stringOrNull("image")
    if (imageUri.isNullOrBlank()) {
      callbackContext.error("E_FEATURE: image is required")
      return
    }
    executor.execute {
      try {
        val bitmap = loadEngineBitmap(imageUri) ?: run {
          callbackContext.error("E_IMAGE: Could not decode image: $imageUri")
          return@execute
        }
        callbackContext.success(value(FaceSdkCompat.extractFeatureBase64(bitmap)))
      } catch (t: Throwable) {
        reject(callbackContext, "E_FEATURE", t)
      }
    }
  }

  fun similarity(opts: JSONObject, callbackContext: CallbackContext) {
    val f1b64 = opts.stringOrNull("feature1")
    val f2b64 = opts.stringOrNull("feature2")
    if (f1b64.isNullOrBlank() || f2b64.isNullOrBlank()) {
      callbackContext.error("E_SIMILARITY: feature1 and feature2 are required")
      return
    }
    executor.execute {
      try {
        val f1 = Base64.decode(f1b64, Base64.DEFAULT)
        val f2 = Base64.decode(f2b64, Base64.DEFAULT)
        callbackContext.success(value(FaceRecognitionSDK.similarity(f1, f2).toDouble()))
      } catch (t: Throwable) {
        reject(callbackContext, "E_SIMILARITY", t)
      }
    }
  }

  /**
   * 1:N similarity in one bridge call. A bad or empty candidate scores -1.
   *
   * The gallery search would otherwise be one round trip per enrolled person, which is what
   * makes a large gallery feel slow in a WebView app.
   */
  fun similarityMany(opts: JSONObject, callbackContext: CallbackContext) {
    val probeB64 = opts.stringOrNull("probe")
    val candidates = opts.optJSONArray("candidates")
    if (probeB64.isNullOrBlank() || candidates == null) {
      callbackContext.error("E_SIMILARITY: probe and candidates are required")
      return
    }
    executor.execute {
      try {
        val probe = Base64.decode(probeB64, Base64.DEFAULT)
        val out = JSONArray()
        for (i in 0 until candidates.length()) {
          val c = candidates.optString(i, "")
          if (c.isNullOrEmpty()) {
            out.put(-1.0)
            continue
          }
          val s = try {
            FaceRecognitionSDK.similarity(probe, Base64.decode(c, Base64.DEFAULT)).toDouble()
          } catch (_: Throwable) {
            -1.0
          }
          out.put(if (s.isNaN()) -1.0 else s)
        }
        callbackContext.success(value(out.toString()))
      } catch (t: Throwable) {
        reject(callbackContext, "E_SIMILARITY", t)
      }
    }
  }

  /**
   * Writes a JPEG of the image, or of a face crop, into app-private storage and resolves its
   * `file://` URI. [path] is absolute or relative to the app files dir.
   *
   * Options: box {x1,y1,x2,y2}, mode "full" | "padded" | "square", padding (0.12),
   * scale (1.8), maxSide, quality (92).
   */
  fun writeFaceImage(opts: JSONObject, callbackContext: CallbackContext) {
    val imageUri = opts.stringOrNull("image")
    val path = opts.stringOrNull("path")
    if (imageUri.isNullOrBlank() || path.isNullOrBlank()) {
      callbackContext.error("E_WRITE: image and path are required")
      return
    }
    val o = try {
      val raw = opts.stringOrNull("options")
      if (raw.isNullOrBlank()) JSONObject() else JSONObject(raw)
    } catch (_: Exception) {
      JSONObject()
    }
    executor.execute {
      try {
        val source = loadBitmap(imageUri) ?: run {
          callbackContext.error("E_IMAGE: could not decode image: $imageUri")
          return@execute
        }
        val bitmap = ImageUtils.enginePreparedImage(
          source,
          o.optInt("maxSide", ImageUtils.ENGINE_MAX_SIDE)
        )
        val boxJson = o.optJSONObject("box")
        val box = boxJson?.let {
          Rect(it.optInt("x1"), it.optInt("y1"), it.optInt("x2"), it.optInt("y2"))
        }
        val out: Bitmap = when (o.optString("mode", if (box == null) "full" else "padded")) {
          "square" -> if (box != null) ImageUtils.squareAround(bitmap, box, o.optDouble("scale", 1.8).toFloat()) else bitmap
          "padded" -> if (box != null) ImageUtils.cropPadded(bitmap, box, o.optDouble("padding", 0.12).toFloat()) ?: bitmap else bitmap
          else -> bitmap
        }
        val file = resolveFile(path)
        file.parentFile?.mkdirs()
        file.writeBytes(ImageUtils.jpeg(out, o.optInt("quality", 92)))
        // Must be { value: "file://…" } — JS destructures `.value` (same as Capacitor).
        callbackContext.success(value("file://" + file.absolutePath))
      } catch (t: Throwable) {
        reject(callbackContext, "E_WRITE", t)
      }
    }
  }

  /** Deletes each path (absolute or relative to the files dir). Resolves the number removed. */
  fun deleteFiles(opts: JSONObject, callbackContext: CallbackContext) {
    val paths = opts.optJSONArray("paths")
    if (paths == null) {
      callbackContext.error("E_DELETE: paths is required")
      return
    }
    executor.execute {
      try {
        var n = 0
        for (i in 0 until paths.length()) {
          val p = paths.optString(i, "")
          if (p.isNullOrEmpty()) continue
          if (resolveFile(p).delete()) n++
        }
        callbackContext.success(value(n.toDouble()))
      } catch (t: Throwable) {
        reject(callbackContext, "E_DELETE", t)
      }
    }
  }

  /** Deletes every file inside [path] but keeps the directory. Resolves the number removed. */
  fun deleteDirectory(opts: JSONObject, callbackContext: CallbackContext) {
    val path = opts.stringOrNull("path")
    if (path.isNullOrBlank()) {
      callbackContext.error("E_DELETE: path is required")
      return
    }
    executor.execute {
      try {
        var n = 0
        resolveFile(path).listFiles()?.forEach { if (it.isFile && it.delete()) n++ }
        callbackContext.success(value(n.toDouble()))
      } catch (t: Throwable) {
        reject(callbackContext, "E_DELETE", t)
      }
    }
  }

  private fun resolveFile(path: String): File {
    val p = if (path.startsWith("file://")) path.removePrefix("file://") else path
    val f = File(p)
    return if (f.isAbsolute) f else File(cordova.context.applicationContext.filesDir, p)
  }

  fun quality(opts: JSONObject, callbackContext: CallbackContext) {
    val imageUri = opts.stringOrNull("image")
    if (imageUri.isNullOrBlank()) {
      callbackContext.error("E_QUALITY: image is required")
      return
    }
    val crop = if (opts.has("crop")) opts.getBoolean("crop") else false
    executor.execute {
      try {
        val bitmap = loadEngineBitmap(imageUri) ?: run {
          callbackContext.error("E_IMAGE: Could not decode image: $imageUri")
          return@execute
        }
        callbackContext.success(value(FaceSdkCompat.qualityJson(bitmap)))
      } catch (t: Throwable) {
        reject(callbackContext, "E_QUALITY", t)
      }
    }
  }

  fun startVideoWorker(opts: JSONObject, callbackContext: CallbackContext) {
    val configJson = opts.stringOrNull("config")
    executor.execute {
      try {
                val threshold = parseMatchThreshold(configJson)
        val code = 0.also { FaceSdkCompat.startWorker(threshold) }
        callbackContext.success(value(code))
      } catch (t: Throwable) {
        reject(callbackContext, "E_VIDEO_WORKER", t)
      }
    }
  }

  fun stopVideoWorker(callbackContext: CallbackContext) {
    executor.execute {
      try {
        FaceSdkCompat.stopWorker()
        
        callbackContext.success()
      } catch (t: Throwable) {
        reject(callbackContext, "E_VIDEO_WORKER", t)
      }
    }
  }

  fun syncVideoWorkerDatabase(opts: JSONObject, callbackContext: CallbackContext) {
    val threshold = if (opts.has("matchThreshold")) opts.getDouble("matchThreshold") else 0.67
    val features = opts.optJSONArray("features") ?: JSONArray()
    executor.execute {
      try {
        val list = ArrayList<ByteArray>()
        for (i in 0 until features.length()) {
          if (features.isNull(i)) continue
          val s = features.optString(i)
          if (s.isBlank()) continue
          list.add(Base64.decode(s, Base64.DEFAULT))
        }
        val code = 0.also { FaceSdkCompat.syncWorker(list, threshold.toFloat()) }
        callbackContext.success(value(code))
      } catch (t: Throwable) {
        reject(callbackContext, "E_SYNC_DB", t)
      }
    }
  }

  fun probeLiveImage(opts: JSONObject, callbackContext: CallbackContext) {
    val imageUri = opts.stringOrNull("image")
    if (imageUri.isNullOrBlank()) {
      callbackContext.error("E_IMAGE: image is required")
      return
    }
    executor.execute {
      try {
        val bitmap = loadBitmap(imageUri) ?: run {
          callbackContext.error("E_IMAGE: Could not decode image: $imageUri")
          return@execute
        }
        val ret = JSONObject()
        ret.put("width", bitmap.width)
        ret.put("height", bitmap.height)
        callbackContext.success(ret)
      } catch (t: Throwable) {
        reject(callbackContext, "E_IMAGE", t)
      }
    }
  }

  fun applyLiveFrame(opts: JSONObject, callbackContext: CallbackContext) {
    val imageUri = opts.stringOrNull("image")
    if (imageUri.isNullOrBlank()) {
      callbackContext.error("E_FRAME: image is required")
      return
    }
    val rotateDegrees =
      (if (opts.has("rotateDegrees")) opts.getDouble("rotateDegrees") else 0.0).toFloat()
    val maxEdge =
      (if (opts.has("maxEdge")) opts.getInt("maxEdge") else 640).coerceAtLeast(1)
    val feedWorker = if (opts.has("feedWorker")) opts.getBoolean("feedWorker") else true
    executor.execute {
      try {
        val bitmap = loadBitmap(imageUri) ?: run {
          callbackContext.error("E_IMAGE: Could not decode image: $imageUri")
          return@execute
        }
        val prepared = applyLiveTransform(bitmap, rotateDegrees, maxEdge)
        lastLiveBitmap = prepared
        if (feedWorker) {
          FaceSdkCompat.workerFrameJson(prepared)?.let { emitVideoWorkerEvent(it) }
          callbackContext.success(liveFrameMap(prepared, ingested = true, uri = null))
        } else {
          callbackContext.success(
            liveFrameMap(prepared, ingested = true, uri = writeLiveJpeg(prepared))
          )
        }
      } catch (t: Throwable) {
        reject(callbackContext, "E_FRAME", t)
      }
    }
  }

  fun exportLastLiveFrame(opts: JSONObject, callbackContext: CallbackContext) {
    val withPreview = opts.optBoolean("preview", false)
    executor.execute {
      try {
        val prepared = lastLiveBitmap ?: run {
          callbackContext.error("E_IMAGE: No live frame")
          return@execute
        }
        // Freeze a software copy — analysis keeps replacing lastLiveBitmap.
        val still = prepared.copy(Bitmap.Config.ARGB_8888, false) ?: prepared
        val uri = writeLiveJpeg(still)
        val map = liveFrameMap(still, ingested = true, uri = uri)
        // Cordova WebView (https://localhost) cannot load file:// in <img>. Ship a data URL
        // for capture review / result tiles, plus a small previewB64 thumb.
        if (withPreview) {
          val fullB64 = bitmapToBase64Jpeg(still, 85)
          map.put("dataUrl", "data:image/jpeg;base64,$fullB64")
          val preview = scaleMax(still, 360)
          map.put("previewB64", bitmapToBase64Jpeg(preview, 70))
          if (preview !== still && !preview.isRecycled) preview.recycle()
        }
        if (still !== prepared && !still.isRecycled) still.recycle()
        callbackContext.success(map)
      } catch (t: Throwable) {
        reject(callbackContext, "E_FRAME", t)
      }
    }
  }

  /** Decode a file:// / content:// / data: image to a data URL for WebView <img>. */
  fun readImageDataUrl(opts: JSONObject, callbackContext: CallbackContext) {
    val image = opts.stringOrNull("image")
    if (image.isNullOrBlank()) {
      callbackContext.error("E_IMAGE: image is required")
      return
    }
    if (image.startsWith("data:")) {
      callbackContext.success(value(image))
      return
    }
    executor.execute {
      try {
        val bitmap = loadBitmap(image) ?: run {
          callbackContext.error("E_IMAGE: Could not decode image: $image")
          return@execute
        }
        val b64 = bitmapToBase64Jpeg(bitmap, 85)
        callbackContext.success(value("data:image/jpeg;base64,$b64"))
      } catch (t: Throwable) {
        reject(callbackContext, "E_IMAGE", t)
      }
    }
  }

  fun writeStatus(opts: JSONObject, callbackContext: CallbackContext) {
    val json = opts.stringOrNull("payload") ?: "{}"
    try {
      File(cordova.context.filesDir, "facerecognition_status.json").writeText(json)
      callbackContext.success()
    } catch (t: Throwable) {
      reject(callbackContext, "E_STATUS", t)
    }
  }

  fun estimatorStatus(callbackContext: CallbackContext) {
    executor.execute {
      try {
        callbackContext.success(value("{}"))
      } catch (t: Throwable) {
        reject(callbackContext, "E_ESTIMATOR", t)
      }
    }
  }

  fun startLivePreview(opts: JSONObject, callbackContext: CallbackContext) {
    val front = if (opts.has("frontCamera")) opts.getBoolean("frontCamera") else true
    val activity = cordova.activity
    if (activity == null) {
      callbackContext.error("E_CAMERA: No activity")
      return
    }
    if (
      ContextCompat.checkSelfPermission(activity, Manifest.permission.CAMERA) !=
        PackageManager.PERMISSION_GRANTED
    ) {
      pendingFrontCamera = front
      pendingStartAfterPermission = true
      pendingCameraCallback = callbackContext
      PermissionHelper.requestPermission(this, REQ_CAMERA, Manifest.permission.CAMERA)
      return
    }
    beginLivePreview(front, callbackContext)
  }

  private fun beginLivePreview(front: Boolean, callbackContext: CallbackContext) {
    val activity = cordova.activity
    if (activity == null) {
      callbackContext.error("E_CAMERA: No activity")
      return
    }
    activity.runOnUiThread {
      try {
        // A new surface each time. Reusing the host meant the previous visit's last frame sat
        // on screen until the camera bound, which read as the camera being stuck.
        detachPreviewHost()
        attachPreviewHost()
        val previewView = previewView ?: run {
          callbackContext.error("E_CAMERA: Preview view missing")
          return@runOnUiThread
        }
        // Wait for layout so ViewPort matches the WebView / overlay size.
        previewView.post {
          bindCameraUseCases(front, callbackContext)
        }
      } catch (t: Throwable) {
        reject(callbackContext, "E_CAMERA", t)
      }
    }
  }

  private fun bindCameraUseCases(
    front: Boolean,
    callbackContext: CallbackContext,
    attempt: Int = 0,
  ) {
    val activity = cordova.activity ?: run {
      callbackContext.error("E_CAMERA: No activity")
      return
    }
    val previewView = previewView ?: run {
      callbackContext.error("E_CAMERA: Preview view missing")
      return
    }
    // CameraX draws nothing until the view has a display and a size. Binding earlier
    // leaves the black host on screen, which is all the user sees through the WebView.
    if ((previewView.width <= 0 || previewView.height <= 0 || previewView.display == null) && attempt < 30) {
      previewView.post { bindCameraUseCases(front, callbackContext, attempt + 1) }
      return
    }
    val appContext = cordova.context
    val future = ProcessCameraProvider.getInstance(appContext)
    future.addListener({
      try {
        val provider = future.get()
        cameraProvider?.unbindAll()
        cameraProvider = provider
        syncPreviewHostToWebView()

        val useFront = when {
          front && provider.hasCamera(CameraSelector.DEFAULT_FRONT_CAMERA) -> true
          provider.hasCamera(CameraSelector.DEFAULT_BACK_CAMERA) -> false
          else -> front
        }
        val selector = if (useFront) {
          CameraSelector.DEFAULT_FRONT_CAMERA
        } else {
          CameraSelector.DEFAULT_BACK_CAMERA
        }
        val rotation = previewView.display?.rotation ?: 0
        val size = Size(720, 1280)
        val preview = Preview.Builder()
          .setTargetResolution(size)
          .setTargetRotation(rotation)
          .build()
        val analysis = ImageAnalysis.Builder()
          .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
          .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
          .setTargetResolution(size)
          .setTargetRotation(rotation)
          .build()
        analysis.setAnalyzer(analysisExecutor) { image ->
          ingestAnalysisFrame(image)
        }
        // Same bind as the native app. A UseCaseGroup on an empty viewport stays black.
        provider.bindToLifecycle(activity as LifecycleOwner, selector, preview, analysis)
        preview.setSurfaceProvider(previewView.surfaceProvider)
        setWebViewTransparent(true)
        callbackContext.success()
      } catch (t: Throwable) {
        reject(callbackContext, "E_CAMERA", t)
      }
    }, ContextCompat.getMainExecutor(appContext))
  }

  fun stopLivePreview(callbackContext: CallbackContext) {
    val activity = cordova.activity
    if (activity == null) {
      cameraProvider = null
      callbackContext.success()
      return
    }
    activity.runOnUiThread {
      try {
        cameraProvider?.unbindAll()
        setWebViewTransparent(false)
        detachPreviewHost()
        callbackContext.success()
      } catch (t: Throwable) {
        reject(callbackContext, "E_CAMERA", t)
      }
    }
  }

  fun pickFolderImages(callbackContext: CallbackContext) {
    val activity = cordova.activity
    if (activity == null) {
      callbackContext.error("E_ACTIVITY: No activity")
      return
    }
    folderCallback = callbackContext
    cordova.setActivityResultCallback(this)
    activity.startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT_TREE), REQ_FOLDER)
  }

  override fun onActivityResult(requestCode: Int, resultCode: Int, intent: Intent?) {
    if (requestCode != REQ_FOLDER) {
      super.onActivityResult(requestCode, resultCode, intent)
      return
    }
    val cb = folderCallback ?: return
    folderCallback = null
    if (resultCode != Activity.RESULT_OK || intent?.data == null) {
      cb.success(JSONArray())
      return
    }
    val tree = intent.data!!
    try {
      cordova.activity.contentResolver.takePersistableUriPermission(
        tree,
        Intent.FLAG_GRANT_READ_URI_PERMISSION,
      )
    } catch (_: Exception) {
    }
    val arr = JSONArray()
    FolderImages.list(cordova.activity, tree).forEach { item ->
      val o = JSONObject()
      o.put("uri", item.uri)
      o.put("fileName", item.fileName)
      arr.put(o)
    }
    cb.success(arr)
  }

  fun takeLiveSnapshot(callbackContext: CallbackContext) {
    executor.execute {
      try {
        val prepared = lastLiveBitmap ?: run {
          callbackContext.error("E_CAMERA: Live preview is not running")
          return@execute
        }
        val uri = writeLiveJpeg(prepared)
        val ret = JSONObject()
        ret.put("uri", uri)
        ret.put("path", uri.removePrefix("file://"))
        callbackContext.success(ret)
      } catch (t: Throwable) {
        reject(callbackContext, "E_CAMERA", t)
      }
    }
  }

  fun addVideoWorkerListener(callbackContext: CallbackContext) {
    videoWorkerCallback = callbackContext
    val result = PluginResult(PluginResult.Status.NO_RESULT)
    result.keepCallback = true
    callbackContext.sendPluginResult(result)
  }

  fun removeVideoWorkerListener(callbackContext: CallbackContext) {
    videoWorkerCallback = null
    callbackContext.success()
  }

  private fun emitVideoWorkerEvent(json: String?) {
    val cb = videoWorkerCallback ?: return
    val data = JSONObject()
    data.put("json", json ?: "{}")
    val result = PluginResult(PluginResult.Status.OK, data)
    result.keepCallback = true
    cb.sendPluginResult(result)
  }

  private fun ingestAnalysisFrame(image: androidx.camera.core.ImageProxy) {
    val now = SystemClock.elapsedRealtime()
    if (now - lastAnalysisMs < 120L || analysisBusy) {
      image.close()
      return
    }
    analysisBusy = true
    lastAnalysisMs = now
    try {
      val bitmap = ImageUtils.bitmapFromImageProxy(image) ?: return
      val prepared = applyLiveTransform(bitmap, 0f, 640)
      if (prepared !== bitmap && !bitmap.isRecycled) {
        bitmap.recycle()
      }
      lastLiveBitmap = prepared
      try {
        FaceSdkCompat.workerFrameJson(prepared)?.let { emitVideoWorkerEvent(it) }
      } catch (_: Throwable) {
        // Worker may not be running yet.
      }
    } catch (_: Throwable) {
      // Drop a bad preview frame.
    } finally {
      image.close()
      analysisBusy = false
    }
  }

  private fun androidWebView(): android.view.View? {
    return webView?.view as? android.view.View
  }

  private fun attachPreviewHost() {
    val activity = cordova.activity ?: return
    val webView = androidWebView() ?: return
    val parent = webView.parent as? ViewGroup ?: return
    if (previewHost != null) {
      syncPreviewHostToWebView()
      return
    }
    val host = FrameLayout(activity)
    host.setBackgroundColor(Color.BLACK)
    val view = PreviewView(activity)
    view.implementationMode = PreviewView.ImplementationMode.COMPATIBLE
    view.scaleType = PreviewView.ScaleType.FILL_CENTER
    host.addView(
      view,
      FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT
      )
    )
    // Match WebView frame so FILL_CENTER crop matches the HTML overlay.
    val lp = ViewGroup.MarginLayoutParams(
      if (webView.width > 0) webView.width else ViewGroup.LayoutParams.MATCH_PARENT,
      if (webView.height > 0) webView.height else ViewGroup.LayoutParams.MATCH_PARENT
    )
    lp.leftMargin = webView.left
    lp.topMargin = webView.top
    parent.addView(host, 0, lp)
    host.isClickable = false
    host.isFocusable = false
    view.isClickable = false
    webView.bringToFront()
    previewHost = host
    previewView = view
    webView.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ ->
      syncPreviewHostToWebView()
    }
  }

  private fun syncPreviewHostToWebView() {
    val webView = androidWebView() ?: return
    val host = previewHost ?: return
    val lp = host.layoutParams as? ViewGroup.MarginLayoutParams ?: return
    if (webView.width <= 0 || webView.height <= 0) return
    if (
      lp.width == webView.width &&
      lp.height == webView.height &&
      lp.leftMargin == webView.left &&
      lp.topMargin == webView.top
    ) {
      return
    }
    lp.width = webView.width
    lp.height = webView.height
    lp.leftMargin = webView.left
    lp.topMargin = webView.top
    host.layoutParams = lp
  }

  private fun detachPreviewHost() {
    val host = previewHost ?: return
    (host.parent as? ViewGroup)?.removeView(host)
    previewHost = null
    previewView = null
  }

  private fun setWebViewTransparent(transparent: Boolean) {
    val webView = androidWebView() ?: return
    // Opaque means the app's own background, not black. Transparency is only for a live
    // preview. A hardware layer is an opaque surface on this Android version: it hides the
    // camera behind the WebView and the page comes out black. A software layer keeps
    // per-pixel alpha, so the preview shows through and the controls stay drawn.
    val color = if (transparent) Color.TRANSPARENT else APP_BACKGROUND
    webView.setBackgroundColor(color)
    if (webView is android.webkit.WebView) {
      webView.setBackgroundColor(color)
      // Drop any solid ColorDrawable Cordova set from BackgroundColor preference.
      if (transparent) {
        webView.background = null
        webView.setBackgroundColor(Color.TRANSPARENT)
      }
    }
    // Parent FrameLayout (android.R.id.content) must not paint over the PreviewView.
    (webView.parent as? View)?.setBackgroundColor(
      if (transparent) Color.TRANSPARENT else APP_BACKGROUND
    )
    webView.setLayerType(
      if (transparent) View.LAYER_TYPE_SOFTWARE else View.LAYER_TYPE_HARDWARE,
      null
    )
    webView.bringToFront()
  }

  private fun value(v: Any): JSONObject {
    val ret = JSONObject()
    ret.put("value", v)
    return ret
  }

  private fun reject(cb: CallbackContext, code: String, t: Throwable) {
    val msg = t.message ?: code
    cb.error("$code: $msg")
  }

  private fun loadBitmap(uriOrBase64: String): Bitmap? {
    return if (uriOrBase64.startsWith("data:") || looksLikeBase64(uriOrBase64)) {
      ImageUtils.bitmapFromBase64(uriOrBase64)
    } else {
      ImageUtils.bitmapFromUri(cordova.context.applicationContext, uriOrBase64)
    }
  }

  /** Decode + engine prepare (≤1280) so detect boxes and cropFace share one coordinate space. */
  private fun loadEngineBitmap(uriOrBase64: String): Bitmap? {
    val raw = loadBitmap(uriOrBase64) ?: return null
    return ImageUtils.enginePreparedImage(raw)
  }

  private fun looksLikeBase64(s: String): Boolean {
    if (s.startsWith("content:") || s.startsWith("file:") || s.startsWith("/")) return false
    return s.length > 256 && !s.contains("://")
  }





  private fun parseMatchThreshold(configJson: String?): Float {
    if (configJson.isNullOrBlank()) return 0.67f
    return try {
      JSONObject(configJson).optDouble("matchThreshold", 0.67).toFloat()
    } catch (_: Exception) {
      0.67f
    }
  }

  private fun bitmapToBase64Jpeg(bitmap: Bitmap, quality: Int = 85): String {
    val out = ByteArrayOutputStream()
    bitmap.compress(Bitmap.CompressFormat.JPEG, quality.coerceIn(40, 95), out)
    return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
  }

  private fun liveFrameMap(prepared: Bitmap, ingested: Boolean, uri: String?): JSONObject {
    val map = JSONObject()
    map.put("ingested", ingested)
    map.put("width", prepared.width)
    map.put("height", prepared.height)
    if (uri != null) map.put("uri", uri) else map.put("uri", JSONObject.NULL)
    return map
  }

  private fun writeLiveJpeg(prepared: Bitmap): String {
    // file:// for native detect/crop and for sideLoop (must stay small over the bridge).
    // WebView preview uses cropFace base64 / display helpers — do not ship data: every frame.
    val file = File(cordova.context.cacheDir, "frs_live_${System.currentTimeMillis()}.jpg")
    file.outputStream().use { out ->
      prepared.compress(Bitmap.CompressFormat.JPEG, 85, out)
    }
    return "file://${file.absolutePath}"
  }

  private fun applyLiveTransform(src: Bitmap, rotateDegrees: Float, maxEdge: Int): Bitmap {
    var frame = src
    val deg = rotateDegrees % 360f
    if (kotlin.math.abs(deg) > 0.01f) {
      val matrix = android.graphics.Matrix().apply { postRotate(deg) }
      val rotated = Bitmap.createBitmap(frame, 0, 0, frame.width, frame.height, matrix, true)
      if (rotated !== frame && frame !== src) frame.recycle()
      frame = rotated
    }
    return scaleMax(frame, maxEdge)
  }

  private fun scaleMax(src: Bitmap, maxEdge: Int): Bitmap {
    val w = src.width
    val h = src.height
    val edge = maxOf(w, h)
    if (edge <= maxEdge) return src
    val scale = maxEdge.toFloat() / edge
    return Bitmap.createScaledBitmap(src, (w * scale).toInt(), (h * scale).toInt(), true)
  }

  private fun JSONObject.stringOrNull(key: String): String? {
    if (!has(key) || isNull(key)) return null
    return getString(key)
  }
}
