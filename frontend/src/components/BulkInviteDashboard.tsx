import React, { useState, useEffect } from "react";
import { authenticatedFetch } from "@/lib/api";
import { AnimatedIcon, IconMap } from "@/components/AnimatedIconsax";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";

type BulkInviteJob = {
  id: number;
  name: string;
  assessment_id: number;
  assessment_title?: string;
  job_id?: number | null;
  status: "pending" | "processing" | "completed" | "failed";
  total_count: number;
  success_count: number;
  failed_count: number;
  created_by: number;
  created_at: string;
  updated_at: string;
  candidates?: Array<{
    id: number;
    name: string;
    email: string;
    phone?: string;
    status: "pending" | "sent" | "failed";
    error_message?: string;
    retry_count: number;
  }>;
};

type AssessmentOption = {
  assessment_id: number;
  title: string;
  role?: string;
  question_count: number;
};

export default function BulkInviteDashboard() {
  const [jobs, setJobs] = useState<BulkInviteJob[]>([]);
  const [assessments, setAssessments] = useState<AssessmentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalJobs, setTotalJobs] = useState(0);

  // Modal / Upload states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    assessment_id: "",
    job_id: ""
  });
  const [inputMode, setInputMode] = useState<"file" | "text">("file");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [csvText, setCsvText] = useState(
    "name,email,phone,job_role,tags\nJane Doe,jane.doe@example.com,9876543210,Frontend Engineer,React;Frontend\nJohn Smith,john.smith@example.com,,Backend Engineer,Node;Backend"
  );
  const [submitting, setSubmitting] = useState(false);

  // Details panel states
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [selectedJob, setSelectedJob] = useState<BulkInviteJob | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [retryingJob, setRetryingJob] = useState(false);

  useEffect(() => {
    fetchJobs();
    fetchAssessments();
  }, [page]);

  useEffect(() => {
    if (selectedJobId) {
      fetchJobDetails(selectedJobId);
      // Auto-poll job details if the job is not yet completed
      const interval = setInterval(() => {
        if (selectedJob && (selectedJob.status === "pending" || selectedJob.status === "processing")) {
          fetchJobDetails(selectedJobId);
        }
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [selectedJobId]);

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const response = await authenticatedFetch(`/api/bulk-invites?page=${page}&limit=5`);
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setJobs(data.data || []);
        if (data.pagination) {
          setTotalPages(data.pagination.totalPages || 1);
          setTotalJobs(data.pagination.total || 0);
        }
      }
    } catch (err) {
      console.error("Failed to load bulk invite jobs", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAssessments = async () => {
    try {
      const res = await authenticatedFetch("/api/assessments");
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setAssessments(data.data || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchJobDetails = async (jobId: number) => {
    setLoadingDetail(true);
    try {
      const res = await authenticatedFetch(`/api/bulk-invites/${jobId}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.data) {
        setSelectedJob(data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.assessment_id) {
      alert("Please select an assessment");
      return;
    }

    setSubmitting(true);
    try {
      let res;
      if (inputMode === "file") {
        if (!uploadFile) {
          alert("Please upload a CSV file");
          setSubmitting(false);
          return;
        }
        const formData = new FormData();
        formData.append("file", uploadFile);
        formData.append("name", createForm.name);
        formData.append("assessment_id", createForm.assessment_id);
        if (createForm.job_id) formData.append("job_id", createForm.job_id);

        res = await authenticatedFetch("/api/bulk-invites", {
          method: "POST",
          body: formData
        });
      } else {
        res = await authenticatedFetch("/api/bulk-invites", {
          method: "POST",
          body: JSON.stringify({
            name: createForm.name,
            assessment_id: createForm.assessment_id,
            job_id: createForm.job_id || undefined,
            csvText
          })
        });
      }

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setIsCreateOpen(false);
        setCreateForm({ name: "", assessment_id: "", job_id: "" });
        setUploadFile(null);
        fetchJobs();
        if (data.data) {
          setSelectedJobId(data.data.id);
        }
      } else {
        alert(data.error || "Failed to create bulk invite job");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to submit bulk invite job");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetryFailed = async (jobId: number) => {
    setRetryingJob(true);
    try {
      const res = await authenticatedFetch(`/api/bulk-invites/${jobId}/retry`, {
        method: "POST"
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        alert(data.message || "Failed invites queued for retry successfully.");
        fetchJobDetails(jobId);
        fetchJobs();
      } else {
        alert(data.error || "Failed to retry invitations");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to retry invitations");
    } finally {
      setRetryingJob(false);
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-emerald-50 text-emerald-700 border-emerald-150";
      case "pending":
      case "processing":
        return "bg-amber-50 text-amber-700 border-amber-150 animate-pulse";
      case "failed":
        return "bg-red-50 text-red-700 border-red-150";
      default:
        return "bg-slate-50 text-slate-700 border-slate-150";
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1.3fr]">
      {/* Left side: Job history lists */}
      <div className="space-y-6">
        <Card className="border-slate-200 shadow-sm h-fit">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-lg">Bulk Dispatches</CardTitle>
              <CardDescription className="text-xs">
                History of candidate CSV/manual bulk invite runs
              </CardDescription>
            </div>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-xs h-9 font-semibold"
              onClick={() => setIsCreateOpen(true)}
            >
              <AnimatedIcon icon={IconMap.Plus} size={14} className="mr-1.5" />
              New Bulk Run
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="flex h-48 items-center justify-center">
                <AnimatedIcon icon={IconMap.Loader2} size={28} className="animate-spin text-blue-500" />
              </div>
            ) : jobs.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400 italic bg-slate-50 rounded-xl border border-dashed border-slate-200">
                No bulk dispatch runs launched yet.
              </div>
            ) : (
              <div className="space-y-3">
                {jobs.map((job) => {
                  const percent = job.total_count > 0 ? Math.round(((job.success_count + job.failed_count) / job.total_count) * 100) : 0;
                  const isSelected = selectedJobId === job.id;
                  
                  return (
                    <div
                      key={job.id}
                      onClick={() => setSelectedJobId(job.id)}
                      className={`group cursor-pointer p-4 rounded-xl border transition-all duration-200 relative overflow-hidden ${
                        isSelected
                          ? "border-blue-500 bg-gradient-to-br from-blue-50/50 to-indigo-50/30 shadow-md"
                          : "border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <h4 className="font-bold text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                            {job.name}
                          </h4>
                          <p className="text-[11px] text-slate-500">
                            Assessment: <span className="font-semibold">{job.assessment_title || `ID: ${job.assessment_id}`}</span>
                          </p>
                        </div>
                        <Badge className={`${getStatusBadgeColor(job.status)} text-[10px] px-2 py-0.5 border`}>
                          {job.status}
                        </Badge>
                      </div>

                      {/* Counts / metrics */}
                      <div className="mt-3 grid grid-cols-3 gap-2 text-[10px] bg-slate-50 p-2 rounded-lg border border-slate-100 font-medium">
                        <div className="text-slate-600 text-center">
                          Total: <strong className="text-slate-900">{job.total_count}</strong>
                        </div>
                        <div className="text-emerald-700 text-center">
                          Success: <strong>{job.success_count}</strong>
                        </div>
                        <div className="text-red-700 text-center">
                          Failed: <strong>{job.failed_count}</strong>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="mt-3 space-y-1">
                        <div className="flex items-center justify-between text-[9px] text-slate-400 font-semibold uppercase">
                          <span>Progress</span>
                          <span>{percent}%</span>
                        </div>
                        <Progress value={percent} className="h-1.5 bg-slate-100" />
                      </div>

                      <div className="mt-3 flex items-center justify-between text-[9px] text-slate-400">
                        <span>Started {new Date(job.created_at).toLocaleDateString()}</span>
                        <span className="font-semibold text-slate-300">ID: {job.id}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center gap-1.5 pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-[11px]"
                  disabled={page === 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  Prev
                </Button>
                <span className="flex items-center px-3 text-xs font-semibold text-slate-500">
                  Page {page} of {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-[11px]"
                  disabled={page === totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Right side: Detailed Job monitoring pipeline */}
      <div className="space-y-6">
        {selectedJobId ? (
          <Card className="border-slate-200 shadow-sm animate-in slide-in-from-right-4 duration-300">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-4 px-6 flex flex-row items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-md font-bold">{selectedJob?.name}</CardTitle>
                  {selectedJob && (
                    <Badge className={`${getStatusBadgeColor(selectedJob.status)} text-[9px] px-1.5 py-0 border`}>
                      {selectedJob.status}
                    </Badge>
                  )}
                </div>
                <CardDescription className="text-xs mt-0.5">
                  Detailed dispatch status and invite logs
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-slate-400 hover:text-slate-600"
                onClick={() => setSelectedJobId(null)}
              >
                Close Details
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {loadingDetail && !selectedJob ? (
                <div className="flex h-64 items-center justify-center">
                  <AnimatedIcon icon={IconMap.Loader2} size={28} className="animate-spin text-blue-500" />
                </div>
              ) : selectedJob ? (
                <div className="space-y-6">
                  {/* Job Metrics Summary */}
                  <div className="p-6 pb-2 grid grid-cols-4 gap-4">
                    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 text-center">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Candidate Total</p>
                      <p className="text-xl font-black text-slate-900 mt-1">{selectedJob.total_count}</p>
                    </div>
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/20 p-3 text-center">
                      <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Dispatched</p>
                      <p className="text-xl font-black text-emerald-800 mt-1">{selectedJob.success_count}</p>
                    </div>
                    <div className="rounded-xl border border-red-100 bg-red-50/20 p-3 text-center">
                      <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider">Failed Runs</p>
                      <p className="text-xl font-black text-red-800 mt-1">{selectedJob.failed_count}</p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 flex flex-col justify-center items-center">
                      {selectedJob.failed_count > 0 ? (
                        <Button
                          size="sm"
                          disabled={retryingJob}
                          className="bg-red-600 hover:bg-red-700 text-[10px] h-8 w-full font-bold uppercase tracking-wider shadow-sm"
                          onClick={() => handleRetryFailed(selectedJob.id)}
                        >
                          {retryingJob ? "Queueing..." : "Retry Failed"}
                        </Button>
                      ) : (
                        <div className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                          <AnimatedIcon icon={IconMap.CheckCircle2} size={14} />
                          All clean
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Candidates List Table */}
                  <div className="border-t border-slate-100">
                    <div className="px-6 py-3 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-150">
                      Candidate Invites List ({selectedJob.candidates?.length || 0})
                    </div>
                    <div className="max-h-[350px] overflow-y-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-400 font-bold border-b border-slate-100 sticky top-0 z-10">
                          <tr>
                            <th className="px-6 py-3 font-semibold">Recipient</th>
                            <th className="px-6 py-3 text-center font-semibold">Status</th>
                            <th className="px-6 py-3 font-semibold">Logs / Errors</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {selectedJob.candidates && selectedJob.candidates.map((c) => (
                            <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-4">
                                <div className="font-semibold text-slate-900">{c.name}</div>
                                <div className="text-[10px] text-slate-400 font-mono">{c.email}</div>
                                {c.phone && <div className="text-[9px] text-slate-400">Phone: {c.phone}</div>}
                              </td>
                              <td className="px-6 py-4 text-center">
                                <Badge className={`text-[9px] px-1.5 py-0 border ${
                                  c.status === "sent" ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                                  c.status === "pending" ? "bg-amber-50 text-amber-700 border-amber-100 animate-pulse" :
                                  "bg-red-50 text-red-700 border-red-100"
                                }`}>
                                  {c.status}
                                </Badge>
                              </td>
                              <td className="px-6 py-4 max-w-[200px] truncate text-[10px] text-slate-500">
                                {c.error_message ? (
                                  <span className="text-red-600 font-semibold" title={c.error_message}>
                                    Error: {c.error_message}
                                  </span>
                                ) : c.status === "sent" ? (
                                  <span className="text-emerald-600 font-medium">Link dispatched successfully</span>
                                ) : (
                                  <span className="text-slate-400">Waiting in queue...</span>
                                )}
                                {c.retry_count > 0 && (
                                  <div className="text-[9px] text-slate-400 mt-0.5">Retries: {c.retry_count}</div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <div className="h-full flex items-center justify-center p-8 bg-slate-50 border border-slate-200 border-dashed rounded-xl text-slate-400 text-sm italic">
            Select a dispatch run on the left to view pipeline details, errors, and retry failed invites.
          </div>
        )}
      </div>

      {/* Create Modal */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-md">
          <form onSubmit={handleCreateSubmit}>
            <DialogHeader className="border-b pb-4">
              <DialogTitle className="text-lg font-bold">Launch Bulk Invitation Run</DialogTitle>
              <DialogDescription className="text-xs mt-1 text-slate-500">
                Provide candidate contacts via CSV file or copy-paste CSV text.
              </DialogDescription>
            </DialogHeader>

            <div className="py-5 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="bulk-name" className="text-xs font-bold text-slate-500 uppercase">Dispatch Batch Name</Label>
                <Input
                  id="bulk-name"
                  placeholder="e.g. Q3 React Developers Batch 1"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  required
                />
              </div>

              <div className="grid gap-4 grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="bulk-assess" className="text-xs font-bold text-slate-500 uppercase">Target Assessment</Label>
                  <select
                    id="bulk-assess"
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    value={createForm.assessment_id}
                    onChange={(e) => setCreateForm({ ...createForm, assessment_id: e.target.value })}
                    required
                  >
                    <option value="">-- Choose Test --</option>
                    {assessments.map(a => (
                      <option key={a.assessment_id} value={a.assessment_id}>{a.title} ({a.question_count} Qs)</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bulk-job" className="text-xs font-bold text-slate-500 uppercase">Internal Job ID (Optional)</Label>
                  <Input
                    id="bulk-job"
                    type="number"
                    placeholder="e.g. 5"
                    value={createForm.job_id}
                    onChange={(e) => setCreateForm({ ...createForm, job_id: e.target.value })}
                  />
                </div>
              </div>

              {/* Toggle Input Mode */}
              <div className="space-y-2 pt-2">
                <Label className="text-xs font-bold text-slate-500 uppercase">Input Mode</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={inputMode === "file" ? "default" : "outline"}
                    className="flex-1 text-xs h-9"
                    onClick={() => setInputMode("file")}
                  >
                    CSV File Upload
                  </Button>
                  <Button
                    type="button"
                    variant={inputMode === "text" ? "default" : "outline"}
                    className="flex-1 text-xs h-9"
                    onClick={() => setInputMode("text")}
                  >
                    Copy-Paste CSV Text
                  </Button>
                </div>
              </div>

              {inputMode === "file" ? (
                <div className="space-y-2">
                  <Label htmlFor="bulk-file" className="text-xs font-bold text-slate-500 uppercase">Select CSV File</Label>
                  <Input
                    id="bulk-file"
                    type="file"
                    accept=".csv"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    required
                  />
                  <p className="text-[10px] text-slate-400 leading-relaxed font-medium">
                    CSV structure must have headers: <code className="bg-slate-100 p-0.5 rounded text-red-600 font-mono">name,email,phone,job_role,tags</code>
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="bulk-text" className="text-xs font-bold text-slate-500 uppercase">CSV Raw Text Input</Label>
                  <Textarea
                    id="bulk-text"
                    rows={6}
                    className="font-mono text-xs"
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                    required
                  />
                  <p className="text-[10px] text-slate-400 font-medium">
                    Line columns split by comma. Multi-value tags split by semicolon (;).
                  </p>
                </div>
              )}
            </div>

            <DialogFooter className="border-t pt-4">
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={submitting} className="bg-blue-600 hover:bg-blue-700">
                {submitting ? "Uploading..." : "Launch Dispatch Job"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
