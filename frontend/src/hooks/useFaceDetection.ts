import { useEffect, useRef, useState } from 'react';
import * as faceDetection from '@tensorflow-models/face-detection';
import '@tensorflow/tfjs';

export const useFaceDetection = (
  videoRef: React.RefObject<HTMLVideoElement>,
  onViolation: (type: string, detail: string) => void
) => {
  const [detector, setDetector] = useState<faceDetection.FaceDetector | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const noFaceTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const loadModel = async () => {
      const model = faceDetection.SupportedModels.MediaPipeFaceDetector;
      const detectorConfig: faceDetection.MediaPipeFaceDetectorTfjsConfig = {
        runtime: 'tfjs',
        maxFaces: 5,
      };
      const newDetector = await faceDetection.createDetector(model, detectorConfig);
      setDetector(newDetector);
    };
    loadModel();
  }, []);

  const detect = async () => {
    if (detector && videoRef.current && videoRef.current.readyState === 4) {
      const faces = await detector.estimateFaces(videoRef.current);

      // Warning Logic: No face detected
      if (faces.length === 0) {
        if (!noFaceTimer.current) {
          noFaceTimer.current = setTimeout(() => {
            onViolation('No Face Detected', 'Candidate face not visible for > 5 seconds');
          }, 5000);
        }
      } else {
        if (noFaceTimer.current) {
          clearTimeout(noFaceTimer.current);
          noFaceTimer.current = null;
        }
      }

      // Violation Logic: Multiple faces
      if (faces.length > 1) {
        onViolation('Multiple Faces Detected', `${faces.length} faces detected in frame`);
      }
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isMonitoring) {
      interval = setInterval(detect, 1000); // Check every second
    }
    return () => clearInterval(interval);
  }, [isMonitoring, detector]);

  return { startMonitoring: () => setIsMonitoring(true), stopMonitoring: () => setIsMonitoring(false) };
};
