import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  ArrowLeft,
  Sparkles, 
  Users, 
  TrendingUp,
  Award,
  Briefcase,
  GraduationCap,
  CheckCircle,
  XCircle,
  Mail,
  Phone,
  MapPin,
  Loader2,
  Eye
} from 'lucide-react';

interface CandidateMatch {
  match_id: number;
  candidate_id: number;
  full_name: string;
  email: string;
  phone: string;
  location: string;
  current_title: string;
  current_company: string;
  skills: string[];
  years_of_experience: number;
  linkedin_url: string;
  overall_score: number;
  semantic_similarity_score: number;
  skills_match_score: number;
  experience_match_score: number;
  education_match_score: number;
  matched_skills: string[];
  missing_skills: string[];
  match_explanation: string;
  created_at: string;
}

interface Job {
  job_id: number;
  title: string;
  company: string;
  description: string;
  skills: string[];
  experience_level: string;
  location: string;
}

export default function JobMatches() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [matches, setMatches] = useState<CandidateMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [minScore, setMinScore] = useState(50);

  useEffect(() => {
    if (jobId) {
      fetchJobAndMatches();
    }
  }, [jobId]);

  const fetchJobAndMatches = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      
      // Fetch job details
      const jobResponse = await fetch(`/api/jobs/${jobId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (jobResponse.ok) {
        const jobData = await jobResponse.json();
        setJob(jobData.data);
      }

      // Fetch matches
      const matchesResponse = await fetch(`/api/jobs/${jobId}/matches?minScore=${minScore}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (matchesResponse.ok) {
        const matchesData = await matchesResponse.json();
        setMatches(matchesData.data || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-blue-600';
    if (score >= 40) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 80) return 'bg-green-100';
    if (score >= 60) return 'bg-blue-100';
    if (score >= 40) return 'bg-yellow-100';
    return 'bg-red-100';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <XCircle className="h-16 w-16 text-red-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Job Not Found</h3>
              <Button onClick={() => navigate('/admin/jobs')}>
                Back to Jobs
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="sm" onClick={() => navigate('/admin/jobs')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <div>
                <h1 className="text-xl font-bold text-foreground">{job.title}</h1>
                <p className="text-sm text-muted-foreground">{job.company}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blue-600" />
              <span className="font-semibold">{matches.length} AI Matches</span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Job Overview */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              Job Requirements
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <p className="text-sm text-muted-foreground">Experience Level</p>
                <p className="font-semibold">{job.experience_level || 'Not specified'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Location</p>
                <p className="font-semibold">{job.location || 'Not specified'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Required Skills</p>
                <p className="font-semibold">{job.skills?.length || 0} skills</p>
              </div>
            </div>
            {job.skills && job.skills.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {job.skills.map((skill, idx) => (
                  <Badge key={idx} variant="outline" className="bg-blue-50">
                    {skill}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Matches */}
        {matches.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-12">
                <Users className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">No Matches Found</h3>
                <p className="text-muted-foreground mb-4">
                  No candidates match the criteria for this job yet.
                  Upload more resumes or adjust matching parameters.
                </p>
                <Button onClick={() => navigate('/admin/resumes')}>
                  Upload Resumes
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold">Top Matched Candidates</h2>
              <Badge variant="secondary" className="text-sm">
                Showing {matches.length} matches
              </Badge>
            </div>

            {matches.map((match) => (
              <Card key={match.match_id} className="hover:shadow-lg transition-shadow">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    {/* Avatar */}
                    <div className={`w-20 h-20 rounded-full ${getScoreBgColor(match.overall_score)} flex items-center justify-center flex-shrink-0`}>
                      <div className="text-center">
                        <div className={`text-2xl font-bold ${getScoreColor(match.overall_score)}`}>
                          {Math.round(match.overall_score)}
                        </div>
                        <div className="text-xs text-muted-foreground">Match</div>
                      </div>
                    </div>

                    <div className="flex-1">
                      {/* Header */}
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="text-xl font-semibold text-foreground mb-1">
                            {match.full_name}
                          </h3>
                          {match.current_title && (
                            <p className="text-muted-foreground flex items-center gap-2">
                              <Briefcase className="h-4 w-4" />
                              {match.current_title}
                              {match.current_company && ` at ${match.current_company}`}
                            </p>
                          )}
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => navigate(`/candidate/${match.candidate_id}`)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View Profile
                        </Button>
                      </div>

                      {/* Contact Info */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm text-muted-foreground mb-4">
                        {match.email && (
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4 text-gray-400" />
                            <span className="truncate">{match.email}</span>
                          </div>
                        )}
                        {match.phone && (
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-gray-400" />
                            <span>{match.phone}</span>
                          </div>
                        )}
                        {match.location && (
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-gray-400" />
                            <span>{match.location}</span>
                          </div>
                        )}
                      </div>

                      {/* Scoring Details */}
                      <Tabs defaultValue="overview" className="w-full">
                        <TabsList className="grid w-full grid-cols-4 mb-4">
                          <TabsTrigger value="overview">Overview</TabsTrigger>
                          <TabsTrigger value="skills">Skills</TabsTrigger>
                          <TabsTrigger value="scores">Scores</TabsTrigger>
                          <TabsTrigger value="explanation">AI Analysis</TabsTrigger>
                        </TabsList>

                        <TabsContent value="overview" className="space-y-3">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Overall Match</p>
                              <div className={`text-2xl font-bold ${getScoreColor(match.overall_score)}`}>
                                {Math.round(match.overall_score)}%
                              </div>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Skills Match</p>
                              <div className={`text-2xl font-bold ${getScoreColor(match.skills_match_score)}`}>
                                {Math.round(match.skills_match_score)}%
                              </div>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Experience</p>
                              <div className={`text-2xl font-bold ${getScoreColor(match.experience_match_score)}`}>
                                {Math.round(match.experience_match_score)}%
                              </div>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">AI Semantic</p>
                              <div className={`text-2xl font-bold ${getScoreColor(match.semantic_similarity_score)}`}>
                                {Math.round(match.semantic_similarity_score)}%
                              </div>
                            </div>
                          </div>
                        </TabsContent>

                        <TabsContent value="skills" className="space-y-3">
                          {match.matched_skills && match.matched_skills.length > 0 && (
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <CheckCircle className="h-4 w-4 text-green-600" />
                                <h4 className="font-semibold text-green-900">
                                  Matched Skills ({match.matched_skills.length})
                                </h4>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {match.matched_skills.map((skill, idx) => (
                                  <Badge key={idx} className="bg-green-100 text-green-800">
                                    {skill}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {match.missing_skills && match.missing_skills.length > 0 && (
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <XCircle className="h-4 w-4 text-red-600" />
                                <h4 className="font-semibold text-red-900">
                                  Missing Skills ({match.missing_skills.length})
                                </h4>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {match.missing_skills.map((skill, idx) => (
                                  <Badge key={idx} variant="outline" className="bg-red-50 text-red-700">
                                    {skill}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </TabsContent>

                        <TabsContent value="scores" className="space-y-3">
                          <div className="space-y-3">
                            <div>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="flex items-center gap-2">
                                  <Sparkles className="h-4 w-4" />
                                  Semantic Similarity
                                </span>
                                <span className="font-semibold">
                                  {Math.round(match.semantic_similarity_score)}%
                                </span>
                              </div>
                              <Progress value={match.semantic_similarity_score} />
                            </div>
                            
                            <div>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="flex items-center gap-2">
                                  <Award className="h-4 w-4" />
                                  Skills Match
                                </span>
                                <span className="font-semibold">
                                  {Math.round(match.skills_match_score)}%
                                </span>
                              </div>
                              <Progress value={match.skills_match_score} />
                            </div>
                            
                            <div>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="flex items-center gap-2">
                                  <Briefcase className="h-4 w-4" />
                                  Experience Match
                                </span>
                                <span className="font-semibold">
                                  {Math.round(match.experience_match_score)}%
                                </span>
                              </div>
                              <Progress value={match.experience_match_score} />
                            </div>
                            
                            <div>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="flex items-center gap-2">
                                  <GraduationCap className="h-4 w-4" />
                                  Education Match
                                </span>
                                <span className="font-semibold">
                                  {Math.round(match.education_match_score)}%
                                </span>
                              </div>
                              <Progress value={match.education_match_score} />
                            </div>
                          </div>
                        </TabsContent>

                        <TabsContent value="explanation">
                          {match.match_explanation ? (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                              <div className="flex items-start gap-2">
                                <Sparkles className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                                <div>
                                  <h4 className="font-semibold text-blue-900 mb-2">
                                    AI Analysis
                                  </h4>
                                  <p className="text-sm text-blue-800 leading-relaxed">
                                    {match.match_explanation}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <p className="text-muted-foreground text-sm">
                              AI analysis not available for this match
                            </p>
                          )}
                        </TabsContent>
                      </Tabs>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
