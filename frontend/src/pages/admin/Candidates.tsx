import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Search,
  Users,
  FileText,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  Loader2,
  Eye,
  Filter,
  Download,
  Trash2,
  AlertTriangle,
  ArrowLeft
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Candidate {
  candidate_id: number;
  full_name: string;
  email: string;
  phone: string;
  location: string;
  skills: string[];
  years_of_experience: number;
  current_title: string;
  current_company: string;
  linkedin_url: string;
  github_url: string;
  gender?: string;
  created_at: string;
  resume_count?: number;
  latest_resume_status?: string;
}

export default function Candidates() {
  const navigate = useNavigate();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [experienceFilter, setExperienceFilter] = useState('all');
  const [error, setError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchCandidates();
  }, []);

  const fetchCandidates = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/candidates', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setCandidates(data.data || []);
      } else {
        setError('Failed to fetch candidates');
      }
    } catch (err) {
      console.error('Error fetching candidates:', err);
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAllResumes = async () => {
    setDeleting(true);
    setError('');

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/resumes/all', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        setCandidates([]);
        setShowDeleteConfirm(false);
        alert('✅ All resumes deleted successfully!');
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to delete resumes');
      }
    } catch (err) {
      console.error('Error deleting resumes:', err);
      setError('Network error. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const filteredCandidates = candidates.filter(candidate => {
    const matchesSearch = !searchTerm ||
      candidate.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      candidate.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      candidate.current_title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      candidate.skills?.some(skill => skill.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesExperience = experienceFilter === 'all' ||
      (experienceFilter === '0-2' && candidate.years_of_experience <= 2) ||
      (experienceFilter === '3-5' && candidate.years_of_experience >= 3 && candidate.years_of_experience <= 5) ||
      (experienceFilter === '5+' && candidate.years_of_experience > 5);

    return matchesSearch && matchesExperience;
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
        <Button variant="ghost" onClick={() => navigate('/admin/dashboard')} className="text-muted-foreground">
          <ArrowLeft className="mr-2 h-4 w-4" />
          {(() => { try { const t = localStorage.getItem('accessToken'); if (t) { const d = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); if (d.role === 'lead') return 'Back to Lead Panel'; } } catch (e) { } return 'Back to Admin Dashboard'; })()}
        </Button>
      </div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="h-8 w-8 text-blue-600" />
            <div>
              <h1 className="text-3xl font-bold">Candidates</h1>
              <p className="text-muted-foreground">
                {filteredCandidates.length} candidate{filteredCandidates.length !== 1 ? 's' : ''} found
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={candidates.length === 0}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete All Resumes
            </Button>
            <Button onClick={() => navigate('/admin/resumes')}>
              <FileText className="h-4 w-4 mr-2" />
              Upload Resume
            </Button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search by name, email, title, or skills..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="w-full md:w-48">
              <Select value={experienceFilter} onValueChange={setExperienceFilter}>
                <SelectTrigger>
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Experience" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Experience</SelectItem>
                  <SelectItem value="0-2">0-2 years</SelectItem>
                  <SelectItem value="3-5">3-5 years</SelectItem>
                  <SelectItem value="5+">5+ years</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error Message */}
      {error && (
        <Card className="mb-6 border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-600">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Candidates List */}
      {filteredCandidates.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Users className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No candidates found</h3>
              <p className="text-muted-foreground mb-4">
                {searchTerm || experienceFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Upload resumes to get started with AI-powered candidate parsing'}
              </p>
              <Button onClick={() => navigate('/admin/resumes')}>
                <FileText className="h-4 w-4 mr-2" />
                Upload First Resume
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredCandidates.map((candidate) => (
            <Card
              key={candidate.candidate_id}
              className="hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => navigate(`/candidate/${candidate.candidate_id}`)}
            >
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  {/* Avatar */}
                  {String(candidate.gender || '').toLowerCase().startsWith('m') ? (
                    <img
                      src="/avatars/avatar-1.png"
                      alt=""
                      className="w-16 h-16 rounded-full object-cover flex-shrink-0"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = '/avatars/default.png';
                      }}
                    />
                  ) : String(candidate.gender || '').toLowerCase().startsWith('f') ? (
                    <img
                      src="/avatars/avatar-5.png"
                      alt=""
                      className="w-16 h-16 rounded-full object-cover flex-shrink-0"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = '/avatars/default.png';
                      }}
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-semibold text-xl flex-shrink-0">
                      {candidate.full_name ? candidate.full_name.split(' ').map(n => n[0]).join('').slice(0, 2) : '?'}
                    </div>
                  )}

                  {/* Main Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="text-xl font-semibold text-foreground mb-1">
                          {candidate.full_name || 'Name not extracted'}
                        </h3>
                        {candidate.current_title && (
                          <p className="text-muted-foreground flex items-center gap-2">
                            <Briefcase className="h-4 w-4" />
                            {candidate.current_title}
                            {candidate.current_company && ` at ${candidate.current_company}`}
                          </p>
                        )}
                      </div>
                      {candidate.years_of_experience !== null && (
                        <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-blue-50 text-blue-700 border-transparent">
                          {candidate.years_of_experience} years exp.
                        </span>
                      )}
                    </div>

                    {/* Contact Info */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm text-muted-foreground mb-3">
                      {candidate.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-gray-400" />
                          <span className="truncate">{candidate.email}</span>
                        </div>
                      )}
                      {candidate.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-gray-400" />
                          <span>{candidate.phone}</span>
                        </div>
                      )}
                      {candidate.location && (
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-gray-400" />
                          <span>{candidate.location}</span>
                        </div>
                      )}
                    </div>

                    {/* Skills */}
                    {candidate.skills && candidate.skills.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {candidate.skills.slice(0, 10).map((skill, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold text-foreground text-xs bg-background"
                          >
                            {skill}
                          </span>
                        ))}
                        {candidate.skills.length > 10 && (
                          <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold text-foreground text-xs bg-gray-100">
                            +{candidate.skills.length - 10} more
                          </span>
                        )}
                      </div>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        Added {new Date(candidate.created_at).toLocaleDateString()}
                      </span>
                      <div className="flex gap-2">
                        {candidate.latest_resume_status && (
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${candidate.latest_resume_status === 'completed'
                              ? 'border-green-300 text-green-700 bg-green-50'
                              : candidate.latest_resume_status === 'pending'
                                ? 'border-yellow-300 text-yellow-700 bg-yellow-50'
                                : 'border-gray-300 text-gray-700 bg-background'
                              }`}
                          >
                            {candidate.latest_resume_status}
                          </span>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/candidate/${candidate.candidate_id}`);
                          }}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View Profile
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-6 w-6" />
                Delete All Resumes?
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <p className="text-gray-700">
                  This will permanently delete <strong>all {candidates.length} candidates</strong> and their resumes from the database.
                </p>
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm text-red-800 font-semibold">
                    ⚠️ This action cannot be undone!
                  </p>
                </div>
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                )}
                <div className="flex gap-3 justify-end">
                  <Button
                    variant="outline"
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={deleting}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleDeleteAllResumes}
                    disabled={deleting}
                  >
                    {deleting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Yes, Delete All
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
  );
}
