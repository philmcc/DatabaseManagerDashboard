import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity } from "lucide-react";
import BaseLayout from "@/components/layout/base-layout";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface HealthCheckResult {
  queryId: number;
  query: {
    title: string;
  };
  error?: string;
  results: Array<Record<string, any>>;
  instance?: {
    hostname: string;
    port: number;
  };
}

interface HealthCheckExecution {
  id: number;
  status: string;
  startedAt: string;
  completedAt?: string;
  results: HealthCheckResult[];
}

interface HealthCheckReport {
  id: number;
  status: string;
  markdown: string;
  completedAt: string;
  createdAt: string;
  cluster: {
    name: string;
  };
  user: {
    username: string;
  };
}

export default function HealthCheckReports() {
  // Fetch the latest execution
  const { data: latestExecution, isLoading: isLoadingLatest } = useQuery<HealthCheckExecution>({
    queryKey: ['/api/health-check-executions/latest'],
  });

  // Fetch all executions
  const { data: executions = [], isLoading: isLoadingExecutions } = useQuery<HealthCheckExecution[]>({
    queryKey: ['/api/health-check-executions'],
  });

  // Fetch reports
  const { data: reports = [], isLoading: isLoadingReports } = useQuery<HealthCheckReport[]>({
    queryKey: ['/api/health-check-reports'],
  });

  if (isLoadingLatest || isLoadingExecutions || isLoadingReports) {
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
          <div className="space-y-8">
            {reports.length > 0 ? (
              <>
                <h3 className="text-lg font-semibold">Latest Reports</h3>
                <Accordion type="single" collapsible className="mb-8">
                  {reports.map((report) => (
                    <AccordionItem
                      key={report.id}
                      value={report.id.toString()}
                      className="border mb-2"
                    >
                      <AccordionTrigger>
                        <div className="flex items-center justify-between w-full pr-4">
                          <div className="flex flex-col items-start">
                            <span>Cluster: {report.cluster.name}</span>
                            <span className="text-sm text-muted-foreground">
                              {format(new Date(report.createdAt), 'PPpp')}
                            </span>
                          </div>
                          <span
                            className={`text-xs px-2 py-1 rounded ${
                              report.status === "completed"
                                ? "bg-green-100 text-green-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {report.status}
                          </span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="p-4 prose prose-sm max-w-none dark:prose-invert">
                          <div dangerouslySetInnerHTML={{ __html: report.markdown }} />
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </>
            ) : (
              <div className="text-muted-foreground">No health check reports available</div>
            )}

            <h3 className="text-lg font-semibold">Execution History</h3>
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
                  {executions.map((execution: HealthCheckExecution) => (
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
          </div>
          {latestExecution && latestExecution.results && latestExecution.results.length > 0 ? (
            <>
              <h3 className="text-lg font-semibold mb-4">Latest Results</h3>
              <Accordion type="single" collapsible className="mb-8">
                {latestExecution.results.map((result: HealthCheckResult) => (
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
                        ) : result.results && result.results.length > 0 ? (
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
                        ) : (
                          <div>No results available</div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </>
          ) : (
            <div className="text-muted-foreground">No health check results available</div>
          )}
        </CardContent>
      </Card>
    </BaseLayout>
  );
}