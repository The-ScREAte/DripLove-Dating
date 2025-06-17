
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Users, Heart, MessageCircle, UserX, TrendingUp, Activity, Plus, Search, Shield, Ban, Pause, Trash2, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface AdminStats {
  total_users: number;
  total_matches: number;
  total_likes: number;
  total_blocks: number;
  total_messages: number;
  active_users_today: number;
  new_users_this_week: number;
  matches_this_week: number;
}

interface UserProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  account_status: string;
  created_at: string;
  is_admin: boolean;
}

const AdminPage = () => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [showCreateAdmin, setShowCreateAdmin] = useState(false);
  const [showManualMatch, setShowManualMatch] = useState(false);
  const [newAdmin, setNewAdmin] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: ''
  });
  const [matchUsers, setMatchUsers] = useState({
    user1: '',
    user2: ''
  });
  const { toast } = useToast();

  useEffect(() => {
    checkAdminAccess();
  }, []);

  useEffect(() => {
    if (isAuthorized) {
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
  }, [isAuthorized]);

  useEffect(() => {
    if (searchTerm) {
      const filtered = users.filter(user => 
        user.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredUsers(filtered);
    } else {
      setFilteredUsers(users);
    }
  }, [searchTerm, users]);

  const checkAdminAccess = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.user) {
        setLoading(false);
        return;
      }

      setCurrentUser(session.user);

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', session.user.id)
        .single();

      if (error || !profile?.is_admin) {
        toast({
          title: "Access Denied",
          description: "You don't have admin privileges",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      setIsAuthorized(true);
    } catch (error) {
      console.error('Error checking admin access:', error);
      toast({
        title: "Error",
        description: "Failed to verify admin access",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const { data, error } = await supabase.rpc('get_app_stats');
      
      if (error) throw error;
      
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        const statsData: AdminStats = {
          total_users: Number(data.total_users) || 0,
          total_matches: Number(data.total_matches) || 0,
          total_likes: Number(data.total_likes) || 0,
          total_blocks: Number(data.total_blocks) || 0,
          total_messages: Number(data.total_messages) || 0,
          active_users_today: Number(data.active_users_today) || 0,
          new_users_this_week: Number(data.new_users_this_week) || 0,
          matches_this_week: Number(data.matches_this_week) || 0,
        };
        setStats(statsData);
      } else {
        console.error('Invalid stats data format:', data);
        setStats(null);
      }
    } catch (error) {
      console.error('Error fetching admin stats:', error);
      toast({
        title: "Error",
        description: "Failed to fetch admin statistics",
        variant: "destructive",
      });
    }
  };

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, account_status, created_at, is_admin')
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

  const createAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Check if email already exists
      const { data: existingUser } = await supabase
        .from('profiles')
        .select('email')
        .eq('email', newAdmin.email)
        .single();

      if (existingUser) {
        toast({
          title: "Error",
          description: "An account with this email already exists",
          variant: "destructive",
        });
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: newAdmin.email,
        password: newAdmin.password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            first_name: newAdmin.firstName,
            last_name: newAdmin.lastName,
            is_admin: true,
          },
        },
      });
      
      if (error) throw error;
      
      // Manually create profile for admin (since we don't want the trigger to create a full profile)
      if (data.user) {
        await supabase.from("profiles").insert({
          id: data.user.id,
          email: data.user.email,
          first_name: newAdmin.firstName,
          last_name: newAdmin.lastName,
          is_admin: true,
          date_of_birth: '1990-01-01',
          country: 'Admin',
          city: 'Admin',
          bio: 'Admin User',
          preference: 'both',
          interests: [],
          account_status: 'active'
        });
      }

      toast({
        title: "Success",
        description: "Admin user created successfully",
      });

      setNewAdmin({
        firstName: '',
        lastName: '',
        email: '',
        password: ''
      });
      setShowCreateAdmin(false);
      fetchUsers();
    } catch (error: any) {
      console.error('Error creating admin:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create admin user",
        variant: "destructive",
      });
    }
  };

  const createManualMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (matchUsers.user1 === matchUsers.user2) {
        toast({
          title: "Error",
          description: "Cannot match a user with themselves",
          variant: "destructive",
        });
        return;
      }

      // Create match directly
      const { error } = await supabase
        .from('matches')
        .insert({
          user1_id: matchUsers.user1 < matchUsers.user2 ? matchUsers.user1 : matchUsers.user2,
          user2_id: matchUsers.user1 < matchUsers.user2 ? matchUsers.user2 : matchUsers.user1
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Manual match created successfully",
      });

      setMatchUsers({ user1: '', user2: '' });
      setShowManualMatch(false);
      fetchStats();
    } catch (error: any) {
      console.error('Error creating manual match:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create manual match",
        variant: "destructive",
      });
    }
  };

  const updateUserStatus = async (userId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ account_status: newStatus })
        .eq('id', userId);

      if (error) throw error;

      toast({
        title: "Success",
        description: `User status updated to ${newStatus}`,
      });

      fetchUsers();
    } catch (error: any) {
      console.error('Error updating user status:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update user status",
        variant: "destructive",
      });
    }
  };

  const deleteUser = async (userId: string) => {
    try {
      const { error } = await supabase.rpc('delete_user_and_data', {
        user_id_to_delete: userId
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "User deleted successfully",
      });

      fetchUsers();
      fetchStats();
    } catch (error: any) {
      console.error('Error deleting user:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete user",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'blocked': return 'bg-red-100 text-red-800';
      case 'on_hold': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Filter out admin users for manual matching
  const nonAdminUsers = users.filter(user => !user.is_admin);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-50 to-purple-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-pink-600"></div>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-50 to-purple-50 flex items-center justify-center">
        <Card className="w-96">
          <CardContent className="p-8 text-center">
            <Shield className="w-16 h-16 mx-auto mb-4 text-red-500" />
            <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
            <p className="text-gray-600 mb-4">You don't have admin privileges to access this page.</p>
            <Button onClick={() => window.location.href = '/'}>
              Go Back
            </Button>
          </CardContent>
        </Card>
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
              <p className="text-gray-600">Real-time application statistics and insights</p>
            </div>
          </div>
          
          <div className="flex space-x-4">
            <Dialog open={showCreateAdmin} onOpenChange={setShowCreateAdmin}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Admin
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Admin User</DialogTitle>
                  <DialogDescription>
                    Create a new admin user with full dashboard access
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={createAdmin} className="space-y-4">
                  <div>
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      value={newAdmin.firstName}
                      onChange={(e) => setNewAdmin({...newAdmin, firstName: e.target.value})}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      value={newAdmin.lastName}
                      onChange={(e) => setNewAdmin({...newAdmin, lastName: e.target.value})}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={newAdmin.email}
                      onChange={(e) => setNewAdmin({...newAdmin, email: e.target.value})}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={newAdmin.password}
                      onChange={(e) => setNewAdmin({...newAdmin, password: e.target.value})}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full">Create Admin</Button>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={showManualMatch} onOpenChange={setShowManualMatch}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Heart className="w-4 h-4 mr-2" />
                  Manual Match
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Manual Match</DialogTitle>
                  <DialogDescription>
                    Select two users to create a manual match between them
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={createManualMatch} className="space-y-4">
                  <div>
                    <Label htmlFor="user1">First User</Label>
                    <Select value={matchUsers.user1} onValueChange={(value) => setMatchUsers({...matchUsers, user1: value})}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select first user" />
                      </SelectTrigger>
                      <SelectContent>
                        {nonAdminUsers.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.first_name} {user.last_name} ({user.email})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="user2">Second User</Label>
                    <Select value={matchUsers.user2} onValueChange={(value) => setMatchUsers({...matchUsers, user2: value})}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select second user" />
                      </SelectTrigger>
                      <SelectContent>
                        {nonAdminUsers.filter(user => user.id !== matchUsers.user1).map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.first_name} {user.last_name} ({user.email})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" className="w-full" disabled={!matchUsers.user1 || !matchUsers.user2}>
                    Create Match
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="border-pink-200 shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-pink-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-pink-600">{stats?.total_users || 0}</div>
              <p className="text-xs text-gray-600">All registered users</p>
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

        {/* User Management */}
        <Card className="shadow-lg">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="flex items-center space-x-2">
                <Users className="h-5 w-5 text-pink-600" />
                <span>User Management</span>
              </CardTitle>
              <div className="flex items-center space-x-2">
                <Search className="h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search users..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-64"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      {user.first_name} {user.last_name}
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(user.account_status)}`}>
                        {user.account_status}
                      </span>
                    </TableCell>
                    <TableCell>
                      {user.is_admin ? (
                        <span className="flex items-center text-purple-600">
                          <Shield className="w-4 h-4 mr-1" />
                          Admin
                        </span>
                      ) : (
                        'User'
                      )}
                    </TableCell>
                    <TableCell>
                      {new Date(user.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {!user.is_admin && (
                        <div className="flex space-x-2">
                          {user.account_status === 'active' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => updateUserStatus(user.id, 'blocked')}
                              >
                                <Ban className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => updateUserStatus(user.id, 'on_hold')}
                              >
                                <Pause className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                          {user.account_status !== 'active' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateUserStatus(user.id, 'active')}
                            >
                              <RotateCcw className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => deleteUser(user.id)}
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
