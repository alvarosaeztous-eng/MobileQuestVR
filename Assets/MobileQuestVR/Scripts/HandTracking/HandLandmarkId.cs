namespace MobileQuestVR.HandTracking
{
    /// <summary>
    /// Official 21 hand landmark indices defined by Google MediaPipe Hand Landmarker.
    /// </summary>
    public enum HandLandmarkId
    {
        Wrist = 0,
        ThumbCmc = 1,
        ThumbMcp = 2,
        ThumbIp = 3,
        ThumbTip = 4,
        IndexMcp = 5,
        IndexPip = 6,
        IndexDip = 7,
        IndexTip = 8,
        MiddleMcp = 9,
        MiddlePip = 10,
        MiddleDip = 11,
        MiddleTip = 12,
        RingMcp = 13,
        RingPip = 14,
        RingDip = 15,
        RingTip = 16,
        PinkyMcp = 17,
        PinkyPip = 18,
        PinkyDip = 19,
        PinkyTip = 20
    }

    /// <summary>
    /// MediaPipe canonical 21-bone hand skeleton connectivity pairs.
    /// </summary>
    public static class HandSkeletonTopology
    {
        public const int LandmarkCount = 21;

        public static readonly (int From, int To)[] BoneConnections =
        {
            // Thumb
            (0, 1), (1, 2), (2, 3), (3, 4),
            // Index
            (0, 5), (5, 6), (6, 7), (7, 8),
            // Middle
            (0, 9), (9, 10), (10, 11), (11, 12),
            // Ring
            (0, 13), (13, 14), (14, 15), (15, 16),
            // Pinky
            (0, 17), (17, 18), (18, 19), (19, 20),
            // Palm knuckles
            (5, 9), (9, 13), (13, 17)
        };
    }
}
