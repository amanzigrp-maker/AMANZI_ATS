import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  TrendingUp,
  TrendingDown,
  Users,
  Briefcase,
  Clock,
  Search,
  Target,
  BarChart3,
  Activity,
  Loader2,
  Download,
  ArrowLeft
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface KPIData {
  date: string;
  resumes_uploaded: number;
  resumes_parsed: number;
  avg_processing_time: number;
}

interface JobPerformance {
  job_id: number;
  total_matches: number;
  avg_score: number;
  max_score: number;
  median_score: number;
  avg_matched_skills: number;
  avg_processing_time: number;
}

interface TimeToHire {
  avg_days: number;
  median_days: number;
  min_days: number;
  max_days: number;
  total_hires: number;
}

interface SearchAnalytics {
  query_type: string;
  total_searches: number;
  avg_results: number;
  avg_response_time: number;
  p95_response_time: number;
}

interface SourceMetrics {
  source: string;
  total_candidates: number;
  avg_quality_score: number;
  total_matches: number;
}

export default function Analytics() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [kpis, setKpis] = useState<KPIData[]>([]);
  const [jobPerformance, setJobPerformance] = useState<JobPerformance[]>([]);
  const [timeToHire, setTimeToHire] = useState<TimeToHire | null>(null);
  const [searchAnalytics, setSearchAnalytics] = useState<SearchAnalytics[]>([]);
  const [sourceMetrics, setSourceMetrics] = useState<SourceMetrics[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetchAnalytics();
  }, [days]);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/dashboard/complete?days=${days}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Map PostgreSQL data to component state
        const overview = data.data.overview;
        setKpis(data.data.upload_trends || []);
        setJobPerformance(data.data.job_performance || []);
        setTimeToHire(data.data.time_to_hire || null);
        setSearchAnalytics(data.data.search_analytics || []);
        setSourceMetrics(data.data.source_metrics || []);
      } else {
        setError(data.error || 'Failed to load analytics');
      }
    } catch (err) {
      console.error('Analytics fetch error:', err);
      setError('Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = async (reportType: string) => {
    setExporting(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/admin/reports/export?type=${reportType}&days=${days}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${reportType}_report_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to export report');
      }
    } catch (err) {
      setError('Network error during export');
    } finally {
      setExporting(false);
    }
  };

  const calculateTrend = (data: KPIData[]) => {
    if (data.length < 2) return { value: 0, direction: 'neutral' };
    const recent = data.slice(0, 7).reduce((sum, d) => sum + d.resumes_uploaded, 0);
    const previous = data.slice(7, 14).reduce((sum, d) => sum + d.resumes_uploaded, 0);
    const change = previous > 0 ? ((recent - previous) / previous) * 100 : 0;
    return {
      value: Math.abs(change).toFixed(1),
      direction: change > 0 ? 'up' : change < 0 ? 'down' : 'neutral'
    };
  };

  const trend = calculateTrend(kpis);
  const totalResumes = kpis.reduce((sum, d) => sum + d.resumes_uploaded, 0);
  const totalParsed = kpis.reduce((sum, d) => sum + d.resumes_parsed, 0);
  const avgProcessingTime = kpis.length > 0
    ? (kpis.reduce((sum, d) => sum + d.avg_processing_time, 0) / kpis.length).toFixed(0)
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="pt-6">
            <div className="text-center">
              <Activity className="h-12 w-12 text-orange-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-orange-900 mb-2">
                Analytics Service Unavailable
              </h3>
              <p className="text-orange-700 mb-4">{error}</p>
              <p className="text-sm text-orange-600">
                Check your database connection and try again
              </p>
            </div>
          </CardContent>
        </Card>
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
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <BarChart3 className="h-8 w-8 text-blue-600" />
              Recruitment Analytics
            </h1>
            <p className="text-muted-foreground mt-2">
              Real-time insights from your recruitment data
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => exportToCSV('resumes')}
              disabled={exporting}
              variant="outline"
              className="flex items-center gap-2"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Export Resumes CSV
            </Button>
            <Button
              onClick={() => exportToCSV('jobs')}
              disabled={exporting}
              variant="outline"
              className="flex items-center gap-2"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Export Jobs CSV
            </Button>
            <Button
              onClick={() => exportToCSV('analytics')}
              disabled={exporting}
              variant="outline"
              className="flex items-center gap-2"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Export Analytics CSV
            </Button>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          {[7, 30, 90].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${days === d
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
            >
              {d} Days
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Resumes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-3xl font-bold">{totalResumes}</div>
                <div className="flex items-center gap-1 text-sm mt-1">
                  {trend.direction === 'up' && (
                    <>
                      <TrendingUp className="h-4 w-4 text-green-600" />
                      <span className="text-green-600">+{trend.value}%</span>
                    </>
                  )}
                  {trend.direction === 'down' && (
                    <>
                      <TrendingDown className="h-4 w-4 text-red-600" />
                      <span className="text-red-600">-{trend.value}%</span>
                    </>
                  )}
                  <span className="text-muted-foreground">vs last period</span>
                </div>
              </div>
              <Users className="h-10 w-10 text-blue-100" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Successfully Parsed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-3xl font-bold">{totalParsed}</div>
                <div className="text-sm text-muted-foreground mt-1">
                  {totalResumes > 0 ? ((totalParsed / totalResumes) * 100).toFixed(1) : 0}% success rate
                </div>
              </div>
              <Target className="h-10 w-10 text-green-100" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg Processing Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-3xl font-bold">{avgProcessingTime}ms</div>
                <div className="text-sm text-muted-foreground mt-1">
                  AI parsing speed
                </div>
              </div>
              <Clock className="h-10 w-10 text-purple-100" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Time to Hire
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-3xl font-bold">
                  {timeToHire ? timeToHire.avg_days.toFixed(0) : 0}
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  days average
                </div>
              </div>
              <Briefcase className="h-10 w-10 text-orange-100" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for Detailed Analytics */}
      <Tabs defaultValue="jobs" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="jobs">Job Performance</TabsTrigger>
          <TabsTrigger value="sources">Candidate Sources</TabsTrigger>
          <TabsTrigger value="search">Search Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="jobs">
          <Card>
            <CardHeader>
              <CardTitle>Job Performance Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              {jobPerformance.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No job performance data available</p>
              ) : (
                <div className="space-y-3">
                  {jobPerformance.slice(0, 10).map((job) => (
                    <div key={job.job_id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-semibold">Job ID: {job.job_id}</div>
                        <Badge>{job.total_matches} matches</Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <div className="text-muted-foreground">Avg Score</div>
                          <div className="font-semibold text-lg">
                            {job.avg_score.toFixed(1)}%
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Max Score</div>
                          <div className="font-semibold text-lg">
                            {job.max_score.toFixed(1)}%
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Avg Skills Matched</div>
                          <div className="font-semibold text-lg">
                            {job.avg_matched_skills.toFixed(1)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sources">
          <Card>
            <CardHeader>
              <CardTitle>Candidate Source Quality</CardTitle>
            </CardHeader>
            <CardContent>
              {sourceMetrics.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No source data available</p>
              ) : (
                <div className="space-y-3">
                  {sourceMetrics.map((source) => (
                    <div key={source.source} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-semibold">{source.source || 'Unknown'}</div>
                        <Badge variant="outline">{source.total_candidates} candidates</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <div className="text-muted-foreground">Avg Quality Score</div>
                          <div className="font-semibold text-lg">
                            {source.avg_quality_score.toFixed(1)}%
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Total Matches</div>
                          <div className="font-semibold text-lg">
                            {source.total_matches}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="search">
          <Card>
            <CardHeader>
              <CardTitle>Search Performance</CardTitle>
            </CardHeader>
            <CardContent>
              {searchAnalytics.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No search data available</p>
              ) : (
                <div className="space-y-3">
                  {searchAnalytics.map((search) => (
                    <div key={search.query_type} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-semibold flex items-center gap-2">
                          <Search className="h-4 w-4" />
                          {search.query_type}
                        </div>
                        <Badge>{search.total_searches} searches</Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <div className="text-muted-foreground">Avg Results</div>
                          <div className="font-semibold text-lg">
                            {search.avg_results.toFixed(1)}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Avg Response Time</div>
                          <div className="font-semibold text-lg">
                            {search.avg_response_time.toFixed(0)}ms
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">P95 Response</div>
                          <div className="font-semibold text-lg">
                            {search.p95_response_time.toFixed(0)}ms
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
