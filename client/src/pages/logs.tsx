import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import BaseLayout from "@/components/layout/base-layout";
import { SelectDatabaseOperationLog, SelectDatabaseConnection, SelectTag } from "@db/schema";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

export default function LogsPage() {
  const [page, setPage] = useState(1);
  const [selectedDatabase, setSelectedDatabase] = useState<string>("");
  const [selectedTag, setSelectedTag] = useState<string>("");
  const pageSize = 20;

  // Fetch databases for filter
  const { data: databases } = useQuery<SelectDatabaseConnection[]>({
    queryKey: ['/api/databases'],
  });

  // Fetch tags for filter
  const { data: tags } = useQuery<SelectTag[]>({
    queryKey: ['/api/tags'],
  });

  // Build query string with filters
  const buildQueryString = () => {
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('pageSize', pageSize.toString());
    if (selectedDatabase) params.append('databaseId', selectedDatabase);
    if (selectedTag) params.append('tagId', selectedTag);
    return params.toString();
  };

  const { data, isLoading } = useQuery<{ logs: DatabaseLog[], total: number }>({
    queryKey: [`/api/database-logs?${buildQueryString()}`],
  });

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;

  return (
    <BaseLayout>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Database Operation Logs
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-6 flex gap-4">
            <div className="w-64">
              <Select 
                value={selectedDatabase} 
                onValueChange={(value) => {
                  setSelectedDatabase(value);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Filter by Database" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Databases</SelectItem>
                  {databases?.map((db) => (
                    <SelectItem key={db.id} value={db.id.toString()}>
                      {db.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-64">
              <Select 
                value={selectedTag} 
                onValueChange={(value) => {
                  setSelectedTag(value);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Filter by Tag" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Tags</SelectItem>
                  {tags?.map((tag) => (
                    <SelectItem key={tag.id} value={tag.id.toString()}>
                      {tag.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {isLoading ? (
            <p className="text-center text-muted-foreground">Loading logs...</p>
          ) : !data?.logs.length ? (
            <p className="text-center text-muted-foreground">No operation logs yet.</p>
          ) : (
            <>
              <div className="space-y-4">
                {data.logs.map((log) => (
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
                        {log.database && (
                          <p className="text-sm mb-2 text-primary">
                            Database: {log.database.name} ({log.database.host}:{log.database.port})
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
    </BaseLayout>
  );
}