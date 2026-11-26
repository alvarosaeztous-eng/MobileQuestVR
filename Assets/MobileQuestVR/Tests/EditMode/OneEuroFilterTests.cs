using MobileQuestVR.HandTracking;
using NUnit.Framework;
using UnityEngine;

namespace MobileQuestVR.Tests.EditMode
{
    public class OneEuroFilterTests
    {
        [Test]
        public void OneEuroFilter_ReducesStationaryJitterAndTracksFastMotion()
        {
            OneEuroFilterFloat filter = new OneEuroFilterFloat(minCutoff: 1.5f, beta: 0.1f, dCutoff: 1.0f);
            const float dt = 1f / 60f;

            // Inject high-frequency +/- 0.02 jitter around 0.5
            float maxDeviation = 0f;
            filter.Filter(0.5f, dt);
            for (int i = 0; i < 60; i++)
            {
                float noisy = 0.5f + (i % 2 == 0 ? 0.02f : -0.02f);
                float smoothed = filter.Filter(noisy, dt);
                if (i > 10)
                {
                    maxDeviation = Mathf.Max(maxDeviation, Mathf.Abs(smoothed - 0.5f));
                }
            }

            Assert.That(maxDeviation, Is.LessThan(0.01f), "Filter should suppress stationary micro-jitter.");

            // Now apply a large step move to 1.5 and verify responsive convergence
            float output = 0f;
            for (int i = 0; i < 20; i++)
            {
                output = filter.Filter(1.5f, dt);
            }

            Assert.That(output, Is.GreaterThan(1.35f), "Adaptive cutoff should follow fast motion quickly.");
        }
    }
}
