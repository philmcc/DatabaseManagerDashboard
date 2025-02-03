import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUser } from "@/hooks/use-user";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Link } from "wouter";
import { Settings, LogOut, Database, Activity, Server, Users } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import BaseLayout from "@/components/layout/base-layout";
import { SelectDatabaseConnection, SelectDatabaseOperationLog } from "@db/schema";
import { useState } from "react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import Navbar from "@/components/layout/navbar";
import { Loader2 } from "lucide-react";

interface LogDetails {
  before?: Record<string, any>;
  after?: Record<string, any>;
  error?: string;
}

interface DatabaseLog extends SelectDatabaseOperationLog {
  user?: {
    username: string;
    fullName: string | null;
  };
  database?: {
    name: string;
    host: string;
    port: number;
  };
  details: LogDetails;
}

interface Cluster {
  id: number;
  name: string;
  description?: string | null;
  instances: { id: number; hostname: string }[];
}

export default function Dashboard() {
  const { user, logout } = useUser();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [testingDatabaseId, setTestingDatabaseId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 5;
  const queryClient = useQueryClient();

  const { data: clusters, isLoading, error } = useQuery<Cluster[]>({
    queryKey: ["/api/clusters"],
    queryFn: async () => {
      const res = await fetch("/api/clusters", { credentials: "include" });
      if (!res.ok) {
        throw new Error("Failed to fetch clusters");
      }
      return res.json();
    },
  });

  const { data: logsData, isLoading: isLoadingLogs } = useQuery<{ logs: DatabaseLog[], total: number }>({
    queryKey: [`/api/database-logs?page=${page}&pageSize=${pageSize}`],
    enabled: !!user,
  });

  const logs = logsData?.logs || [];
  const totalPages = logsData ? Math.ceil(logsData.total / pageSize) : 0;

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
      queryClient.invalidateQueries({ queryKey: ['/api/database-logs'] });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin h-8 w-8" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Error loading clusters</p>
      </div>
    );
  }

  return (
    <div>
      <Navbar />
      <div className="container mx-auto py-6">
        <h1 className="text-4xl font-bold mb-4">Dashboard</h1>
        <h2 className="text-3xl font-bold mb-6">Clusters</h2>
        {clusters && clusters.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {clusters.map((cluster) => (
              <Card key={cluster.id}>
                <CardHeader>
                  <CardTitle>
                    <Link href={`/clusters/${cluster.id}`}>
                      {cluster.name}
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p>{cluster.description || "No description provided."}</p>
                  <p className="mt-2 font-medium">
                    Instances: {cluster.instances?.length || 0}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <p>No clusters found.</p>
        )}

        <div className="mt-10">
          <h2 className="text-2xl font-bold mb-4">Recent Database Logs</h2>
          {isLoadingLogs ? (
            <div className="flex items-center justify-center">
              <Loader2 className="animate-spin h-8 w-8" />
            </div>
          ) : logs.length > 0 ? (
            <div className="overflow-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Operation</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Result</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Database</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Details</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{format(new Date(log.timestamp), 'Pp')}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{log.operationType}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{log.operationResult}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{log.user ? log.user.username : "N/A"}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{log.database ? log.database.name : "N/A"}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{JSON.stringify(log.details)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {log.database && (
                          <Button
                            onClick={() => testConnection(log.database.id)}
                            disabled={testingDatabaseId === log.database.id}
                            size="small"
                          >
                            {testingDatabaseId === log.database.id ? "Testing..." : "Test Connection"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-center text-gray-500">No logs available.</p>
          )}
          <div className="mt-4 flex justify-center items-center gap-4">
            <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <span>Page {page} of {totalPages}</span>
            <Button variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}