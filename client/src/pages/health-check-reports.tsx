import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Activity, RefreshCw } from "lucide-react";
import BaseLayout from "@/components/layout/base-layout";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export default function HealthCheckReports() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch the latest execution
  const { data: latestExecution, isLoading: isLoadingLatest } = useQuery({
    queryKey: ['/api/health-check-executions/latest'],
  });

  // Fetch all executions
  const { data: executions = [], isLoading: isLoadingExecutions } = useQuery({
    queryKey: ['/api/health-check-executions'],
  });

  // Run health check mutation
  const runMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/health-check-executions', {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to run health check');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/health-check-executions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/health-check-executions/latest'] });
      toast({
        title: "Success",
        description: "Health check started successfully",
      });
    },
  });

  if (isLoadingLatest || isLoadingExecutions) {
    return <div>Loading...</div>;
  }

  return (
    <BaseLayout>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Health Check Reports
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-end mb-4">
            <Button
              onClick={() => runMutation.mutate()}
              disabled={runMutation.isPending}
            >
              {runMutation.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Run Health Check
            </Button>
          </div>

          {latestExecution && (
            <>
              <h3 className="text-lg font-semibold mb-4">Latest Results</h3>
              <Accordion type="single" collapsible className="mb-8">
                {latestExecution.results.map((result: any) => (
                  <AccordionItem
                    key={result.queryId}
                    value={result.queryId.toString()}
                    className="border mb-2"
                  >
                    <AccordionTrigger>
                      <div className="flex items-center justify-between w-full pr-4">
                        <span>{result.query.title}</span>
                        {result.error ? (
                          <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">
                            Error
                          </span>
                        ) : (
                          <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                            Success
                          </span>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="p-4">
                        {result.error ? (
                          <div className="text-red-600">{result.error}</div>
                        ) : (
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  {result.instance && (
                                    <TableHead>Instance</TableHead>
                                  )}
                                  {Object.keys(result.results[0] || {}).map(
                                    (key) => (
                                      <TableHead key={key}>
                                        {key}
                                      </TableHead>
                                    )
                                  )}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {result.results.map((row: any, i: number) => (
                                  <TableRow key={i}>
                                    {result.instance && (
                                      <TableCell>
                                        {result.instance.hostname}:
                                        {result.instance.port}
                                      </TableCell>
                                    )}
                                    {Object.values(row).map(
                                      (value: any, j: number) => (
                                        <TableCell key={j}>
                                          {value}
                                        </TableCell>
                                      )
                                    )}
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </>
          )}

          <h3 className="text-lg font-semibold mb-4">Execution History</h3>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Started At</TableHead>
                  <TableHead>Completed At</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Queries</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {executions.map((execution: any) => (
                  <TableRow key={execution.id}>
                    <TableCell>
                      {format(new Date(execution.startedAt), 'PPpp')}
                    </TableCell>
                    <TableCell>
                      {execution.completedAt
                        ? format(new Date(execution.completedAt), 'PPpp')
                        : '-'}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          execution.status === 'completed'
                            ? 'bg-green-100 text-green-800'
                            : execution.status === 'running'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {execution.status}
                      </span>
                    </TableCell>
                    <TableCell>{execution.results?.length || 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </BaseLayout>
  );
}
