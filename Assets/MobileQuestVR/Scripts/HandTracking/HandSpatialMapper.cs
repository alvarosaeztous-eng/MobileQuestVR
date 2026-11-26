using UnityEngine;

namespace MobileQuestVR.HandTracking
{
    /// <summary>
    /// Unprojects MediaPipe 21-landmark hand detections from rear-camera image coordinates into
    /// metric 3D VR world coordinates attached to the user's head/eye frame, with per-joint One-Euro filtering.
    /// </summary>
    public sealed class HandSpatialMapper
    {
        private const float DefaultPalmLengthMeters = 0.088f;
        private const float MinDepthMeters = 0.22f;
        private const float MaxDepthMeters = 0.95f;

        private readonly OneEuroFilterVector3[] _jointFilters = new OneEuroFilterVector3[HandSkeletonTopology.LandmarkCount];
        private readonly Vector3 _cameraToEyeOffset = new Vector3(0f, -0.02f, 0.055f);

        public HandSpatialMapper(float minCutoff = 1.9f, float beta = 0.12f)
        {
            for (int i = 0; i < HandSkeletonTopology.LandmarkCount; i++)
            {
                _jointFilters[i] = new OneEuroFilterVector3(minCutoff, beta, 1.0f);
            }
        }

        public void ResetFilters()
        {
            for (int i = 0; i < _jointFilters.Length; i++)
            {
                _jointFilters[i].Reset();
            }
        }

        /// <summary>
        /// Maps a RawHandDetection into metric Unity world-space joint positions, palm basis, pinch midpoint, and aim ray.
        /// </summary>
        public void MapToWorldPose(
            RawHandDetection detection,
            Transform centerEyeAnchor,
            float cameraHorizontalFovDeg,
            float cameraAspectRatio,
            float deltaTime,
            TrackedHandPose outputPose)
        {
            if (detection == null || centerEyeAnchor == null || outputPose == null)
            {
                return;
            }

            float safeAspect = Mathf.Max(0.4f, cameraAspectRatio);
            float tanHalfH = Mathf.Tan(Mathf.Clamp(cameraHorizontalFovDeg, 40f, 110f) * 0.5f * Mathf.Deg2Rad);
            float tanHalfV = tanHalfH / safeAspect;

            // Estimate metric depth Z from apparent projected palm size (Wrist -> MiddleMCP)
            Vector3 normWrist = detection.NormalizedLandmarks[(int)HandLandmarkId.Wrist];
            Vector3 normMiddleMcp = detection.NormalizedLandmarks[(int)HandLandmarkId.MiddleMcp];

            Vector2 palmRayDelta = new Vector2(
                (normMiddleMcp.x - normWrist.x) * 2f * tanHalfH,
                (normMiddleMcp.y - normWrist.y) * 2f * tanHalfV);

            float angularPalmSize = Mathf.Max(0.05f, palmRayDelta.magnitude);
            float estimatedDepthZ = Mathf.Clamp(DefaultPalmLengthMeters / angularPalmSize, MinDepthMeters, MaxDepthMeters);

            // Unproject wrist into camera-local space (+X right, +Y up, +Z forward)
            Vector3 wristLocal = UnprojectNormalizedPoint(normWrist.x, normWrist.y, estimatedDepthZ, tanHalfH, tanHalfV) + _cameraToEyeOffset;

            Vector3 worldWristOffset = detection.HasWorldLandmarks
                ? MediaPipeWorldToUnityLocal(detection.WorldLandmarks[(int)HandLandmarkId.Wrist])
                : Vector3.zero;

            for (int i = 0; i < HandSkeletonTopology.LandmarkCount; i++)
            {
                Vector3 localPos;
                if (detection.HasWorldLandmarks)
                {
                    Vector3 mpLocal = MediaPipeWorldToUnityLocal(detection.WorldLandmarks[i]);
                    localPos = wristLocal + (mpLocal - worldWristOffset);
                }
                else
                {
                    Vector3 nl = detection.NormalizedLandmarks[i];
                    float relativeDepthZ = nl.z * (estimatedDepthZ * 2f * tanHalfH);
                    localPos = UnprojectNormalizedPoint(nl.x, nl.y, estimatedDepthZ + relativeDepthZ, tanHalfH, tanHalfV) + _cameraToEyeOffset;
                }

                Vector3 filteredLocal = _jointFilters[i].Filter(localPos, deltaTime);
                outputPose.WorldJoints[i] = centerEyeAnchor.TransformPoint(filteredLocal);
            }

            // Compute palm center, palm normal, pinch midpoint, and ergonomic pointing ray
            Vector3 wrist = outputPose.WorldJoints[(int)HandLandmarkId.Wrist];
            Vector3 indexMcp = outputPose.WorldJoints[(int)HandLandmarkId.IndexMcp];
            Vector3 middleMcp = outputPose.WorldJoints[(int)HandLandmarkId.MiddleMcp];
            Vector3 pinkyMcp = outputPose.WorldJoints[(int)HandLandmarkId.PinkyMcp];
            Vector3 thumbTip = outputPose.WorldJoints[(int)HandLandmarkId.ThumbTip];
            Vector3 indexTip = outputPose.WorldJoints[(int)HandLandmarkId.IndexTip];

            outputPose.PalmCenter = (wrist + indexMcp + middleMcp + pinkyMcp) * 0.25f;

            Vector3 v1 = indexMcp - wrist;
            Vector3 v2 = pinkyMcp - wrist;
            Vector3 cross = Vector3.Cross(v1, v2);
            if (detection.Handedness == Handedness.Left)
            {
                cross = -cross;
            }
            outputPose.PalmNormal = cross.sqrMagnitude > 1e-6f ? cross.normalized : -centerEyeAnchor.forward;

            outputPose.PinchPoint = (thumbTip + indexTip) * 0.5f;

            // Ergonomic shoulder-to-hand aim ray (more stable than raw index fingertip jitter in VR)
            Vector3 shoulderEstimate = centerEyeAnchor.position
                + centerEyeAnchor.right * (detection.Handedness == Handedness.Left ? -0.18f : 0.18f)
                - centerEyeAnchor.up * 0.22f;

            Vector3 aimDirection = (outputPose.PinchPoint - shoulderEstimate);
            Vector3 fingerDir = (indexTip - indexMcp);
            Vector3 blendedDir = aimDirection.normalized * 0.65f + (fingerDir.sqrMagnitude > 1e-5f ? fingerDir.normalized : centerEyeAnchor.forward) * 0.35f;
            outputPose.AimRay = new Ray(outputPose.PinchPoint, blendedDir.normalized);

            outputPose.Handedness = detection.Handedness;
            outputPose.Confidence = detection.Confidence;
            outputPose.IsTracked = true;
            outputPose.LastTrackedTime = Time.unscaledTime;
        }

        private static Vector3 UnprojectNormalizedPoint(float u, float v, float depthZ, float tanHalfH, float tanHalfV)
        {
            // MediaPipe image coords: u in [0,1] left->right, v in [0,1] top->bottom
            float ndcX = (u - 0.5f) * 2f;
            float ndcY = (0.5f - v) * 2f;
            return new Vector3(ndcX * tanHalfH * depthZ, ndcY * tanHalfV * depthZ, depthZ);
        }

        private static Vector3 MediaPipeWorldToUnityLocal(Vector3 mpWorldMeters)
        {
            // MediaPipe world landmarks: +X right, +Y down, +Z away from camera
            return new Vector3(mpWorldMeters.x, -mpWorldMeters.y, mpWorldMeters.z);
        }
    }
}
