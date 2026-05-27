import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardContent, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, ShieldAlert, Download, ArrowRight, ShieldCheck } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';

export default function RequiresSecureBrowser({ children }: { children: React.ReactNode }) {
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchFailed, setLaunchFailed] = useState(false);

  const isElectron = useMemo(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    return (
      userAgent.indexOf('electron') > -1 ||
      userAgent.indexOf('amanzi-secure-browser') > -1 ||
      typeof (window as any).amanziSecureBrowser !== 'undefined'
    );
  }, []);

  const secureProtocolUrl = useMemo(() => {
    return `amanzi-secure-browser://launch?url=${encodeURIComponent(window.location.href)}`;
  }, []);

  useEffect(() => {
    if (!isElectron) {
      // Auto-attempt launch on mount
      const timer = setTimeout(() => {
        window.location.href = secureProtocolUrl;
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isElectron, secureProtocolUrl]);

  const handleLaunch = () => {
    setIsLaunching(true);
    setLaunchFailed(false);

    // Attempt to open the custom protocol
    window.location.href = secureProtocolUrl;

    let hasBlurred = false;
    const onBlur = () => {
      hasBlurred = true;
      setIsLaunching(false);
    };

    window.addEventListener('blur', onBlur);
    window.addEventListener('pagehide', onBlur);

    // After 3 seconds, check if window lost focus
    setTimeout(() => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pagehide', onBlur);
      if (!hasBlurred) {
        setIsLaunching(false);
        setLaunchFailed(true);
      }
    }, 3000);
  };

  const [searchParams] = useSearchParams();
  const securityHold = searchParams.get('securityHold');

  if (isElectron) {
    if (securityHold === 'process') {
      return (
        <div className="min-h-screen w-full flex items-center justify-center bg-[#020617] p-6">
          <Card className="bg-red-950/40 border-red-500/20 backdrop-blur-3xl shadow-[0_0_50px_rgba(239,68,68,0.15)] rounded-2xl max-w-md w-full overflow-hidden text-center relative z-10">
            <CardHeader>
              <div className="mx-auto w-16 h-16 bg-red-500/20 rounded-2xl flex items-center justify-center mb-4 border border-red-500/30">
                <ShieldAlert className="w-8 h-8 text-red-500" />
              </div>
              <CardTitle className="text-white text-2xl">Security Violation</CardTitle>
              <CardDescription className="text-red-300/80 mt-2 text-base">
                Prohibited software detected
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-300">
                Your assessment has been paused because a blacklisted background process was detected.
              </p>
              <div className="mt-6 p-4 bg-black/40 rounded-xl border border-red-500/20 text-left space-y-2">
                <p className="text-xs text-red-400 font-bold uppercase tracking-wider">Please Close:</p>
                <ul className="text-sm text-slate-300 list-disc pl-5">
                  <li>Screen Recording (Snipping Tool, OBS, etc.)</li>
                  <li>Remote Desktop (AnyDesk, TeamViewer)</li>
                  <li>AI Assistants (ChatGPT Desktop)</li>
                </ul>
              </div>
            </CardContent>
            <CardFooter>
              <Button
                onClick={() => {
                  searchParams.delete('securityHold');
                  window.location.search = searchParams.toString();
                }}
                className="w-full h-12 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl"
              >
                I have closed the applications
              </Button>
            </CardFooter>
          </Card>
        </div>
      );
    }
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#020617] p-6 relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-500/10 blur-[130px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-500/10 blur-[130px] rounded-full" />
      </div>
      <Card className="bg-slate-900/40 border-white/10 backdrop-blur-3xl shadow-2xl rounded-2xl max-w-md w-full overflow-hidden text-center relative z-10">
        <CardHeader>
          <div className="mx-auto w-12 h-12 bg-amber-500/20 rounded-full flex items-center justify-center mb-4 border border-amber-500/30">
            <AlertCircle className="w-6 h-6 text-amber-500" />
          </div>
          <CardTitle className="text-white text-xl">Secure Browser Required</CardTitle>
          <CardDescription className="text-slate-400 mt-2">
            This assessment can only be accessed using the Amanzi Secure Browser to ensure exam integrity.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-300">
            We've attempted to automatically open the Secure Browser. If you do not see a prompt, click the button below.
          </p>
        </CardContent>
        <CardFooter>
          <Button 
            asChild
            className="w-full h-12 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl"
          >
            <a href={secureProtocolUrl}>
              Launch Amanzi Secure Browser
            </a>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

