import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { authenticatedFetch } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, User, Building, Calendar, FileText, MessageSquare, Mail, Phone } from 'lucide-react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreVertical, CheckCircle, XCircle } from 'lucide-react';

interface JobApplication {
  application_id: number;
  job_id: number;
  application_type: 'vendor' | 'candidate';
  status: string;
  cover_letter?: string;
  proposed_candidates?: any[];
  applied_date: string;
  notes?: string;
  applicant_email: string;
  applicant_name: string;
  candidate_name?: string;
  current_title?: string;
  candidate_skills?: string[];
  uploaded_by_name?: string;
  uploaded_by_email?: string;
  uploaded_by_role?: 'vendor' | 'recruiter' | 'admin';
  gender?: string;
}

const getConsistentAvatar = (name: string, gender?: string) => {
  const g = (gender || '').toLowerCase();
  if (g === 'female' || g === 'f') return '/avatars/avatar-5.png';
  if (g === 'male' || g === 'm') return '/avatars/avatar-1.png';

  const avatars = [
    '/avatars/avatar-1.png',
    '/avatars/avatar-2.png',
    '/avatars/avatar-3.png',
    '/avatars/avatar-4.png',
    '/avatars/avatar-5.png',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % avatars.length;
  return avatars[index];
};

interface Job {
  job_id: number;
  title: string;
  company: string;
  location: string;
  employment_type: string;
  posted_date: string;
}

const JobApplicants: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedStatusId, setExpandedStatusId] = useState<number | null>(null);
  const [uploadingForAppId, setUploadingForAppId] = useState<number | null>(null);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState<JobApplication | null>(null);
  const [newStatus, setNewStatus] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const { toast } = useToast();

  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const statusFilter = (searchParams.get('status') || '').toLowerCase();

  const filteredApplications = useMemo(() => {
    if (!statusFilter) return applications;
    // Map simple filters to underlying statuses
    if (statusFilter === 'interview') {
      return applications.filter((a) =>
        ['interview_l1', 'interview_l2', 'interview_l3', 'interview_scheduled', 'interviewed'].includes((a.status || '').toLowerCase())
      );
    }
    if (statusFilter === 'offered') {
      return applications.filter((a) => (a.status || '').toLowerCase() === 'offered');
    }
    if (statusFilter === 'joined') {
      return applications.filter((a) => (a.status || '').toLowerCase() === 'joined');
    }
    return applications;
  }, [applications, statusFilter]);

  useEffect(() => {
    if (id) {
      fetchJobDetails();
      fetchApplications();
    }
  }, [id]);

  const fetchJobDetails = async () => {
    try {
      const response = await authenticatedFetch(`/api/jobs/${id}`);
      if (response.ok) {
        const data = await response.json();
        setJob(data.data);
      }
    } catch (error) {
      console.error('Error fetching job details:', error);
    }
  };

  const fetchApplications = async () => {
    try {
      // Use the same endpoint as the recruiter dashboard modal:
      // GET /api/applications/jobs/:jobId
      const response = await authenticatedFetch(`/api/applications/jobs/${id}`);
      if (response.ok) {
        const data = await response.json();
        setApplications(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching applications:', error);
    } finally {
      setLoading(false);
    }
  };

  const uploadModifiedCvForApplication = async (application: JobApplication, file: File) => {
    const role = String(localStorage.getItem('userRole') || '').toLowerCase();
    if (role && role !== 'admin' && role !== 'recruiter' && role !== 'lead') return;

    if (application.application_type !== 'candidate') {
      alert('Modified CV upload is available only for direct candidate applications.');
      return;
    }

    const jobId = Number(application.job_id);
    const candidateId = Number((application as any).candidate_id);
    if (!Number.isInteger(jobId) || !Number.isInteger(candidateId)) {
      alert('Candidate ID not found for this application.');
      return;
    }

    setUploadingForAppId(application.application_id);
    try {
      const token = localStorage.getItem('accessToken');
      const form = new FormData();
      form.append('resume', file);
      form.append('job_id', String(jobId));
      form.append('candidate_id', String(candidateId));

      const res = await fetch('/api/resumes/upload-modified', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(payload?.error || payload?.message || 'Upload failed');
        return;
      }

      await fetchApplications();
      alert('Modified CV uploaded');
    } catch (e: any) {
      alert(e?.message || 'Upload failed');
    } finally {
      setUploadingForAppId(null);
    }
  };
  
  const handleStatusUpdate = (application: JobApplication) => {
    setSelectedApplication(application);
    setNewStatus(application.status || '');
    setAdminNotes(application.notes || '');
    setIsStatusModalOpen(true);
  };

  const submitStatusUpdate = async () => {
    if (!selectedApplication) return;

    setIsUpdating(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/applications/${selectedApplication.application_id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: newStatus,
          notes: adminNotes,
        }),
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Application status updated successfully.',
        });
        setIsStatusModalOpen(false);
        fetchApplications();
      } else {
        const data = await response.json();
        throw new Error(data.message || 'Failed to update status');
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update status',
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'vendor_applied': 'bg-blue-100 text-blue-800',
      'vendor_reviewing': 'bg-yellow-100 text-yellow-800',
      'vendor_shortlisted': 'bg-green-100 text-green-800',
      'vendor_rejected': 'bg-red-100 text-red-800',
      'profile_share': 'bg-blue-100 text-blue-800',
      'screen_selected': 'bg-indigo-100 text-indigo-800',
      'interview_l1': 'bg-purple-100 text-purple-800',
      'interview_l2': 'bg-purple-100 text-purple-800',
      'interview_l3': 'bg-purple-100 text-purple-800',
      'offered': 'bg-emerald-100 text-emerald-800',
      'joined': 'bg-green-100 text-green-800',
      'rejected': 'bg-red-100 text-red-800',
      'backout': 'bg-orange-100 text-orange-800',
      'bg_status': 'bg-cyan-100 text-cyan-800',
      // backward compatibility
      'applied': 'bg-blue-100 text-blue-800',
      'screening': 'bg-yellow-100 text-yellow-800',
      'selected': 'bg-green-100 text-green-800',
      'accepted': 'bg-green-200 text-green-900',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getStatusText = (status: string) => {
    const statusMap: Record<string, string> = {
      'vendor_applied': 'Vendor Applied',
      'vendor_reviewing': 'Under Review',
      'vendor_shortlisted': 'Shortlisted',
      'vendor_rejected': 'Rejected',
      'profile_share': 'Profile Share',
      'screen_selected': 'Screen Selected',
      'interview_l1': 'Interview L1',
      'interview_l2': 'Interview L2',
      'interview_l3': 'L3 Interview',
      'offered': 'Offered',
      'rejected': 'Rejected',
      'backout': 'Backout',
      'bg_status': 'BG Status',
      'joined': 'Joined'
    };
    return statusMap[status] || status.charAt(0).toUpperCase() + status.slice(1);
  };

  const getApplicationTypeIcon = (type: string) =>
    type === 'vendor' ? <Building className="h-4 w-4" /> : <User className="h-4 w-4" />;

  const parseArrayField = (field: string[] | string | null): string[] => {
    if (!field) return [];
    if (Array.isArray(field)) return field;
    if (typeof field === 'string') {
      try {
        return JSON.parse(field);
      } catch {
        return field.split(',').map(item => item.trim()).filter(Boolean);
      }
    }
    return [];
  };

  // Timeline helpers: map backend status to a simple timeline status
  type TimelineStatus = 'pending' | 'screening' | 'interviewed' | 'accepted' | 'rejected' | 'offered';

  const mapStatusToTimeline = (status: string): TimelineStatus => {
    const s = (status || '').toLowerCase();
    if (s === 'vendor_applied' || s === 'applied' || s === 'profile_share' || !s) return 'pending';
    if (s === 'screening' || s === 'vendor_reviewing' || s === 'review' || s === 'screen_selected') return 'screening';
    if (s === 'interview_scheduled' || s === 'interviewed' || s.startsWith('interview_')) return 'interviewed';
    if (s === 'selected' || s === 'accepted' || s === 'joined' || s === 'bg_status') return 'accepted';
    if (s === 'rejected' || s === 'vendor_rejected' || s === 'backout') return 'rejected';
    if (s === 'offered' || s === 'offer') return 'offered';
    return 'pending';
  };

  const getTimelineStepIndex = (timelineStatus: TimelineStatus) => {
    if (timelineStatus === 'pending') return 0;
    if (timelineStatus === 'screening') return 1;
    if (timelineStatus === 'interviewed' || timelineStatus === 'accepted' || timelineStatus === 'rejected') return 2;
    if (timelineStatus === 'offered') return 3;
    return 0;
  };

  const getTimelineStepClasses = (index: number, timelineStatus: TimelineStatus) => {
    const currentIndex = getTimelineStepIndex(timelineStatus);
    if (index < currentIndex || index === currentIndex) {
      return 'border-blue-500 bg-blue-50 text-blue-700';
    }
    return 'border-border bg-card text-gray-700';
  };

  const getTimelineDecisionClasses = (timelineStatus: TimelineStatus) => {
    if (timelineStatus === 'rejected') {
      return 'border-red-500 bg-red-50 text-red-700';
    }
    if (timelineStatus === 'accepted') {
      return 'border-green-500 bg-green-50 text-green-700';
    }
    const idx = getTimelineStepIndex(timelineStatus);
    if (idx >= 2) {
      return 'border-blue-500 bg-blue-50 text-blue-700';
    }
    return 'border-border bg-card text-gray-700';
  };

  const getTimelineConnectorClasses = (index: number, timelineStatus: TimelineStatus) => {
    const currentIndex = getTimelineStepIndex(timelineStatus);
    return index < currentIndex ? 'bg-blue-500' : 'bg-gray-200';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading applicants...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 animate-fade-in">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <h1 className="text-xl font-bold text-foreground">Job Applicants</h1>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Job Header */}
        {job && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="text-2xl">{job.title}</CardTitle>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>{job.company}</span>
                <span>•</span>
                <span>{job.location}</span>
                <span>•</span>
                <span>{job.employment_type}</span>
                <span>•</span>
                <span>Posted: {new Date(job.posted_date).toLocaleDateString()}</span>
              </div>
            </CardHeader>
          </Card>
        )}

        <div className="mb-6">
          <h2 className="text-2xl font-bold text-foreground mb-2">Applications</h2>
          <p className="text-muted-foreground">
            {filteredApplications.length} application(s) shown
            {statusFilter === 'interview' && ' (interview pipeline only)'}
            {statusFilter === 'offered' && ' (offered candidates only)'}
          </p>
        </div>

        {/* Applications List */}
        {filteredApplications.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-muted-foreground text-lg">No applications received yet</p>
              <p className="text-gray-400">
                Applications will appear here when candidates apply for this job.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6">
            {filteredApplications.map((application) => (
              <Card key={application.application_id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-4 flex-1">
                      <Avatar className="w-12 h-12 border border-border">
                        <AvatarImage
                          src={getConsistentAvatar(application.applicant_name || application.candidate_name || 'U', application.gender)}
                          className="object-cover"
                        />
                        <AvatarFallback className="bg-slate-100 text-muted-foreground font-semibold text-sm">
                          {(application.applicant_name || application.candidate_name || 'U').split(' ').map(n => n[0]).join('')}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {getApplicationTypeIcon(application.application_type)}
                          <span className="font-semibold">
                            {application.application_type === 'vendor'
                              ? 'Vendor Application'
                              : 'Direct Application'}
                          </span>
                          <Badge className={getStatusColor(application.status)}>
                            {getStatusText(application.status)}
                          </Badge>
                        </div>
                        <h3 className="font-semibold text-foreground text-lg">
                          {application.applicant_name || application.candidate_name || 'Unknown'}
                        </h3>
                        {application.current_title && (
                          <p className="text-sm text-muted-foreground mb-1">{application.current_title}</p>
                        )}
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {application.applicant_email}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Applied {new Date(application.applied_date).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          Uploaded by:{' '}
                          {application.uploaded_by_name
                            ? `${application.uploaded_by_name} (${application.uploaded_by_role})`
                            : application.uploaded_by_email
                              ? application.uploaded_by_email
                              : 'Candidate (Self)'}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {application.cover_letter && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Cover Letter</h4>
                        <p className="text-sm text-muted-foreground bg-background p-3 rounded-md">
                          {application.cover_letter}
                        </p>
                      </div>
                    )}

                    {application.proposed_candidates && application.proposed_candidates.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Proposed Candidates</h4>
                        <div className="bg-blue-50 p-3 rounded-md">
                          <p className="text-sm text-blue-800 mb-2">
                            {application.proposed_candidates.length} candidate(s) proposed
                          </p>
                          <ul className="text-sm text-blue-700 space-y-1">
                            {application.proposed_candidates.slice(0, 5).map((candidate, index) => (
                              <li key={index} className="flex items-center gap-2">
                                <User className="h-3 w-3" />
                                {typeof candidate === 'string'
                                  ? candidate
                                  : candidate.name || 'Unnamed candidate'}
                              </li>
                            ))}
                            {application.proposed_candidates.length > 5 && (
                              <li className="text-blue-600 font-medium">
                                ... and {application.proposed_candidates.length - 5} more
                              </li>
                            )}
                          </ul>
                        </div>
                      </div>
                    )}

                    {application.candidate_skills && parseArrayField(application.candidate_skills).length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Skills</h4>
                        <div className="flex flex-wrap gap-1">
                          {parseArrayField(application.candidate_skills).slice(0, 8).map((skill, index) => (
                            <Badge key={index} variant="outline" className="text-xs bg-background">
                              {skill}
                            </Badge>
                          ))}
                          {parseArrayField(application.candidate_skills).length > 8 && (
                            <Badge variant="outline" className="text-xs bg-gray-100">
                              +{parseArrayField(application.candidate_skills).length - 8} more
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}

                    {application.notes && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
                        <h4 className="text-sm font-medium text-yellow-800 mb-1">Admin Notes</h4>
                        <p className="text-sm text-yellow-700">{application.notes}</p>
                      </div>
                    )}

                    <div className="flex justify-between items-center pt-3 border-t border-gray-100">
                      <span className="text-xs text-muted-foreground">
                        Application ID: {application.application_id}
                      </span>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm">
                          <MessageSquare className="h-4 w-4 mr-1" />
                          Contact
                        </Button>
                        <input
                          id={`modified-cv-${application.application_id}`}
                          type="file"
                          accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.bmp,.tiff"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void uploadModifiedCvForApplication(application, f);
                            e.currentTarget.value = '';
                          }}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={uploadingForAppId === application.application_id}
                          onClick={() => {
                            const el = document.getElementById(`modified-cv-${application.application_id}`) as HTMLInputElement | null;
                            el?.click();
                          }}
                        >
                          <FileText className="h-4 w-4 mr-1" />
                          {uploadingForAppId === application.application_id ? 'Uploading…' : 'Upload Modified CV'}
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleStatusUpdate(application)}
                          className="border-blue-200 hover:bg-blue-50 text-blue-700"
                        >
                          <MessageSquare className="h-4 w-4 mr-1" />
                          Update Status
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setExpandedStatusId((prev) =>
                              prev === application.application_id ? null : application.application_id
                            )
                          }
                        >
                          {expandedStatusId === application.application_id ? 'Hide Status' : 'Show Status'}
                        </Button>
                      </div>
                    </div>
                  </div>
                  {expandedStatusId === application.application_id && (
                    <div className="mt-4 pt-4 border-t border-gray-100 animate-scale-in">
                      <p className="text-xs text-muted-foreground mb-2">Application Status Timeline</p>
                      {(() => {
                        const timelineStatus = mapStatusToTimeline(application.status);
                        return (
                          <div className="flex items-center justify-between gap-4">
                            {/* Step 1: Pending */}
                            <div className="flex-1 flex flex-col items-center">
                              <div
                                className={`w-full max-w-[140px] border rounded-lg px-3 py-1.5 text-center text-xs font-medium ${getTimelineStepClasses(
                                  0,
                                  timelineStatus
                                )}`}
                              >
                                Pending
                              </div>
                            </div>

                            <div
                              className={`h-0.5 flex-1 ${getTimelineConnectorClasses(0, timelineStatus)}`}
                            ></div>

                            {/* Step 2: Screening */}
                            <div className="flex-1 flex flex-col items-center">
                              <div
                                className={`w-full max-w-[140px] border rounded-lg px-3 py-1.5 text-center text-xs font-medium ${getTimelineStepClasses(
                                  1,
                                  timelineStatus
                                )}`}
                              >
                                Screening
                              </div>
                            </div>

                            <div
                              className={`h-0.5 flex-1 ${getTimelineConnectorClasses(1, timelineStatus)}`}
                            ></div>

                            {/* Step 3: Interviewed / Accepted / Rejected */}
                            <div className="flex-1 flex flex-col items-center">
                              <div
                                className={`w-full max-w-[170px] border rounded-lg px-3 py-1.5 text-center text-xs font-medium ${getTimelineDecisionClasses(
                                  timelineStatus
                                )}`}
                              >
                                {timelineStatus === 'rejected'
                                  ? 'Rejected'
                                  : timelineStatus === 'accepted'
                                    ? 'Accepted'
                                    : 'Interviewed'}
                              </div>
                            </div>

                            <div
                              className={`h-0.5 flex-1 ${getTimelineConnectorClasses(2, timelineStatus)}`}
                            ></div>

                            {/* Step 4: Offered */}
                            <div className="flex-1 flex flex-col items-center">
                              <div
                                className={`w-full max-w-[140px] border rounded-lg px-3 py-1.5 text-center text-xs font-medium ${getTimelineStepClasses(
                                  3,
                                  timelineStatus
                                )}`}
                              >
                                Offered
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Status Update Modal */}
      <Dialog open={isStatusModalOpen} onOpenChange={setIsStatusModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Update Application Status</DialogTitle>
          </DialogHeader>

          {selectedApplication && (
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Applicant</Label>
                <p className="text-sm text-muted-foreground">
                  {selectedApplication.applicant_name || selectedApplication.candidate_name || selectedApplication.applicant_email}
                </p>
              </div>

              <div>
                <Label htmlFor="status">Status</Label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedApplication.application_type === 'vendor' ? (
                      <>
                        <SelectItem value="vendor_applied">Applied</SelectItem>
                        <SelectItem value="vendor_reviewing">Under Review</SelectItem>
                        <SelectItem value="vendor_shortlisted">Shortlisted</SelectItem>
                        <SelectItem value="vendor_rejected">Rejected</SelectItem>
                      </>
                    ) : (
                      <>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="applied">Applied</SelectItem>
                        <SelectItem value="profile_share">Profile Share</SelectItem>
                        <SelectItem value="screen_selected">Screen Selected</SelectItem>
                        <SelectItem value="interview_l1">Interview L1</SelectItem>
                        <SelectItem value="interview_l2">Interview L2</SelectItem>
                        <SelectItem value="interview_l3">L3 Interview</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                        <SelectItem value="offered">Offered</SelectItem>
                        <SelectItem value="backout">Backout</SelectItem>
                        <SelectItem value="bg_status">BG Status</SelectItem>
                        <SelectItem value="joined">Joined</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="notes">Admin Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Add notes about this application..."
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <Button variant="outline" onClick={() => setIsStatusModalOpen(false)} disabled={isUpdating}>
                  Cancel
                </Button>
                <Button onClick={submitStatusUpdate} disabled={isUpdating} className="bg-blue-600 hover:bg-blue-700 text-white">
                  {isUpdating ? 'Updating...' : 'Update Status'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default JobApplicants;
