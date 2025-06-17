
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Users, Heart, MessageCircle, UserX, TrendingUp, Activity, Plus, Shield, Ban, Pause, Trash2, UserPlus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AdminStats {
  total_users: number;
  total_matches: number;
  total_likes: number;
  total_blocks: number;
  total_messages: number;
  active_users_today: number;
  new_users_this_week: number;
  matches_this_week: number;
  blocked_users: number;
  users_on_hold: number;
  total_admins: number;
}

interface User {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  account_status: string;
  is_admin: boolean;
  created_at: string;
}

interface AdminPageProps {
  currentUser: any;
  onUnauthorized: () => void;
}

const AdminPage = ({ currentUser, onUnauthorized }: AdminPageProps) => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [newAdmin, setNewAdmin] = useState({ email: '', password: '', name: '' });
  const [newMatch, setNewMatch] = useState({ user1: '', user2: '' });
  const { toast } = useToast();

  useEffect(() => {
    checkAdminStatus();
  }, [currentUser]);

  useEffect(() => {
    if (isAdmin) {
      fetchStats();
      fetchUsers();
      
      // Set up real-time subscriptions
      const profilesChannel = supabase
        .channel('admin-profiles')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
          fetchStats();
          fetchUsers();
        })
        .subscribe();

      const matchesChannel = supabase
        .channel('admin-matches')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => {
          fetchStats();
        })
        .subscribe();

      const likesChannel = supabase
        .channel('admin-likes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'likes' }, () => {
          fetchStats();
        })
        .subscribe();

      const chatsChannel = supabase
        .channel('admin-chats')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'chats' }, () => {
          fetchStats();
        })
        .subscribe();

      return () => {
        supabase.removeChannel(profilesChannel);
        supabase.removeChannel(matchesChannel);
        supabase.removeChannel(likesChannel);
        supabase.removeChannel(chatsChannel);
      };
    }
  }, [isAdmin]);

  const checkAdminStatus = async () => {
    if (!currentUser?.id) {
      onUnauthorized();
      return;
    }
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', currentUser.id)
        .single();
      
      if (error) throw error;
      
      if (!data?.is_admin) {
        onUnauthorized();
        return;
      }
      
      setIsAdmin(true);
    } catch (error) {
      console.error('Error checking admin status:', error);
      onUnauthorized();
    }
  };

  const fetchStats = async () => {
    try {
      const { data, error } = await supabase.rpc('get_app_stats');
      
      if (error) throw error;
      
      // Type cast with unknown first to fix TypeScript error
      setStats(data as unknown as AdminStats);
    } catch (error) {
      console.error('Error fetching admin stats:', error);
      toast({
        title: "Error",
        description: "Failed to fetch admin statistics",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, account_status, is_admin, created_at')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        title: "Error",
        description: "Failed to fetch users",
        variant: "destructive",
      });
    }
  };

  const updateAccountStatus = async (userId: string, status: string) => {
    try {
      const { error } = await supabase.rpc('admin_update_account_status', {
        target_user_id: userId,
        new_status: status
      });
      
      if (error) throw error;
      
      toast({
        title: "Success",
        description: `Account status updated to ${status}`,
      });
      
      fetchUsers();
    } catch (error) {
      console.error('Error updating account status:', error);
      toast({
        title: "Error",
        description: "Failed to update account status",
        variant: "destructive",
      });
    }
  };

  const createManualMatch = async () => {
    if (!newMatch.user1 || !newMatch.user2 || newMatch.user1 === newMatch.user2) {
      toast({
        title: "Error",
        description: "Please select two different users",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase.rpc('admin_create_match', {
        user1_id: newMatch.user1,
        user2_id: newMatch.user2
      });
      
      if (error) throw error;
      
      toast({
        title: "Success",
        description: "Manual match created successfully",
      });
      
      setNewMatch({ user1: '', user2: '' });
      fetchStats();
    } catch (error) {
      console.error('Error creating manual match:', error);
      toast({
        title: "Error",
        description: "Failed to create manual match",
        variant: "destructive",
      });
    }
  };

  const createNewAdmin = async () => {
    if (!newAdmin.email || !newAdmin.password || !newAdmin.name) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    try {
      // Create auth user
      const { data, error } = await supabase.auth.signUp({
        email: newAdmin.email,
        password: newAdmin.password,
        options: {
          data: {
            first_name: newAdmin.name.split(' ')[0] || newAdmin.name,
            last_name: newAdmin.name.split(' ').slice(1).join(' ') || '',
            is_admin: true
          }
        }
      });

      if (error) throw error;

      if (data.user) {
        // Update the profile to set admin status
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ is_admin: true })
          .eq('id', data.user.id);

        if (updateError) throw updateError;
      }
      
      toast({
        title: "Success",
        description: "New admin created successfully",
      });
      
      setNewAdmin({ email: '', password: '', name: '' });
      fetchUsers();
      fetchStats();
    } catch (error) {
      console.error('Error creating admin:', error);
      toast({
        title: "Error",
        description: "Failed to create admin user",
        variant: "destructive",
      });
    }
  };

  if (!isAdmin || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-50 to-purple-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-pink-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-purple-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <img 
              src="/lovable-uploads/ef9367e7-bcc2-40e6-8a31-b92465c0e20b.png" 
              alt="AfroVibe Logo" 
              className="w-12 h-12"
            />
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
                AfroVibe Admin Dashboard
              </h1>
              <p className="text-gray-600">Real-time application statistics and management</p>
            </div>
          </div>

          <div className="flex space-x-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button className="bg-pink-600 hover:bg-pink-700">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Admin
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Admin</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="adminName">Admin Name</Label>
                    <Input
                      id="adminName"
                      value={newAdmin.name}
                      onChange={(e) => setNewAdmin({ ...newAdmin, name: e.target.value })}
                      placeholder="Enter admin name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="adminEmail">Email</Label>
                    <Input
                      id="adminEmail"
                      type="email"
                      value={newAdmin.email}
                      onChange={(e) => setNewAdmin({ ...newAdmin, email: e.target.value })}
                      placeholder="Enter admin email"
                    />
                  </div>
                  <div>
                    <Label htmlFor="adminPassword">Password</Label>
                    <Input
                      id="adminPassword"
                      type="password"
                      value={newAdmin.password}
                      onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })}
                      placeholder="Enter admin password"
                    />
                  </div>
                  <Button onClick={createNewAdmin} className="w-full">
                    Create Admin
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <UserPlus className="w-4 h-4 mr-2" />
                  Manual Match
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Manual Match</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="user1">First User</Label>
                    <Select value={newMatch.user1} onValueChange={(value) => setNewMatch({ ...newMatch, user1: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select first user" />
                      </SelectTrigger>
                      <SelectContent>
                        {users.filter(u => u.account_status === 'active' && !u.is_admin).map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.first_name} {user.last_name} ({user.email})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="user2">Second User</Label>
                    <Select value={newMatch.user2} onValueChange={(value) => setNewMatch({ ...newMatch, user2: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select second user" />
                      </SelectTrigger>
                      <SelectContent>
                        {users.filter(u => u.account_status === 'active' && !u.is_admin && u.id !== newMatch.user1).map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.first_name} {user.last_name} ({user.email})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={createManualMatch} className="w-full">
                    Create Match
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="border-pink-200 shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-pink-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-pink-600">{stats?.total_users || 0}</div>
              <p className="text-xs text-gray-600">Active users</p>
            </CardContent>
          </Card>

          <Card className="border-purple-200 shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Matches</CardTitle>
              <Heart className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{stats?.total_matches || 0}</div>
              <p className="text-xs text-gray-600">Successful connections</p>
            </CardContent>
          </Card>

          <Card className="border-blue-200 shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Messages</CardTitle>
              <MessageCircle className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{stats?.total_messages || 0}</div>
              <p className="text-xs text-gray-600">Messages exchanged</p>
            </CardContent>
          </Card>

          <Card className="border-green-200 shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Today</CardTitle>
              <Activity className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats?.active_users_today || 0}</div>
              <p className="text-xs text-gray-600">Users active today</p>
            </CardContent>
          </Card>
        </div>

        {/* User Management Table */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>User Management</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>{user.first_name} {user.last_name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        user.account_status === 'active' ? 'bg-green-100 text-green-800' :
                        user.account_status === 'blocked' ? 'bg-red-100 text-red-800' :
                        user.account_status === 'on_hold' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {user.account_status}
                      </span>
                    </TableCell>
                    <TableCell>
                      {user.is_admin ? (
                        <span className="flex items-center text-purple-600">
                          <Shield className="w-4 h-4 mr-1" />
                          Admin
                        </span>
                      ) : 'User'}
                    </TableCell>
                    <TableCell>{new Date(user.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      {!user.is_admin && (
                        <div className="flex space-x-2">
                          {user.account_status === 'active' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => updateAccountStatus(user.id, 'on_hold')}
                              >
                                <Pause className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => updateAccountStatus(user.id, 'blocked')}
                              >
                                <Ban className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                          {user.account_status !== 'active' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateAccountStatus(user.id, 'active')}
                            >
                              Activate
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => updateAccountStatus(user.id, 'deleted')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminPage;
