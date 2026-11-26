using UnityEngine;

namespace MobileQuestVR.Tracking
{
    /// <summary>
    /// Abstraction over a 3DoF head orientation source (Android IMU/Gyroscope or Editor input).
    /// </summary>
    public interface IHeadTrackingSource
    {
        string SourceName { get; }
        bool IsAvailable { get; }
        bool IsTracking { get; }

        void Initialize();
        void Shutdown();

        /// <summary>
        /// Samples the latest head rotation in Unity world coordinates (left-handed, Y-up, +Z forward)
        /// and angular velocity in radians per second.
        /// </summary>
        bool TrySampleOrientation(float deltaTime, out Quaternion unityOrientation, out Vector3 angularVelocityRadSec);
    }
}
