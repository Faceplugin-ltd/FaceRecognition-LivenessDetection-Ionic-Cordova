package com.facerecognitionsdk

import android.graphics.Bitmap
import android.graphics.Rect
import android.util.Base64
import com.faceplugin.facerecognitionsdk.FaceRecognitionSDK
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream

/**
 * The bridge's view of the engine.
 *
 * The SDK's Android API changed: `FaceBox` and `FaceDetectionParam` are gone, detection runs
 * through `FaceRecognitionSDK.Image`, and the VideoWorker, `cropFace`, `quality`,
 * `extractFeature` and the landmark mode were removed. This adapter keeps the JSON the
 * JavaScript and Dart layers already read, so the app code above the bridge is unchanged,
 * and implements what the engine no longer provides.
 *
 * Every call here must already hold the engine's turn — the engine is not re-entrant.
 */
internal object FaceSdkCompat {

    // Keep the original SDK result across the JSON bridge, never re-detect by box.
    // Bounded to the most recent 256 faces; stale handles fail explicitly.
    private val detectedFaces = LinkedHashMap<String, FaceRecognitionSDK.Face>()

    private fun rememberFace(face: FaceRecognitionSDK.Face): String {
        val id = java.util.UUID.randomUUID().toString()
        detectedFaces[id] = face
        while (detectedFaces.size > 256) detectedFaces.remove(detectedFaces.keys.first())
        return id
    }

    fun clearDetectedFaces() { detectedFaces.clear() }

    /** Smile at or above this reads as "Smiling", matching the Android app. */
    private const val SMILE_THRESHOLD = 0.5f

    // ---------------------------------------------------------------- lifecycle

    fun licenseStatusJson(): String {
        val l = FaceRecognitionSDK.license()
        return JSONObject()
            .put("licensed", l?.licensed ?: false)
            .put("level", l?.level ?: -1)
            .put("levelName", l?.levelName ?: "None")
            .put("recognition", l?.recognition ?: false)
            .put("liveness", l?.liveness ?: false)
            .put("label", l?.label ?: "Not licensed")
            .toString()
    }

    // ---------------------------------------------------------------- detection

    /**
     * Detection for a `param` JSON, as the bridges' `faceDetection` passes it.
     *
     * Two keys beyond the estimators change what comes back:
     * `templates` asks for a recognition template on the first N faces, and `sortBySize`
     * orders the faces largest first before those templates are taken.
     *
     * The templates are read from the same open [FaceRecognitionSDK.Image] as the detection,
     * which is what the Android app's kit does. Extracting them from a second detect would
     * cost a full attribute pass per face and, worse, could attribute a template to the wrong
     * person when two faces are close together or the subject moved between the two passes.
     */
    fun detectJson(bitmap: Bitmap, paramJson: String?): String {
        val param = parseJson(paramJson)
        return facesJson(
            bitmap,
            optionsFromParam(paramJson),
            templates = param.optInt("templates", 0),
            sortBySize = param.optBoolean("sortBySize", false)
        )
    }

    /** Detection for the legacy numeric flags, as the bridges' `detect` passes them. */
    fun detectJsonForFlags(bitmap: Bitmap, flags: Int): String =
        facesJson(bitmap, optionsFromFlags(flags))

    private fun facesJson(
        bitmap: Bitmap,
        options: FaceRecognitionSDK.DetectOptions,
        templates: Int = 0,
        sortBySize: Boolean = false,
    ): String {
        val out = JSONArray()
        val image = FaceRecognitionSDK.Image.from(bitmap) ?: return out.toString()
        try {
            var faces = image.detect(options) ?: emptyList()
            if (sortBySize) {
                faces = faces.sortedByDescending { it.bounds.width().toLong() * it.bounds.height() }
            }
            faces.forEachIndexed { index, face ->
                val json = faceJson(face)
                if (index < templates) {
                    // Timed per face, so the host can still show detection and extraction as
                    // two steps on the status card even though they share one engine pass.
                    val started = System.nanoTime()
                    val bytes = try { image.template(face) } catch (_: Throwable) { null }
                    json.put("templateMs", (System.nanoTime() - started) / 1e6)
                    if (bytes != null && bytes.isNotEmpty()) {
                        json.put("template", Base64.encodeToString(bytes, Base64.NO_WRAP))
                        json.put("templateBytes", bytes.size)
                    } else {
                        json.put("template", JSONObject.NULL)
                        json.put("templateBytes", 0)
                    }
                }
                out.put(json)
            }
        } finally {
            image.close()
        }
        return out.toString()
    }

    /** The recognition template for the face a caller already detected, as base64. */
    fun templateBase64(bitmap: Bitmap, faceJson: String?): String {
        val id = parseJson(faceJson).optString("detectionId", "")
        val face = detectedFaces[id]
            ?: throw IllegalArgumentException("Missing or expired detection result")
        val bytes = FaceRecognitionSDK.template(bitmap, face) ?: return ""
        return if (bytes.isEmpty()) "" else Base64.encodeToString(bytes, Base64.NO_WRAP)
    }


    /** The whole image's strongest face as a template, for the bridges' `extractFeature`. */
    fun extractFeatureBase64(bitmap: Bitmap): String {
        val image = FaceRecognitionSDK.Image.from(bitmap) ?: return ""
        try {
            val face = largest(image.detect(allOptions()) ?: emptyList()) ?: return ""
            val bytes = image.template(face) ?: return ""
            return if (bytes.isEmpty()) "" else Base64.encodeToString(bytes, Base64.NO_WRAP)
        } finally {
            image.close()
        }
    }

    /**
     * A face crop as a base64 JPEG. The engine no longer crops, so this is the same 1.4x
     * square around the box the apps use, done here.
     */
    fun cropFaceBase64(bitmap: Bitmap, faceJson: String?): String {
        val box = boundsOf(faceJson) ?: run {
            val image = FaceRecognitionSDK.Image.from(bitmap) ?: return ""
            try {
                largest(image.detect(FaceRecognitionSDK.DetectOptions()) ?: emptyList())?.bounds
            } finally {
                image.close()
            }
        } ?: return ""
        val crop = cropPadded(bitmap, box) ?: return ""
        val out = ByteArrayOutputStream()
        crop.compress(Bitmap.CompressFormat.JPEG, 92, out)
        return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
    }

    /** Quality for the strongest face, in the shape the bridges' `quality` returned. */
    fun qualityJson(bitmap: Bitmap): String {
        val image = FaceRecognitionSDK.Image.from(bitmap) ?: return "{}"
        try {
            val face = largest(image.detect(allOptions()) ?: emptyList()) ?: return "{}"
            return JSONObject()
                .put("quality", numOrNull(face.quality))
                .put("score", numOrNull(face.score))
                .toString()
        } finally {
            image.close()
        }
    }

    // ---------------------------------------------------------------- VideoWorker, emulated

    @Volatile
    private var workerRunning = false

    @Volatile
    private var workerThreshold = FaceRecognitionSDK.MATCH_THRESHOLD

    @Volatile
    private var workerDb: List<ByteArray> = emptyList()

    fun startWorker(matchThreshold: Float) {
        workerThreshold = matchThreshold
        // A new session starts without a gallery: the capture guide never matches frames.
        workerDb = emptyList()
        workerRunning = true
    }

    fun stopWorker() {
        workerRunning = false
        workerDb = emptyList()
    }

    fun syncWorker(features: List<ByteArray>, matchThreshold: Float) {
        workerDb = features
        workerThreshold = matchThreshold
    }

    fun workerRunning(): Boolean = workerRunning

    private var lastMatchMs = 0L

    /** At most one gallery scan every [MATCH_INTERVAL_MS] while tracking. */
    private fun dueForMatch(): Boolean {
        val now = android.os.SystemClock.elapsedRealtime()
        if (now - lastMatchMs < MATCH_INTERVAL_MS) return false
        lastMatchMs = now
        return true
    }

    private const val MATCH_INTERVAL_MS = 400L

    /**
     * One tracking event for a frame, or null when no session is running.
     *
     * The shape is the one the hosts parse, and all three parts of it matter: `event` is the
     * discriminator every parser checks first and drops the message without, `frame_width` /
     * `frame_height` are what the capture guide measures its ROI against (a host that does not
     * get them falls back to a hard-coded frame size and then asks the user to move closer
     * forever), and a match rides on the face it belongs to, not on the event.
     */
    fun workerFrameJson(frame: Bitmap): String? {
        if (!workerRunning) return null
        val image = FaceRecognitionSDK.Image.from(frame) ?: return null
        try {
            // What the native capture guide asks for: a box, the pose and the
            // landmarks it draws. Eye openness is an estimator per frame and the gate
            // does not read it.
            val options = FaceRecognitionSDK.DetectOptions().apply {
                pose = true
                points = true
            }
            val faces = image.detect(options) ?: emptyList()
            val tracked = JSONArray()

            faces.forEachIndexed { index, face ->
                val b = face.bounds
                val o = JSONObject()
                    .put("track_id", index)
                    .put(
                        "faceRegion",
                        JSONObject().put("x", b.left).put("y", b.top)
                            .put("width", b.width()).put("height", b.height())
                    )
                    .put(
                        "facePose",
                        JSONObject().put("yaw", num(face.yaw)).put("pitch", num(face.pitch))
                            .put("roll", num(face.roll))
                    )
                val points = JSONArray()
                face.points?.let { p ->
                    var i = 0
                    while (i + 1 < p.size) {
                        points.put(JSONObject().put("x", p[i].toDouble()).put("y", p[i + 1].toDouble()))
                        i += 2
                    }
                }
                o.put("facePoints", points)
                if (!face.eyesOpen.isNaN()) o.put("eyes_open", face.eyesOpen.toDouble())
                o.put("weak", false)

                // A template plus a scan of the whole gallery is far too much to do on
                // every frame; the real VideoWorker matched on its own cadence.
                if (index == 0 && workerDb.isNotEmpty() && dueForMatch()) {
                    val feature = try { image.template(face) } catch (_: Throwable) { null }
                    if (feature != null && feature.isNotEmpty()) {
                        var bestIndex = -1
                        var best = -1f
                        workerDb.forEachIndexed { candidate, stored ->
                            val score = try {
                                FaceRecognitionSDK.similarity(feature, stored)
                            } catch (_: Throwable) {
                                -1f
                            }
                            if (!score.isNaN() && score > best) {
                                best = score
                                bestIndex = candidate
                            }
                        }
                        if (bestIndex >= 0) {
                            o.put(
                                "match",
                                JSONObject()
                                    .put("matched", best >= workerThreshold)
                                    .put("person_index", bestIndex)
                                    .put("score", best.toDouble())
                            )
                        }
                    }
                }
                tracked.put(o)
            }

            return JSONObject()
                .put("event", "tracking")
                .put("frame_width", frame.width)
                .put("frame_height", frame.height)
                .put("faces", tracked)
                .toString()
        } finally {
            image.close()
        }
    }

    // ---------------------------------------------------------------- face to JSON

    /**
     * The keys the hosts already read. A value the engine did not compute stays at the
     * neutral value the old bridge used, so nothing above this file has to change.
     */
    fun faceJson(f: FaceRecognitionSDK.Face): JSONObject {
        val b = f.bounds
        val o = JSONObject()
        o.put("detectionId", rememberFace(f))
        o.put("x1", b.left)
        o.put("y1", b.top)
        o.put("x2", b.right)
        o.put("y2", b.bottom)
        o.put("score", numOrNull(f.score))
        o.put("yaw", num(f.yaw))
        o.put("roll", num(f.roll))
        o.put("pitch", num(f.pitch))
        o.put("poseComputed", !f.yaw.isNaN())
        if (f.liveness.isNaN()) {
            o.put("liveness", 0.0)
            o.put("livenessLabel", "")
        } else {
            o.put("liveness", f.liveness.toDouble())
            o.put(
                "livenessLabel",
                if (f.liveness > FaceRecognitionSDK.LIVENESS_THRESHOLD) "Live" else "Fake"
            )
        }
        o.put("quality", numOrNull(f.quality))
        o.put("face_quality", if (f.quality.isNaN()) num(f.score) else f.quality.toDouble())
        o.put("face_luminance", 0.0)
        if (f.eyesOpen.isNaN()) {
            o.put("eyes_open", JSONObject.NULL)
            o.put("left_eye_closed", 0.0)
            o.put("right_eye_closed", 0.0)
        } else {
            val closed = 1.0 - f.eyesOpen
            o.put("eyes_open", f.eyesOpen.toDouble())
            o.put("left_eye_closed", closed)
            o.put("right_eye_closed", closed)
        }
        o.put("smile", numOrNull(f.smile))
        o.put(
            "emotionLabel",
            if (f.smile.isNaN()) "" else if (f.smile >= SMILE_THRESHOLD) "Smiling" else "Neutral"
        )
        o.put("mouth_opened", numOrNull(f.mouthOpen))
        o.put("face_occlusion", 0.0)
        o.put("age", if (f.age > 0) f.age else 0)
        o.put("gender", f.gender)
        o.put("genderLabel", f.genderLabel ?: "")
        o.put("maskLabel", "")
        o.put("qualityLabel", "")
        // Open/Closed words depend on the app's eye threshold, so the engine does not label eyes.
        o.put("eyesLeftLabel", "")
        o.put("eyesRightLabel", "")
        o.put("glassesLabel", "")
        o.put("sunglassesLabel", "")
        o.put("occlusionLabel", "")
        o.put("attributes", JSONObject())
        val landmarks = JSONArray()
        val p = f.points
        val count = if (p == null) 0 else p.size / 2
        for (i in 0 until count * 2) landmarks.put(p!![i].toDouble())
        o.put("landmarkCount", count)
        o.put("landmarks", landmarks)
        return o
    }

    // ---------------------------------------------------------------- helpers

    fun allOptions(): FaceRecognitionSDK.DetectOptions =
        FaceRecognitionSDK.DetectOptions().apply {
            liveness = true
            quality = true
            pose = true
            ageGender = true
            eyes = true
            expression = true
            points = true
        }

    private fun optionsFromParam(paramJson: String?): FaceRecognitionSDK.DetectOptions {
        val o = parseJson(paramJson)
        if (o.optBoolean("allAttributes", false)) return allOptions()
        return FaceRecognitionSDK.DetectOptions().apply {
            liveness = o.optBoolean("check_liveness", false)
            quality = o.optBoolean("check_quality", false)
            pose = o.optBoolean("check_pose", true)
            ageGender = o.optBoolean("estimate_age_gender", false)
            eyes = o.optBoolean("check_eye_closeness", false) ||
                o.optBoolean("check_face_occlusion", false)
            expression = o.optBoolean("check_emotion", false)
            points = o.optBoolean("check_landmarks", true)
        }
    }

    /** The old flag bitmask. Anything out of range asks for everything. */
    private fun optionsFromFlags(flags: Int): FaceRecognitionSDK.DetectOptions {
        if (flags < 0) return allOptions()
        fun has(bit: Int) = (flags and bit) != 0
        return FaceRecognitionSDK.DetectOptions().apply {
            pose = has(0x01)
            points = has(0x02)
            ageGender = has(0x04) || has(0x08)
            expression = has(0x10)
            quality = has(0x20) || has(0x40)
            eyes = has(0x80)
            liveness = has(0x100) || has(0x200)
        }
    }

    private fun parseJson(json: String?): JSONObject = try {
        if (json.isNullOrBlank()) JSONObject() else JSONObject(json)
    } catch (_: Exception) {
        JSONObject()
    }

    /** The box a caller sent back for cropping. */
    private fun boundsOf(faceJson: String?): Rect? {
        val o = parseJson(faceJson)
        if (!o.has("x1") || !o.has("y2")) return null
        return Rect(
            o.optDouble("x1", 0.0).toInt(),
            o.optDouble("y1", 0.0).toInt(),
            o.optDouble("x2", 0.0).toInt(),
            o.optDouble("y2", 0.0).toInt()
        )
    }

    private fun largest(faces: List<FaceRecognitionSDK.Face>): FaceRecognitionSDK.Face? =
        faces.maxByOrNull { it.bounds.width().toLong() * it.bounds.height() }

    /**
     * The face box with 12% padding, which is what the native kits store as a person's photo
     * (`ImageUtils.cropFace`). A square around the centre framed the face far wider than the
     * apps show it.
     */
    private fun cropPadded(src: Bitmap, box: Rect, paddingFraction: Float = 0.12f): Bitmap? {
        val w = box.width()
        val h = box.height()
        if (w <= 1 || h <= 1) return null
        val pad = maxOf(4, (minOf(w, h) * paddingFraction).toInt())
        val left = maxOf(0, box.left - pad)
        val top = maxOf(0, box.top - pad)
        val right = minOf(src.width, box.right + pad)
        val bottom = minOf(src.height, box.bottom + pad)
        if (right - left <= 1 || bottom - top <= 1) return null
        return try {
            Bitmap.createBitmap(src, left, top, right - left, bottom - top)
        } catch (_: Exception) {
            null
        }
    }

    private fun num(v: Float): Double = if (v.isNaN()) 0.0 else v.toDouble()

    private fun numOrNull(v: Float): Any = if (v.isNaN()) JSONObject.NULL else v.toDouble()
}
