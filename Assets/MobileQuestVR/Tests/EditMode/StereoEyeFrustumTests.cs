using MobileQuestVR.Rendering;
using NUnit.Framework;
using UnityEngine;

namespace MobileQuestVR.Tests.EditMode
{
    public class StereoEyeFrustumTests
    {
        [Test]
        public void LocalEyeOffsets_AreSymmetricAroundCenterEye()
        {
            const float ipd = 0.064f;
            Vector3 left = StereoEyeFrustum.GetLocalEyeOffset(StereoEye.Left, ipd);
            Vector3 right = StereoEyeFrustum.GetLocalEyeOffset(StereoEye.Right, ipd);

            Assert.That(left.x, Is.EqualTo(-0.032f).Within(1e-5f));
            Assert.That(right.x, Is.EqualTo(0.032f).Within(1e-5f));
            Assert.That(Vector3.Distance(left, right), Is.EqualTo(ipd).Within(1e-5f));
        }

        [Test]
        public void OffAxisConvergenceProjection_ProducesMirroredHorizontalShear()
        {
            Matrix4x4 leftProj = StereoEyeFrustum.ComputeProjectionMatrix(
                StereoEye.Left, 86f, 0.9f, 0.04f, 100f, 0.064f, convergenceDistance: 2.0f, lensCenterOffsetX: 0f);
            Matrix4x4 rightProj = StereoEyeFrustum.ComputeProjectionMatrix(
                StereoEye.Right, 86f, 0.9f, 0.04f, 100f, 0.064f, convergenceDistance: 2.0f, lensCenterOffsetX: 0f);

            // Element m02 encodes asymmetric horizontal frustum shift (left + right) / (right - left)
            Assert.That(leftProj.m02, Is.GreaterThan(0f));
            Assert.That(rightProj.m02, Is.LessThan(0f));
            Assert.That(leftProj.m02, Is.EqualTo(-rightProj.m02).Within(1e-5f));
            Assert.That(leftProj.m11, Is.EqualTo(rightProj.m11).Within(1e-5f));
        }
    }
}
