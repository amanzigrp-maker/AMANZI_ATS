import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authenticatedFetch } from '@/lib/api';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft } from 'lucide-react';

interface FailedLoginUser {
  userid: number;
  email: string;
  failed_attempts: number;
}

export default function FailedLogins() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<FailedLoginUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchFailedLogins = async () => {
    try {
      const response = await authenticatedFetch('/api/admin/logins/failed');
      if (!response.ok) {
        throw new Error('Failed to fetch failed logins');
      }
      const data = await response.json();
      setUsers(data);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      }
    }
  };

  useEffect(() => {
    fetchFailedLogins();
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
    } catch (err) {
      toast({ title: '❌ Error', description: 'Could not revoke sessions.', variant: 'destructive' });
    }
  };

  return (
    <div className="p-8">
      <Button 
        onClick={() => navigate('/admin/dashboard')} 
        variant="outline" 
        className="mb-6"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        {(() => { try { const t = localStorage.getItem('accessToken'); if (t) { const d = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); if (d.role === 'lead') return 'Back to Lead Panel'; } } catch(e) {} return 'Back to Admin Dashboard'; })()}
      </Button>
      <h1 className="text-3xl font-bold mb-6">Suspicious Failed Logins (Last 24h)</h1>
      {error && <p className="text-red-500 bg-red-100 p-4 rounded-md">{error}</p>}
      <div className="bg-card rounded-lg shadow-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User Email</TableHead>
              <TableHead>Failed Attempts</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.userid}>
                <TableCell>{user.email}</TableCell>
                <TableCell>{user.failed_attempts}</TableCell>
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
