import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export const useProctoringSocket = (
  interviewId: string,
  candidateId: string,
  role: 'candidate' | 'admin'
) => {
  const socketRef = useRef<Socket | null>(null);
  const [isLiveEnabled, setIsLiveEnabled] = useState(false);
  const [peers, setPeers] = useState<string[]>([]);

  useEffect(() => {
    // Replace with your actual backend URL if different
    const socket = io(window.location.protocol + "//" + window.location.hostname + ":3003");
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to proctoring server');
      socket.emit('join-interview', { interviewId, role });
    });

    socket.on('candidate-status', (data) => {
      console.log('Candidate status change:', data);
    });

    socket.on('live-monitoring-changed', (data) => {
      setIsLiveEnabled(data.enabled);
    });

    return () => {
      socket.disconnect();
    };
  }, [interviewId, role]);

  const emitViolation = (type: string, detail: string) => {
    if (socketRef.current) {
      socketRef.current.emit('proctor-event', {
        candidateId,
        interviewId,
        type: 'violation',
        detail,
        timestamp: new Date().toISOString()
      });
    }
  };

  const emitWarning = (type: string, detail: string) => {
    if (socketRef.current) {
      socketRef.current.emit('proctor-event', {
        candidateId,
        interviewId,
        type: 'warning',
        detail,
        timestamp: new Date().toISOString()
      });
    }
  };

  return { socket: socketRef.current, isLiveEnabled, emitViolation, emitWarning };
};
