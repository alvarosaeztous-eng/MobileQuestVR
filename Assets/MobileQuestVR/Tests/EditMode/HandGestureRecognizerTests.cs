using MobileQuestVR.HandTracking;
using NUnit.Framework;
using UnityEngine;

namespace MobileQuestVR.Tests.EditMode
{
    public class HandGestureRecognizerTests
    {
        private static Vector3[] CreateSyntheticHand(bool pinch, bool fist, bool point)
        {
            Vector3[] j = new Vector3[HandSkeletonTopology.LandmarkCount];
            j[(int)HandLandmarkId.Wrist] = new Vector3(0f, 0f, 0f);
            j[(int)HandLandmarkId.ThumbCmc] = new Vector3(-0.024f, 0.022f, 0.005f);
            j[(int)HandLandmarkId.ThumbMcp] = new Vector3(-0.042f, 0.045f, 0.012f);
            j[(int)HandLandmarkId.IndexMcp] = new Vector3(-0.025f, 0.088f, 0f);
            j[(int)HandLandmarkId.MiddleMcp] = new Vector3(0.000f, 0.092f, 0f);
            j[(int)HandLandmarkId.RingMcp] = new Vector3(0.022f, 0.086f, 0f);
            j[(int)HandLandmarkId.PinkyMcp] = new Vector3(0.042f, 0.075f, 0f);

            BuildFinger(j, HandLandmarkId.IndexMcp, HandLandmarkId.IndexPip, HandLandmarkId.IndexDip, HandLandmarkId.IndexTip, fist ? 0.95f : (pinch ? 0.40f : 0.05f));
            BuildFinger(j, HandLandmarkId.MiddleMcp, HandLandmarkId.MiddlePip, HandLandmarkId.MiddleDip, HandLandmarkId.MiddleTip, (fist || point) ? 0.95f : 0.05f);
            BuildFinger(j, HandLandmarkId.RingMcp, HandLandmarkId.RingPip, HandLandmarkId.RingDip, HandLandmarkId.RingTip, (fist || point) ? 0.95f : 0.05f);
            BuildFinger(j, HandLandmarkId.PinkyMcp, HandLandmarkId.PinkyPip, HandLandmarkId.PinkyDip, HandLandmarkId.PinkyTip, (fist || point) ? 0.95f : 0.05f);

            if (pinch)
            {
                j[(int)HandLandmarkId.ThumbIp] = j[(int)HandLandmarkId.IndexTip] + new Vector3(-0.02f, -0.02f, 0f);
                j[(int)HandLandmarkId.ThumbTip] = j[(int)HandLandmarkId.IndexTip] + new Vector3(-0.008f, -0.005f, 0f);
            }
            else if (fist)
            {
                j[(int)HandLandmarkId.ThumbIp] = new Vector3(-0.020f, 0.068f, 0.025f);
                j[(int)HandLandmarkId.ThumbTip] = new Vector3(0.005f, 0.072f, 0.030f);
            }
            else
            {
                j[(int)HandLandmarkId.ThumbIp] = new Vector3(-0.058f, 0.068f, 0.014f);
                j[(int)HandLandmarkId.ThumbTip] = new Vector3(-0.074f, 0.090f, 0.015f);
            }

            return j;
        }

        private static void BuildFinger(Vector3[] j, HandLandmarkId mcp, HandLandmarkId pip, HandLandmarkId dip, HandLandmarkId tip, float curl)
        {
            Vector3 p0 = j[(int)mcp];
            float a1 = curl * 75f * Mathf.Deg2Rad;
            float a2 = curl * 145f * Mathf.Deg2Rad;
            float a3 = curl * 190f * Mathf.Deg2Rad;

            Vector3 p1 = p0 + new Vector3(0f, Mathf.Cos(a1), Mathf.Sin(a1)) * 0.036f;
            Vector3 p2 = p1 + new Vector3(0f, Mathf.Cos(a2), Mathf.Sin(a2)) * 0.024f;
            Vector3 p3 = p2 + new Vector3(0f, Mathf.Cos(a3), Mathf.Sin(a3)) * 0.020f;

            j[(int)pip] = p1;
            j[(int)dip] = p2;
            j[(int)tip] = p3;
        }

        [Test]
        public void Recognizer_DetectsOpenPalmPinchPointAndFist()
        {
            HandGestureRecognizer recognizer = new HandGestureRecognizer();
            Vector3 palm = new Vector3(0f, 0.05f, 0f);
            Vector3 normal = Vector3.back;
            Vector3 head = new Vector3(0f, 0.05f, -0.5f);

            HandGestureState open = recognizer.Evaluate(CreateSyntheticHand(false, false, false), palm, normal, head);
            Assert.That(open.PrimaryGesture, Is.EqualTo(HandGestureType.OpenPalm));
            Assert.That(open.IsPinching, Is.False);
            Assert.That(open.IsPalmFacingHead, Is.True);

            HandGestureState pinch = recognizer.Evaluate(CreateSyntheticHand(true, false, false), palm, normal, head);
            Assert.That(pinch.PrimaryGesture, Is.EqualTo(HandGestureType.Pinch));
            Assert.That(pinch.IsPinching, Is.True);
            Assert.That(pinch.PinchStartedThisFrame, Is.True);

            recognizer.Reset();
            HandGestureState point = recognizer.Evaluate(CreateSyntheticHand(false, false, true), palm, normal, head);
            Assert.That(point.PrimaryGesture, Is.EqualTo(HandGestureType.Point));
            Assert.That(point.IsPointing, Is.True);

            recognizer.Reset();
            HandGestureState fist = recognizer.Evaluate(CreateSyntheticHand(false, true, false), palm, normal, head);
            Assert.That(fist.IsGrabbing, Is.True);
        }

        [Test]
        public void AndroidMediaPipePackedBuffer_DecodesHandednessConfidenceAndLandmarks()
        {
            float[] buffer = new float[AndroidMediaPipeHandProvider.HeaderFloats + AndroidMediaPipeHandProvider.FloatsPerHand];
            buffer[0] = 1f; // 1 hand
            buffer[1] = 1f; // has world landmarks
            buffer[2] = 2f; // Right hand
            buffer[3] = 0.93f;

            // IndexTip (#8) normalized & world
            int normIndexTip = 2 + 2 + 8 * 3;
            buffer[normIndexTip] = 0.62f;
            buffer[normIndexTip + 1] = 0.41f;
            buffer[normIndexTip + 2] = -0.08f;

            int worldIndexTip = 2 + 2 + 21 * 3 + 8 * 3;
            buffer[worldIndexTip] = 0.03f;
            buffer[worldIndexTip + 1] = -0.07f;
            buffer[worldIndexTip + 2] = 0.02f;

            RawHandTrackingFrame frame = new RawHandTrackingFrame();
            bool ok = AndroidMediaPipeHandProvider.DecodePackedBuffer(buffer, 123456L, frame);

            Assert.That(ok, Is.True);
            Assert.That(frame.HandCount, Is.EqualTo(1));
            Assert.That(frame.TimestampMs, Is.EqualTo(123456L));
            Assert.That(frame.Hands[0].Handedness, Is.EqualTo(Handedness.Right));
            Assert.That(frame.Hands[0].Confidence, Is.EqualTo(0.93f).Within(1e-4f));
            Assert.That(frame.Hands[0].NormalizedLandmarks[(int)HandLandmarkId.IndexTip].x, Is.EqualTo(0.62f).Within(1e-4f));
            Assert.That(frame.Hands[0].WorldLandmarks[(int)HandLandmarkId.IndexTip].y, Is.EqualTo(-0.07f).Within(1e-4f));
        }
    }
}
