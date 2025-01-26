import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUser } from "@/hooks/use-user";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Settings, LogOut, Database, Activity } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import BaseLayout from "@/components/layout/base-layout";
import { SelectDatabaseConnection, SelectDatabaseOperationLog } from "@db/schema";
import { useState } from "react";
import { format } from "date-fns";

export default function Dashboard() {
  const { user, logout } = useUser();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [testingDatabaseId, setTestingDatabaseId] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const { data: databases = [], isLoading } = useQuery<SelectDatabaseConnection[]>({
    queryKey: ['/api/databases'],
    enabled: !!user,
  });

  const { data: logs = [], isLoading: isLoadingLogs } = useQuery<SelectDatabaseOperationLog[]>({
    queryKey: ['/api/database-logs'],
    enabled: !!user,
  });

  const { mutate: testConnection } = useMutation({
    mutationFn: async (databaseId: number) => {
      setTestingDatabaseId(databaseId);
      try {
        const res = await fetch(`/api/databases/${databaseId}/test`, {
          method: 'POST',
          credentials: 'include',
        });

        if (!res.ok) {
          const error = await res.text();
          throw new Error(error);
        }

        return res.json();
      } finally {
        setTestingDatabaseId(null);
      }
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: data.message,
      });
      // Invalidate the logs query to refresh the list
      queryClient.invalidateQueries({ queryKey: ['/api/database-logs'] });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
      // Invalidate the logs query even on error to show the failure
      queryClient.invalidateQueries({ queryKey: ['/api/database-logs'] });
    },
  });

  const handleLogout = async () => {
    try {
      const result = await logout();
      if (result.ok) {
        setLocation("/");
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: result.message,
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to logout",
      });
    }
  };

  return (
    <BaseLayout>
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">
            Welcome {user?.fullName || user?.username}
          </h1>
          <div className="space-x-2">
            <Button
              variant="outline"
              onClick={() => setLocation("/profile-settings")}
            >
              <Settings className="mr-2 h-4 w-4" />
              Profile Settings
            </Button>
            <Button
              variant="outline"
              onClick={handleLogout}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {isLoading ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">
                  Loading databases...
                </p>
              </CardContent>
            </Card>
          ) : databases.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">
                  No databases added yet.
                </p>
              </CardContent>
            </Card>
          ) : (
            databases.map((db) => (
              <Card key={db.id}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {db.name}
                  </CardTitle>
                  <Database className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-xs text-muted-foreground">
                    <p>{db.databaseName} @ {db.host}:{db.port}</p>
                    <p>Username: {db.username}</p>
                  </div>
                  <div className="mt-2 space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLocation(`/databases/${db.id}/edit`)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={testingDatabaseId === db.id}
                      onClick={() => testConnection(db.id)}
                    >
                      {testingDatabaseId === db.id ? "Testing..." : "Test Connection"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <Button
          className="mt-4"
          onClick={() => setLocation("/databases/new")}
        >
          <Database className="mr-2 h-4 w-4" />
          Add New Database
        </Button>

        <div className="mt-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Recent Database Operations
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingLogs ? (
                <p className="text-center text-muted-foreground">Loading logs...</p>
              ) : logs.length === 0 ? (
                <p className="text-center text-muted-foreground">No operation logs yet.</p>
              ) : (
                <div className="space-y-4">
                  {logs.map((log) => (
                    <div key={log.id} className="border-b pb-4 last:border-0">
                      <div className="flex flex-col space-y-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium">
                              {log.operationType.charAt(0).toUpperCase() + log.operationType.slice(1)} - {' '}
                              <span className={log.operationResult === 'success' ? 'text-green-600' : 'text-red-600'}>
                                {log.operationResult}
                              </span>
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {format(new Date(log.timestamp), 'PPpp')}
                            </p>
                          </div>
                        </div>
                        {log.details && typeof log.details === 'object' && (
                          <div className="text-sm text-muted-foreground bg-slate-50 p-2 rounded">
                            {log.details.name && <p>Database: {log.details.name}</p>}
                            {log.details.host && log.details.port && (
                              <p>Host: {log.details.host}:{log.details.port}</p>
                            )}
                            {log.details.error && (
                              <p className="text-red-500">Error: {log.details.error}</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </BaseLayout>
  );
}