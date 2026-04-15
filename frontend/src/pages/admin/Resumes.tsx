import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Building2,
  Save,
  Trash2,
  ArrowLeft
} from 'lucide-react';
import { ResumePreview } from '@/components/ResumePreview';

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

export default function Resumes() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [candidateId, setCandidateId] = useState<number | null>(null);
  const [resumeId, setResumeId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
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

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setStatus('uploading');

    const formDataToSend = new FormData();
    formDataToSend.append('resume', file);

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/resumes/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formDataToSend,
      });

      const data = await response.json();

      console.log('📦 Received data from API:', data);
      console.log('📦 data.data:', data.data);
      console.log('📦 data.data.parsed_data:', data.data?.parsed_data);

      if (data.success && data.data) {
        setStatus('success');
        setCandidateId(data.data.candidate_id || null);
        setResumeId(data.data.resume_id || null);

        if (data.data.parsed_data) {
          console.log('✅ Auto-filling form with parsed data:', data.data.parsed_data);
          console.log('📋 Available fields:', Object.keys(data.data.parsed_data));
          console.log('🔍 Gender:', data.data.parsed_data.gender);
          console.log('🔍 Designation:', data.data.parsed_data.designation);
          console.log('🔍 Country:', data.data.parsed_data.country);
          console.log('🔍 City:', data.data.parsed_data.city);
          console.log('🔍 Primary Skills:', data.data.parsed_data.primary_skills);
          console.log('🔍 Experience:', data.data.parsed_data.experience);
          console.log('🔍 Projects:', data.data.parsed_data.projects);
          console.log('🔍 Education:', data.data.parsed_data.education);
          const pd = data.data.parsed_data;
          setFormData({
            // Personal Details
            full_name: pd.full_name || '',
            email: pd.email || '',
            phone: pd.phone || '',
            location: pd.location || '',

            // Required Details
            gender: pd.gender || '',
            designation: pd.designation || '',
            total_experience: pd.total_experience || 0,
            country: pd.country || '',
            city: pd.city || '',
            pan_card: pd.pan_card || '',
            primary_skills: pd.primary_skills || [],
            secondary_skills: pd.secondary_skills || [],

            // Additional Details
            experience: pd.experience || [],
            education: pd.education || []
          });
        }
      } else {
        setStatus('error');
        setErrorMessage(data.error || 'Failed to upload resume');
      }
    } catch (error) {
      console.error('Upload error:', error);
      setStatus('error');
      setErrorMessage('Network error. Please check if the AI service is running.');
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

  const [newSecondarySkill, setNewSecondarySkill] = useState('');

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
    if (!candidateId && !resumeId) return;

    try {
      const token = localStorage.getItem('accessToken');

      const url = candidateId ? `/api/candidates/${candidateId}` : `/api/candidates`;
      const method = candidateId ? 'PUT' : 'POST';

      const bodyData = {
        ...formData,
        ...(candidateId ? {} : { resume_id: resumeId, parsed_json: formData })
      };

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(bodyData)
      });

      if (response.ok) {
        const result = await response.json();
        const finalCandidateId = candidateId || result.data?.candidate_id;
        navigate(`/admin/candidates/${finalCandidateId}`);
      }
    } catch (error) {
      console.error('Error saving:', error);
    }
  };

  const handleDeleteAllResumes = async () => {
    if (!confirm('⚠️ WARNING: This will delete ALL resumes AND candidates from the database. This action cannot be undone. Are you sure?')) {
      return;
    }

    setDeleting(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/admin/resumes/delete-all', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setStatus('success');
        setErrorMessage(data.message || 'All resumes deleted successfully!');
        // Reset form
        setFile(null);
        setCandidateId(null);
      } else {
        const errorData = await response.json().catch(() => ({}));
        setStatus('error');
        setErrorMessage(errorData.error || errorData.message || 'Failed to delete resumes');
        console.error('Delete error:', errorData);
      }
    } catch (error) {
      console.error('Error deleting:', error);
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Error deleting resumes');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-4">
        <Button variant="ghost" onClick={() => navigate('/admin/dashboard')} className="text-muted-foreground -ml-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          {(() => { try { const t = localStorage.getItem('accessToken'); if (t) { const d = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); if (d.role === 'lead') return 'Back to Lead Panel'; } } catch(e) {} return 'Back to Admin Dashboard'; })()}
        </Button>
      </div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Upload className="h-8 w-8 text-blue-600" />
            Upload & Parse Resume
          </h1>
          <p className="text-muted-foreground mt-2">
            Upload a resume and watch the form auto-fill with extracted information
          </p>
        </div>
        <Button
          variant="destructive"
          onClick={handleDeleteAllResumes}
          disabled={deleting}
          className="bg-red-600 hover:bg-red-700"
        >
          {deleting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Deleting...
            </>
          ) : (
            <>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete All Resumes
            </>
          )}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                    ✅ Resume parsed successfully! Form auto-filled with extracted data.
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

        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Candidate Information</CardTitle>
              <CardDescription>
                {status === 'success'
                  ? 'Extracted data from resume - Review and edit as needed'
                  : 'Upload a resume to auto-fill this form'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
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
                      className={formData.full_name ? 'bg-green-50 border-green-300' : ''}
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
                      className={formData.email ? 'bg-green-50 border-green-300' : ''}
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
                      className={formData.phone ? 'bg-green-50 border-green-300' : ''}
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
                  <h4 className="text-sm font-semibold text-gray-700">Experiences</h4>
                  {formData.experience.length > 0 ? (
                    <div className="space-y-2">
                      {formData.experience.map((exp, idx) => (
                        <div key={idx} className="p-3 bg-background rounded border">
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div><span className="font-semibold">Company:</span> {exp.company}</div>
                            <div><span className="font-semibold">Role:</span> {exp.role}</div>
                            <div><span className="font-semibold">Start Year:</span> {exp.start_year}</div>
                            <div><span className="font-semibold">End Year:</span> {exp.end_year}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No experience data extracted</p>
                  )}
                </div>

                {/* Educations */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-gray-700">Educations</h4>
                  {formData.education.length > 0 ? (
                    <div className="space-y-2">
                      {formData.education.map((edu, idx) => (
                        <div key={idx} className="p-3 bg-background rounded border">
                          <div className="grid grid-cols-3 gap-2 text-sm">
                            <div><span className="font-semibold">Degree:</span> {edu.degree}</div>
                            <div><span className="font-semibold">Institute:</span> {edu.institute}</div>
                            <div><span className="font-semibold">Passing Year:</span> {edu.passing_year}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No education data extracted</p>
                  )}
                </div>
              </div>

              {candidateId && (
                <div className="flex gap-3 pt-4">
                  <Button onClick={handleSave} size="lg" className="flex-1">
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </Button>
                  <Button
                    onClick={() => navigate(`/admin/candidates/${candidateId}`)}
                    variant="outline"
                    size="lg"
                  >
                    View Profile
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
