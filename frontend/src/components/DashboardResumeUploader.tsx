import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Upload,
  Loader2,
  CheckCircle,
  XCircle,
  FileText,
  User,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  Code,
  Calendar,
  Save
} from 'lucide-react';
import { ResumePreview } from './ResumePreview';

interface ParsedData {
  // Personal Details
  full_name: string;
  email: string;
  phone: string;
  location: string;

  // Required Details
  gender: string;
  designation: string;
  total_experience: number;
  country: string;
  city: string;
  pan_card: string;
  primary_skills: string[];
  secondary_skills: string[];

  // Additional Details
  experience: Array<{
    company: string;
    role: string;
    start_year: number;
    end_year: number;
  }>;
  education: Array<{
    degree: string;
    institute: string;
    passing_year: number;
  }>;
}
interface DashboardResumeUploaderProps {
  onClose: () => void;
  userRole?: string;
  // Optional: when recruiter uploads from a specific job, associate resumes with that job
  selectedJob?: { job_id?: number; id?: number } | null;
  onUploadSuccess?: () => void;
}

export default function DashboardResumeUploader({ onClose, userRole, selectedJob, onUploadSuccess }: DashboardResumeUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [files, setFiles] = useState<Array<{ file: File, status: 'pending' | 'uploading' | 'success' | 'error' | 'duplicate', progress: number, error?: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [candidateId, setCandidateId] = useState<number | null>(null);
  const [resumeId, setResumeId] = useState<number | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [bulkSummary, setBulkSummary] = useState<{ total: number; success: number; duplicate: number } | null>(null);

  // Form data - initially empty, will be filled after parsing
  const [formData, setFormData] = useState<ParsedData>({
    // Personal Details
    full_name: '',
    email: '',
    phone: '',
    location: '',

    // Required Details
    gender: '',
    designation: '',
    total_experience: 0,
    country: '',
    city: '',
    pan_card: '',
    primary_skills: [],
    secondary_skills: [],

    // Additional Details
    experience: [],
    education: []
  });

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [newSkill, setNewSkill] = useState('');
  const [newSecondarySkill, setNewSecondarySkill] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles) {
      const selectedFile = selectedFiles[0];
      const allowedTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'image/jpeg',
        'image/png',
        'image/bmp',
        'image/tiff'
      ];
      if (!allowedTypes.includes(selectedFile.type)) {
        setStatus('error');
        setErrorMessage('Invalid file type. Please upload PDF, DOC, DOCX, XLS, XLSX, JPG, PNG, BMP, or TIFF.');
        return;
      }

      if (selectedFile.size > 10 * 1024 * 1024) {
        setStatus('error');
        setErrorMessage('File too large. Maximum size is 10MB.');
        return;
      }

      setFile(selectedFile);
      setPreviewUrl(URL.createObjectURL(selectedFile));
      setStatus('idle');
      setErrorMessage('');
    }
  };

  const addFiles = (newFiles: File[]) => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword'
    ];

    const validFiles = newFiles.filter((file) => {
      if (!allowedTypes.includes(file.type)) return false;
      if (file.size > 10 * 1024 * 1024) return false; // 10MB limit
      return true;
    });

    const fileStatuses = validFiles.map((file) => ({
      file,
      status: 'pending' as const,
      progress: 0,
    }));

    setFiles((prev) => [...prev, ...fileStatuses]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const droppedFiles = Array.from(e.dataTransfer.files) as File[];
    if (droppedFiles.length > 0) {
      const file = droppedFiles[0];
      const allowedTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'image/jpeg',
        'image/png',
        'image/bmp',
        'image/tiff'
      ];
      if (!allowedTypes.includes(file.type) || file.size > 10 * 1024 * 1024) {
        return;
      }
      setFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setStatus('idle');
      setErrorMessage('');
    }
  };

  const handleUpload = async () => {
    // TEMP: force single upload
    // if (userRole === 'admin') {
    //   return handleBulkUpload();
    // }


    if (!file) return;

    setUploading(true);
    setStatus('uploading');

    const formDataToSend = new FormData();
    formDataToSend.append('resume', file);
    // If uploading from a specific job context, include job_id so backend/AI can link it
    const jobId = selectedJob?.job_id ?? null;
    if (jobId) {
      formDataToSend.append('job_id', String(jobId));
    }

    if (formData.gender) {
      formDataToSend.append('gender', String(formData.gender));
    }

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/resumes/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formDataToSend,
      });

      const data = await response.json();

      // Check for duplicate error
      if (response.status === 409 || data.error === 'duplicate_resume') {
        setStatus('error');
        const existing = data.existing_candidate;
        let message = 'Resume Already Exists!\n\n';
        if (existing) {
          message += `This candidate is already in the system:\n`;
          message += `• Name: ${existing.full_name}\n`;
          message += `• Email: ${existing.email}\n`;
          message += `• Phone: ${existing.phone}\n`;
          message += `• First uploaded: ${new Date(existing.created_at).toLocaleDateString()}\n`;
          message += `• Total resumes: ${existing.resume_count}\n\n`;
          message += `Please verify if this is the same candidate.`;
        } else {
          message += data.details || 'A resume with the same email or phone number already exists.';
        }
        setErrorMessage(message);
        setUploading(false);
        return;
      }

      if (response.ok && data.success) {
        setStatus('success');

        // backend returns candidate_id directly
        setCandidateId(data.candidate_id);
        setResumeId(data.resume_id);

        const pd = data.parsed_data;
        if (pd) {
          setFormData((prev) => ({
            ...prev,
            full_name: pd.full_name || '',
            email: pd.email || '',
            phone: pd.phone || '',
            location: pd.location || '',

            gender: prev.gender || pd.gender || '',
            designation: pd.designation || '',
            total_experience: pd.total_experience || 0,
            country: pd.country || '',
            city: pd.city || '',
            pan_card: pd.pan_card || '',
            primary_skills: pd.primary_skills || [],
            secondary_skills: pd.secondary_skills || [],
            experience: pd.experience || [],
            education: pd.education || [],
          }));
        }
      } else {
        setStatus('error');
        const msg =
          data?.message ||
          data?.detail ||
          data?.error ||
          'Failed to upload resume';
        setErrorMessage(String(msg));
      }

    } catch (error) {
      console.error('Upload error:', error);
      setStatus('error');
      setErrorMessage('Network error. Please check if the AI service is running.');
    } finally {
      setUploading(false);
    }
  };

  const handleBulkUpload = async () => {
    if (files.length === 0) return;

    setUploading(true);
    setBulkSummary(null);

    try {
      const formData = new FormData();
      files.forEach((fileStatus) => {
        formData.append('files', fileStatus.file);
      });

      // If recruiter is uploading for a specific job, include job_id so backend/AI can link it
      const jobId = selectedJob?.job_id ?? null;
      if (jobId) {
        formData.append('job_id', String(jobId));
      }

      setFiles(prev => prev.map(f => ({ ...f, status: 'uploading' as const, progress: 0 })));

      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/resumes/parse-resumes-bulk', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const result = await response.json();

      let total = files.length;
      let successCount = 0;
      let duplicateCount = 0;

      if (result.data && Array.isArray(result.data.results)) {
        setFiles(prev => prev.map((fs, index) => {
          const match = result.data.results[index];
          if (!match) return { ...fs, status: 'error', progress: 0, error: 'No result from server' };

          let fileStatus: 'success' | 'error' | 'duplicate' = 'error';
          if (match.status === 'duplicate') {
            fileStatus = 'duplicate';
            duplicateCount += 1;
          } else if (match.status === 'success' || match.status === 'processed' || match.status === 'completed') {
            fileStatus = 'success';
            successCount += 1;
          }

          return {
            ...fs,
            status: fileStatus,
            progress: fileStatus === 'success' || fileStatus === 'duplicate' ? 100 : 0,
            error: match.error || undefined,
          };
        }));
      } else {
        successCount = files.length;
        setFiles(prev => prev.map(f => ({ ...f, status: 'success', progress: 100 })));
      }

      setBulkSummary({ total, success: successCount, duplicate: duplicateCount });

      // Notify dashboards so they refresh stats (including Total Applicants)
      try {
        localStorage.setItem('applicantsUpdated', Date.now().toString());
      } catch (e) {
        // ignore storage errors
      }

    } catch (error) {
      console.error('Upload error:', error);
      setFiles(prev => prev.map(f => ({ ...f, status: 'error', progress: 0, error: 'Upload failed' })));
    } finally {
      setUploading(false);
    }
  };

  const handleAddPrimarySkill = () => {
    if (newSkill.trim() && !formData.primary_skills.includes(newSkill.trim())) {
      setFormData({
        ...formData,
        primary_skills: [...formData.primary_skills, newSkill.trim()]
      });
      setNewSkill('');
    }
  };

  const handleRemovePrimarySkill = (skillToRemove: string) => {
    setFormData({
      ...formData,
      primary_skills: formData.primary_skills.filter(skill => skill !== skillToRemove)
    });
  };

  const handleAddSecondarySkill = () => {
    if (newSecondarySkill.trim() && !formData.secondary_skills.includes(newSecondarySkill.trim())) {
      setFormData({
        ...formData,
        secondary_skills: [...formData.secondary_skills, newSecondarySkill.trim()]
      });
      setNewSecondarySkill('');
    }
  };

  const handleRemoveSecondarySkill = (skillToRemove: string) => {
    setFormData({
      ...formData,
      secondary_skills: formData.secondary_skills.filter(skill => skill !== skillToRemove)
    });
  };

  const handleSave = async () => {
    if (!formData.email || !formData.phone || !formData.full_name) {
      alert('Full Name, Email and Phone are mandatory to save the candidate.');
      return;
    }

    try {
      const token = localStorage.getItem('accessToken');
      const payload = {
        full_name: formData.full_name,
        email: formData.email,
        phone: formData.phone,
        location: formData.location,
        current_designation: formData.designation,
        total_experience: formData.total_experience,
        gender: formData.gender,
        pan_card: formData.pan_card,
        country: formData.country,
        city: formData.city,
        primary_skills: formData.primary_skills,
        secondary_skills: formData.secondary_skills,
        skills: Array.from(new Set([...(formData.primary_skills || []), ...(formData.secondary_skills || [])])),
        parsed_json: {
          full_name: formData.full_name,
          email: formData.email,
          phone: formData.phone,
          location: formData.location,
          gender: formData.gender,
          designation: formData.designation,
          total_experience: formData.total_experience,
          country: formData.country,
          city: formData.city,
          pan_card: formData.pan_card,
          primary_skills: formData.primary_skills,
          secondary_skills: formData.secondary_skills,
          experience: formData.experience,
          education: formData.education,
        },
        resume_id: resumeId // Pass resume_id for linking if this is a new candidate
      };

      const url = candidateId ? `/api/candidates/${candidateId}` : `/api/candidates`;
      const method = candidateId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || 'Failed to save candidate');
        return;
      }

      const finalCandidateId = candidateId || data.data?.candidate_id;

      // If this upload was done in the context of a specific job, also create/link an application
      const jobId = selectedJob?.job_id ?? null;
      if (jobId) {
        try {
          await fetch(`/api/applications/jobs/${jobId}/link-candidate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ candidateId: finalCandidateId })
          });

          // Notify dashboards so Total Applicants widgets can refresh
          try {
            localStorage.setItem('applicantsUpdated', Date.now().toString());
          } catch (e) {
            // ignore storage errors
          }
        } catch (e) {
          console.error('Error linking candidate to job:', e);
        }
      }

      // Close the modal after save (and optional link)
      onUploadSuccess?.();
      onClose();
    } catch (error) {
      console.error('Error saving:', error);
    }
  };

  // Render regular single file upload UI for all roles

  // Regular single file upload UI for normal users
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Upload className="h-8 w-8 text-blue-600" />
          Upload & Parse Resume
        </h1>
        <p className="text-muted-foreground mt-2">
          Upload a resume and watch the form auto-fill with extracted information
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Upload Section */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Upload Resume</CardTitle>
              <CardDescription>PDF or DOCX format</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Input
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.bmp,.tiff"
                  onChange={handleFileChange}
                  disabled={uploading}
                />
                {file && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground p-2 bg-background rounded">
                    <FileText className="h-4 w-4" />
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(file.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <Button
                onClick={handleUpload}
                disabled={!file || uploading}
                className="w-full"
                size="lg"
              >
                {uploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Parsing Resume...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload & Parse
                  </>
                )}
              </Button>

              {status === 'success' && (
                <Alert className="border-green-300 bg-green-50">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-900">
                    ✅ Resume uploaded successfully! Parsing is in progress.
                  </AlertDescription>
                </Alert>
              )}

              {status === 'error' && (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
              )}

              {status === 'uploading' && (
                <Alert>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <AlertDescription>
                    Processing resume... This may take a few seconds.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Resume Preview */}
          {file && <ResumePreview file={file} previewUrl={previewUrl} />}
        </div>

        {/* Right: Form Fields */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Candidate Information</CardTitle>
              <CardDescription>
                {status === 'success'
                  ? (candidateId ? 'Resume parsed successfully. You can review and update the information.' : 'Resume parsed, but some mandatory info is missing. Please add Email and Phone manually.')
                  : 'Upload a resume to auto-fill this form'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Personal Details */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider border-b pb-2">
                  PERSONAL DETAILS
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="full_name" className="flex items-center gap-2">
                      <User className="h-4 w-4 text-gray-400" />
                      Full Name *
                    </Label>
                    <Input
                      id="full_name"
                      value={formData.full_name}
                      onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                      placeholder="John Doe"
                      className={formData.full_name ? 'bg-green-50 border-green-300' : 'border-red-300 focus:border-red-500'}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email" className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-gray-400" />
                      Email *
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="john.doe@example.com"
                      className={formData.email ? 'bg-green-50 border-green-300' : 'border-red-300 focus:border-red-500'}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone" className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-gray-400" />
                      Phone
                    </Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="+1-555-123-4567"
                      className={formData.phone ? 'bg-green-50 border-green-300' : 'border-red-300 focus:border-red-500'}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="location" className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-gray-400" />
                      Location
                    </Label>
                    <Input
                      id="location"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      placeholder="San Francisco, CA"
                      className={formData.location ? 'bg-green-50 border-green-300' : ''}
                    />
                  </div>
                </div>
              </div>

              {/* Required Details */}
              <div className="space-y-4 pt-4 border-t">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider border-b pb-2">
                  REQUIRED DETAILS
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="gender">Gender</Label>
                    <select
                      id="gender"
                      value={formData.gender}
                      onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                      className="w-full px-3 py-2 border rounded-md"
                    >
                      <option value="">Select Gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="designation" className="flex items-center gap-2">
                      <Briefcase className="h-4 w-4 text-gray-400" />
                      Designation *
                    </Label>
                    <Input
                      id="designation"
                      value={formData.designation}
                      onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                      placeholder="UI/UX Designer & Web Developer"
                      className={formData.designation ? 'bg-green-50 border-green-300' : ''}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="total_experience" className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-gray-400" />
                      Total Experience (Years) *
                    </Label>
                    <Input
                      id="total_experience"
                      type="number"
                      step="0.1"
                      value={formData.total_experience || ''}
                      onChange={(e) => setFormData({ ...formData, total_experience: parseFloat(e.target.value) || 0 })}
                      placeholder="1"
                      className={formData.total_experience ? 'bg-green-50 border-green-300' : ''}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="city">City *</Label>
                    <Input
                      id="city"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      placeholder="Enter city and select"
                      className={formData.city ? 'bg-green-50 border-green-300' : ''}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pan_card">PAN Card</Label>
                    <Input
                      id="pan_card"
                      value={formData.pan_card}
                      onChange={(e) => {
                        const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
                        setFormData({ ...formData, pan_card: val });
                      }}
                      placeholder="ABCDE1234F"
                      maxLength={10}
                      className={formData.pan_card ? (formData.pan_card.length === 10 ? 'bg-green-50 border-green-300' : 'bg-yellow-50 border-yellow-300') : ''}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="country">Country *</Label>
                    <Input
                      id="country"
                      value={formData.country}
                      onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                      placeholder="India"
                      className={formData.country ? 'bg-green-50 border-green-300' : ''}
                    />
                  </div>
                </div>
              </div>

              {/* Primary Skills */}
              <div className="space-y-4 pt-4 border-t">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                  <Code className="h-4 w-4" />
                  Primary Skills * (Maximum 5 skills)
                </h3>

                <div className="flex gap-2">
                  <Input
                    value={newSkill}
                    onChange={(e) => setNewSkill(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddPrimarySkill()}
                    placeholder="Enter primary skills, separated by comma"
                  />
                  <Button onClick={handleAddPrimarySkill} variant="outline">
                    Add
                  </Button>
                </div>

                {formData.primary_skills.length > 0 && (
                  <div className="flex flex-wrap gap-2 p-4 bg-blue-50 rounded-lg border">
                    {formData.primary_skills.map((skill, idx) => (
                      <Badge
                        key={idx}
                        variant="secondary"
                        className="px-3 py-1 bg-blue-100 text-blue-800 hover:bg-blue-200 cursor-pointer"
                        onClick={() => handleRemovePrimarySkill(skill)}
                      >
                        {skill} ×
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Secondary Skills */}
              <div className="space-y-4 pt-4">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                  Secondary Skills (Optional)
                </h3>

                <div className="flex gap-2">
                  <Input
                    value={newSecondarySkill}
                    onChange={(e) => setNewSecondarySkill(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddSecondarySkill()}
                    placeholder="Enter secondary skills, separated by comma"
                  />
                  <Button onClick={handleAddSecondarySkill} variant="outline">
                    Add
                  </Button>
                </div>

                {formData.secondary_skills.length > 0 && (
                  <div className="flex flex-wrap gap-2 p-4 bg-background rounded-lg border">
                    {formData.secondary_skills.map((skill, idx) => (
                      <Badge
                        key={idx}
                        variant="secondary"
                        className="px-3 py-1 bg-gray-100 text-gray-800 hover:bg-gray-200 cursor-pointer"
                        onClick={() => handleRemoveSecondarySkill(skill)}
                      >
                        {skill} ×
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Additional Details */}
              <div className="space-y-4 pt-6 border-t-2">
                <h3 className="text-lg font-bold text-gray-800 uppercase tracking-wider">
                  ADDITIONAL DETAILS
                </h3>

                {/* Experiences */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-gray-700">Experiences</h4>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setFormData({
                          ...formData,
                          experience: [
                            ...formData.experience,
                            { company: '', role: '', start_year: new Date().getFullYear(), end_year: new Date().getFullYear() },
                          ],
                        });
                      }}
                    >
                      + Add Experience
                    </Button>
                  </div>

                  {formData.experience.length > 0 ? (
                    <div className="space-y-2">
                      {formData.experience.map((exp, idx) => (
                        <div key={idx} className="p-3 bg-background rounded border space-y-2">
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <Label className="text-xs text-muted-foreground">Company</Label>
                              <Input
                                value={exp.company}
                                onChange={(e) => {
                                  const next = [...formData.experience];
                                  next[idx] = { ...next[idx], company: e.target.value };
                                  setFormData({ ...formData, experience: next });
                                }}
                                placeholder="Company name"
                              />
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">Role</Label>
                              <Input
                                value={exp.role}
                                onChange={(e) => {
                                  const next = [...formData.experience];
                                  next[idx] = { ...next[idx], role: e.target.value };
                                  setFormData({ ...formData, experience: next });
                                }}
                                placeholder="Job title / role"
                              />
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">Start Year</Label>
                              <Input
                                type="number"
                                value={exp.start_year || ''}
                                onChange={(e) => {
                                  const year = parseInt(e.target.value || '0', 10) || 0;
                                  const next = [...formData.experience];
                                  next[idx] = { ...next[idx], start_year: year };
                                  setFormData({ ...formData, experience: next });
                                }}
                                placeholder="2019"
                              />
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">End Year</Label>
                              <Input
                                type="number"
                                value={exp.end_year || ''}
                                onChange={(e) => {
                                  const year = parseInt(e.target.value || '0', 10) || 0;
                                  const next = [...formData.experience];
                                  next[idx] = { ...next[idx], end_year: year };
                                  setFormData({ ...formData, experience: next });
                                }}
                                placeholder="2023"
                              />
                            </div>
                          </div>
                          <div className="flex justify-end">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const next = formData.experience.filter((_, i) => i !== idx);
                                setFormData({ ...formData, experience: next });
                              }}
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No experience data extracted</p>
                  )}
                </div>

                {/* Experiences section ends here, Projects section removed */}


                {/* Educations */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-gray-700">Educations</h4>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setFormData({
                          ...formData,
                          education: [
                            ...formData.education,
                            { degree: '', institute: '', passing_year: new Date().getFullYear() },
                          ],
                        });
                      }}
                    >
                      + Add Education
                    </Button>
                  </div>

                  {formData.education.length > 0 ? (
                    <div className="space-y-2">
                      {formData.education.map((edu, idx) => (
                        <div key={idx} className="p-3 bg-background rounded border space-y-2">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                            <div>
                              <Label className="text-xs text-muted-foreground">Degree</Label>
                              <Input
                                value={edu.degree}
                                onChange={(e) => {
                                  const next = [...formData.education];
                                  next[idx] = { ...next[idx], degree: e.target.value };
                                  setFormData({ ...formData, education: next });
                                }}
                                placeholder="B.Sc. Computer Science"
                              />
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">Institute</Label>
                              <Input
                                value={edu.institute}
                                onChange={(e) => {
                                  const next = [...formData.education];
                                  next[idx] = { ...next[idx], institute: e.target.value };
                                  setFormData({ ...formData, education: next });
                                }}
                                placeholder="University Name"
                              />
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">Passing Year</Label>
                              <Input
                                type="number"
                                value={edu.passing_year || ''}
                                onChange={(e) => {
                                  const year = parseInt(e.target.value || '0', 10) || 0;
                                  const next = [...formData.education];
                                  next[idx] = { ...next[idx], passing_year: year };
                                  setFormData({ ...formData, education: next });
                                }}
                                placeholder="2020"
                              />
                            </div>
                          </div>
                          <div className="flex justify-end">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const next = formData.education.filter((_, i) => i !== idx);
                                setFormData({ ...formData, education: next });
                              }}
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No education data extracted</p>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              {(candidateId || resumeId) && (
                <div className="flex gap-3 pt-4">
                  <Button onClick={handleSave} size="lg" className="flex-1">
                    <Save className="h-4 w-4 mr-2" />
                    {candidateId ? 'Save Changes' : 'Save Candidate'}
                  </Button>
                  <Button
                    onClick={onClose}
                    variant="outline"
                    size="lg"
                  >
                    Close
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}