import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Plus,
  Briefcase,
  MapPin,
  DollarSign,
  Users,
  Eye,
  Trash2,
  Search,
  Sparkles,
  Building,
  Loader2,
  ArrowLeft,
  CalendarDays,
  Clock,
  CheckCircle2
} from 'lucide-react';

interface Job {
  job_id: number;
  title: string;
  company: string;
  client_id?: number;
  client_name?: string;
  description: string;
  requirements?: string;
  skills?: string[];
  location?: string;
  employment_type?: string;
  experience_level?: string;
  salary_min?: number;
  salary_max?: number;
  remote_option?: boolean;
  status: string;
  posted_date: string;
  application_count?: number;
  match_count?: number;
}

interface JobFormData {
  title: string;
  company: string;
  client_id: string;
  description: string;
  requirements: string;
  skills: string;
  location: string;
  employment_type: string;
  experience_level: string;
  salary_min: string;
  salary_max: string;
  remote_option: string;
  assignment_type: 'specific';
  assigned_recruiters: string[];
  assigned_vendors: string[];
}

interface User {
  userid: number;
  email: string;
  role: string;
  status: string;
}

export default function Jobs() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [recruiters, setRecruiters] = useState<User[]>([]);
  const [vendors, setVendors] = useState<User[]>([]);
  const [clients, setClients] = useState<{ client_id: number; client_name: string; code?: string }[]>([]);

  // Admin → Recruiter assignment dialog state
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [assignJobId, setAssignJobId] = useState<number | null>(null);
  const [selectedRecruiterIds, setSelectedRecruiterIds] = useState<number[]>([]);
  const [updatingJobId, setUpdatingJobId] = useState<number | null>(null);

  const [formData, setFormData] = useState<JobFormData>({
    title: '',
    company: '',
    client_id: '',
    description: '',
    requirements: '',
    skills: '',
    location: '',
    employment_type: 'Full-time',
    experience_level: 'Mid-level',
    salary_min: '',
    salary_max: '',
    remote_option: 'false',
    assignment_type: 'specific',
    assigned_recruiters: [],
    assigned_vendors: []
  });

  useEffect(() => {
    fetchJobs();
    fetchUsers();
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/admin/clients', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) return;
      const data = await res.json();
      const list = data?.data ?? data ?? [];
      setClients(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error('Error fetching clients:', err);
    }
  };

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/admin/users/all', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setUsers(data);
        setRecruiters(data.filter((user: User) => user.role === 'recruiter' && user.status === 'active'));
        setVendors(data.filter((user: User) => user.role === 'vendor' && user.status === 'active'));
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const updateJobStatus = async (
    jobId: number,
    status: 'active' | 'on_hold' | 'closed'
  ) => {
    try {
      setUpdatingJobId(jobId);
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        await fetchJobs();
      } else {
        alert(data.error || 'Failed to update job status');
      }
    } catch (error) {
      console.error('Error updating job status:', error);
      alert('Network error. Please try again.');
    } finally {
      setUpdatingJobId(null);
    }
  };

  const handleAssignClick = async (job: Job) => {
    if (job.status !== 'active') {
      alert('Job must be active to assign recruiters.');
      return;
    }

    const jobId = job.job_id;
    setAssignJobId(jobId);
    setSelectedRecruiterIds([]);

    try {
      const token = localStorage.getItem('accessToken');
      const resp = await fetch(`/api/jobs/${jobId}/assignments/recruiters`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!resp.ok) {
        console.warn('Failed to load existing recruiter assignments');
      } else {
        const json = await resp.json().catch(() => ({}));
        const list = (json && json.data) || [];
        const alreadyAssignedIds = list
          .map((r: any) => r.assigned_to_user_id)
          .filter((id: any) => typeof id === 'number');
        setSelectedRecruiterIds(alreadyAssignedIds);
      }
    } catch (err) {
      console.error('Error fetching existing recruiter assignments:', err);
    }

    setIsAssignDialogOpen(true);
  };

  const handleToggleRecruiterSelection = (id: number, checked: boolean) => {
    setSelectedRecruiterIds(prev => checked ? [...prev, id] : prev.filter(rid => rid !== id));
  };

  const handleConfirmAssignRecruiters = async () => {
    if (!assignJobId) return;
    if (!selectedRecruiterIds.length) {
      alert('Please select at least one recruiter.');
      return;
    }

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/jobs/${assignJobId}/assign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          role: 'recruiter',
          user_ids: selectedRecruiterIds,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        alert((data as any).error || 'Failed to assign job');
        return;
      }

      alert('Job assigned to selected recruiters.');
      setIsAssignDialogOpen(false);
    } catch (err) {
      console.error('Error assigning job to recruiters:', err);
      alert('Network error. Please try again.');
    }
  };

  const fetchJobs = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/jobs', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setJobs(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleAssignmentTypeChange = () => {
    // assignment_type is locked to 'specific'
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const token = localStorage.getItem('accessToken');

      const payload = {
        title: formData.title,
        company: formData.company,
        client_id: formData.client_id ? parseInt(formData.client_id, 10) : null,
        description: formData.description,
        requirements: formData.requirements,
        skills: formData.skills ? formData.skills.split(',').map(s => s.trim()) : [],
        location: formData.location,
        employment_type: formData.employment_type,
        experience_level: formData.experience_level,
        salary_min: formData.salary_min ? parseInt(formData.salary_min) : null,
        salary_max: formData.salary_max ? parseInt(formData.salary_max) : null,
        remote_option: formData.remote_option === 'true',
        assignment_type: 'specific',
        assigned_recruiters: formData.assigned_recruiters.map(id => parseInt(id, 10)),
        assigned_vendors: formData.assigned_vendors.map(id => parseInt(id, 10))
      };

      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok) {
        alert('✅ Job posted successfully!');
        setIsDialogOpen(false);
        fetchJobs();
        // Trigger dashboard refresh
        localStorage.setItem('jobsUpdated', Date.now().toString());
        // Reset form
        setFormData({
          title: '',
          company: '',
          client_id: '',
          description: '',
          requirements: '',
          skills: '',
          location: '',
          employment_type: 'Full-time',
          experience_level: 'Mid-level',
          salary_min: '',
          salary_max: '',
          remote_option: 'false',
          assignment_type: 'specific',
          assigned_recruiters: [],
          assigned_vendors: []
        });
      } else {
        alert(data.error || 'Failed to post job');
      }
    } catch (error) {
      console.error('Error creating job:', error);
      alert('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (jobId: number) => {
    if (!confirm('Are you sure you want to delete this job?')) return;

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        alert('Job deleted successfully');
        fetchJobs();
      } else {
        alert('Failed to delete job');
      }
    } catch (error) {
      console.error('Error deleting job:', error);
      alert('Network error. Please try again.');
    }
  };

  const filteredJobs = jobs.filter(job => {
    const matchesSearch = !searchTerm ||
      job.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.company?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.description?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || job.status === statusFilter;

    let matchesDate = true;
    if (dateFilter) {
      try {
        const jobDate = new Date(job.posted_date).toISOString().split('T')[0];
        matchesDate = jobDate === dateFilter;
      } catch (e) {
        matchesDate = false;
      }
    }

    return matchesSearch && matchesStatus && matchesDate;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-4">
        <Button variant="ghost" onClick={() => navigate('/admin/dashboard')} className="text-muted-foreground -ml-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          {(() => { try { const t = localStorage.getItem('accessToken'); if (t) { const d = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); if (d.role === 'lead') return 'Back to Lead Panel'; } } catch(e) {} return 'Back to Admin Dashboard'; })()}
        </Button>
      </div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Briefcase className="h-8 w-8 text-blue-600" />
            <div>
              <h1 className="text-3xl font-bold">Job Postings</h1>
              <p className="text-muted-foreground">
                {filteredJobs.length} job{filteredJobs.length !== 1 ? 's' : ''} available
              </p>
            </div>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Post New Job
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Post New Job</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label htmlFor="title">Job Title *</Label>
                    <Input
                      id="title"
                      name="title"
                      value={formData.title}
                      onChange={handleInputChange}
                      placeholder="e.g., Senior React Developer"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="client_id">Select Client *</Label>
                    <Select
                      value={formData.client_id}
                      onValueChange={(value) => handleSelectChange('client_id', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose client" />
                      </SelectTrigger>
                      <SelectContent>
                        {clients.map((client) => (
                          <SelectItem key={client.client_id} value={String(client.client_id)}>
                            {client.client_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="location">Location</Label>
                    <Input
                      id="location"
                      name="location"
                      value={formData.location}
                      onChange={handleInputChange}
                      placeholder="e.g., San Francisco, CA"
                    />
                  </div>

                  <div className="col-span-2">
                    <Label htmlFor="description">Job Description *</Label>
                    <Textarea
                      id="description"
                      name="description"
                      value={formData.description}
                      onChange={handleInputChange}
                      placeholder="Describe the role, responsibilities, and what you're looking for..."
                      rows={4}
                      required
                    />
                  </div>

                  <div className="col-span-2">
                    <Label htmlFor="requirements">Requirements</Label>
                    <Textarea
                      id="requirements"
                      name="requirements"
                      value={formData.requirements}
                      onChange={handleInputChange}
                      placeholder="List the key requirements and qualifications..."
                      rows={3}
                    />
                  </div>

                  <div className="col-span-2">
                    <Label htmlFor="skills">Required Skills (comma-separated)</Label>
                    <Input
                      id="skills"
                      name="skills"
                      value={formData.skills}
                      onChange={handleInputChange}
                      placeholder="e.g., React, TypeScript, Node.js"
                    />
                  </div>

                  <div>
                    <Label htmlFor="employment_type">Employment Type</Label>
                    <Select
                      value={formData.employment_type}
                      onValueChange={(value) => handleSelectChange('employment_type', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Full-time">Full-time</SelectItem>
                        <SelectItem value="Part-time">Part-time</SelectItem>
                        <SelectItem value="Contract">Contract</SelectItem>
                        <SelectItem value="Internship">Internship</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="experience_level">Experience Level</Label>
                    <Select
                      value={formData.experience_level}
                      onValueChange={(value) => handleSelectChange('experience_level', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Entry-level">Entry-level</SelectItem>
                        <SelectItem value="Mid-level">Mid-level</SelectItem>
                        <SelectItem value="Senior">Senior</SelectItem>
                        <SelectItem value="Lead">Lead</SelectItem>
                        <SelectItem value="Executive">Executive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="salary_min">Min Salary ($)</Label>
                    <Input
                      id="salary_min"
                      name="salary_min"
                      type="number"
                      value={formData.salary_min}
                      onChange={handleInputChange}
                      placeholder="e.g., 80000"
                    />
                  </div>

                  <div>
                    <Label htmlFor="salary_max">Max Salary ($)</Label>
                    <Input
                      id="salary_max"
                      name="salary_max"
                      type="number"
                      value={formData.salary_max}
                      onChange={handleInputChange}
                      placeholder="e.g., 120000"
                    />
                  </div>

                  <div>
                    <Label htmlFor="remote_option">Remote Work</Label>
                    <Select
                      value={formData.remote_option}
                      onValueChange={(value) => handleSelectChange('remote_option', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Yes</SelectItem>
                        <SelectItem value="false">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="col-span-2">
                    <Label>Assignment Visibility</Label>
                    <Select
                      value={formData.assignment_type}
                      onValueChange={handleAssignmentTypeChange}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="specific">Specific Vendors/Recruiters</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Use the lists below to pick exactly who can see this job.
                    </p>
                  </div>

                  <div className="col-span-2">
                    <Label>Assign Recruiters</Label>
                    <div className="grid grid-cols-2 gap-2 mt-2 max-h-32 overflow-y-auto border rounded-md p-2">
                      {recruiters.map((recruiter) => (
                        <label key={recruiter.userid} className="flex items-center space-x-2 text-sm">
                          <input
                            type="checkbox"
                            checked={formData.assigned_recruiters.includes(recruiter.userid.toString())}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData(prev => ({
                                  ...prev,
                                  assigned_recruiters: [...prev.assigned_recruiters, recruiter.userid.toString()]
                                }));
                              } else {
                                setFormData(prev => ({
                                  ...prev,
                                  assigned_recruiters: prev.assigned_recruiters.filter(id => id !== recruiter.userid.toString())
                                }));
                              }
                            }}
                            className="rounded"
                          />
                          <span>{recruiter.email}</span>
                        </label>
                      ))}
                      {recruiters.length === 0 && (
                        <p className="text-muted-foreground text-sm col-span-2">No active recruiters found</p>
                      )}
                    </div>
                  </div>

                  <div className="col-span-2">
                    <Label>Assign Vendors</Label>
                    <div className="grid grid-cols-2 gap-2 mt-2 max-h-32 overflow-y-auto border rounded-md p-2">
                      {vendors.map((vendor) => (
                        <label key={vendor.userid} className="flex items-center space-x-2 text-sm">
                          <input
                            type="checkbox"
                            checked={formData.assigned_vendors.includes(vendor.userid.toString())}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData(prev => ({
                                  ...prev,
                                  assigned_vendors: [...prev.assigned_vendors, vendor.userid.toString()]
                                }));
                              } else {
                                setFormData(prev => ({
                                  ...prev,
                                  assigned_vendors: prev.assigned_vendors.filter(id => id !== vendor.userid.toString())
                                }));
                              }
                            }}
                            className="rounded"
                          />
                          <span>{vendor.email}</span>
                        </label>
                      ))}
                      {vendors.length === 0 && (
                        <p className="text-muted-foreground text-sm col-span-2">No active vendors found</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 justify-end pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Posting...
                      </>
                    ) : (
                      'Post Job'
                    )}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-6 shadow-sm border-slate-200">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search jobs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-10 w-full"
              />
            </div>

            <div className="w-full md:w-48">
              <Input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="h-10 w-full text-slate-600"
              />
            </div>

            <div className="w-full md:w-48">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="on_hold">On hold</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Job cards */}
      {filteredJobs.length === 0 ? (
        <div className="text-center text-muted-foreground mt-10">
          No jobs found. Try adjusting your filters or post a new job.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredJobs.map((job) => {
            const isActive = job.status === 'active';
            const isOnHold = job.status === 'on_hold';

            return (
              <Card key={job.job_id} className={`group relative overflow-hidden shadow-sm hover:shadow-md border-slate-200 hover:border-blue-200 transition-all duration-300 rounded-xl bg-white hover:-translate-y-0.5`}>

                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col md:flex-row md:justify-between items-start gap-4 mb-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <h2 className="text-lg sm:text-xl font-bold text-slate-800 group-hover:text-blue-600 transition-colors tracking-tight">
                          {job.title}
                        </h2>
                        <Badge variant="secondary" className="px-2 py-0.5 bg-slate-100 text-slate-600 hover:bg-slate-200 border-none font-medium shadow-sm tracking-tight text-[10px] uppercase">
                          {(job as any).client_name || job.company}
                        </Badge>
                        {isActive && (
                          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-green-700 bg-green-50 px-2 py-0.5 rounded-full border border-green-200/60 shadow-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                            Active
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs font-medium">
                        {job.location && (
                          <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-50 text-slate-600 border border-slate-100 shadow-sm">
                            <MapPin className="h-3.5 w-3.5 text-slate-400" />
                            {job.location}
                          </span>
                        )}
                        {job.employment_type && (
                          <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-50 text-slate-600 border border-slate-100 shadow-sm">
                            <Briefcase className="h-3.5 w-3.5 text-slate-400" />
                            {job.employment_type}
                          </span>
                        )}
                        {job.experience_level && (
                          <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-50 text-slate-600 border border-slate-100 shadow-sm">
                            <Building className="h-3.5 w-3.5 text-slate-400" />
                            {job.experience_level}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center justify-end w-full md:w-auto mt-2 md:mt-0">
                      <Select
                        value={job.status}
                        onValueChange={(value) =>
                          updateJobStatus(job.job_id, value as 'active' | 'on_hold' | 'closed')
                        }
                        disabled={updatingJobId === job.job_id}
                      >
                        <SelectTrigger className="w-[110px] h-8 bg-slate-50 border-slate-200 focus:ring-blue-500 rounded-lg text-xs font-medium shadow-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-lg border-slate-200 shadow-xl">
                          <SelectItem value="active" className="text-xs font-medium text-green-700 focus:bg-green-50 focus:text-green-800 cursor-pointer">Active</SelectItem>
                          <SelectItem value="on_hold" className="text-xs font-medium text-amber-700 focus:bg-amber-50 focus:text-amber-800 cursor-pointer">On hold</SelectItem>
                          <SelectItem value="closed" className="text-xs font-medium text-slate-700 focus:bg-slate-100 cursor-pointer">Closed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Skills */}
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {(() => {
                      const skillsArray = Array.isArray(job.skills)
                        ? job.skills
                        : typeof job.skills === 'string'
                          ? job.skills.split(',').map((s: string) => s.replace(/["[\]{}]/g, '').trim()).filter(Boolean)
                          : [];

                      return (
                        <>
                          {skillsArray.slice(0, 5).map((skill: string, idx: number) => (
                            <span key={idx} className="inline-flex items-center px-2 py-1 rounded-md text-[11px] font-medium bg-white border border-slate-200 text-slate-600 shadow-sm hover:border-slate-300 hover:bg-slate-50 transition-colors">
                              {skill}
                            </span>
                          ))}
                          {skillsArray.length > 5 && (
                            <span className="inline-flex items-center px-2 py-1 rounded-md text-[11px] font-bold bg-slate-100 border border-slate-200 text-slate-500 shadow-sm">
                              +{skillsArray.length - 5} more
                            </span>
                          )}
                        </>
                      );
                    })()}
                  </div>

                  {/* Footer */}
                  <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-3 pt-3.5 border-t border-slate-100">
                    <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs sm:text-sm text-slate-500 font-medium w-full xl:w-auto">
                      <span className="flex items-center gap-1.5 min-w-max hover:text-slate-800 transition-colors cursor-default">
                        <Users className="h-4 w-4 text-slate-400" />
                        {job.application_count ?? (job as any).total_applicants ?? (job as any).totalApplicants ?? 0} Applications
                      </span>
                      {job.match_count !== undefined && job.match_count > 0 && (
                        <span className="flex items-center gap-1.5 min-w-max text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100/50 shadow-sm">
                          <Sparkles className="h-3.5 w-3.5" />
                          {job.match_count} Matches
                        </span>
                      )}
                      <span className="flex items-center gap-1.5 min-w-max hover:text-slate-800 transition-colors cursor-default">
                        <Clock className="h-4 w-4 text-slate-400" />
                        Posted {new Date(job.posted_date).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="flex gap-2 flex-wrap items-center justify-start xl:justify-end w-full xl:w-auto mt-1 xl:mt-0">
                      <Button
                        variant="default"
                        size="sm"
                        disabled={!isActive}
                        onClick={() => handleAssignClick(job)}
                        className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow-md font-medium h-8 px-4 rounded-lg transition-all text-xs"
                      >
                        Assign Job
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/jobs/${job.job_id}`)}
                        className="font-medium shadow-sm hover:shadow-md hover:bg-slate-50 h-8 px-3 rounded-lg border-slate-200 transition-all text-slate-700 text-xs"
                      >
                        <Eye className="h-3.5 w-3.5 mr-1 text-slate-500" />
                        View
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/admin/jobs/${job.job_id}/applications`)}
                        className="font-medium shadow-sm hover:shadow-md hover:bg-slate-50 h-8 px-3 rounded-lg border-slate-200 transition-all text-slate-700 text-xs"
                      >
                        <Users className="h-3.5 w-3.5 mr-1 text-slate-500" />
                        Applicants
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(job.job_id)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 ml-auto xl:ml-0 h-8 w-8 rounded-lg transition-all"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Admin → Recruiter Assign Dialog */}
      <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Assign Job to Recruiters</DialogTitle>
          </DialogHeader>
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Select one or more recruiters who should see this job.
            </p>
            <div className="max-h-64 overflow-y-auto border rounded-md p-2 space-y-1 text-sm">
              {recruiters.map((r) => (
                <label key={r.userid} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={selectedRecruiterIds.includes(r.userid)}
                    onChange={(e) => handleToggleRecruiterSelection(r.userid, e.target.checked)}
                  />
                  <span>{r.email}</span>
                </label>
              ))}
              {recruiters.length === 0 && (
                <p className="text-muted-foreground">No active recruiters available.</p>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAssignDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="button" onClick={handleConfirmAssignRecruiters}>
                Assign
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
