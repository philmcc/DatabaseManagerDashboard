import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import BaseLayout from "@/components/layout/base-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Database, Activity, Server, Clock, RefreshCw, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { SelectDatabaseConnection, SelectDatabaseOperationLog } from "@db/schema";
import { useState, useEffect } from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import QueryMonitoringCard from "@/components/database/QueryMonitoringCard";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

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
  usename: string;
  application_name: string | null;
  client_addr: string | null;
  backend_start: string;
  query_start: string;
  state: string;
  query: string;
}

// Helper function to convert duration string to seconds
const durationToSeconds = (duration: string): number => {
  // Duration comes in format "123.456s"
  return parseFloat(duration.replace('s', ''));
};

// Helper function to extract a normalized signature from a query text.
// This trims whitespace, replaces multiple spaces with one, lowercases the text,
// removes a trailing semicolon (if any), and returns the first 80 characters.
const extractSignature = (queryText: string): string => {
  let normalized = queryText.trim().replace(/\s+/g, ' ').toLowerCase();
  if (normalized.endsWith(';')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized.substring(0, 80);
};

export default function DatabaseDetails() {
  const { id } = useParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [continuousKillSignature, setContinuousKillSignature] = useState<string | null>(null);
  const [isContinuousKilling, setIsContinuousKilling] = useState(false);
  const [continuousKillCount, setContinuousKillCount] = useState(0);
  const [continuousKillStartTime, setContinuousKillStartTime] = useState<string | null>(null);
  const [autoRefreshQueries, setAutoRefreshQueries] = useState(false);

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

  const { data: runningQueries = [], isLoading: isLoadingQueries } = useQuery<RunningQuery[]>({
    queryKey: [`/api/databases/${id}/running-queries`],
    refetchInterval: autoRefreshQueries ? 5000 : undefined,
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
      console.log(`Starting kill query operation for PID ${pid}`);
      
      // Get the query details for logging
      const queryToKill = runningQueries?.find(q => q.pid === pid);
      console.log('Query details to kill:', queryToKill);
      
      // First, create a log entry
      console.log('Attempting to create operation log entry...');
      const logResponse = await fetch(`/api/databases/${id}/operation-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          databaseId: parseInt(id),
          operationType: 'kill_query',
          operationResult: 'success',
          details: {
            pid,
            queryText: queryToKill?.query?.substring(0, 500),
            username: queryToKill?.usename,
            duration: queryToKill?.query_start,
            action: 'manual_kill'
          }
        }),
      });

      if (!logResponse.ok) {
        const logError = await logResponse.text();
        console.error('Failed to create operation log:', {
          status: logResponse.status,
          statusText: logResponse.statusText,
          error: logError
        });
      } else {
        console.log('Successfully created operation log entry');
      }

      console.log('Attempting to kill query...');
      const response = await fetch(`/api/databases/${id}/kill-query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          pid,
          queryText: queryToKill?.query,
          action: 'manual_kill'
        }),
      });
  
      if (!response.ok) {
        const error = await response.text();
        console.error('Kill query failed, attempting to log error:', {
          status: response.status,
          statusText: response.statusText,
          error
        });

        // Log the failure
        const errorLogResponse = await fetch(`/api/databases/${id}/operation-log`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            databaseId: parseInt(id),
            operationType: 'kill_query',
            operationResult: 'error',
            details: {
              pid,
              query: queryToKill?.query,
              username: queryToKill?.usename,
              duration: queryToKill?.query_start,
              action: 'manual_kill',
              error: error
            }
          }),
        });

        if (!errorLogResponse.ok) {
          console.error('Failed to create error operation log:', {
            status: errorLogResponse.status,
            statusText: errorLogResponse.statusText,
            error: await errorLogResponse.text()
          });
        } else {
          console.log('Successfully created error operation log entry');
        }

        throw new Error(error);
      }
  
      console.log('Successfully killed query');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0].toString();
          const matches = key.includes('/api/database-logs') || key.includes('/api/databases/' + id + '/operation-log');
          console.log('Invalidating query key:', key, 'matches:', matches);
          return matches;
        }
      });
      toast({
        title: "Query Terminated",
        description: "The query has been successfully terminated",
      });
    },
    onError: (error: Error) => {
      console.error('Kill query mutation error:', error);
      toast({
        variant: "destructive",
        title: "Failed to terminate query",
        description: error.message,
      });
    },
  });

  const handleRefreshQueries = async () => {
    try {
      await queryClient.invalidateQueries({
        queryKey: [`/api/databases/${id}/running-queries`]
      });
      toast({
        title: "Success",
        description: "Queries refreshed",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to refresh queries",
      });
    }
  };

  // Add logging for continuous kill start/stop
  const handleContinuousKillToggle = async () => {
    if (isContinuousKilling) {
      const endTime = new Date().toISOString();
      // Log stopping continuous kill
      await fetch(`/api/databases/${id}/operation-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          databaseId: parseInt(id),
          operationType: 'continuous_kill_stop',
          operationResult: 'success',
          details: {
            targetSignature: continuousKillSignature?.substring(0, 500),
            startTime: continuousKillStartTime,
            endTime: endTime,
            killCount: continuousKillCount,
            action: 'continuous_kill_stop'
          }
        }),
      });
      
      setIsContinuousKilling(false);
      setContinuousKillCount(0);
      setContinuousKillStartTime(null);
      setContinuousKillSignature(null);
      toast({
        title: "Continuous Kill Stopped",
        description: "No longer automatically killing matching queries.",
      });
    } else {
      if (continuousKillSignature) {
        const startTime = new Date().toISOString();
        // Log starting continuous kill
        await fetch(`/api/databases/${id}/operation-log`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            databaseId: parseInt(id),
            operationType: 'continuous_kill_start',
            operationResult: 'success',
            details: {
              targetSignature: continuousKillSignature.substring(0, 500),
              startTime: startTime,
              action: 'continuous_kill_start'
            }
          }),
        });
        
        setIsContinuousKilling(true);
        setContinuousKillStartTime(startTime);
        setContinuousKillCount(0);
        toast({
          title: "Continuous Kill Activated",
          description: "Matching queries will be killed repeatedly.",
        });
      } else {
        toast({
          title: "No target selected",
          description: "Please set a running query as target first.",
        });
      }
    }
  };

  // When continuous kill mode is active, periodically refetch running queries and kill matching ones.
  useEffect(() => {
    if (!isContinuousKilling || !continuousKillSignature) return;

    const intervalId = setInterval(() => {
      (async () => {
        try {
          const result = await queryClient.invalidateQueries({ queryKey: [`/api/databases/${id}/running-queries`] });
          const updatedQueries: RunningQuery[] = result.data || [];

          for (const query of updatedQueries) {
            const querySig = extractSignature(query.query);
            if (querySig === continuousKillSignature) {
              try {
                // Kill the query
                const response = await fetch(`/api/databases/${id}/kill-query`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({ 
                    pid: query.pid,
                    queryText: query.query,
                    action: 'continuous_kill_execution'
                  }),
                });

                if (!response.ok) {
                  throw new Error(await response.text());
                }

                // Increment the kill count
                setContinuousKillCount(prev => prev + 1);

                // Invalidate queries
                queryClient.invalidateQueries({ 
                  predicate: (query) => query.queryKey[0].toString().includes('/api/database-logs')
                });
              } catch (error) {
                console.error("Error killing query:", error);
              }
            }
          }
        } catch (error) {
          console.error("Error in continuous kill effect:", error);
        }
      })();
    }, 2000);

    return () => clearInterval(intervalId);
  }, [isContinuousKilling, continuousKillSignature, queryClient, id]);

  // Format the duration since query start
  const formatQueryDuration = (queryStart: string) => {
    try {
      const start = new Date(queryStart);
      if (isNaN(start.getTime())) {
        return 'Invalid date';
      }
      return formatDistanceToNow(start, { addSuffix: true });
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Invalid date';
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
          <Accordion type="single" collapsible>
            <AccordionItem value="logs">
              <AccordionTrigger className="w-full">
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Operation Logs
                </CardTitle>
              </AccordionTrigger>
              <AccordionContent>
                <div className="px-6 py-4">
                  {isLoadingLogs ? (
                    <p className="text-center text-muted-foreground">Loading logs...</p>
                  ) : !logs.length ? (
                    <p className="text-center text-muted-foreground">No operation logs yet.</p>
                  ) : (
                    <>
                      <Accordion type="multiple" className="space-y-4">
                        {logs.map((log) => (
                          <AccordionItem key={log.id} value={String(log.id)}>
                            <AccordionTrigger>
                              <div className="flex justify-between items-center w-full">
                                <div>
                                  <p className="font-medium">
                                    {log.operationType.charAt(0).toUpperCase() + log.operationType.slice(1)} -{' '}
                                    <span className={log.operationResult === 'success' ? 'text-green-600' : 'text-red-600'}>
                                      {log.operationResult}
                                    </span>
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    {log.timestamp ? format(new Date(log.timestamp), 'PPpp') : 'Timestamp not available'}
                                  </p>
                                </div>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent>
                              <div className="log-details text-sm text-muted-foreground bg-slate-50 p-2 rounded">
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
                                {log.details.query && (
                                  <>
                                    <p className="font-medium text-xs uppercase text-gray-500 mt-2">Query:</p>
                                    <pre className="whitespace-pre-wrap text-xs bg-gray-100 p-2 rounded">
                                      {log.details.query}
                                    </pre>
                                  </>
                                )}
                                {(!log.details.query && !log.details.error && !(log.details.before && log.details.after)) && JSON.stringify(log.details)}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>
                      <div className="mt-4 flex justify-between items-center">
                        <Button variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
                        <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
                        <Button variant="outline" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</Button>
                      </div>
                    </>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
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
                    <div className="flex justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Switch
                          id="auto-refresh-queries"
                          checked={autoRefreshQueries}
                          onCheckedChange={setAutoRefreshQueries}
                        />
                        <Label htmlFor="auto-refresh-queries">
                          Auto-refresh queries {autoRefreshQueries ? '(every 5s)' : '(off)'}
                        </Label>
                      </div>
                      
                      {continuousKillSignature && (
                        <div className="flex items-center gap-2 mr-auto">
                          <Button
                            className="bg-green-500 text-white hover:bg-green-600"
                            size="sm"
                            onClick={handleContinuousKillToggle}
                          >
                            Clear Target
                          </Button>
                          <span className="text-sm text-muted-foreground">
                            Target: "{continuousKillSignature}"
                          </span>
                        </div>
                      )}
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRefreshQueries}
                        className="flex items-center gap-2"
                      >
                        <RefreshCw className="h-4 w-4" />
                        Refresh
                      </Button>
                      <Button
                        variant={isContinuousKilling ? "destructive" : "default"}
                        size="sm"
                        onClick={handleContinuousKillToggle}
                        className="ml-2"
                      >
                        {isContinuousKilling ? "Stop Continuous Kill" : "Start Continuous Kill"}
                      </Button>
                    </div>
                    
                    {isLoadingQueries ? (
                      <p className="text-center text-muted-foreground">Loading queries...</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>PID</TableHead>
                            <TableHead>User</TableHead>
                            <TableHead>Application</TableHead>
                            <TableHead>Client</TableHead>
                            <TableHead>Duration</TableHead>
                            <TableHead>State</TableHead>
                            <TableHead>Query</TableHead>
                            <TableHead></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {runningQueries.map((query) => (
                            <TableRow key={query.pid}>
                              <TableCell>{query.pid}</TableCell>
                              <TableCell>{query.usename}</TableCell>
                              <TableCell>{query.application_name || '-'}</TableCell>
                              <TableCell>{query.client_addr || '-'}</TableCell>
                              <TableCell>{formatQueryDuration(query.query_start)}</TableCell>
                              <TableCell>{query.state}</TableCell>
                              <TableCell className="max-w-md truncate">
                                <code className="text-sm">{query.query}</code>
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => killQuery({ pid: query.pid })}
                                >
                                  Kill
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                          {runningQueries.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={8} className="text-center text-muted-foreground">
                                No running queries
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>

        <QueryMonitoringCard databaseId={parseInt(id || "0")} />
      </div>
    </BaseLayout>
  );
}