import React, { useState, useEffect } from "react";
import { authenticatedFetch } from "@/lib/api";
import { AnimatedIcon, IconMap } from "@/components/AnimatedIconsax";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

type QuestionPaper = {
  id: number;
  title: string;
  description?: string;
  subject?: string;
  total_questions: number;
  created_by: number;
  created_at: string;
  updated_at: string;
  is_template: boolean;
  questions?: Array<{
    question_text: string;
    options: Record<string, string>;
    correct_option: string;
    difficulty?: string;
    topic?: string;
    explanation?: string;
  }>;
};

export default function QuestionPaperLibrary({ onAssessmentCreated }: { onAssessmentCreated?: () => void }) {
  const [papers, setPapers] = useState<QuestionPaper[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Modals / Dialogs states
  const [previewPaper, setPreviewPaper] = useState<QuestionPaper | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [reusePaper, setReusePaper] = useState<QuestionPaper | null>(null);
  const [reuseForm, setReuseForm] = useState({
    title: "",
    description: "",
    role: "",
    duration_minutes: 30
  });
  const [submittingReuse, setSubmittingReuse] = useState(false);

  useEffect(() => {
    fetchPapers();
  }, [search, subject, difficulty, page]);

  const fetchPapers = async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (search) q.set("search", search);
      if (subject) q.set("subject", subject);
      if (difficulty) q.set("difficulty", difficulty);
      q.set("page", String(page));
      q.set("limit", "8");

      const response = await authenticatedFetch(`/api/question-papers?${q.toString()}`);
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setPapers(data.data || []);
        if (data.pagination) {
          setTotalPages(data.pagination.totalPages || 1);
          setTotalItems(data.pagination.total || 0);
        }
      }
    } catch (err) {
      console.error("Failed to load question papers", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = async (paperId: number) => {
    setPreviewLoading(true);
    try {
      const res = await authenticatedFetch(`/api/question-papers/${paperId}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.data) {
        setPreviewPaper(data.data);
      } else {
        alert(data.error || "Failed to load details");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to load details");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleExportPdf = (paperId: number) => {
    // PDF download via authenticated endpoint in window/iframe or blob URL
    // We can fetch it as blob then download
    setLoading(true);
    authenticatedFetch(`/api/question-papers/${paperId}/export`)
      .then(async (res) => {
        if (!res.ok) throw new Error("PDF download failed");
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Question_Paper_${paperId}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch((err) => {
        console.error(err);
        alert("Failed to download PDF");
      })
      .finally(() => setLoading(false));
  };

  const handleDuplicate = async (paperId: number) => {
    if (!window.confirm("Are you sure you want to clone this question paper?")) return;
    setLoading(true);
    try {
      const res = await authenticatedFetch(`/api/question-papers/${paperId}/duplicate`, {
        method: "POST"
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        fetchPapers();
      } else {
        alert(data.error || "Failed to duplicate");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to duplicate");
    } finally {
      setLoading(false);
    }
  };

  const handleArchive = async (paperId: number) => {
    if (!window.confirm("Are you sure you want to archive this question paper? This will remove it from the library view.")) return;
    setLoading(true);
    try {
      const res = await authenticatedFetch(`/api/question-papers/${paperId}`, {
        method: "DELETE"
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        fetchPapers();
      } else {
        alert(data.error || "Failed to archive");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to archive");
    } finally {
      setLoading(false);
    }
  };

  const openReuseDialog = (paper: QuestionPaper) => {
    setReusePaper(paper);
    setReuseForm({
      title: `${paper.title} Assessment`,
      description: paper.description || "",
      role: paper.subject || "",
      duration_minutes: 30
    });
  };

  const handleReuseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reusePaper) return;
    setSubmittingReuse(true);
    try {
      const res = await authenticatedFetch(`/api/question-papers/${reusePaper.id}/reuse`, {
        method: "POST",
        body: JSON.stringify(reuseForm)
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setReusePaper(null);
        alert(`Successfully generated assessment: "${reuseForm.title}"`);
        if (onAssessmentCreated) onAssessmentCreated();
      } else {
        alert(data.error || "Failed to create assessment");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to create assessment");
    } finally {
      setSubmittingReuse(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search & Filters */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex-1 grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="library-search" className="text-xs font-bold text-slate-500 uppercase">Search</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                <AnimatedIcon icon={IconMap.Search} size={16} />
              </span>
              <Input
                id="library-search"
                placeholder="Search title, details..."
                className="pl-9 h-10"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
          </div>
          
          <div className="space-y-1.5">
            <Label htmlFor="library-subject" className="text-xs font-bold text-slate-500 uppercase">Subject / Tag</Label>
            <Input
              id="library-subject"
              placeholder="e.g. React, Backend"
              className="h-10"
              value={subject}
              onChange={(e) => { setSubject(e.target.value); setPage(1); }}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="library-difficulty" className="text-xs font-bold text-slate-500 uppercase">Difficulty</Label>
            <select
              id="library-difficulty"
              className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm outline-none focus:ring-2 focus:ring-blue-500"
              value={difficulty}
              onChange={(e) => { setDifficulty(e.target.value); setPage(1); }}
            >
              <option value="">All Levels</option>
              <option value="basic">Basic</option>
              <option value="medium">Medium</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>
        </div>
        
        <div className="shrink-0 flex items-center text-xs text-slate-500 font-medium">
          Total Saved: <span className="font-bold text-slate-900 ml-1">{totalItems}</span>
        </div>
      </div>

      {/* Grid of Papers */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <AnimatedIcon icon={IconMap.Loader2} size={32} className="animate-spin text-blue-500" />
        </div>
      ) : papers.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 italic shadow-sm">
          No question papers saved in your library yet.
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          {papers.map((paper) => (
            <Card key={paper.id} className="border-slate-200 bg-white shadow-sm hover:shadow-md transition-all duration-300 relative group overflow-hidden">
              <div className="absolute right-0 top-0 w-24 h-24 bg-blue-500/5 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <CardTitle className="text-lg font-bold group-hover:text-blue-600 transition-colors">{paper.title}</CardTitle>
                    <CardDescription className="text-xs text-slate-400 line-clamp-1">
                      {paper.description || "No description provided."}
                    </CardDescription>
                  </div>
                  {paper.is_template && (
                    <Badge variant="secondary" className="bg-purple-50 text-purple-700 border-purple-100 text-[10px]">
                      Template
                    </Badge>
                  )}
                </div>
              </CardHeader>
              
              <CardContent className="space-y-4">
                {/* Stats row */}
                <div className="flex items-center gap-4 text-xs text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  <span className="flex items-center gap-1">
                    <AnimatedIcon icon={IconMap.ClipboardList} size={14} className="text-slate-400" />
                    <strong>{paper.total_questions}</strong> Questions
                  </span>
                  {paper.subject && (
                    <span className="flex items-center gap-1 font-semibold text-blue-600">
                      #{paper.subject}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                  <span>Saved on {new Date(paper.created_at).toLocaleDateString()}</span>
                  <span className="font-semibold text-slate-300">ID: {paper.id}</span>
                </div>

                {/* Actions Bar */}
                <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs font-semibold"
                    onClick={() => handlePreview(paper.id)}
                  >
                    <AnimatedIcon icon={IconMap.Eye} size={13} className="mr-1.5" />
                    Preview
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs text-blue-600 border-blue-200 hover:bg-blue-50"
                    onClick={() => openReuseDialog(paper)}
                  >
                    <AnimatedIcon icon={IconMap.Plus} size={13} className="mr-1.5" />
                    Reuse
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 w-8 p-0 text-slate-500 hover:text-slate-700"
                    title="Download PDF"
                    onClick={() => handleExportPdf(paper.id)}
                  >
                    <AnimatedIcon icon={IconMap.Download} size={14} />
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 w-8 p-0 text-slate-500 hover:text-slate-700"
                    title="Clone / Duplicate"
                    onClick={() => handleDuplicate(paper.id)}
                  >
                    <AnimatedIcon icon={IconMap.Copy} size={14} />
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50 ml-auto"
                    title="Archive / Delete"
                    onClick={() => handleArchive(paper.id)}
                  >
                    <AnimatedIcon icon={IconMap.Trash2} size={14} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-1.5 pt-4">
          <Button
            size="sm"
            variant="outline"
            disabled={page === 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="flex items-center px-4 text-xs font-semibold text-slate-600">
            Page {page} of {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page === totalPages}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
          >
            Next
          </Button>
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={!!previewPaper} onOpenChange={(open) => !open && setPreviewPaper(null)}>
        {previewPaper && (
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader className="border-b pb-4">
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <span className="p-1.5 bg-blue-100 text-blue-600 rounded-lg">
                  <AnimatedIcon icon={IconMap.ClipboardList} size={18} />
                </span>
                {previewPaper.title}
              </DialogTitle>
              <DialogDescription className="text-sm mt-1 text-slate-500">
                {previewPaper.description || "No description provided."}
              </DialogDescription>
            </DialogHeader>

            <div className="py-6 space-y-6">
              <div className="flex flex-wrap gap-3 text-xs">
                <Badge variant="secondary">Subject: {previewPaper.subject || "General"}</Badge>
                <Badge variant="outline">Total questions: {previewPaper.total_questions}</Badge>
                <Badge variant="outline">Saved on {new Date(previewPaper.created_at).toLocaleDateString()}</Badge>
              </div>

              <div className="divide-y divide-slate-100">
                {previewPaper.questions && previewPaper.questions.map((q, idx) => (
                  <div key={idx} className="py-4 first:pt-0 last:pb-0 space-y-3">
                    <div className="flex items-start gap-3">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500">
                        {idx + 1}
                      </span>
                      <p className="text-sm font-semibold text-slate-800 leading-relaxed">
                        {q.question_text}
                      </p>
                    </div>

                    <div className="grid gap-2 pl-8 sm:grid-cols-2">
                      {Object.entries(q.options || {}).map(([k, text]) => {
                        const isCorrect = k.toUpperCase() === q.correct_option.toUpperCase();
                        return (
                          <div
                            key={k}
                            className={`rounded-lg border px-3 py-2 text-xs flex items-center justify-between transition-colors ${
                              isCorrect
                                ? "border-emerald-200 bg-emerald-50/50 text-emerald-950 font-bold"
                                : "border-slate-100 bg-slate-50/30 text-slate-600"
                            }`}
                          >
                            <span>
                              <span className="mr-1.5 font-bold opacity-60">{k}.</span>
                              {text}
                            </span>
                            {isCorrect && <span className="text-emerald-600 font-bold ml-2">✓ Correct</span>}
                          </div>
                        );
                      })}
                    </div>

                    {q.explanation && (
                      <div className="mt-2 text-xs text-slate-400 bg-slate-50 p-2.5 rounded-lg border border-slate-100 italic pl-8">
                        <strong>Explanation:</strong> {q.explanation}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter className="border-t pt-4">
              <Button variant="outline" onClick={() => setPreviewPaper(null)}>Close</Button>
              <Button
                variant="outline"
                className="text-blue-600 border-blue-200 hover:bg-blue-50"
                onClick={() => {
                  const paper = previewPaper;
                  setPreviewPaper(null);
                  openReuseDialog(paper);
                }}
              >
                Create Assessment
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* Reuse / Create Assessment Dialog */}
      <Dialog open={!!reusePaper} onOpenChange={(open) => !open && setReusePaper(null)}>
        {reusePaper && (
          <DialogContent className="max-w-md">
            <form onSubmit={handleReuseSubmit}>
              <DialogHeader className="border-b pb-4">
                <DialogTitle className="text-lg font-bold">Create Assessment from Library</DialogTitle>
                <DialogDescription className="text-xs mt-1 text-slate-500">
                  Configure settings to spawn a new assessment using this saved question paper.
                </DialogDescription>
              </DialogHeader>

              <div className="py-5 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reuse-title" className="text-xs font-bold text-slate-500 uppercase">Assessment Title</Label>
                  <Input
                    id="reuse-title"
                    placeholder="e.g. Senior Backend Engineer Interview"
                    value={reuseForm.title}
                    onChange={(e) => setReuseForm({ ...reuseForm, title: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reuse-desc" className="text-xs font-bold text-slate-500 uppercase">Description (Optional)</Label>
                  <textarea
                    id="reuse-desc"
                    placeholder="Brief description for candidate context..."
                    className="w-full min-h-[70px] p-2.5 rounded-lg border border-slate-200 bg-white text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    value={reuseForm.description}
                    onChange={(e) => setReuseForm({ ...reuseForm, description: e.target.value })}
                  />
                </div>

                <div className="grid gap-4 grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="reuse-role" className="text-xs font-bold text-slate-500 uppercase">Job Role / Subject</Label>
                    <Input
                      id="reuse-role"
                      placeholder="e.g. Backend, React"
                      value={reuseForm.role}
                      onChange={(e) => setReuseForm({ ...reuseForm, role: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="reuse-duration" className="text-xs font-bold text-slate-500 uppercase">Duration (Minutes)</Label>
                    <Input
                      id="reuse-duration"
                      type="number"
                      min="5"
                      max="300"
                      value={reuseForm.duration_minutes}
                      onChange={(e) => setReuseForm({ ...reuseForm, duration_minutes: Number(e.target.value) })}
                      required
                    />
                  </div>
                </div>
              </div>

              <DialogFooter className="border-t pt-4">
                <Button type="button" variant="outline" onClick={() => setReusePaper(null)}>Cancel</Button>
                <Button type="submit" disabled={submittingReuse} className="bg-blue-600 hover:bg-blue-700">
                  {submittingReuse ? "Generating..." : "Spawn Assessment"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
