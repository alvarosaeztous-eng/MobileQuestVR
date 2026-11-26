using System.Collections.Generic;
using MobileQuestVR.Core;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;

namespace MobileQuestVR.Editor
{
    /// <summary>
    /// Unity 6 Editor tools for building/baking the VirtualRoom scene hierarchy in Edit Mode,
    /// creating headset profile assets, and verifying Android VR build configuration.
    /// </summary>
    public static class MobileQuestVRSceneBuilder
    {
        private static readonly string[] RequiredShaders =
        {
            VRRuntimeConfig.ShaderStereoDistortion,
            VRRuntimeConfig.ShaderRoomSurfaceLit,
            VRRuntimeConfig.ShaderHoloPanel,
            VRRuntimeConfig.ShaderGazeReticle
        };

        [MenuItem("MobileQuestVR/Build Virtual Room in Current Scene", priority = 10)]
        public static void BuildVirtualRoomInCurrentScene()
        {
            MobileQuestVRBootstrap bootstrap = Object.FindFirstObjectByType<MobileQuestVRBootstrap>();
            if (bootstrap == null)
            {
                GameObject root = new GameObject("MobileQuestVRSystem");
                bootstrap = root.AddComponent<MobileQuestVRBootstrap>();
            }

            // Clear previously baked children so rebuilding is idempotent
            for (int i = bootstrap.transform.childCount - 1; i >= 0; i--)
            {
                Object.DestroyImmediate(bootstrap.transform.GetChild(i).gameObject);
            }

            bootstrap.InitializeAllSystems();
            EnsureRequiredShadersAlwaysIncluded();

            EditorSceneManager.MarkSceneDirty(SceneManager.GetActiveScene());
            Selection.activeGameObject = bootstrap.gameObject;
            Debug.Log("[MobileQuestVR] Virtual Room hierarchy built in Edit Mode. Save the scene (Ctrl/Cmd+S) to keep baked objects.");
        }

        [MenuItem("MobileQuestVR/Create Default Headset Profile Asset", priority = 20)]
        public static void CreateDefaultHeadsetProfileAsset()
        {
            const string assetPath = "Assets/MobileQuestVR/DefaultVRHeadsetProfile.asset";
            VRHeadsetProfile existing = AssetDatabase.LoadAssetAtPath<VRHeadsetProfile>(assetPath);
            if (existing != null)
            {
                Selection.activeObject = existing;
                EditorGUIUtility.PingObject(existing);
                return;
            }

            VRHeadsetProfile profile = ScriptableObject.CreateInstance<VRHeadsetProfile>();
            AssetDatabase.CreateAsset(profile, assetPath);
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            Selection.activeObject = profile;
            EditorGUIUtility.PingObject(profile);
            Debug.Log($"[MobileQuestVR] Created headset profile asset at {assetPath}");
        }

        [MenuItem("MobileQuestVR/Verify Android VR Project Settings", priority = 30)]
        public static void VerifyAndroidVRSettings()
        {
            EnsureRequiredShadersAlwaysIncluded();

            List<string> notes = new List<string>();

            if (PlayerSettings.defaultInterfaceOrientation != UIOrientation.LandscapeLeft)
            {
                notes.Add("- Default Orientation is not LandscapeLeft (recommended for mobile VR headsets).");
            }

            if (PlayerSettings.Android.minSdkVersion < AndroidSdkVersions.AndroidApiLevel26)
            {
                notes.Add("- Android Min SDK < API 26 (API 26+ recommended for Unity 6 + MediaPipe CameraX).");
            }

            if (PlayerSettings.GetScriptingBackend(NamedBuildTarget.Android) != ScriptingImplementation.IL2CPP)
            {
                notes.Add("- Android Scripting Backend is not IL2CPP (required for ARM64 builds & MediaPipe native libs).");
            }

            if ((PlayerSettings.Android.targetArchitectures & AndroidArchitecture.ARM64) == 0)
            {
                notes.Add("- Android ARM64 architecture is not enabled.");
            }

            if (notes.Count == 0)
            {
                EditorUtility.DisplayDialog(
                    "MobileQuestVR Settings Check",
                    "All Android VR settings and shaders are configured properly for Unity 6!",
                    "OK");
            }
            else
            {
                string summary = "Review these recommended Android VR settings:\n\n" + string.Join("\n", notes);
                EditorUtility.DisplayDialog("MobileQuestVR Settings Check", summary, "OK");
            }
        }

        public static void EnsureRequiredShadersAlwaysIncluded()
        {
            Object graphicsAsset = AssetDatabase.LoadAssetAtPath<Object>("ProjectSettings/GraphicsSettings.asset");
            if (graphicsAsset == null)
            {
                return;
            }

            SerializedObject serializedGraphics = new SerializedObject(graphicsAsset);
            SerializedProperty arrayProp = serializedGraphics.FindProperty("m_AlwaysIncludedShaders");
            if (arrayProp == null)
            {
                return;
            }

            bool modified = false;
            foreach (string shaderName in RequiredShaders)
            {
                Shader shader = Shader.Find(shaderName);
                if (shader == null)
                {
                    Debug.LogWarning($"[MobileQuestVR] Could not locate shader '{shaderName}' while verifying AlwaysIncludedShaders.");
                    continue;
                }

                bool alreadyIncluded = false;
                for (int i = 0; i < arrayProp.arraySize; i++)
                {
                    if (arrayProp.GetArrayElementAtIndex(i).objectReferenceValue == shader)
                    {
                        alreadyIncluded = true;
                        break;
                    }
                }

                if (!alreadyIncluded)
                {
                    int idx = arrayProp.arraySize;
                    arrayProp.InsertArrayElementAtIndex(idx);
                    arrayProp.GetArrayElementAtIndex(idx).objectReferenceValue = shader;
                    modified = true;
                }
            }

            if (modified)
            {
                serializedGraphics.ApplyModifiedProperties();
                AssetDatabase.SaveAssets();
                Debug.Log("[MobileQuestVR] Registered custom VR shaders into GraphicsSettings.m_AlwaysIncludedShaders.");
            }
        }
    }

    /// <summary>
    /// Ensures MobileQuestVR runtime shaders are never stripped during Android APK builds.
    /// </summary>
    public sealed class MobileQuestVRBuildPreprocessor : IPreprocessBuildWithReport
    {
        public int callbackOrder => 0;

        public void OnPreprocessBuild(BuildReport report)
        {
            MobileQuestVRSceneBuilder.EnsureRequiredShadersAlwaysIncluded();
        }
    }
}
