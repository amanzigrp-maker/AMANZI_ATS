import { useState, useCallback, useRef, useEffect } from 'react';
import RecordRTC from 'recordrtc';

export const useRecording = (stream: MediaStream | null) => {
  const [isRecording, setIsRecording] = useState(false);
  const recorderRef = useRef<RecordRTC | null>(null);

  // Auto-cleanup on unmount to prevent buffer memory leaks
  useEffect(() => {
    return () => {
      if (recorderRef.current) {
        try {
          recorderRef.current.destroy();
        } catch (e) {
          // RecordRTC might be already destroyed
        }
      }
    };
  }, []);

  const startRecording = useCallback(() => {
    if (!stream) return;

    recorderRef.current = new RecordRTC(stream, {
      type: 'video',
      mimeType: 'video/webm;codecs=vp8',
      bitsPerSecond: 128000, // Low bitrate for compression
      timeSlice: 10000, // Store in 10s chunks
      ondataavailable: (blob) => {
        // Here we could upload chunks sequentially if needed
        console.log("Chunk recorded", blob.size);
      }
    });

    recorderRef.current.startRecording();
    setIsRecording(true);
  }, [stream]);

  const stopRecording = useCallback(() => {
    return new Promise<Blob>((resolve) => {
      if (recorderRef.current) {
        recorderRef.current.stopRecording(() => {
          const blob = recorderRef.current!.getBlob();
          setIsRecording(false);
          resolve(blob);
        });
      }
    });
  }, []);

  return { isRecording, startRecording, stopRecording };
};
