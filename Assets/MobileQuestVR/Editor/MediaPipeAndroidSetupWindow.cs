using System.IO;
using UnityEditor;
using UnityEngine;

namespace MobileQuestVR.Editor
{
    /// <summary>
    /// Unity Editor utility window for activating or removing the native Android MediaPipe
    /// HandLandmarker + CameraX Java bridge inside Assets/Plugins/Android.
    /// </summary>
    public class MediaPipeAndroidSetupWindow : EditorWindow
    {
        private const string RepoNativeDir = "NativePlugins/Android";
        private const string TargetJavaDir = "Assets/Plugins/Android/com/mobilequestvr/handtracking";
        private const string ModelAssetPath = "Assets/StreamingAssets/hand_landmarker.task";
        private const string MainGradlePath = "Assets/Plugins/Android/mainTemplate.gradle";

        private static readonly string[] BridgeJavaFiles =
        {
            "MediaPipeHandBridge.java",
            "HandLandmarkCallback.java"
        };

        [MenuItem("MobileQuestVR/MediaPipe Hand Tracking Setup", priority = 40)]
        public static void OpenWindow()
        {
            MediaPipeAndroidSetupWindow window = GetWindow<MediaPipeAndroidSetupWindow>("MediaPipe VR Setup");
            window.minSize = new Vector2(520f, 380f);
        }

        private void OnGUI()
        {
            GUILayout.Space(8f);
            EditorGUILayout.LabelField("MobileQuestVR — Android MediaPipe Hand Tracking Setup", EditorStyles.boldLabel);
            EditorGUILayout.HelpBox(
                "MobileQuestVR ships with the complete C# Hand Tracking architecture (21 landmarks, One-Euro filter, " +
                "3D pinhole spatial unprojection, gesture recognition, hand visualizer, and JNI bridge) plus native Android " +
                "CameraX + MediaPipe Tasks Vision Java sources in NativePlugins/Android/.",
                MessageType.Info);

            GUILayout.Space(10f);

            bool javaInstalled = IsBridgeInstalled();
            bool modelPresent = File.Exists(ModelAssetPath);
            bool gradlePresent = File.Exists(MainGradlePath);

            DrawStatusRow("1. Native Java Bridge (MediaPipeHandBridge.java)", javaInstalled ? "Installed in Assets/Plugins/Android" : "Not installed yet (clean Day-1 build mode)", javaInstalled);
            DrawStatusRow("2. Model File (StreamingAssets/hand_landmarker.task)", modelPresent ? "Found" : "Missing — download float16 hand_landmarker.task", modelPresent);
            DrawStatusRow("3. Custom Gradle Template (mainTemplate.gradle)", gradlePresent ? "Present — verify MediaPipe dependencies" : "Not enabled yet (Player Settings > Publishing Settings)", gradlePresent);

            GUILayout.Space(14f);

            EditorGUILayout.BeginHorizontal();
            if (GUILayout.Button("Install Native Java Bridge", GUILayout.Height(32f)))
            {
                InstallJavaBridge();
            }

            if (GUILayout.Button("Remove Java Bridge (Day-1 Mode)", GUILayout.Height(32f)))
            {
                RemoveJavaBridge();
            }
            EditorGUILayout.EndHorizontal();

            GUILayout.Space(12f);
            EditorGUILayout.LabelField("Required Gradle Dependencies (mainTemplate.gradle):", EditorStyles.boldLabel);
            EditorGUILayout.TextArea(
                "implementation 'com.google.mediapipe:tasks-vision:0.10.14'\n" +
                "implementation 'androidx.camera:camera-core:1.3.4'\n" +
                "implementation 'androidx.camera:camera-camera2:1.3.4'\n" +
                "implementation 'androidx.camera:camera-lifecycle:1.3.4'",
                GUILayout.Height(72f));

            GUILayout.Space(8f);
            if (GUILayout.Button("Open MediaPipe Model Download URL in Browser"))
            {
                Application.OpenURL("https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task");
            }
        }

        private static bool IsBridgeInstalled()
        {
            foreach (string file in BridgeJavaFiles)
            {
                if (!File.Exists(Path.Combine(TargetJavaDir, file)))
                {
                    return false;
                }
            }
            return true;
        }

        private static void InstallJavaBridge()
        {
            string projectRoot = Path.GetFullPath(Path.Combine(Application.dataPath, ".."));
            string sourceDir = Path.Combine(projectRoot, RepoNativeDir);
            string destDir = Path.Combine(projectRoot, TargetJavaDir);

            if (!Directory.Exists(sourceDir))
            {
                EditorUtility.DisplayDialog("MediaPipe Setup", $"Source directory not found: {sourceDir}", "OK");
                return;
            }

            Directory.CreateDirectory(destDir);
            foreach (string file in BridgeJavaFiles)
            {
                string src = Path.Combine(sourceDir, file);
                string dst = Path.Combine(destDir, file);
                if (File.Exists(src))
                {
                    File.Copy(src, dst, overwrite: true);
                }
            }

            AssetDatabase.Refresh();
            Debug.Log("[MobileQuestVR] Installed native MediaPipe Java bridge into Assets/Plugins/Android. Remember to add MediaPipe dependencies to mainTemplate.gradle and place hand_landmarker.task in Assets/StreamingAssets/.");
        }

        private static void RemoveJavaBridge()
        {
            string projectRoot = Path.GetFullPath(Path.Combine(Application.dataPath, ".."));
            string destDir = Path.Combine(projectRoot, TargetJavaDir);

            if (Directory.Exists(destDir))
            {
                Directory.Delete(destDir, recursive: true);
                string metaPath = destDir + ".meta";
                if (File.Exists(metaPath))
                {
                    File.Delete(metaPath);
                }
            }

            AssetDatabase.Refresh();
            Debug.Log("[MobileQuestVR] Removed native MediaPipe Java bridge from Assets/Plugins/Android.");
        }

        private static void DrawStatusRow(string title, string detail, bool ok)
        {
            EditorGUILayout.BeginVertical(EditorStyles.helpBox);
            EditorGUILayout.LabelField(title, EditorStyles.boldLabel);
            GUIStyle statusStyle = new GUIStyle(EditorStyles.label);
            statusStyle.normal.textColor = ok ? new Color(0.15f, 0.72f, 0.35f) : new Color(0.85f, 0.55f, 0.15f);
            EditorGUILayout.LabelField(detail, statusStyle);
            EditorGUILayout.EndVertical();
        }
    }
}
