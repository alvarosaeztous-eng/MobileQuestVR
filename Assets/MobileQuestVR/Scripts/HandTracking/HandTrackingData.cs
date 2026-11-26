using UnityEngine;

namespace MobileQuestVR.HandTracking
{
    public enum Handedness
    {
        Unknown = 0,
        Left = 1,
        Right = 2
    }

    public enum HandGestureType
    {
        None = 0,
        OpenPalm = 1,
        Point = 2,
        Pinch = 3,
        FistGrab = 4,
        ThumbsUp = 5
    }

    public enum HandTrackingProviderStatus
    {
        Uninitialized = 0,
        AwaitingCameraPermission = 1,
        ReadyAwaitingNativePlugin = 2,
        Running = 3,
        Stopped = 4,
        Error = 5
    }

    /// <summary>
    /// Raw single-hand output from MediaPipe HandLandmarker (21 normalized image landmarks + optional 21 metric world landmarks).
    /// </summary>
    public sealed class RawHandDetection
    {
        public Handedness Handedness = Handedness.Unknown;
        public float Confidence;
        public bool HasWorldLandmarks;

        /// <summary>
        /// Normalized image landmarks: x in [0,1] left-to-right, y in [0,1] top-to-bottom, z relative depth in image width scale.
        /// </summary>
        public readonly Vector3[] NormalizedLandmarks = new Vector3[HandSkeletonTopology.LandmarkCount];

        /// <summary>
        /// Optional MediaPipe 3D metric world landmarks in meters relative to hand center (right-handed, +Y down, +Z away).
        /// </summary>
        public readonly Vector3[] WorldLandmarks = new Vector3[HandSkeletonTopology.LandmarkCount];

        public void CopyFrom(RawHandDetection source)
        {
            Handedness = source.Handedness;
            Confidence = source.Confidence;
            HasWorldLandmarks = source.HasWorldLandmarks;
            System.Array.Copy(source.NormalizedLandmarks, NormalizedLandmarks, HandSkeletonTopology.LandmarkCount);
            System.Array.Copy(source.WorldLandmarks, WorldLandmarks, HandSkeletonTopology.LandmarkCount);
        }
    }

    /// <summary>
    /// Raw frame emitted by an IHandTrackingProvider (supports up to two simultaneously tracked hands).
    /// </summary>
    public sealed class RawHandTrackingFrame
    {
        public long TimestampMs;
        public int HandCount;
        public readonly RawHandDetection[] Hands =
        {
            new RawHandDetection(),
            new RawHandDetection()
        };

        public void CopyFrom(RawHandTrackingFrame source)
        {
            TimestampMs = source.TimestampMs;
            HandCount = Mathf.Clamp(source.HandCount, 0, Hands.Length);
            for (int i = 0; i < HandCount; i++)
            {
                Hands[i].CopyFrom(source.Hands[i]);
            }
        }
    }

    /// <summary>
    /// Computed gesture classification and continuous pinch/curl signals for one tracked hand.
    /// </summary>
    public struct HandGestureState
    {
        public HandGestureType PrimaryGesture;
        public bool IsPinching;
        public bool PinchStartedThisFrame;
        public bool PinchEndedThisFrame;
        public float PinchStrength;
        public bool IsGrabbing;
        public bool IsPointing;
        public bool IsPalmFacingHead;
        public float IndexCurl;
        public float MiddleCurl;
        public float RingCurl;
        public float PinkyCurl;
        public float ThumbCurl;
    }

    /// <summary>
    /// Fully mapped 3D VR hand state in Unity world space ready for rendering and interaction.
    /// </summary>
    public sealed class TrackedHandPose
    {
        public Handedness Handedness;
        public bool IsTracked;
        public float Confidence;
        public float LastTrackedTime;

        public readonly Vector3[] WorldJoints = new Vector3[HandSkeletonTopology.LandmarkCount];
        public Vector3 PalmCenter;
        public Vector3 PalmNormal;
        public Vector3 PinchPoint;
        public Ray AimRay;
        public HandGestureState Gesture;

        public TrackedHandPose(Handedness handedness)
        {
            Handedness = handedness;
        }
    }
}
