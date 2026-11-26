using MobileQuestVR.Tracking;
using NUnit.Framework;
using UnityEngine;

namespace MobileQuestVR.Tests.EditMode
{
    public class GyroCoordinateConverterTests
    {
        private static Quaternion BuildLandscapeLeftNorthAndroidAttitude()
        {
            Quaternion portraitNorth = Quaternion.AngleAxis(90f, Vector3.right);
            return portraitNorth * Quaternion.AngleAxis(90f, Vector3.forward);
        }

        [Test]
        public void LandscapeLeftNeutralFacingNorth_MapsToUnityIdentity()
        {
            Quaternion androidNeutral = BuildLandscapeLeftNorthAndroidAttitude();
            Quaternion unityRot = GyroCoordinateConverter.AndroidAttitudeToUnity(androidNeutral, ScreenOrientation.LandscapeLeft);

            Vector3 fwd = unityRot * Vector3.forward;
            Vector3 up = unityRot * Vector3.up;
            Vector3 right = unityRot * Vector3.right;

            Assert.That(Vector3.Distance(fwd, Vector3.forward), Is.LessThan(1e-3f));
            Assert.That(Vector3.Distance(up, Vector3.up), Is.LessThan(1e-3f));
            Assert.That(Vector3.Distance(right, Vector3.right), Is.LessThan(1e-3f));
        }

        [Test]
        public void LandscapeLeftTurnRight30Deg_RotatesForwardRightward()
        {
            Quaternion androidNeutral = BuildLandscapeLeftNorthAndroidAttitude();
            // Right-handed turn right around ENU Up (+Z) is -30 deg
            Quaternion turnedRight = Quaternion.AngleAxis(-30f, Vector3.forward) * androidNeutral;

            Quaternion unityRot = GyroCoordinateConverter.AndroidAttitudeToUnity(turnedRight, ScreenOrientation.LandscapeLeft);
            Vector3 fwd = unityRot * Vector3.forward;

            Assert.That(fwd.x, Is.EqualTo(0.5f).Within(1e-2f));
            Assert.That(fwd.y, Is.EqualTo(0f).Within(1e-2f));
            Assert.That(fwd.z, Is.EqualTo(0.866f).Within(1e-2f));
        }

        [Test]
        public void LandscapeLeftLookUp30Deg_PitchesForwardUpward()
        {
            Quaternion androidNeutral = BuildLandscapeLeftNorthAndroidAttitude();
            Quaternion lookUp = Quaternion.AngleAxis(30f, Vector3.right) * androidNeutral;

            Quaternion unityRot = GyroCoordinateConverter.AndroidAttitudeToUnity(lookUp, ScreenOrientation.LandscapeLeft);
            Vector3 fwd = unityRot * Vector3.forward;

            Assert.That(fwd.x, Is.EqualTo(0f).Within(1e-2f));
            Assert.That(fwd.y, Is.EqualTo(0.5f).Within(1e-2f));
            Assert.That(fwd.z, Is.EqualTo(0.866f).Within(1e-2f));
        }

        [Test]
        public void ComputeYawRecenterOffset_ZerosYawWhilePreservingPitch()
        {
            Quaternion pitchedAndTurned = Quaternion.Euler(-20f, 73f, 0f);
            Quaternion offset = GyroCoordinateConverter.ComputeYawRecenterOffset(pitchedAndTurned);
            Quaternion recentered = offset * pitchedAndTurned;

            Vector3 fwd = recentered * Vector3.forward;
            Assert.That(fwd.x, Is.EqualTo(0f).Within(1e-3f));
            Assert.That(fwd.y, Is.EqualTo(Mathf.Sin(20f * Mathf.Deg2Rad)).Within(1e-3f));
            Assert.That(fwd.z, Is.EqualTo(Mathf.Cos(20f * Mathf.Deg2Rad)).Within(1e-3f));
        }
    }
}
