import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, Database, Clock, Server, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { format } from "date-fns";

interface MetricsProps {
  databaseId: number;
}

interface TableStats {
  table_name: string;
  row_count: number;
  dead_tuples: number;
  size_mb: number;
}

interface Metrics {
  activeConnections: number;
  databaseSize: number;
  slowQueries: number;
  avgQueryTime: number;
  cacheHitRatio: number;
  tableStats: TableStats[];
}

interface MetricsResponse {
  current: Metrics;
  historical: Array<{
    timestamp: string;
    activeConnections: number;
    databaseSize: number;
    slowQueries: number;
    cacheHitRatio: number;
  }>;
}

export default function MetricsDashboard({ databaseId }: MetricsProps) {
  const [timeRange, setTimeRange] = useState<string>("1h");

  const { data: metricsData, isLoading, error } = useQuery<MetricsResponse>({
    queryKey: [`/api/databases/${databaseId}/metrics`, { timeRange }],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center space-x-2">
            <Activity className="h-4 w-4 animate-spin" />
            <p className="text-muted-foreground">Loading metrics...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center space-x-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <p>Error loading metrics. Please try again later.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!metricsData?.current) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center space-x-2 text-muted-foreground">
            <Database className="h-4 w-4" />
            <p>No metrics available. This might be due to connection issues with the database.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { current, historical } = metricsData;

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat().format(Math.round(num * 100) / 100);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Performance Metrics</h2>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Time Range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1h">Last Hour</SelectItem>
            <SelectItem value="24h">24 Hours</SelectItem>
            <SelectItem value="7d">7 Days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Active Connections
            </CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{current.activeConnections}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Database Size
            </CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(current.databaseSize)} MB</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Slow Queries
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{current.slowQueries}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Cache Hit Ratio
            </CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(current.cacheHitRatio * 100)}%
            </div>
          </CardContent>
        </Card>
      </div>

      {historical.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Active Connections Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={historical}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={(timestamp) => format(new Date(timestamp), "HH:mm")}
                    />
                    <YAxis />
                    <Tooltip
                      labelFormatter={(timestamp) => format(new Date(timestamp), "HH:mm:ss")}
                    />
                    <Line
                      type="monotone"
                      dataKey="activeConnections"
                      stroke="hsl(var(--primary))"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Database Size Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={historical}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={(timestamp) => format(new Date(timestamp), "HH:mm")}
                    />
                    <YAxis />
                    <Tooltip
                      labelFormatter={(timestamp) => format(new Date(timestamp), "HH:mm:ss")}
                    />
                    <Line
                      type="monotone"
                      dataKey="databaseSize"
                      stroke="hsl(var(--primary))"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {current.tableStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Table Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={current.tableStats}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  layout="vertical"
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="table_name" type="category" width={150} />
                  <Tooltip />
                  <Bar dataKey="row_count" fill="hsl(var(--primary))" name="Row Count" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}