import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Upload,
  Loader2,
  CheckCircle,
  XCircle,
  FileText,
  Trash2,
  Eye,
  AlertTriangle,
  FolderUp,
  RefreshCw,
  ArrowLeft,
} from 'lucide-react';

interface FileStatus {
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error' | 'duplicate';
  progress: number; // 0 - 100
  error?: string;
  resumeId?: number;
  candidateId?: number;
}

interface JobOption {
  job_id: number;
  title?: string;
  job_code?: string;
  company_name?: string;
  client_name?: string;
}

export default function BulkUpload() {
  const navigate = useNavigate();
  const [files, setFiles] = useState<FileStatus[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [jobId, setJobId] = useState<number | null>(null);
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsError, setJobsError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [reprocessing, setReprocessing] = useState(false);

  useEffect(() => {
    const fetchJobs = async () => {
      setJobsLoading(true);
      setJobsError('');
      try {
        const token = localStorage.getItem('accessToken');
        const response = await fetch('/api/jobs', {
          headers: {
            Authorization: token ? `Bearer ${token}` : '',
          },
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          setJobsError(data?.error || data?.message || `Failed to load jobs (${response.status})`);
          setJobs([]);
          return;
        }
        const list = (data?.data || data) as any[];
        setJobs(Array.isArray(list) ? (list as JobOption[]) : []);
      } catch (e: any) {
        setJobsError(e?.message || 'Failed to load jobs');
        setJobs([]);
      } finally {
        setJobsLoading(false);
      }
    };

    fetchJobs();
  }, []);

  // ---------- Drag & Drop Handlers ----------
  const handleDrag = useCallback((e: any) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  }, []);

  const handleDrop = useCallback((e: any) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const droppedFiles = Array.from((e?.dataTransfer?.files || []) as FileList) as File[];
    addFiles(droppedFiles);
  }, []);

  // ---------- File Selection ----------
  const handleFileInput = (e: any) => {
    if (e.target.files) {
      addFiles(Array.from(e.target.files));
    }
  };

  // ---------- Delete All Resumes ----------
  const deleteAllResumes = async () => {
    setDeleting(true);
    setDeleteError('');

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/admin/resumes/delete-all', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok) {
        alert(`Successfully deleted ${data.deletedCount} resumes and candidates`);
        setShowDeleteConfirm(false);
      } else {
        setDeleteError(data.error || 'Failed to delete resumes');
      }
    } catch (error) {
      console.error('Delete error:', error);
      setDeleteError('Network error occurred');
    } finally {
      setDeleting(false);
    }
  };

  // ---------- Reprocess Failed Uploads ----------
  const reprocessFailedUploads = async () => {
    setReprocessing(true);

    // Get failed files that need reprocessing
    const failedFiles = files.filter(file => file.status === 'error');

    if (failedFiles.length === 0) {
      alert('No failed uploads to reprocess');
      setReprocessing(false);
      return;
    }

    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    try {
      const token = localStorage.getItem('accessToken');

      // Process each failed file individually
      for (const file of failedFiles) {
        if (file.resumeId) {
          try {
            console.log(`Attempting to reprocess resume ID: ${file.resumeId} for file: ${file.file.name}`);

            const response = await fetch(`/api/admin/upload/reprocess/${file.resumeId}`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            });

            console.log(`Response status for ${file.file.name}:`, response.status);

            if (response.ok) {
              const data = await response.json();
              console.log('Reprocess result:', data);
              successCount++;

              // Update file status to show it's being reprocessed
              setFiles(prev => prev.map(f =>
                f.file.name === file.file.name
                  ? { ...f, status: 'uploading' as const, progress: 0 }
                  : f
              ));
            } else {
              errorCount++;
              // Handle non-JSON error responses (like HTML error pages)
              const contentType = response.headers.get('content-type');
              if (contentType && contentType.includes('application/json')) {
                const errorData = await response.json();
                console.error('Reprocess error:', errorData);
                errors.push(`${file.file.name}: ${errorData.detail || 'Unknown error'}`);
              } else {
                console.error('Non-JSON error response:', response.status, response.statusText);
                errors.push(`${file.file.name}: Server returned ${response.status}`);
              }
            }
          } catch (fileError) {
            console.error(`Error reprocessing file ${file.file.name}:`, fileError);
            errorCount++;
            errors.push(`${file.file.name}: Network error`);
          }
        } else {
          console.warn(`File ${file.file.name} has no resumeId, skipping reprocess`);
          errorCount++;
          errors.push(`${file.file.name}: No resume ID found`);
        }
      }

      // Show detailed results
      if (successCount > 0 && errorCount === 0) {
        alert(`✅ Successfully started reprocessing ${successCount} failed uploads. Check back in a few minutes.`);
      } else if (successCount > 0 && errorCount > 0) {
        alert(`⚠️ Started reprocessing ${successCount} uploads, but ${errorCount} failed:\n${errors.join('\n')}`);
      } else {
        alert(`❌ Failed to reprocess any uploads:\n${errors.join('\n')}`);
      }
    } catch (error) {
      console.error('Reprocess error:', error);
      alert('❌ Network error occurred during reprocessing');
    } finally {
      setReprocessing(false);
    }
  };

  const addFiles = (newFiles: File[]) => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      // Remove image types - they should be processed via OCR in individual upload, not bulk
      // 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      // 'application/vnd.ms-excel',
      // 'image/jpeg',
      // 'image/png',
      // 'image/bmp',
      // 'image/tiff'
    ];

    const validFiles = newFiles.filter((file) => {
      if (!allowedTypes.includes(file.type)) return false;
      if (file.size > 10 * 1024 * 1024) return false; // 10MB limit
      return true;
    });

    const fileStatuses: FileStatus[] = validFiles.map((file) => ({
      file,
      status: 'pending',
      progress: 0,
    }));

    setFiles((prev) => [...prev, ...fileStatuses]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // ---------- Robust Upload Function (XMLHttpRequest with progress) ----------
  const handleUpload = async () => {
    if (files.length === 0) return;
    if (!jobId) {
      setFiles((prev) => prev.map((f) => ({ ...f, status: 'error', progress: 0, error: 'Job is required' })));
      return;
    }

    setUploading(true);
    setFiles((prev) => prev.map((f) => ({ ...f, status: 'uploading', progress: 5 })));

    try {
      // create FormData using 'files' as the field name (matches multer.array('files'))
      const formData = new FormData();
      files.forEach((fs) => {
        formData.append('files', fs.file, fs.file.name);
      });

      if (jobId) {
        formData.append('job_id', String(jobId));
      }

      // add other metadata if needed, e.g. user id or job_id
      // const userId = ...; formData.append('user_id', String(userId));

      // Send via XHR to avoid wrappers potentially forcing JSON headers
      const xhr = new XMLHttpRequest();

      // Replace with your API base (vite proxy will handle /api if configured)
      const uploadUrl = '/api/resumes/bulk-upload';

      xhr.open('POST', uploadUrl, true);

      // If you use localStorage token-based auth, add Authorization header:
      const token =
        localStorage.getItem('accessToken') ||
        localStorage.getItem('token') ||
        localStorage.getItem('authToken') ||
        '';
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

      // track upload progress (overall). We'll distribute progress across files.
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const percent = Math.round((event.loaded / event.total) * 100);
        // Spread overall percent to each file proportionally:
        setFiles((prev) => prev.map((f) => ({ ...f, progress: Math.max(f.progress, Math.round(percent * 0.9)) })));
      };

      // handle completion
      const responsePromise: Promise<any> = new Promise((resolve, reject) => {
        xhr.onload = () => {
          // 2xx success
          if (xhr.status >= 200 && xhr.status < 300) {
            // try parse JSON, but handle empty body
            try {
              const text = xhr.responseText?.trim();
              if (!text) return resolve(null);
              const json = JSON.parse(text);
              return resolve(json);
            } catch (err) {
              // invalid JSON
              return reject(new Error('Invalid JSON response from server'));
            }
          } else {
            // server returned error status
            try {
              const json = JSON.parse(xhr.responseText || '{}');
              return reject(new Error(json.error || `Server returned ${xhr.status}`));
            } catch {
              return reject(new Error(`Server returned ${xhr.status}`));
            }
          }
        };

        xhr.onerror = () => reject(new Error('Network error during upload (connection error)'));
        xhr.ontimeout = () => reject(new Error('Upload timed out'));
      });

      // set a long timeout for bulk uploads (milliseconds)
      xhr.timeout = 10 * 60 * 1000; // 10 minutes

      // start upload
      xhr.send(formData);

      // await response
      const result = await responsePromise;

      // If server returned null body but HTTP 200, consider success without per-file results
      if (!result) {
        // mark all as success
        setFiles((prev) => prev.map((f) => ({ ...f, status: 'success', progress: 100 })));
        setJobId(Date.now());
        setUploading(false);
        return;
      }

      // Backend wraps Python response in data property: { success, data: { job_id, results: [...] } }
      console.log('Upload response:', result);
      const actualData = result.data || result; // Handle both wrapped and unwrapped responses
      console.log('Actual data:', actualData);
      console.log('Results array:', actualData.results);
      console.log('First result sample:', actualData.results?.[0]);

      if (actualData.job_id) setJobId(actualData.job_id);

      if (Array.isArray(actualData.results) && actualData.results.length > 0) {
        // match results to files by filename (safer than index)
        setFiles((prev) =>
          prev.map((fs) => {
            const match = actualData.results.find((r: any) => r.filename === fs.file.name) || actualData.results.shift();
            if (!match) return { ...fs, status: 'error', progress: 0, error: 'No result from server' };
            console.log('Match for', fs.file.name, '- Status:', match.status, '- Full object:', match);

            // Determine status
            let fileStatus: 'success' | 'error' | 'duplicate' = 'error';
            if (match.status === 'duplicate') {
              fileStatus = 'duplicate';
            } else if (match.status === 'success' || match.status === 'processed' || match.status === 'completed') {
              fileStatus = 'success';
            }

            return {
              ...fs,
              status: fileStatus,
              progress: fileStatus === 'success' ? 100 : fileStatus === 'duplicate' ? 100 : 0,
              error: match.error || undefined,
              resumeId: match.resume_id || undefined,
              candidateId: match.candidate_id || undefined,
            };
          })
        );
      } else if (actualData && Array.isArray(actualData.results)) {
        // alternative nested shape (already handled above, but kept for compatibility)
        setFiles((prev) =>
          prev.map((fs) => {
            const match = actualData.results.find((r: any) => r.filename === fs.file.name) || actualData.results.shift();
            if (!match) return { ...fs, status: 'error', progress: 0, error: 'No result from server' };

            // Determine status
            let fileStatus: 'success' | 'error' | 'duplicate' = 'error';
            if (match.status === 'duplicate') {
              fileStatus = 'duplicate';
            } else if (match.status === 'success' || match.status === 'processed' || match.status === 'completed') {
              fileStatus = 'success';
            }

            return {
              ...fs,
              status: fileStatus,
              progress: fileStatus === 'success' ? 100 : fileStatus === 'duplicate' ? 100 : 0,
              error: match.error || undefined,
              resumeId: match.resume_id || undefined,
              candidateId: match.candidate_id || undefined,
            };
          })
        );
      } else {
        // fallback - just mark all success if server returned success flag
        if (result.success) {
          setFiles((prev) => prev.map((f) => ({ ...f, status: 'success', progress: 100 })));
        } else {
          // unexpected shape - show server message if available
          const message = result.error || result.message || 'Unexpected server response';
          setFiles((prev) => prev.map((f) => ({ ...f, status: 'error', progress: 0, error: message })));
        }
      }
    } catch (err: any) {
      console.error('Upload error:', err);
      const message = err?.message || 'Upload failed';
      setFiles((prev) => prev.map((f) => ({ ...f, status: 'error', progress: 0, error: message })));
    } finally {
      setUploading(false);
    }
  };

  // ---------- File Stats ----------
  const stats = {
    total: files.length,
    pending: files.filter((f) => f.status === 'pending').length,
    uploading: files.filter((f) => f.status === 'uploading').length,
    success: files.filter((f) => f.status === 'success').length,
    error: files.filter((f) => f.status === 'error').length,
    duplicate: files.filter((f) => f.status === 'duplicate').length,
  };

  // ---------- UI Helpers ----------
  const getStatusIcon = (status: FileStatus['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-600" />;
      case 'duplicate':
        return <AlertTriangle className="w-5 h-5 text-orange-600" />;
      case 'uploading':
        return <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />;
      default:
        return <FileText className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: FileStatus['status']) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Success</Badge>;
      case 'error':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Failed</Badge>;
      case 'duplicate':
        return (
          <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">Duplicate</Badge>
        );
      case 'uploading':
        return (
          <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Processing</Badge>
        );
      default:
        return <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100">Pending</Badge>;
    }
  };

  // ---------- JSX ----------
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Back Button */}
        <div className="mb-4">
          <Button variant="ghost" onClick={() => navigate('/admin/dashboard')} className="text-muted-foreground -ml-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {(() => { try { const t = localStorage.getItem('accessToken'); if (t) { const d = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); if (d.role === 'lead') return 'Back to Lead Panel'; } } catch(e) {} return 'Back to Admin Dashboard'; })()}
          </Button>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3">
              <FolderUp className="w-8 h-8 text-violet-600" />
              Bulk Resume Upload
            </h1>
            <p className="text-muted-foreground mt-1">
              Upload up to 1000 resumes with AI-powered parsing
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={reprocessFailedUploads}
              disabled={reprocessing || stats.error === 0}
            >
              {reprocessing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Reprocess Failed ({stats.error})
            </Button>
            <Button
              variant="destructive"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete All Resumes
            </Button>
            <Button variant="outline" onClick={() => navigate('/admin/dashboard')}>
              Back to Dashboard
            </Button>
          </div>
        </div>

        {/* Upload Area */}
        <Card>
          <CardHeader>
            <CardTitle>Upload Resumes</CardTitle>
            <CardDescription>
              Drag and drop files or click to browse. Supports PDF, DOCX, XLSX (max 10MB each)
            </CardDescription>
            {/* File limit indicator */}
            <div className="mt-2 flex items-center gap-2">
              <Badge variant={files.length >= 10 ? "destructive" : "secondary"}>
                {files.length} / 10 files
              </Badge>
              {files.length >= 10 && (
                <span className="text-sm text-red-600">Maximum limit reached</span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div
              className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${dragActive
                ? 'border-violet-500 bg-violet-50'
                : 'border-gray-300 hover:border-violet-400 hover:bg-background'
                }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <Upload className="w-16 h-16 mx-auto text-gray-400 mb-4" />
              <p className="text-lg font-medium text-gray-700 mb-2">
                Drop your resume files here
              </p>
              <p className="text-sm text-muted-foreground mb-4">or</p>
              <label htmlFor="file-upload">
                <Button variant="outline" className="cursor-pointer" asChild>
                  <span>Browse Files</span>
                </Button>
                <input
                  id="file-upload"
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                  onChange={handleFileInput}
                  className="hidden"
                />
              </label>
              <p className="text-xs text-muted-foreground mt-4">
                Supported formats: PDF, DOC, DOCX, XLS, XLSX, JPG, PNG (max 10MB per file)
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Stats Section */}
        {files.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Upload Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="text-sm font-medium text-slate-700">Select Job (Required)</div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setJobsLoading(true);
                      setJobsError('');
                      const token = localStorage.getItem('accessToken');
                      fetch('/api/jobs', {
                        headers: {
                          Authorization: token ? `Bearer ${token}` : '',
                        },
                      })
                        .then(async (r) => {
                          const d = await r.json().catch(() => null);
                          if (!r.ok) throw new Error(d?.error || d?.message || `Failed to load jobs (${r.status})`);
                          const list = (d?.data || d) as any[];
                          setJobs(Array.isArray(list) ? (list as JobOption[]) : []);
                        })
                        .catch((e) => {
                          setJobsError(e?.message || 'Failed to load jobs');
                          setJobs([]);
                        })
                        .finally(() => setJobsLoading(false));
                    }}
                    disabled={jobsLoading}
                  >
                    {jobsLoading ? 'Loading...' : 'Refresh Jobs'}
                  </Button>
                </div>

                <div className="mt-2">
                  <select
                    className="w-full border rounded-md px-3 py-2 bg-card"
                    value={jobId ?? ''}
                    onChange={(e) => {
                      const v = String(e.target.value || '').trim();
                      setJobId(v ? Number(v) : null);
                    }}
                    disabled={jobsLoading}
                  >
                    <option value="">-- Select a job --</option>
                    {jobs.map((j) => (
                      <option key={j.job_id} value={j.job_id}>
                        {(j.job_code ? `${j.job_code} - ` : '') + (j.title || `Job ${j.job_id}`)}
                      </option>
                    ))}
                  </select>
                  {jobsError && <div className="text-sm text-red-600 mt-1">{jobsError}</div>}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                {[
                  ['Total', stats.total, 'slate'],
                  ['Pending', stats.pending, 'gray'],
                  ['Processing', stats.uploading, 'blue'],
                  ['Success', stats.success, 'green'],
                  ['Failed', stats.error, 'red'],
                  ['Duplicates', stats.duplicate, 'orange'],
                ].map(([label, count, color]) => (
                  <div key={String(label)} className={`text-center p-4 rounded-lg bg-slate-100`}>
                    <div className={`text-2xl font-bold text-slate-800`}>{count}</div>
                    <div className={`text-sm text-muted-foreground`}>{label}</div>
                  </div>
                ))}
              </div>

              {stats.total > 0 && (
                <div className="mt-6">
                  <Button
                    onClick={handleUpload}
                    disabled={uploading || stats.pending === 0 || !jobId}
                    className="w-full bg-violet-600 hover:bg-violet-700"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing {stats.uploading} of {stats.total} files...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 mr-2" />
                        Upload {stats.pending} Resume{stats.pending !== 1 ? 's' : ''}
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* File List */}
        {files.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Files ({files.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {files.map((fileStatus, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-4 p-4 bg-background rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    {getStatusIcon(fileStatus.status)}

                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 truncate">
                        {fileStatus.file.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {(fileStatus.file.size / 1024).toFixed(2)} KB
                      </p>
                      {fileStatus.error && (
                        <p className="text-sm text-red-600 mt-1">{fileStatus.error}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {getStatusBadge(fileStatus.status)}

                      {fileStatus.status === 'success' && fileStatus.candidateId && (
                        <a
                          href={`/admin/candidates/${fileStatus.candidateId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-9 px-3"
                          title={`View candidate ${fileStatus.candidateId}`}
                        >
                          <Eye className="w-4 h-4" />
                        </a>
                      )}
                      {fileStatus.status === 'success' && !fileStatus.candidateId && (
                        <span className="text-xs text-muted-foreground">No candidate ID</span>
                      )}

                      {fileStatus.status === 'pending' && (
                        <Button size="sm" variant="ghost" onClick={() => removeFile(index)}>
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      )}
                    </div>

                    {fileStatus.status === 'uploading' && (
                      <div className="w-32">
                        <Progress value={fileStatus.progress} className="h-2" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Info Alert */}
        {files.length === 0 && (
          <Alert>
            <AlertDescription>
              💡 <strong>Tip:</strong> You can select multiple files at once or drag and drop them
              here. The system uses a <strong>Hybrid AI Parser</strong> combining{' '}
              <strong>Regex + SpaCy + Qwen</strong> for high-accuracy resume parsing in bulk mode.
            </AlertDescription>
          </Alert>
        )}

        {/* Delete Confirmation Dialog */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <Card className="w-full max-w-md mx-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-600">
                  <AlertTriangle className="w-5 h-5" />
                  Delete All Resumes?
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <p className="text-slate-700">
                    This will permanently delete all resumes and candidates from the database.
                  </p>
                  {deleteError && (
                    <div className="bg-red-50 border border-red-200 text-red-800 rounded p-2 text-sm">
                      {deleteError}
                    </div>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>
                      Cancel
                    </Button>
                    <Button variant="destructive" onClick={deleteAllResumes} disabled={deleting}>
                      {deleting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Deleting...
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-4 h-4 mr-2" /> Yes, Delete All
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

// Confirmation Dialog markup appended below return

// Delete All Resumes Confirmation Modal
// Rendered conditionally within the main component tree above

