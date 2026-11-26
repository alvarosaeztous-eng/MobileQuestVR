package com.mobilequestvr.handtracking;

/**
 * Callback interface implemented in Unity C# by AndroidMediaPipeHandProvider.AndroidLandmarkCallbackProxy.
 */
public interface HandLandmarkCallback {
    void onLandmarksDetected(float[] packedLandmarks, long timestampMs);
    void onError(String errorMessage);
}
