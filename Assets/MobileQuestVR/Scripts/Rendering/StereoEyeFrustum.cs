using UnityEngine;

namespace MobileQuestVR.Rendering
{
    public enum StereoEye
    {
        Left = -1,
        Right = 1
    }

    /// <summary>
    /// Computes physically accurate off-axis stereoscopic projection matrices and eye offsets.
    /// Off-axis frustum shifting eliminates the vertical keystone distortion caused by toe-in rotation.
    /// </summary>
    public static class StereoEyeFrustum
    {
        /// <summary>
        /// Returns the local X eye offset from the center eye anchor in meters.
        /// Left eye = -IPD/2, Right eye = +IPD/2.
        /// </summary>
        public static Vector3 GetLocalEyeOffset(StereoEye eye, float ipdMeters)
        {
            float clampedIpd = Mathf.Clamp(ipdMeters, 0.045f, 0.085f);
            float sign = eye == StereoEye.Left ? -1f : 1f;
            return new Vector3(sign * clampedIpd * 0.5f, 0f, 0f);
        }

        /// <summary>
        /// Builds an off-axis perspective projection matrix for one eye.
        /// When convergenceDistance &gt; 0, frustums shift asymmetrically to converge at that plane
        /// without rotating the cameras. When convergenceDistance &lt;= 0, parallel optical-infinity frustums are used.
        /// </summary>
        public static Matrix4x4 ComputeProjectionMatrix(
            StereoEye eye,
            float verticalFovDegrees,
            float eyeAspect,
            float nearClip,
            float farClip,
            float ipdMeters,
            float convergenceDistance,
            float lensCenterOffsetX = 0f)
        {
            float safeFov = Mathf.Clamp(verticalFovDegrees, 30f, 130f);
            float safeAspect = Mathf.Max(0.25f, eyeAspect);
            float safeNear = Mathf.Max(0.005f, nearClip);
            float safeFar = Mathf.Max(safeNear + 1f, farClip);

            float top = safeNear * Mathf.Tan(safeFov * 0.5f * Mathf.Deg2Rad);
            float bottom = -top;
            float halfWidth = top * safeAspect;

            float eyeSign = eye == StereoEye.Left ? -1f : 1f;

            // Off-axis convergence frustum shift:
            // Left eye (-1) shifts frustum slightly right (+shift), Right eye (+1) shifts slightly left (-shift).
            float convergenceShift = 0f;
            if (convergenceDistance > safeNear * 2f)
            {
                convergenceShift = -eyeSign * (0.5f * ipdMeters * safeNear / convergenceDistance);
            }

            // Optional physical lens optical center offset
            float lensShift = eyeSign * lensCenterOffsetX * halfWidth;
            float totalShift = convergenceShift + lensShift;

            float left = -halfWidth + totalShift;
            float right = halfWidth + totalShift;

            return Matrix4x4.Frustum(left, right, bottom, top, safeNear, safeFar);
        }
    }
}
