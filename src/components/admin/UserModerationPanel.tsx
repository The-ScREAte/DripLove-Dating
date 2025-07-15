import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Search, Eye, Ban, Pause, Play, Trash2 } from 'lucide-react';
import { AdminUser } from '@/types';

interface UserModerationPanelProps {
  users: AdminUser[];
  searchTerm: string;
  statusFilter: string;
  onSearchChange: (term: string) => void;
  onStatusFilterChange: (status: string) => void;
  onViewProfile: (userId: string) => void;
  onBlockUser: (userId: string, block: boolean) => void;
  onHoldUser: (userId: string, hold: boolean) => void;
  onDeleteUser: (userId: string) => void;
  blockingUsers: { [key: string]: boolean };
  holdingUsers: { [key: string]: boolean };
  deletingUsers: { [key: string]: boolean };
}

const UserModerationPanel: React.FC<UserModerationPanelProps> = ({
  users,
  searchTerm,
  statusFilter,
  onSearchChange,
  onStatusFilterChange,
  onViewProfile,
  onBlockUser,
  onHoldUser,
  onDeleteUser,
  blockingUsers,
  holdingUsers,
  deletingUsers
}) => {
  const filteredUsers = users.filter(user => {
    const matchesSearch = user.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || user.account_status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="default" className="bg-green-100 text-green-800">Active</Badge>;
      case 'blocked':
        return <Badge variant="destructive">Blocked</Badge>;
      case 'on_hold':
        return <Badge variant="secondary">On Hold</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Search className="w-5 h-5 mr-2" />
          User Moderation
        </CardTitle>
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={onStatusFilterChange}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="blocked">Blocked</SelectItem>
              <SelectItem value="on_hold">On Hold</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2">User</th>
                <th className="text-left p-2">Email</th>
                <th className="text-left p-2">Status</th>
                <th className="text-left p-2">Location</th>
                <th className="text-left p-2">Premium</th>
                <th className="text-left p-2">Joined</th>
                <th className="text-left p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id} className="border-b hover:bg-gray-50">
                  <td className="p-2">
                    <div>
                      <div className="font-medium">{user.first_name} {user.last_name}</div>
                      <div className="text-sm text-gray-500">{user.gender}</div>
                    </div>
                  </td>
                  <td className="p-2 text-sm">{user.email}</td>
                  <td className="p-2">{getStatusBadge(user.account_status)}</td>
                  <td className="p-2 text-sm">{user.city}, {user.country}</td>
                  <td className="p-2">
                    {user.is_premium ? (
                      <Badge variant="default" className="bg-yellow-100 text-yellow-800">
                        Premium
                      </Badge>
                    ) : (
                      <Badge variant="outline">Free</Badge>
                    )}
                  </td>
                  <td className="p-2 text-sm">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td className="p-2">
                    <div className="flex space-x-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onViewProfile(user.id)}
                        className="text-blue-600 hover:text-blue-700 border-blue-300 hover:bg-blue-50"
                        aria-label={`View profile for ${user.first_name} ${user.last_name}`}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      
                      {user.account_status !== 'blocked' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onBlockUser(user.id, true)}
                          disabled={blockingUsers[user.id]}
                          className="text-red-600 hover:text-red-700 border-red-300 hover:bg-red-50"
                          aria-label={`Block ${user.first_name} ${user.last_name}`}
                        >
                          <Ban className="w-4 h-4" />
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onBlockUser(user.id, false)}
                          disabled={blockingUsers[user.id]}
                          className="text-green-600 hover:text-green-700 border-green-300 hover:bg-green-50"
                          aria-label={`Unblock ${user.first_name} ${user.last_name}`}
                        >
                          <Play className="w-4 h-4" />
                        </Button>
                      )}
                      
                      {user.account_status !== 'on_hold' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onHoldUser(user.id, true)}
                          disabled={holdingUsers[user.id]}
                          className="text-yellow-600 hover:text-yellow-700 border-yellow-300 hover:bg-yellow-50"
                          aria-label={`Put ${user.first_name} ${user.last_name} on hold`}
                        >
                          <Pause className="w-4 h-4" />
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onHoldUser(user.id, false)}
                          disabled={holdingUsers[user.id]}
                          className="text-green-600 hover:text-green-700 border-green-300 hover:bg-green-50"
                          aria-label={`Remove ${user.first_name} ${user.last_name} from hold`}
                        >
                          <Play className="w-4 h-4" />
                        </Button>
                      )}
                      
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onDeleteUser(user.id)}
                        disabled={deletingUsers[user.id]}
                        className="text-red-600 hover:text-red-700 border-red-300 hover:bg-red-50"
                        aria-label={`Delete ${user.first_name} ${user.last_name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {filteredUsers.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No users found matching your criteria.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default UserModerationPanel;
