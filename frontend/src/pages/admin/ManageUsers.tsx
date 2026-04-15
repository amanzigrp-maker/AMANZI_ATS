import { useEffect, useState } from 'react';
import { jwtDecode } from 'jwt-decode';
import { useNavigate } from 'react-router-dom';
import { authenticatedFetch } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { KeyRound, ArrowLeft, Eye, EyeOff } from 'lucide-react';

interface User {
  userid: number;
  email: string;
  role: string;
  status: string;
  createdat: string;
  lastlogin: string | null;
  created_by?: number | null;
  creator_email?: string | null;
}

interface DecodedToken {
  id: number;
  role: string;
}

export default function ManageUsers() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loggedInUserId, setLoggedInUserId] = useState<number | null>(null);
  const [loggedInUserRole, setLoggedInUserRole] = useState<string | null>(null);
  const [resetPasswordDialogOpen, setResetPasswordDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [leads, setLeads] = useState<User[]>([]);
  const { toast } = useToast();

  const fetchUsers = async () => {
    try {
      const response = await authenticatedFetch('/api/admin/users/all');
      if (!response.ok) throw new Error('Failed to fetch users');
      const data = await response.json();
      setUsers(data);
      // Populate leads for re-assignment dropdown
      setLeads(data.filter((u: User) => u.role === 'lead'));
    } catch (err) {
      if (err instanceof Error) setError(err.message);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      const decoded: DecodedToken = jwtDecode(token);
      setLoggedInUserId(decoded.id);
      setLoggedInUserRole(decoded.role);
    }
    fetchUsers();
  }, []);

  const handleRoleChange = async (userId: number, newRole: string) => {
    try {
      const response = await authenticatedFetch(`/api/admin/users/${userId}/role`, {
        method: 'PUT',
        body: JSON.stringify({ role: newRole }),
      });
      if (!response.ok) throw new Error('Failed to update role');
      toast({ title: '✅ Role Updated', description: 'User role has been successfully updated.' });
      fetchUsers();
    } catch (err) {
      if (err instanceof Error) toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleLeadAssignment = async (userId: number, leadId: string) => {
    try {
      const response = await authenticatedFetch(`/api/admin/users/${userId}/assignment`, {
        method: 'PUT',
        body: JSON.stringify({ leadId: parseInt(leadId, 10) }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to update assignment');
      }
      toast({ title: '✅ Assignment Updated', description: 'User assigned to new lead successfully.' });
      fetchUsers();
    } catch (err) {
      if (err instanceof Error) toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleDeleteUser = async (userId: number) => {
    try {
      const response = await authenticatedFetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete user');
      toast({ title: '✅ User Disabled', description: 'The user has been successfully disabled.' });
      fetchUsers();
    } catch (err) {
      if (err instanceof Error) toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleReactivateUser = async (userId: number) => {
    try {
      const response = await authenticatedFetch(`/api/admin/users/${userId}/enable`, {
        method: 'PUT',
      });
      if (!response.ok) throw new Error('Failed to reactivate user');
      toast({ title: '✅ User Reactivated', description: 'The user has been successfully reactivated.' });
      fetchUsers();
    } catch (err) {
      if (err instanceof Error) toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleLockUser = async (userId: number) => {
    try {
      const response = await authenticatedFetch(`/api/admin/users/${userId}/lock`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to lock user');
      toast({ title: '✅ User Locked', description: 'The user account has been locked.' });
      fetchUsers();
    } catch (err) {
      if (err instanceof Error) toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleUnlockUser = async (userId: number) => {
    try {
      const response = await authenticatedFetch(`/api/admin/users/${userId}/unlock`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to unlock user');
      toast({ title: '✅ User Unlocked', description: 'The user account has been unlocked.' });
      fetchUsers();
    } catch (err) {
      if (err instanceof Error) toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleResetPassword = async () => {
    if (!selectedUser) return;
    if (newPassword.length < 8) {
      toast({ title: 'Error', description: 'Password must be at least 8 characters long.', variant: 'destructive' });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({ title: 'Error', description: 'Passwords do not match.', variant: 'destructive' });
      return;
    }

    setIsResetting(true);
    try {
      const response = await authenticatedFetch(`/api/admin/reset-password/${selectedUser.userid}`, {
        method: 'PUT',
        body: JSON.stringify({ newPassword }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to reset password');
      }

      toast({
        title: '✅ Password Reset',
        description: `Password has been successfully reset for ${selectedUser.email}. A confirmation email has been sent to the user.`
      });

      setResetPasswordDialogOpen(false);
      setSelectedUser(null);
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      if (err instanceof Error) {
        toast({ title: 'Error', description: err.message, variant: 'destructive' });
      }
    } finally {
      setIsResetting(false);
    }
  };

  const openResetPasswordDialog = (user: User) => {
    setSelectedUser(user);
    setNewPassword('');
    setConfirmPassword('');
    setResetPasswordDialogOpen(true);
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
      <h1 className="text-3xl font-bold mb-6">Manage Users</h1>
      {error && <p className="text-red-500 bg-red-100 p-4 rounded-md">{error}</p>}
      <div className="bg-card rounded-lg shadow-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Assigned Lead</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.userid}>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  <Select value={user.role} onValueChange={(newRole) => handleRoleChange(user.userid, newRole)} disabled={user.userid === loggedInUserId}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {loggedInUserRole !== 'lead' && <SelectItem value="admin">Admin</SelectItem>}
                      <SelectItem value="recruiter">Recruiter</SelectItem>
                      <SelectItem value="vendor">Vendor</SelectItem>
                      {loggedInUserRole !== 'lead' && <SelectItem value="lead">Lead</SelectItem>}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  {loggedInUserRole === 'admin' && (user.role === 'recruiter' || user.role === 'vendor') ? (
                    <Select 
                      value={user.created_by?.toString() || "none"} 
                      onValueChange={(val) => handleLeadAssignment(user.userid, val)}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Unassigned</SelectItem>
                        {leads.map((lead) => (
                          <SelectItem key={lead.userid} value={lead.userid.toString()}>
                            {lead.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-sm text-muted-foreground italic">
                      {user.creator_email || (user.role === 'lead' ? 'N/A' : 'Unassigned')}
                    </span>
                  )}
                </TableCell>
                <TableCell>{user.status}</TableCell>
                <TableCell>{new Date(user.createdat).toLocaleDateString()}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    {user.status === 'disabled' ? (
                      <Button variant="default" size="sm" onClick={() => handleReactivateUser(user.userid)}>
                        Reactivate
                      </Button>
                    ) : user.status === 'blocked' ? (
                      <Button variant="default" size="sm" onClick={() => handleUnlockUser(user.userid)}>
                        Unlock Account
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openResetPasswordDialog(user)}
                          className="flex items-center gap-1"
                        >
                          <KeyRound className="w-4 h-4" />
                          Reset Password
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleLockUser(user.userid)}
                          disabled={user.userid === loggedInUserId}
                          className="border-orange-500 text-orange-600 hover:bg-orange-50"
                        >
                          Lock Account
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="sm" disabled={user.userid === loggedInUserId}>Disable</Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will disable the user account. The user will not be able to log in, but their data will be preserved and can be restored later.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeleteUser(user.userid)}>Disable</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Password Reset Dialog */}
      <Dialog open={resetPasswordDialogOpen} onOpenChange={setResetPasswordDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5" />
              Reset Password
            </DialogTitle>
            <DialogDescription>
              Reset password for <strong>{selectedUser?.email}</strong>. The user will receive a confirmation email.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="new-password">New Password</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNewPassword ? "text" : "password"}
                  placeholder="Enter new password (min 8 characters)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={isResetting}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
                >
                  {showNewPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isResetting}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setResetPasswordDialogOpen(false)}
              disabled={isResetting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleResetPassword}
              disabled={isResetting || !newPassword || !confirmPassword}
            >
              {isResetting ? 'Resetting...' : 'Reset Password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
