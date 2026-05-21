import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Activity, Cpu, Globe, Lock, ShieldCheck } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { authenticatedFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type RiskSummary = {
  total_sessions: number;
  escalated_sessions: number;
  average_score: number;
  max_score: number;
};

type RiskSession = {
  session_id: string;
  candidate_id?: string | null;
  score: number;
  risk_band: "low" | "medium" | "high" | "critical";
  reasons: string[] | string;
  updated_at: string;
};

const bandClass: Record<RiskSession["risk_band"], string> = {
  low: "bg-emerald-50 text-emerald-700 border-emerald-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  high: "bg-orange-50 text-orange-700 border-orange-200",
  critical: "bg-red-50 text-red-700 border-red-200",
};

const EnterpriseSecurityDashboard: React.FC = () => {
  const [summary, setSummary] = useState<RiskSummary>({
    total_sessions: 0,
    escalated_sessions: 0,
    average_score: 0,
    max_score: 0,
  });
  const [sessions, setSessions] = useState<RiskSession[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDashboard = async () => {
    setLoading(true);
    const [summaryRes, sessionsRes] = await Promise.all([
      authenticatedFetch("/api/enterprise-security/risk/summary"),
      authenticatedFetch("/api/enterprise-security/risk/sessions?limit=20"),
    ]);

    if (summaryRes.ok) setSummary(await summaryRes.json());
    if (sessionsRes.ok) setSessions(await sessionsRes.json());
    setLoading(false);
  };

  useEffect(() => {
    void loadDashboard();
  }, []);

  const chartData = useMemo(() => {
    const counts = { low: 0, medium: 0, high: 0, critical: 0 };
    sessions.forEach((session) => {
      counts[session.risk_band] += 1;
    });
    return Object.entries(counts).map(([band, count]) => ({ band, count }));
  }, [sessions]);

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Enterprise Secure Assessment</p>
            <h1 className="text-3xl font-semibold tracking-normal text-slate-950">Security Command Center</h1>
          </div>
          <Button onClick={loadDashboard} disabled={loading} className="gap-2">
            <Activity className="h-4 w-4" />
            Refresh
          </Button>
        </div>

        <section className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-600">
                <ShieldCheck className="h-4 w-4" />
                Sessions Scored
              </CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-semibold text-slate-950">{summary.total_sessions}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-600">
                <AlertTriangle className="h-4 w-4" />
                Escalations
              </CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-semibold text-slate-950">{summary.escalated_sessions}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-600">
                <Globe className="h-4 w-4" />
                Average Risk
              </CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-semibold text-slate-950">{Number(summary.average_score).toFixed(1)}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-600">
                <Lock className="h-4 w-4" />
                Peak Risk
              </CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-semibold text-slate-950">{Number(summary.max_score).toFixed(1)}</CardContent>
          </Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Cpu className="h-4 w-4" />
                Risk Distribution
              </CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="band" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#0f766e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Live Review Queue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {sessions.length === 0 && (
                  <div className="rounded-md border border-dashed border-slate-300 p-6 text-sm text-slate-500">
                    No enterprise risk events have been scored yet.
                  </div>
                )}
                {sessions.map((session) => {
                  const reasons = Array.isArray(session.reasons) ? session.reasons : [];
                  return (
                    <div key={session.session_id} className="rounded-md border bg-white p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-medium text-slate-950">Session {session.session_id}</p>
                          <p className="text-xs text-slate-500">
                            Candidate {session.candidate_id ?? "unknown"} · {new Date(session.updated_at).toLocaleString()}
                          </p>
                        </div>
                        <Badge className={`${bandClass[session.risk_band]} capitalize`}>
                          {session.risk_band} · {Number(session.score).toFixed(0)}
                        </Badge>
                      </div>
                      {reasons.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {reasons.slice(0, 4).map((reason) => (
                            <span key={reason} className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
                              {reason}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
};

export default EnterpriseSecurityDashboard;
