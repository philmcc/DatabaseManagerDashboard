import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import BaseLayout from "@/components/layout/base-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Database, Activity, Server, Clock, RefreshCw, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { SelectDatabaseConnection, SelectDatabaseOperationLog } from "@db/schema";
import { useState } from "react";
import { format } from "date-fns";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

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

interface RunningQuery {
  pid: number;
  username: string;
  database: string;
  state: string;
  query: string;
  duration: string;
  started_at: string;
}

// Helper function to convert duration string to seconds
const durationToSeconds = (duration: string): number => {
  // Duration comes in format "123.456s"
  return parseFloat(duration.replace('s', ''));
};

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

  const { data: runningQueries, refetch: refetchQueries, error: queriesError } = useQuery<RunningQuery[]>({
    queryKey: [`/api/databases/${id}/running-queries`],
    refetchInterval: false,
    queryFn: async ({ queryKey: [url] }) => {
      console.log('Fetching running queries...');
      const response = await fetch(url, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Running queries error response:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
        throw new Error(`Failed to fetch running queries: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('Running queries response data:', data);
      return data;
    },
    onError: (error) => {
      console.error('Error fetching running queries:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to fetch running queries"
      });
    },
    onSuccess: (data) => {
      console.log('Successfully received running queries:', {
        count: data?.length,
        data
      });
    }
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

  const { mutate: deleteDatabase } = useMutation({
    mutationFn: async () => {
      console.log('Initiating database deletion for ID:', id);
      try {
        const res = await fetch(`/api/databases/${id}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        
        console.log('Delete response status:', res.status);
        
        if (!res.ok) {
          const errorText = await res.text();
          console.error('Delete failed with response:', errorText);
          throw new Error(errorText || 'Failed to delete database');
        }
        
        return res;
      } catch (error) {
        console.error('Delete request failed:', error);
        throw error;
      }
    },
    onSuccess: () => {
      console.log('Delete successful, invalidating queries');
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/api/databases'] }),
        queryClient.invalidateQueries({ 
          predicate: (query) => query.queryKey[0].toString().includes('/api/database-logs')
        }),
        queryClient.invalidateQueries({
          queryKey: ['/api/instances']
        })
      ]).then(() => {
        console.log('Query invalidation complete, redirecting');
        window.location.href = '/dashboard';
      });
    },
    onError: (error: Error) => {
      console.error('Delete mutation error:', error);
      toast({
        variant: "destructive",
        title: "Deletion failed",
        description: error.message,
      });
    },
  });

  const { mutate: killQuery } = useMutation({
    mutationFn: async ({ pid }: { pid: number }) => {
      const response = await fetch(`/api/databases/${id}/kill-query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ pid }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }

      return response.json();
    },
    onSuccess: () => {
      refetchQueries();
      toast({
        title: "Query Terminated",
        description: "The query has been successfully terminated",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Failed to terminate query",
        description: error.message,
      });
    },
  });

  const handleRefreshQueries = async () => {
    console.log('Starting query refresh...');
    try {
      const result = await refetchQueries();
      console.log('Refresh completed:', {
        success: result.isSuccess,
        data: result.data,
        error: result.error
      });
      
      toast({
        title: "Refreshed",
        description: `Found ${result.data?.length || 0} running queries`,
      });
    } catch (error) {
      console.error('Error refreshing queries:', error);
      toast({
        variant: "destructive",
        title: "Refresh failed",
        description: error instanceof Error ? error.message : "Failed to refresh running queries",
      });
    }
  };

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
              <Button
                variant="destructive"
                onClick={() => {
                  if (confirm("Are you sure you want to delete this database? This action cannot be undone.")) {
                    deleteDatabase();
                  }
                }}
              >
                Delete Database
              </Button>
            </div>
          </CardContent>
        </Card>

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

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Database Tools
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="running-queries">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Running Queries
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="pt-4">
                    <div className="flex justify-end mb-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRefreshQueries}
                        className="flex items-center gap-2"
                      >
                        <RefreshCw className="h-4 w-4" />
                        Refresh
                      </Button>
                    </div>
                    
                    {queriesError ? (
                      <p className="text-center text-red-500">
                        Error loading queries: {(queriesError as Error).message}
                      </p>
                    ) : !runningQueries ? (
                      <p className="text-center text-muted-foreground">Loading queries...</p>
                    ) : (
                      <div className="space-y-4">
                        {console.log('Rendering running queries:', runningQueries)}
                        {runningQueries.length === 0 ? (
                          <p className="text-center text-muted-foreground py-4">
                            No queries currently running
                          </p>
                        ) : (
                          <Accordion type="multiple" className="space-y-2">
                            {runningQueries
                              .sort((a, b) => durationToSeconds(b.duration) - durationToSeconds(a.duration))
                              .map((query, index) => (
                                <AccordionItem
                                  key={`${query.pid}-${index}`}
                                  value={`${query.pid}-${index}`}
                                  className="border rounded-lg px-4"
                                >
                                  <AccordionTrigger className="hover:no-underline py-2">
                                    <div className="flex flex-1 items-center gap-4">
                                      <div className="flex items-center gap-2 min-w-[140px]">
                                        <Badge variant="outline">{query.state}</Badge>
                                        <span className="text-sm text-muted-foreground whitespace-nowrap">
                                          PID: {query.pid}
                                        </span>
                                      </div>
                                      <div className="text-left text-sm whitespace-nowrap min-w-[150px]">
                                        <span className="font-medium">Duration:</span>{' '}
                                        {query.duration}
                                      </div>
                                      <div className="flex-1 text-left text-sm truncate">
                                        {query.query.split('\n')[0]}
                                      </div>
                                    </div>
                                  </AccordionTrigger>
                                  <AccordionContent className="pb-2">
                                    <div className="space-y-2">
                                      <div className="flex justify-between items-start">
                                        <div className="grid grid-cols-2 gap-2">
                                          <div>
                                            <p className="text-sm">
                                              <span className="font-medium">User:</span> {query.username}
                                            </p>
                                            <p className="text-sm">
                                              <span className="font-medium">Database:</span> {query.database}
                                            </p>
                                          </div>
                                          <div>
                                            <p className="text-sm">
                                              <span className="font-medium">Started:</span>{' '}
                                              {format(new Date(query.started_at), 'PPpp')}
                                            </p>
                                            <p className="text-sm">
                                              <span className="font-medium">State:</span> {query.state}
                                            </p>
                                          </div>
                                        </div>
                                        <Button
                                          variant="destructive"
                                          size="sm"
                                          onClick={() => {
                                            if (confirm(`Are you sure you want to terminate this query (PID: ${query.pid})?`)) {
                                              killQuery({ pid: query.pid });
                                            }
                                          }}
                                          className="flex items-center gap-2"
                                        >
                                          <XCircle className="h-4 w-4" />
                                          Kill Query
                                        </Button>
                                      </div>
                                      <div className="bg-muted p-3 rounded-md mt-2">
                                        <pre className="text-sm overflow-x-auto whitespace-pre-wrap">
                                          <code>{query.query}</code>
                                        </pre>
                                      </div>
                                    </div>
                                  </AccordionContent>
                                </AccordionItem>
                              ))}
                          </Accordion>
                        )}
                      </div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      </div>
    </BaseLayout>
  );
}