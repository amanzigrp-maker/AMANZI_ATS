import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface DuplicateSessionNotice {
  blocked: boolean;
  detail: string;
  activeSessionCount?: number;
  timestamp: string;
}

export const useProctoringSocket = (
  interviewId: string,
  candidateId: string,
  role: 'candidate' | 'admin'
) => {
  const socketRef = useRef<Socket | null>(null);
  const [socketInstance, setSocketInstance] = useState<Socket | null>(null);
  const [isLiveEnabled, setIsLiveEnabled] = useState(false);
  const [duplicateSessionNotice, setDuplicateSessionNotice] = useState<DuplicateSessionNotice | null>(null);
  const [peers, setPeers] = useState<string[]>([]);

  useEffect(() => {
    // Replace with your actual backend URL if different
    const socket = io(window.location.protocol + "//" + window.location.hostname + ":3003");
    socketRef.current = socket;
    setSocketInstance(socket);

    socket.on('connect', () => {
      console.log('Connected to proctoring server');
      socket.emit('join-interview', { interviewId, candidateId, role });
    });

    socket.on('candidate-status', (data) => {
      console.log('Candidate status change:', data);
    });

    socket.on('live-monitoring-changed', (data) => {
      setIsLiveEnabled(data.enabled);
    });

    socket.on('duplicate-session-detected', (data: DuplicateSessionNotice) => {
      setDuplicateSessionNotice(data);
    });

    return () => {
      socket.disconnect();
      setSocketInstance(null);
    };
  }, [interviewId, candidateId, role]);

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

  return { socket: socketInstance, isLiveEnabled, duplicateSessionNotice, emitViolation, emitWarning };
};
