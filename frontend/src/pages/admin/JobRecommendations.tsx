/**
 * Job Recommendations Page
 * 
 * AI-powered candidate recommendations dashboard
 * Shows best-matching candidates for a job from the talent pool
 */

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { authenticatedFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import {
    Search,
    RefreshCw,
    Download,
    Eye,
    Check,
    X,
    Briefcase,
    MapPin,
    Clock,
    Award,
    TrendingUp,
    User,
    Mail,
    Phone,
    ArrowLeft,
} from "lucide-react";

interface Recommendation {
    candidate_id: number;
    full_name: string;
    email: string;
    phone: string;
    current_designation: string;
    current_company: string;
    total_experience_years: number;
    location: string;
    skills: string[];
    final_score: number;
    scores: {
        experience: number;
        skills: number;
        semantic: number;
        education: number;
        location: number;
        industry: number;
        recency: number;
    };
    matched_skills: string[];
    missing_skills: string[];
    explanation: string;
    status: string;
    recommended_at: string;
}

interface RecommendationStats {
    total: number;
    avg_score: number;
    by_status: Record<string, number>;
    by_bucket: Record<string, number>;
}

const JobRecommendationsPage: React.FC = () => {
    const { jobId } = useParams<{ jobId: string }>();
    const navigate = useNavigate();
    const { toast } = useToast();

    const [loading, setLoading] = useState(true);
    const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
    const [stats, setStats] = useState<RecommendationStats | null>(null);
    const [selectedCandidate, setSelectedCandidate] = useState<Recommendation | null>(null);
    const [detailOpen, setDetailOpen] = useState(false);

    // Filters
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [scoreFilter, setScoreFilter] = useState<string>("all");
    const [searchQuery, setSearchQuery] = useState("");

    // Pagination
    const [page, setPage] = useState(1);
    const [limit] = useState(20);
    const [total, setTotal] = useState(0);

    const fetchRecommendations = useCallback(async () => {
        if (!jobId) return;

        setLoading(true);
        try {
            const params = new URLSearchParams();
            params.append("limit", limit.toString());
            params.append("offset", ((page - 1) * limit).toString());
            if (statusFilter !== "all") {
                params.append("status", statusFilter);
            }

            const response = await authenticatedFetch(`/api/recommendations/${jobId}?${params}`);
            const data = await response.json();

            if (data.success) {
                setRecommendations(data.data);
                setTotal(data.total || data.data.length);
                if (data.stats) {
                    setStats(data.stats);
                }
            } else {
                throw new Error(data.error);
            }
        } catch (error: any) {
            console.error("Failed to fetch recommendations:", error);
            toast({
                title: "Error",
                description: "Failed to load recommendations",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    }, [jobId, page, statusFilter, limit, toast]);

    useEffect(() => {
        fetchRecommendations();
    }, [fetchRecommendations]);

    const handleRefresh = () => {
        toast({
            title: "Refreshing",
            description: "Generating new recommendations...",
        });
        // Trigger recommendation generation with automatic token refresh
        authenticatedFetch(`/api/recommendations/generate/${jobId}`, {
            method: "POST",
        })
            .then((res) => res.json())
            .then((data) => {
                if (data.success) {
                    toast({
                        title: "Generation Started",
                        description: "Recommendations are being generated in the background.",
                    });
                    setTimeout(fetchRecommendations, 5000);
                }
            })
            .catch((err) => {
                console.error("Failed to generate recommendations:", err);
            });
    };

    const handleStatusUpdate = async (candidateId: number, newStatus: string) => {
        try {
            const response = await authenticatedFetch(
                `/api/recommendations/${jobId}/candidate/${candidateId}/status`,
                {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status: newStatus }),
                }
            );
            const data = await response.json();

            if (data.success) {
                toast({
                    title: "Status Updated",
                    description: `Candidate status changed to ${newStatus}`,
                });
                fetchRecommendations();
            }
        } catch (error) {
            console.error("Failed to update status:", error);
            toast({
                title: "Error",
                description: "Failed to update candidate status",
                variant: "destructive",
            });
        }
    };

    const getScoreColor = (score: number) => {
        if (score >= 80) return "text-green-600 bg-green-100";
        if (score >= 60) return "text-yellow-600 bg-yellow-100";
        return "text-red-600 bg-red-100";
    };

    const filteredRecommendations = recommendations.filter((rec) => {
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            return (
                rec.full_name.toLowerCase().includes(query) ||
                rec.current_designation?.toLowerCase().includes(query) ||
                rec.skills.some((s) => s.toLowerCase().includes(query))
            );
        }
        if (scoreFilter !== "all") {
            if (scoreFilter === "hot" && rec.final_score < 80) return false;
            if (scoreFilter === "warm" && (rec.final_score < 60 || rec.final_score >= 80)) return false;
            if (scoreFilter === "cold" && rec.final_score >= 60) return false;
        }
        return true;
    });

    if (!jobId) {
        return <div>Invalid job ID</div>;
    }

    return (
        <div className="container mx-auto py-6">
            <div className="mb-4">
                <Button variant="ghost" onClick={() => navigate('/admin/dashboard')} className="text-muted-foreground -ml-4">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    {(() => { try { const t = localStorage.getItem('accessToken'); if (t) { const d = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); if (d.role === 'lead') return 'Back to Lead Panel'; } } catch(e) {} return 'Back to Admin Dashboard'; })()}
                </Button>
            </div>
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold">Candidate Recommendations</h1>
                    <p className="text-muted-foreground">
                        AI-powered matching from your talent pool
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={handleRefresh}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Refresh
                    </Button>
                    <Button variant="outline">
                        <Download className="w-4 h-4 mr-2" />
                        Export
                    </Button>
                </div>
            </div>

            {/* Stats Cards */}
            {stats && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">Total Candidates</p>
                                    <p className="text-2xl font-bold">{stats.total}</p>
                                </div>
                                <Briefcase className="h-8 w-8 text-muted-foreground" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">Avg Match Score</p>
                                    <p className="text-2xl font-bold">{stats.avg_score}%</p>
                                </div>
                                <TrendingUp className="h-8 w-8 text-green-500" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">Hot Matches</p>
                                    <p className="text-2xl font-bold">{stats.by_bucket?.hot || 0}</p>
                                </div>
                                <Award className="h-8 w-8 text-orange-500" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">Shortlisted</p>
                                    <p className="text-2xl font-bold">{stats.by_status?.shortlisted || 0}</p>
                                </div>
                                <Check className="h-8 w-8 text-blue-500" />
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Filters */}
            <Card className="mb-6">
                <CardContent className="pt-6">
                    <div className="flex flex-wrap gap-4 items-center">
                        <div className="flex-1 min-w-[200px]">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search by name, title, or skills..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-10"
                                />
                            </div>
                        </div>

                        <Select value={scoreFilter} onValueChange={setScoreFilter}>
                            <SelectTrigger className="w-[150px]">
                                <SelectValue placeholder="Score range" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Scores</SelectItem>
                                <SelectItem value="hot">Hot (80%+)</SelectItem>
                                <SelectItem value="warm">Warm (60-79%)</SelectItem>
                                <SelectItem value="cold">Cold (below 60%)</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-[150px]">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Status</SelectItem>
                                <SelectItem value="new">New</SelectItem>
                                <SelectItem value="viewed">Viewed</SelectItem>
                                <SelectItem value="shortlisted">Shortlisted</SelectItem>
                                <SelectItem value="rejected">Rejected</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            {/* Results */}
            {loading ? (
                <div className="space-y-4">
                    {[...Array(5)].map((_, i) => (
                        <Skeleton key={i} className="h-32 w-full" />
                    ))}
                </div>
            ) : filteredRecommendations.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center">
                        <Briefcase className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold mb-2">No recommendations found</h3>
                        <p className="text-muted-foreground mb-4">
                            {searchQuery || statusFilter !== "all" || scoreFilter !== "all"
                                ? "Try adjusting your filters"
                                : "Generate recommendations to see matching candidates"}
                        </p>
                        <Button onClick={handleRefresh}>
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Generate Recommendations
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-4">
                    {filteredRecommendations.map((rec) => (
                        <Card key={rec.candidate_id} className="hover:shadow-md transition-shadow">
                            <CardContent className="p-6">
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            <h3 className="text-lg font-semibold">{rec.full_name}</h3>
                                            <Badge className={getScoreColor(rec.final_score)}>
                                                {rec.final_score}% Match
                                            </Badge>
                                            <Badge variant="outline">{rec.status}</Badge>
                                        </div>

                                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-3">
                                            {rec.current_designation && (
                                                <span className="flex items-center gap-1">
                                                    <Briefcase className="h-4 w-4" />
                                                    {rec.current_designation}
                                                    {rec.current_company && ` at ${rec.current_company}`}
                                                </span>
                                            )}
                                            {rec.total_experience_years > 0 && (
                                                <span className="flex items-center gap-1">
                                                    <Clock className="h-4 w-4" />
                                                    {rec.total_experience_years} years
                                                </span>
                                            )}
                                            {rec.location && (
                                                <span className="flex items-center gap-1">
                                                    <MapPin className="h-4 w-4" />
                                                    {rec.location}
                                                </span>
                                            )}
                                        </div>

                                        {/* Skills */}
                                        <div className="flex flex-wrap gap-1 mb-3">
                                            {rec.matched_skills.slice(0, 5).map((skill) => (
                                                <Badge key={skill} variant="secondary" className="text-xs">
                                                    {skill}
                                                </Badge>
                                            ))}
                                            {rec.missing_skills.length > 0 && (
                                                <>
                                                    {rec.missing_skills.slice(0, 3).map((skill) => (
                                                        <Badge key={skill} variant="outline" className="text-xs text-red-500">
                                                            {skill}
                                                        </Badge>
                                                    ))}
                                                    {rec.missing_skills.length > 3 && (
                                                        <Badge variant="outline" className="text-xs">
                                                            +{rec.missing_skills.length - 3} more
                                                        </Badge>
                                                    )}
                                                </>
                                            )}
                                        </div>

                                        {/* Explanation */}
                                        <p className="text-sm text-muted-foreground line-clamp-2">
                                            {rec.explanation}
                                        </p>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex gap-2 ml-4">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                setSelectedCandidate(rec);
                                                setDetailOpen(true);
                                            }}
                                        >
                                            <Eye className="h-4 w-4 mr-1" />
                                            View
                                        </Button>
                                        <Button
                                            variant="default"
                                            size="sm"
                                            onClick={() => handleStatusUpdate(rec.candidate_id, "shortlisted")}
                                        >
                                            <Check className="h-4 w-4 mr-1" />
                                            Shortlist
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleStatusUpdate(rec.candidate_id, "rejected")}
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>

                                {/* Score Breakdown */}
                                <div className="mt-4 pt-4 border-t">
                                    <p className="text-xs text-muted-foreground mb-2">Score Breakdown</p>
                                    <div className="grid grid-cols-6 gap-2">
                                        {[
                                            { key: "experience", label: "Experience" },
                                            { key: "skills", label: "Skills" },
                                            { key: "semantic", label: "Semantic" },
                                            { key: "education", label: "Education" },
                                            { key: "location", label: "Location" },
                                            { key: "industry", label: "Industry" },
                                        ].map(({ key, label }) => (
                                            <div key={key} className="text-center">
                                                <div className="text-xs text-muted-foreground mb-1">{label}</div>
                                                <div className={`text-sm font-medium ${(rec.scores as any)[key] >= 80 ? "text-green-600" :
                                                    (rec.scores as any)[key] >= 60 ? "text-yellow-600" :
                                                        "text-red-600"
                                                    }`}>
                                                    {(rec.scores as any)[key]}%
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Pagination */}
            {filteredRecommendations.length > 0 && (
                <div className="flex justify-center gap-2 mt-6">
                    <Button
                        variant="outline"
                        onClick={() => setPage(page - 1)}
                        disabled={page === 1}
                    >
                        Previous
                    </Button>
                    <span className="flex items-center px-4">
                        Page {page} of {Math.ceil(total / limit)}
                    </span>
                    <Button
                        variant="outline"
                        onClick={() => setPage(page + 1)}
                        disabled={page >= Math.ceil(total / limit)}
                    >
                        Next
                    </Button>
                </div>
            )}

            {/* Detail Modal */}
            <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Candidate Details</DialogTitle>
                    </DialogHeader>
                    {selectedCandidate && (
                        <ScrollArea className="max-h-[70vh]">
                            <div className="space-y-6">
                                {/* Header */}
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h2 className="text-2xl font-bold">{selectedCandidate.full_name}</h2>
                                        <p className="text-muted-foreground">
                                            {selectedCandidate.current_designation}
                                            {selectedCandidate.current_company && ` at ${selectedCandidate.current_company}`}
                                        </p>
                                    </div>
                                    <Badge className={getScoreColor(selectedCandidate.final_score)}>
                                        {selectedCandidate.final_score}% Match
                                    </Badge>
                                </div>

                                {/* Contact */}
                                <div className="flex gap-4 text-sm">
                                    <span className="flex items-center gap-1">
                                        <Mail className="h-4 w-4" />
                                        {selectedCandidate.email}
                                    </span>
                                    {selectedCandidate.phone && (
                                        <span className="flex items-center gap-1">
                                            <Phone className="h-4 w-4" />
                                            {selectedCandidate.phone}
                                        </span>
                                    )}
                                    <span className="flex items-center gap-1">
                                        <MapPin className="h-4 w-4" />
                                        {selectedCandidate.location}
                                    </span>
                                </div>

                                {/* AI Explanation */}
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-base">AI Match Explanation</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <p>{selectedCandidate.explanation}</p>
                                    </CardContent>
                                </Card>

                                {/* Score Breakdown */}
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-base">Score Breakdown</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        {[
                                            { key: "experience", label: "Experience Match", weight: 25 },
                                            { key: "skills", label: "Skills Match", weight: 25 },
                                            { key: "semantic", label: "Semantic Similarity", weight: 20 },
                                            { key: "education", label: "Education Match", weight: 10 },
                                            { key: "location", label: "Location Match", weight: 10 },
                                            { key: "industry", label: "Industry Match", weight: 5 },
                                            { key: "recency", label: "Recency Score", weight: 5 },
                                        ].map(({ key, label, weight }) => (
                                            <div key={key}>
                                                <div className="flex justify-between text-sm mb-1">
                                                    <span>{label} ({weight}%)</span>
                                                    <span className="font-medium">
                                                        {(selectedCandidate.scores as any)[key]}%
                                                    </span>
                                                </div>
                                                <Progress
                                                    value={(selectedCandidate.scores as any)[key]}
                                                    className="h-2"
                                                />
                                            </div>
                                        ))}
                                    </CardContent>
                                </Card>

                                {/* Skills */}
                                <div>
                                    <h4 className="font-semibold mb-2">Skills</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {selectedCandidate.matched_skills.map((skill) => (
                                            <Badge key={skill} variant="secondary">
                                                {skill}
                                            </Badge>
                                        ))}
                                        {selectedCandidate.missing_skills.map((skill) => (
                                            <Badge key={skill} variant="outline" className="text-red-500">
                                                Missing: {skill}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex gap-2 pt-4 border-t">
                                    <Button
                                        className="flex-1"
                                        onClick={() => {
                                            handleStatusUpdate(selectedCandidate.candidate_id, "shortlisted");
                                            setDetailOpen(false);
                                        }}
                                    >
                                        <Check className="h-4 w-4 mr-2" />
                                        Shortlist
                                    </Button>
                                    <Button
                                        variant="outline"
                                        className="flex-1"
                                        onClick={() => {
                                            handleStatusUpdate(selectedCandidate.candidate_id, "rejected");
                                            setDetailOpen(false);
                                        }}
                                    >
                                        <X className="h-4 w-4 mr-2" />
                                        Reject
                                    </Button>
                                    <Button
                                        variant="outline"
                                        onClick={() => navigate(`/admin/candidates/${selectedCandidate.candidate_id}`)}
                                    >
                                        <User className="h-4 w-4 mr-2" />
                                        Full Profile
                                    </Button>
                                </div>
                            </div>
                        </ScrollArea>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default JobRecommendationsPage;
