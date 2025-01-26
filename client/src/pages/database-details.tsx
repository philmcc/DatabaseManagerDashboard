import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import BaseLayout from "@/components/layout/base-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Database, Activity, Server } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { SelectDatabaseConnection, SelectDatabaseOperationLog } from "@db/schema";
import { useState } from "react";
import { format } from "date-fns";
import MetricsDashboard from "@/components/database/metrics-dashboard";

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

export default function DatabaseDetails() {
  const { id } = useParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [isTestingConnection, setIsTestingConnection] = useState(false);

  const { data: database, isLoading: isLoadingDatabase } = useQuery<SelectDatabaseConnection & {
    instance: {
      id: number;
      hostname: string;
      port: number;
      isWriter: boolean;
    };
  }>({
    queryKey: [`/api/databases/${id}`],
  });

  const { data: logsData, isLoading: isLoadingLogs } = useQuery<{ logs: DatabaseLog[], total: number }>({
    queryKey: [`/api/database-logs?page=${page}&pageSize=${pageSize}&databaseId=${id}`],
  });

  const logs = logsData?.logs || [];
  const totalPages = logsData ? Math.ceil(logsData.total / pageSize) : 0;

  const { mutate: testConnection } = useMutation({
    mutationFn: async () => {
      setIsTestingConnection(true);
      try {
        const res = await fetch(`/api/databases/${id}/test`, {
          method: 'POST',
          credentials: 'include',
        });

        if (!res.ok) {
          const error = await res.text();
          throw new Error(error);
        }

        return res.json();
      } finally {
        setIsTestingConnection(false);
      }
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/database-logs?databaseId=${id}`] });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/database-logs?databaseId=${id}`] });
    },
  });

  if (isLoadingDatabase) {
    return (
      <BaseLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <p>Loading database details...</p>
        </div>
      </BaseLayout>
    );
  }

  if (!database) {
    return (
      <BaseLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <p>Database not found</p>
        </div>
      </BaseLayout>
    );
  }

  return (
    <BaseLayout>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              {database.name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Instance</p>
                <Link
                  href={`/instances/${database.instance.id}`}
                  className="flex items-center gap-2 text-primary hover:underline"
                >
                  <Server className="h-4 w-4" />
                  {database.instance.hostname}
                  <Badge variant="outline">
                    {database.instance.isWriter ? 'Writer' : 'Reader'}
                  </Badge>
                </Link>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Port</p>
                <p>{database.instance.port}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Database Name</p>
                <p>{database.databaseName}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Username</p>
                <p>{database.username}</p>
              </div>
            </div>
            {database.tags && database.tags.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-medium text-muted-foreground mb-2">Tags</p>
                <div className="flex flex-wrap gap-2">
                  {database.tags.map((tagRel) => (
                    <span
                      key={tagRel.tag.id}
                      className="bg-secondary text-secondary-foreground px-2 py-1 rounded-md text-sm"
                    >
                      {tagRel.tag.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-6 flex gap-2">
              <Button
                variant="outline"
                onClick={() => testConnection()}
                disabled={isTestingConnection}
              >
                {isTestingConnection ? "Testing..." : "Test Connection"}
              </Button>
              <Button
                variant="outline"
                onClick={() => window.location.href = `/databases/${id}/edit`}
              >
                Edit Database
              </Button>
            </div>
          </CardContent>
        </Card>

        <MetricsDashboard databaseId={parseInt(id)} />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Operation Logs
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingLogs ? (
              <p className="text-center text-muted-foreground">Loading logs...</p>
            ) : !logs.length ? (
              <p className="text-center text-muted-foreground">No operation logs yet.</p>
            ) : (
              <>
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
                              {log.timestamp ? format(new Date(log.timestamp), 'PPpp') : 'Timestamp not available'}
                            </p>
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground bg-slate-50 p-2 rounded">
                          {log.user && (
                            <p className="font-medium mb-1">
                              By: {log.user.fullName || log.user.username}
                            </p>
                          )}
                          {log.details.before && log.details.after && (
                            <>
                              <div className="mt-1">
                                <p className="font-medium text-xs uppercase text-gray-500">Changes:</p>
                                {Object.keys(log.details.before).map(key => {
                                  const beforeVal = log.details.before?.[key];
                                  const afterVal = log.details.after?.[key];
                                  if (beforeVal !== afterVal) {
                                    return (
                                      <p key={key} className="ml-2">
                                        <span className="font-medium">{key}:</span>{' '}
                                        <span className="text-red-500">{beforeVal}</span>{' '}
                                        <span className="text-gray-500">→</span>{' '}
                                        <span className="text-green-500">{afterVal}</span>
                                      </p>
                                    );
                                  }
                                  return null;
                                })}
                              </div>
                            </>
                          )}
                          {log.details.error && (
                            <p className="text-red-500">Error: {log.details.error}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex justify-between items-center">
                  <Button
                    variant="outline"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    Next
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </BaseLayout>
  );
}