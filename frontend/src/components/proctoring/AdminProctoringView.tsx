import React, { useEffect, useState, useRef } from 'react';
import { useProctoringSocket } from '../../hooks/useProctoringSocket';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { ScrollArea } from '../ui/scroll-area';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';
import { Video, ScrollText, AlertTriangle, User, MonitorPlay, Maximize, ShieldCheck } from 'lucide-react';

interface AdminProctoringViewProps {
  interviewId: string;
  candidateId: string;
  candidateName: string;
}

const AdminProctoringView: React.FC<AdminProctoringViewProps> = ({ interviewId, candidateId, candidateName }) => {
  const [logs, setLogs] = useState<any[]>([]);
  const [isLive, setIsLive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const socket = useProctoringSocket(interviewId, 'admin', 'admin');

  useEffect(() => {
    if (!socket.socket) return;

    socket.socket.on('proctor-event-admin', (event) => {
      setLogs(prev => [event, ...prev]);
    });

    socket.socket.on('signal', async (data) => {
      if (!pcRef.current) {
        setupPeer();
      }
      
      if (data.signal.sdp && data.signal.sdp.type === 'offer') {
        await pcRef.current!.setRemoteDescription(new RTCSessionDescription(data.signal.sdp));
        const answer = await pcRef.current!.createAnswer();
        await pcRef.current!.setLocalDescription(answer);
        socket.socket?.emit('signal', { target: data.from, interviewId, signal: { sdp: answer } });
      } else if (data.signal.candidate) {
        await pcRef.current!.addIceCandidate(new RTCIceCandidate(data.signal.candidate));
      }
    });

    return () => {
      socket.socket?.off('proctor-event-admin');
      socket.socket?.off('signal');
      pcRef.current?.close();
    };
  }, [socket.socket, interviewId]);

  const setupPeer = () => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    pc.ontrack = (event) => {
      if (videoRef.current) {
        videoRef.current.srcObject = event.streams[0];
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.socket?.emit('signal', { interviewId, signal: { candidate: event.candidate } });
      }
    };

    pcRef.current = pc;
  };

  const toggleLive = (enabled: boolean) => {
    setIsLive(enabled);
    socket.socket?.emit('toggle-live-monitoring', { interviewId, enabled });
    if (!enabled && pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 bg-slate-950 min-h-screen text-slate-200">
      {/* Left: Candidate Info & Live Feed */}
      <div className="lg:col-span-2 space-y-6">
        <Card className="bg-slate-900 border-slate-800 border-2 overflow-hidden shadow-2xl">
          <CardHeader className="border-b border-slate-800 bg-slate-900/50 flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <User className="text-blue-400 w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-xl text-slate-100">{candidateName}</CardTitle>
                <p className="text-xs text-slate-400">ID: {candidateId}</p>
              </div>
            </div>
            <div className="flex items-center space-x-3 bg-slate-950/50 p-2 rounded-xl border border-slate-800">
              <MonitorPlay className={`w-4 h-4 ${isLive ? 'text-green-400' : 'text-slate-500'}`} />
              <Label htmlFor="live-mode" className="text-xs font-medium uppercase tracking-wider">Live Monitoring</Label>
              <Switch
                id="live-mode"
                checked={isLive}
                onCheckedChange={toggleLive}
              />
            </div>
          </CardHeader>
          <CardContent className="p-0 bg-black aspect-video relative group">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full h-full object-contain"
            />
            {!isLive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm">
                <div className="p-4 rounded-full bg-slate-900 border border-slate-800 mb-4">
                  <Video className="w-12 h-12 text-slate-600" />
                </div>
                <p className="text-slate-400 font-medium">Live monitoring is currently disabled</p>
                <p className="text-xs text-slate-500 mt-1">Enable to start real-time video stream</p>
              </div>
            )}
            {isLive && videoRef.current?.srcObject && (
              <div className="absolute top-4 left-4 flex items-center gap-2 bg-red-600 px-3 py-1 rounded-full text-[10px] font-bold tracking-widest text-white shadow-lg animate-pulse">
                <div className="w-2 h-2 rounded-full bg-white" />
                LIVE
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="bg-slate-900 border-slate-800 shadow-xl overflow-hidden hover:border-slate-700 transition-colors">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-3 bg-green-500/10 rounded-xl">
                <Maximize className="text-green-400 w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Fullscreen Mode</p>
                <p className="text-lg font-bold text-slate-200">Enforced</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-900 border-slate-800 shadow-xl overflow-hidden hover:border-slate-700 transition-colors">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-3 bg-purple-500/10 rounded-xl">
                <ScrollText className="text-purple-400 w-6 h-6" />
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Recording Status</p>
                <p className="text-lg font-bold text-slate-200">Session Active</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Right: Violation Logs */}
      <Card className="bg-slate-900 border-slate-800 border-2 shadow-2xl flex flex-col h-[calc(100vh-3rem)]">
        <CardHeader className="border-b border-slate-800 bg-slate-900/50">
          <CardTitle className="flex items-center gap-2 text-lg">
            <AlertTriangle className="text-amber-500 w-5 h-5" />
            Real-time Violation Logs
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-3">
              {logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-600 italic">
                  <ShieldCheck className="w-12 h-12 mb-3 opacity-20" />
                  <p className="text-sm">No violations detected yet</p>
                </div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className={`p-3 rounded-xl border animate-in slide-in-from-bottom flex flex-col gap-1 ${
                    log.type === 'violation' 
                      ? 'bg-red-500/10 border-red-500/20' 
                      : 'bg-amber-500/10 border-amber-500/20'
                  }`}>
                    <div className="flex items-center justify-between">
                      <Badge variant={log.type === 'violation' ? 'destructive' : 'outline'} className="text-[10px] uppercase">
                        {log.type}
                      </Badge>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-slate-200">{log.detail}</p>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminProctoringView;
