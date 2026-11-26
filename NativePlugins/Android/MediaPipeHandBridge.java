package com.mobilequestvr.handtracking;

import android.app.Activity;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Matrix;
import android.os.SystemClock;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.ImageProxy;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.core.content.ContextCompat;
import androidx.lifecycle.LifecycleOwner;

import com.google.common.util.concurrent.ListenableFuture;
import com.google.mediapipe.framework.image.BitmapImageBuilder;
import com.google.mediapipe.framework.image.MPImage;
import com.google.mediapipe.tasks.components.containers.Category;
import com.google.mediapipe.tasks.components.containers.Landmark;
import com.google.mediapipe.tasks.components.containers.NormalizedLandmark;
import com.google.mediapipe.tasks.core.BaseOptions;
import com.google.mediapipe.tasks.core.Delegate;
import com.google.mediapipe.tasks.vision.core.RunningMode;
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarker;
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarkerResult;

import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Native Android MediaPipe Hand Landmarker + CameraX LIVE_STREAM bridge for MobileQuestVR.
 *
 * Streams packed float[] buffers back to Unity C# (AndroidMediaPipeHandProvider) via HandLandmarkCallback:
 *   Header (2 floats): [handCount, hasWorldLandmarks]
 *   Per hand (128 floats): [handednessCode(1=Left,2=Right), confidence, 21*(x,y,z) normalized, 21*(wx,wy,wz) metric meters]
 *
 * Activate this bridge in Android builds via Unity menu:
 *   MobileQuestVR -> MediaPipe -> Install Android Bridge & Gradle Template
 */
public final class MediaPipeHandBridge {
    private static final String TAG = "MobileQuestVR.MediaPipe";
    private static final String DEFAULT_MODEL_ASSET = "hand_landmarker.task";
    private static final int LANDMARK_COUNT = 21;
    private static final int HEADER_FLOATS = 2;
    private static final int FLOATS_PER_HAND = 2 + (LANDMARK_COUNT * 3) + (LANDMARK_COUNT * 3); // 128

    private final Activity activity;
    private final HandLandmarkCallback callback;
    private final ExecutorService cameraExecutor;

    private HandLandmarker handLandmarker;
    private ProcessCameraProvider cameraProvider;
    private volatile boolean running;

    public MediaPipeHandBridge(@NonNull Activity unityActivity, @NonNull HandLandmarkCallback landmarkCallback) {
        this.activity = unityActivity;
        this.callback = landmarkCallback;
        this.cameraExecutor = Executors.newSingleThreadExecutor();
    }

    public boolean startTracking(int maxHands, float minDetectionConfidence, float minPresenceConfidence, float minTrackingConfidence) {
        if (running) {
            return true;
        }

        try {
            BaseOptions baseOptions = BaseOptions.builder()
                    .setModelAssetPath(DEFAULT_MODEL_ASSET)
                    .setDelegate(Delegate.GPU)
                    .build();

            HandLandmarker.HandLandmarkerOptions options = HandLandmarker.HandLandmarkerOptions.builder()
                    .setBaseOptions(baseOptions)
                    .setRunningMode(RunningMode.LIVE_STREAM)
                    .setNumHands(Math.max(1, Math.min(2, maxHands)))
                    .setMinHandDetectionConfidence(minDetectionConfidence)
                    .setMinHandPresenceConfidence(minPresenceConfidence)
                    .setMinTrackingConfidence(minTrackingConfidence)
                    .setResultListener(this::handleLandmarkerResult)
                    .setErrorListener(error -> {
                        Log.e(TAG, "MediaPipe runtime error", error);
                        if (callback != null) {
                            callback.onError(error.getMessage() != null ? error.getMessage() : "Unknown MediaPipe error");
                        }
                    })
                    .build();

            handLandmarker = HandLandmarker.createFromOptions(activity.getApplicationContext(), options);
            startCameraAnalysis();
            running = true;
            return true;
        } catch (Exception ex) {
            Log.e(TAG, "Failed to initialize MediaPipe HandLandmarker", ex);
            if (callback != null) {
                callback.onError("MediaPipe init failed: " + ex.getMessage());
            }
            return false;
        }
    }

    public void stopTracking() {
        running = false;
        activity.runOnUiThread(() -> {
            if (cameraProvider != null) {
                cameraProvider.unbindAll();
            }
        });
    }

    public void release() {
        stopTracking();
        if (handLandmarker != null) {
            handLandmarker.close();
            handLandmarker = null;
        }
        cameraExecutor.shutdown();
    }

    private void startCameraAnalysis() {
        Context context = activity.getApplicationContext();
        ListenableFuture<ProcessCameraProvider> providerFuture = ProcessCameraProvider.getInstance(context);
        providerFuture.addListener(() -> {
            try {
                cameraProvider = providerFuture.get();
                cameraProvider.unbindAll();

                ImageAnalysis analysis = new ImageAnalysis.Builder()
                        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                        .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
                        .build();

                analysis.setAnalyzer(cameraExecutor, this::analyzeFrame);

                if (activity instanceof LifecycleOwner) {
                    cameraProvider.bindToLifecycle(
                            (LifecycleOwner) activity,
                            CameraSelector.DEFAULT_BACK_CAMERA,
                            analysis);
                } else if (callback != null) {
                    callback.onError("Unity Activity does not implement LifecycleOwner. Enable GameActivity in Player Settings.");
                }
            } catch (Exception ex) {
                Log.e(TAG, "Failed to bind CameraX analysis", ex);
                if (callback != null) {
                    callback.onError("CameraX start failed: " + ex.getMessage());
                }
            }
        }, ContextCompat.getMainExecutor(context));
    }

    private void analyzeFrame(@NonNull ImageProxy imageProxy) {
        try {
            if (!running || handLandmarker == null) {
                return;
            }

            Bitmap bitmap = imageProxy.toBitmap();
            int rotationDegrees = imageProxy.getImageInfo().getRotationDegrees();
            if (rotationDegrees != 0) {
                Matrix matrix = new Matrix();
                matrix.postRotate(rotationDegrees);
                Bitmap rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), matrix, false);
                bitmap.recycle();
                bitmap = rotated;
            }

            MPImage mpImage = new BitmapImageBuilder(bitmap).build();
            long timestampMs = SystemClock.uptimeMillis();
            handLandmarker.detectAsync(mpImage, timestampMs);
        } catch (Exception ex) {
            Log.w(TAG, "Frame analysis skipped: " + ex.getMessage());
        } finally {
            imageProxy.close();
        }
    }

    private void handleLandmarkerResult(HandLandmarkerResult result, MPImage inputImage) {
        if (callback == null || result == null) {
            return;
        }

        List<List<NormalizedLandmark>> normHands = result.landmarks();
        List<List<Landmark>> worldHands = result.worldLandmarks();
        List<List<Category>> handednessLists = result.handednesses();

        int handCount = Math.min(2, normHands != null ? normHands.size() : 0);
        boolean hasWorld = worldHands != null && worldHands.size() >= handCount;

        float[] packed = new float[HEADER_FLOATS + handCount * FLOATS_PER_HAND];
        packed[0] = handCount;
        packed[1] = hasWorld ? 1f : 0f;

        for (int h = 0; h < handCount; h++) {
            int offset = HEADER_FLOATS + h * FLOATS_PER_HAND;

            float handednessCode = 0f;
            float confidence = 0.85f;
            if (handednessLists != null && h < handednessLists.size() && !handednessLists.get(h).isEmpty()) {
                Category top = handednessLists.get(h).get(0);
                confidence = top.score();
                String label = top.categoryName();
                if ("Left".equalsIgnoreCase(label)) {
                    handednessCode = 1f;
                } else if ("Right".equalsIgnoreCase(label)) {
                    handednessCode = 2f;
                }
            }

            packed[offset] = handednessCode;
            packed[offset + 1] = confidence;

            List<NormalizedLandmark> normList = normHands.get(h);
            int normStart = offset + 2;
            for (int i = 0; i < LANDMARK_COUNT && i < normList.size(); i++) {
                NormalizedLandmark lm = normList.get(i);
                int idx = normStart + i * 3;
                packed[idx] = lm.x();
                packed[idx + 1] = lm.y();
                packed[idx + 2] = lm.z();
            }

            if (hasWorld) {
                List<Landmark> worldList = worldHands.get(h);
                int worldStart = normStart + LANDMARK_COUNT * 3;
                for (int i = 0; i < LANDMARK_COUNT && i < worldList.size(); i++) {
                    Landmark lm = worldList.get(i);
                    int idx = worldStart + i * 3;
                    packed[idx] = lm.x();
                    packed[idx + 1] = lm.y();
                    packed[idx + 2] = lm.z();
                }
            }
        }

        callback.onLandmarksDetected(packed, result.timestampMs());
    }
}
