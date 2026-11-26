using System.Collections.Generic;
using UnityEngine;

namespace MobileQuestVR.Core
{
    public enum VRSoundEffect
    {
        Hover,
        Select,
        Grab,
        Release,
        ToggleOn,
        ToggleOff,
        Recenter,
        Chime
    }

    /// <summary>
    /// Generates clean procedural PCM audio clips at runtime so VR interactions have immediate
    /// spatial audio feedback without relying on external audio files.
    /// </summary>
    public static class ProceduralAudioLibrary
    {
        private const int SampleRate = 44100;
        private static readonly Dictionary<VRSoundEffect, AudioClip> Cache = new Dictionary<VRSoundEffect, AudioClip>();

        public static AudioClip GetClip(VRSoundEffect effect)
        {
            if (Cache.TryGetValue(effect, out AudioClip cached) && cached != null)
            {
                return cached;
            }

            AudioClip clip = effect switch
            {
                VRSoundEffect.Hover => SynthesizeTone("VR_Hover", 640f, 760f, 0.045f, 0.16f),
                VRSoundEffect.Select => SynthesizeTone("VR_Select", 520f, 880f, 0.09f, 0.28f),
                VRSoundEffect.Grab => SynthesizeTone("VR_Grab", 310f, 520f, 0.08f, 0.26f),
                VRSoundEffect.Release => SynthesizeTone("VR_Release", 460f, 240f, 0.09f, 0.24f),
                VRSoundEffect.ToggleOn => SynthesizeChord("VR_ToggleOn", new[] { 523.25f, 659.25f }, 0.14f, 0.25f),
                VRSoundEffect.ToggleOff => SynthesizeChord("VR_ToggleOff", new[] { 440f, 329.63f }, 0.14f, 0.22f),
                VRSoundEffect.Recenter => SynthesizeChord("VR_Recenter", new[] { 440f, 554.37f, 659.25f }, 0.22f, 0.26f),
                VRSoundEffect.Chime => SynthesizeChord("VR_Chime", new[] { 587.33f, 880f, 1174.66f }, 0.45f, 0.25f),
                _ => SynthesizeTone("VR_Default", 500f, 500f, 0.06f, 0.2f)
            };

            Cache[effect] = clip;
            return clip;
        }

        public static void PlayAtPoint(VRSoundEffect effect, Vector3 worldPosition, float volume = 0.7f)
        {
            AudioClip clip = GetClip(effect);
            if (clip != null)
            {
                AudioSource.PlayClipAtPoint(clip, worldPosition, Mathf.Clamp01(volume));
            }
        }

        private static AudioClip SynthesizeTone(string clipName, float startFreq, float endFreq, float durationSeconds, float amplitude)
        {
            int sampleCount = Mathf.Max(64, Mathf.RoundToInt(SampleRate * durationSeconds));
            float[] samples = new float[sampleCount];
            double phase = 0.0;

            for (int i = 0; i < sampleCount; i++)
            {
                float t = i / (float)sampleCount;
                float freq = Mathf.Lerp(startFreq, endFreq, t);
                float env = Mathf.Sin(t * Mathf.PI); // Smooth Hann attack/release envelope
                env *= env;

                phase += 2.0 * System.Math.PI * freq / SampleRate;
                samples[i] = (float)(System.Math.Sin(phase) * amplitude * env);
            }

            AudioClip clip = AudioClip.Create(clipName, sampleCount, 1, SampleRate, false);
            clip.SetData(samples, 0);
            return clip;
        }

        private static AudioClip SynthesizeChord(string clipName, float[] frequencies, float durationSeconds, float amplitude)
        {
            int sampleCount = Mathf.Max(64, Mathf.RoundToInt(SampleRate * durationSeconds));
            float[] samples = new float[sampleCount];
            float invCount = 1f / Mathf.Max(1, frequencies.Length);

            for (int i = 0; i < sampleCount; i++)
            {
                float t = i / (float)sampleCount;
                float attack = Mathf.Clamp01(t / 0.06f);
                float decay = Mathf.Exp(-4.5f * t);
                float env = attack * decay;

                float sum = 0f;
                float seconds = i / (float)SampleRate;
                for (int f = 0; f < frequencies.Length; f++)
                {
                    sum += Mathf.Sin(2f * Mathf.PI * frequencies[f] * seconds);
                }

                samples[i] = sum * invCount * amplitude * env;
            }

            AudioClip clip = AudioClip.Create(clipName, sampleCount, 1, SampleRate, false);
            clip.SetData(samples, 0);
            return clip;
        }
    }
}
