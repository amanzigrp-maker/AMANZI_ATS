import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authenticatedFetch } from '@/lib/api';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, RefreshCw } from 'lucide-react';

interface ActiveSessionUser {
  userid: number;
  email: string;
  active_sessions: number;
}

export default function ActiveSessions() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<ActiveSessionUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();

  const fetchActiveSessions = async () => {
    setIsRefreshing(true);
    try {
      const response = await authenticatedFetch('/api/admin/sessions/active');
      if (!response.ok) {
        throw new Error('Failed to fetch active sessions');
      }
      const data = await response.json();
      setUsers(data);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchActiveSessions();
    
    // Auto-refresh every 10 seconds
    const interval = setInterval(() => {
      fetchActiveSessions();
    }, 10000);
    
    return () => clearInterval(interval);
  }, []);

  const handleLockAccount = async (userId: number) => {
    try {
      const response = await authenticatedFetch(`/api/admin/users/${userId}/lock`, { method: 'POST' });
      if (!response.ok) throw new Error('Failed to lock account');
      toast({ title: '✅ Success', description: 'User account has been locked.' });
    } catch (err) {
      toast({ title: '❌ Error', description: 'Could not lock account.', variant: 'destructive' });
    }
  };

  const handleRevokeSessions = async (userId: number) => {
    try {
      const response = await authenticatedFetch(`/api/admin/users/${userId}/revoke-tokens`, { method: 'POST' });
      if (!response.ok) throw new Error('Failed to revoke sessions');
      const data = await response.json();
      toast({ title: '✅ Success', description: data.message });
      fetchActiveSessions();
    } catch (err) {
      toast({ title: '❌ Error', description: 'Could not revoke sessions.', variant: 'destructive' });
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <Button 
          onClick={() => navigate('/admin/dashboard')} 
          variant="outline"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {(() => { try { const t = localStorage.getItem('accessToken'); if (t) { const d = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); if (d.role === 'lead') return 'Back to Lead Panel'; } } catch(e) {} return 'Back to Admin Dashboard'; })()}
        </Button>
        
        <div className="flex items-center gap-4">
          {lastUpdated && (
            <span className="text-sm text-muted-foreground">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <Button 
            onClick={fetchActiveSessions} 
            variant="outline"
            size="sm"
            disabled={isRefreshing}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>
      
      <h1 className="text-3xl font-bold mb-6">Users with Multiple Active Sessions</h1>
      <p className="text-sm text-muted-foreground mb-4">
        🔄 Auto-refreshes every 10 seconds
      </p>
      {error && <p className="text-red-500 bg-red-100 p-4 rounded-md mb-4">{error}</p>}
      <div className="bg-card rounded-lg shadow-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User Email</TableHead>
              <TableHead>Active Sessions</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.userid}>
                <TableCell>{user.email}</TableCell>
                <TableCell>{user.active_sessions}</TableCell>
                <TableCell className="space-x-2">
                  <Button onClick={() => handleLockAccount(user.userid)} variant="destructive" size="sm">Lock Account</Button>
                  <Button onClick={() => handleRevokeSessions(user.userid)} variant="outline" size="sm">Revoke Sessions</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
