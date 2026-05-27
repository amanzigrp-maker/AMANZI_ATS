import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, CardContent, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, ShieldAlert, Download, ArrowRight } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

// Read bypass flags from root .env (VITE_ prefix exposes them to the browser via Vite)
// Set VITE_BYPASS_SECURE_BROWSER=true OR VITE_SECURE_BROWSER_REQUIRED=false in .env to allow
// normal browsers during development / testing.
const bypassSecureBrowser =
  import.meta.env.VITE_BYPASS_SECURE_BROWSER === 'true' ||
  import.meta.env.VITE_SECURE_BROWSER_REQUIRED === 'false';

export default function RequiresSecureBrowser({ children }: { children: React.ReactNode }) {
  // ── All hooks must be called unconditionally (React rules of hooks) ──────────
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchFailed, setLaunchFailed] = useState(false);
  const [searchParams] = useSearchParams();

  const isElectron = useMemo(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    return (
      userAgent.indexOf('electron') > -1 ||
      userAgent.indexOf('amanzi-secure-browser') > -1 ||
      typeof (window as any).amanziSecureBrowser !== 'undefined'
    );
  }, []);

  const secureProtocolUrl = useMemo(
    () => `amanzi-secure-browser://launch?url=${encodeURIComponent(window.location.href)}`,
    [],
  );

  // Auto-attempt to launch the secure browser when running in a normal browser
  useEffect(() => {
    // Skip auto-launch when bypass is active or already inside Electron
    if (bypassSecureBrowser || isElectron) return;

    const timer = setTimeout(() => {
      window.location.href = secureProtocolUrl;
    }, 1000);

    return () => clearTimeout(timer);
  }, [isElectron, secureProtocolUrl]);

  // ── Early return after all hooks ─────────────────────────────────────────────
  // Bypass mode: skip every check and render children in a normal browser
  if (bypassSecureBrowser) {
    return <>{children}</>;
  }

  // ── Electron / secure browser is running ────────────────────────────────────
  if (isElectron) {
    const securityHold = searchParams.get('securityHold');

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
                  const params = new URLSearchParams(searchParams.toString());
                  params.delete('securityHold');
                  window.location.search = params.toString();
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

  // ── Normal browser — show "install secure browser" gate ──────────────────────
  const handleLaunch = () => {
    setIsLaunching(true);
    setLaunchFailed(false);
    window.location.href = secureProtocolUrl;

    let hasBlurred = false;
    const onBlur = () => {
      hasBlurred = true;
      setIsLaunching(false);
    };

    window.addEventListener('blur', onBlur);
    window.addEventListener('pagehide', onBlur);

    setTimeout(() => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pagehide', onBlur);
      if (!hasBlurred) {
        setIsLaunching(false);
        setLaunchFailed(true);
      }
    }, 3000);
  };

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
            We&apos;ve attempted to automatically open the Secure Browser. If you do not see a prompt, click the button below.
          </p>
          {launchFailed && (
            <p className="mt-3 text-xs text-red-400">
              Could not launch automatically. Please install the Amanzi Secure Browser first.
            </p>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button
            onClick={handleLaunch}
            disabled={isLaunching}
            className="w-full h-12 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(37,99,235,0.2)]"
          >
            <ArrowRight className="w-4 h-4" />
            {isLaunching ? 'Launching…' : 'Launch Amanzi Secure Browser'}
          </Button>

          <div className="w-full flex items-center justify-center my-1">
            <div className="h-px bg-white/10 w-full" />
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold px-3 shrink-0">or</span>
            <div className="h-px bg-white/10 w-full" />
          </div>

          <Button
            asChild
            variant="outline"
            className="w-full h-12 border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white bg-slate-950/40 hover:bg-slate-900/40 font-medium rounded-xl flex items-center justify-center gap-2 transition-all"
          >
            <a href="/api/interview/download-app" download>
              Download Amanzi Secure Browser
            </a>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
