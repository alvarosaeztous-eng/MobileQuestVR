using System;
using UnityEngine;

namespace MobileQuestVR.Core
{
    /// <summary>
    /// Applies Android and desktop display/performance settings required for low-latency mobile VR:
    /// LandscapeLeft orientation, wake-lock, native display refresh rate targeting, and Android immersive mode.
    /// </summary>
    public class AndroidPerformanceConfigurator : MonoBehaviour
    {
        [Header("Frame Pacing & Display")]
        [SerializeField] private bool lockLandscapeLeft = true;
        [SerializeField] private bool keepScreenAwake = true;
        [SerializeField] private int fallbackTargetFrameRate = 90;
        [SerializeField] private int antiAliasingSamples = 4;

        public int ActiveTargetFrameRate { get; private set; }

        private void Awake()
        {
            ApplySettings();
        }

        private void OnApplicationFocus(bool hasFocus)
        {
            if (hasFocus)
            {
                ApplyAndroidImmersiveMode();
            }
        }

        public void ApplySettings()
        {
            if (keepScreenAwake)
            {
                Screen.sleepTimeout = SleepTimeout.NeverSleep;
            }

            if (lockLandscapeLeft && Application.isMobilePlatform)
            {
                Screen.autorotateToPortrait = false;
                Screen.autorotateToPortraitUpsideDown = false;
                Screen.autorotateToLandscapeLeft = true;
                Screen.autorotateToLandscapeRight = true;
                Screen.orientation = ScreenOrientation.LandscapeLeft;
            }

            QualitySettings.vSyncCount = 0;
            if (QualitySettings.antiAliasing < antiAliasingSamples)
            {
                QualitySettings.antiAliasing = antiAliasingSamples;
            }

            double nativeRefresh = Screen.currentResolution.refreshRateRatio.value;
            int targetFps = nativeRefresh >= 55.0
                ? Mathf.Clamp(Mathf.RoundToInt((float)nativeRefresh), 60, 120)
                : fallbackTargetFrameRate;

            Application.targetFrameRate = targetFps;
            ActiveTargetFrameRate = targetFps;

            ApplyAndroidImmersiveMode();
        }

        private static void ApplyAndroidImmersiveMode()
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            try
            {
                using (AndroidJavaClass unityPlayer = new AndroidJavaClass("com.unity3d.player.UnityPlayer"))
                using (AndroidJavaObject activity = unityPlayer.GetStatic<AndroidJavaObject>("currentActivity"))
                {
                    if (activity == null)
                    {
                        return;
                    }

                    activity.Call("runOnUiThread", new AndroidJavaRunnable(() =>
                    {
                        try
                        {
                            using (AndroidJavaObject window = activity.Call<AndroidJavaObject>("getWindow"))
                            using (AndroidJavaObject decorView = window?.Call<AndroidJavaObject>("getDecorView"))
                            {
                                if (decorView == null)
                                {
                                    return;
                                }

                                // SYSTEM_UI_FLAG_LAYOUT_STABLE | LAYOUT_HIDE_NAVIGATION | LAYOUT_FULLSCREEN
                                // | HIDE_NAVIGATION | FULLSCREEN | IMMERSIVE_STICKY
                                const int flags = 0x00000100 | 0x00000200 | 0x00000400 | 0x00000002 | 0x00000004 | 0x00001000;
                                decorView.Call("setSystemUiVisibility", flags);
                            }
                        }
                        catch (Exception innerEx)
                        {
                            Debug.LogWarning($"[MobileQuestVR] Immersive UI flags warning: {innerEx.Message}");
                        }
                    }));
                }
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[MobileQuestVR] Could not apply Android immersive mode: {ex.Message}");
            }
#endif
        }
    }
}
