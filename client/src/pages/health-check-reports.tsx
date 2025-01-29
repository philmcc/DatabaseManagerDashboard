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
  // Fetch reports
  const { data: reports = [], isLoading: isLoadingReports } = useQuery<HealthCheckReport[]>({
    queryKey: ['/api/health-check-reports'],
  });

  if (isLoadingReports) {
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
          </div>
        </CardContent>
      </Card>
    </BaseLayout>
  );
}