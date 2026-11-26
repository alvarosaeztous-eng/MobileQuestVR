namespace MobileQuestVR.HandTracking
{
    /// <summary>
    /// Pluggable backend interface for MediaPipe hand landmark streams (Android CameraX+Tasks Vision JNI bridge,
    /// MediaPipeUnityPlugin adapter, or Editor preview provider).
    /// </summary>
    public interface IHandTrackingProvider
    {
        string ProviderName { get; }
        HandTrackingProviderStatus Status { get; }
        string StatusDetail { get; }
        bool IsRunning { get; }

        void Initialize();
        void StartTracking();
        void StopTracking();
        void Dispose();

        /// <summary>
        /// Copies the newest available hand tracking frame into targetFrame.
        /// Returns true if a new frame has arrived since the previous call.
        /// </summary>
        bool TryGetLatestFrame(RawHandTrackingFrame targetFrame);
    }
}
