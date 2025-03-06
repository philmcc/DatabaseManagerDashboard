import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionItem, AccordionContent, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Database, Activity, Plus, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

// Define constants for select values
const ALL_QUERIES = "all_queries";
const UNGROUPED = "ungrouped";

type QueryMonitoringConfig = {
  id?: number;
  databaseId: number;
  intervalMinutes: number;
  isActive: boolean;
  lastRunAt: string | null;
};

type QueryGroup = {
  id: number;
  databaseId: number;
  name: string;
  description: string | null;
  isKnown: boolean;
};

type DiscoveredQuery = {
  id: number;
  databaseId: number;
  queryText: string;
  queryHash: string;
  normalizedQuery: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  callCount: number;
  totalTime: number;
  minTime: number | null;
  maxTime: number | null;
  meanTime: number | null;
  isKnown: boolean;
  groupId: number | null;
};

const QueryMonitoringCard = ({ databaseId }: { databaseId: number }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showKnown, setShowKnown] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(ALL_QUERIES);
  const [intervalMinutes, setIntervalMinutes] = useState(15);
  const [isMonitoringActive, setIsMonitoringActive] = useState(false);
  const [activeAccordion, setActiveAccordion] = useState<string>("monitoring-config");

  // Change mock data flag to false
  const useMockedData = false;

  // Generate test groups
  const generateTestGroups = (): QueryGroup[] => {
    return [
      {
        id: 1,
        databaseId,
        name: "User Queries",
        description: "Queries related to user operations",
        isKnown: true
      },
      {
        id: 2,
        databaseId,
        name: "Product Queries",
        description: "Queries related to product operations",
        isKnown: false
      }
    ];
  };

  // Generate test configuration
  const testConfig = {
    id: 1,
    databaseId,
    intervalMinutes: 15,
    isActive: true,
    lastRunAt: new Date().toISOString()
  };

  // Add this function to generate test query data
  const generateTestQueries = (): DiscoveredQuery[] => {
    return Array.from({ length: 5 }).map((_, i) => ({
      id: i + 1,
      databaseId,
      queryText: `SELECT * FROM users WHERE id = ${i + 1}`,
      queryHash: `hash${i}`,
      normalizedQuery: null,
      firstSeenAt: new Date(Date.now() - 3600000 * 24).toISOString(),
      lastSeenAt: new Date().toISOString(),
      callCount: Math.floor(Math.random() * 100),
      totalTime: Math.random() * 1000,
      minTime: Math.random() * 10,
      maxTime: Math.random() * 100,
      meanTime: Math.random() * 50,
      isKnown: i % 3 === 0,
      groupId: i % 5 === 0 ? 1 : null,
    }));
  };

  // Use mocked data in queries
  const { data: config, isLoading: isLoadingConfig } = useQuery({
    queryKey: [`database-${databaseId}-monitoring-config`],
    queryFn: async () => {
      if (useMockedData) {
        return testConfig;
      }
      
      try {
        const response = await fetch(`/api/databases/${databaseId}/query-monitoring/config`);
        console.log('Config API response status:', response.status);
        
        // If not ok, get the response text for debugging
        if (!response.ok) {
          const errorText = await response.text();
          console.error('API Error Response:', errorText);
          throw new Error(`${response.status}: ${errorText.substring(0, 100)}...`);
        }
        
        return await response.json();
      } catch (error) {
        console.error("Error fetching monitoring config:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to load monitoring configuration"
        });
        // Return a default value
        return { isActive: false, intervalMinutes: 15, lastRunAt: null };
      }
    },
    // We can retry a few times to handle temporary issues
    retry: 2,
    // Don't fail immediately on error
    retryDelay: 1000,
    onSuccess: (data) => {
      setIntervalMinutes(data.intervalMinutes || 15);
      setIsMonitoringActive(data.isActive || false);
    }
  });

  // Fetch query groups
  const { data: groups = generateTestGroups(), isLoading: isLoadingGroups } = useQuery({
    queryKey: [`database-${databaseId}-query-groups`],
    queryFn: async () => {
      if (useMockedData) {
        return generateTestGroups();
      }
      
      try {
        const response = await fetch(`/api/databases/${databaseId}/query-groups`);
        if (!response.ok) {
          throw new Error("Failed to fetch query groups");
        }
        return await response.json();
      } catch (error) {
        console.error("Error fetching query groups:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to load query groups"
        });
        return [];
      }
    }
  });

  // Fetch discovered queries
  const { data: queries = [], isLoading: isLoadingQueries, refetch: refetchQueries } = useQuery({
    queryKey: [`database-${databaseId}-discovered-queries`, { showKnown, groupId: selectedGroupId }],
    queryFn: async () => {
      if (useMockedData) {
        // Return mock data consistently
        return generateTestQueries();
      }
      
      try {
        const queryParams = new URLSearchParams();
        queryParams.append("showKnown", showKnown.toString());
        
        // Handle special group ID values
        if (selectedGroupId === UNGROUPED) {
          queryParams.append("groupId", "ungrouped");
        } else if (selectedGroupId !== ALL_QUERIES && selectedGroupId) {
          queryParams.append("groupId", selectedGroupId);
        }
        
        const response = await fetch(
          `/api/databases/${databaseId}/discovered-queries?${queryParams}`
        );
        
        if (!response.ok) {
          throw new Error("Failed to fetch discovered queries");
        }
        
        const data = await response.json();
        console.log("Queries loaded:", data.length, "items");
        return data;
      } catch (error) {
        console.error("Error fetching discovered queries:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to load discovered queries"
        });
        return [];
      }
    },
    onSuccess: (data) => {
      console.log("Queries loaded:", data.length, "items");
    }
  });

  // Update monitoring config
  const updateConfigMutation = useMutation({
    mutationFn: async () => {
      try {
        const response = await fetch(`/api/databases/${databaseId}/query-monitoring/config`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            isActive: isMonitoringActive,
            intervalMinutes
          }),
        });
        
        if (!response.ok) {
          throw new Error("Failed to update monitoring configuration");
        }
        
        return await response.json();
      } catch (error) {
        console.error("Error updating config:", error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: [`database-${databaseId}-monitoring-config`] 
      });
      toast({
        title: "Success",
        description: "Monitoring configuration updated",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update configuration",
      });
    },
  });

  // Start monitoring
  const startMonitoringMutation = useMutation({
    mutationFn: async () => {
      try {
        // Using relative path for API URL 
        const apiUrl = `/api/databases/${databaseId}/query-monitoring/start`;
        
        console.log('Attempting to call API:', apiUrl);
        
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({})
        });
        
        console.log('API Response Status:', response.status);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('API Error Response:', errorText.substring(0, 200));
          throw new Error(`Failed to start monitoring: ${response.status}`);
        }
        
        return await response.json();
      } catch (error) {
        console.error("Error starting monitoring:", error);
        throw error;
      }
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Query monitoring started",
      });
      // After a slight delay, refetch the queries to show newly discovered ones
      setTimeout(() => {
        refetchQueries();
      }, 2000);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to start monitoring",
      });
    },
  });

  // Mark query as known/unknown
  const markQueryMutation = useMutation({
    mutationFn: async ({ queryId, isKnown }: { queryId: number, isKnown: boolean }) => {
      try {
        const response = await fetch(`/api/databases/${databaseId}/discovered-queries`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            queryId,
            isKnown
          }),
        });
        
        if (!response.ok) {
          throw new Error("Failed to update query");
        }
        
        return await response.json();
      } catch (error) {
        console.error("Error updating query:", error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: [`database-${databaseId}-discovered-queries`] 
      });
      toast({
        title: "Success",
        description: "Query updated",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update query",
      });
    },
  });

  // Assign query to group
  const assignToGroupMutation = useMutation({
    mutationFn: async ({ queryId, groupId }: { queryId: number, groupId: number | null }) => {
      try {
        const response = await fetch(`/api/databases/${databaseId}/discovered-queries`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            queryId,
            groupId
          }),
        });
        
        if (!response.ok) {
          throw new Error("Failed to assign query to group");
        }
        
        return await response.json();
      } catch (error) {
        console.error("Error assigning query to group:", error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: [`database-${databaseId}-discovered-queries`] 
      });
      toast({
        title: "Success",
        description: "Query group updated",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update query group",
      });
    },
  });

  const handleUpdateConfig = () => {
    updateConfigMutation.mutate();
  };

  const testApiConnection = async () => {
    try {
      console.log('Testing API connection...');
      
      // Log all request details
      const requestDetails = {
        url: '/api/test',
        method: 'GET',
        timestamp: new Date().toISOString()
      };
      console.log('Request details:', requestDetails);
      
      const response = await fetch('/api/test');
      console.log('Test API Response Status:', response.status);
      console.log('Test API Response Headers:', Object.fromEntries([...response.headers.entries()]));
      
      if (!response.ok) {
        const text = await response.text();
        console.error('API test error response:', text);
        throw new Error('API test failed');
      }
      
      const data = await response.json();
      console.log('API test successful response data:', data);
      
      // Now that test is working, let's try query monitoring API
      console.log('Testing query monitoring API...');
      const monitoringTestResponse = await fetch(`/api/databases/${databaseId}/query-monitoring/config`);
      console.log('Monitoring config API status:', monitoringTestResponse.status);
      
      if (!monitoringTestResponse.ok) {
        const errorText = await monitoringTestResponse.text();
        console.error('Monitoring config API error:', errorText.substring(0, 200));
        return false;
      }
      
      const configData = await monitoringTestResponse.json();
      console.log('Monitoring config data:', configData);
      
      return true;
    } catch (error) {
      console.error('API test error:', error);
      return false;
    }
  };

  const handleStartMonitoring = () => {
    if (useMockedData) {
      const mockQueries = generateTestQueries();
      console.log("Generated mock queries:", mockQueries.length, "items");
      
      // Simulate API success with mock data
      toast({
        title: "Monitoring Started (Mock)",
        description: "Using mock data - showing sample queries"
      });
      
      // Update state to show mock queries - use EXACT same query key format
      queryClient.setQueryData(
        [`database-${databaseId}-discovered-queries`, { showKnown, groupId: selectedGroupId }], 
        mockQueries
      );
      
      // After setting query data
      const updatedData = queryClient.getQueryData([
        `database-${databaseId}-discovered-queries`, 
        { showKnown, groupId: selectedGroupId }
      ]);
      console.log("Updated query data:", updatedData);
      
      // Open the discovered queries accordion
      setActiveAccordion("discovered-queries");
      
      return;
    }
    
    // Original API call logic
    testApiConnection().then(success => {
      if (success) {
        startMonitoringMutation.mutate();
      } else {
        toast({
          variant: "destructive",
          title: "API Error",
          description: "Could not connect to the API. Check console for details."
        });
      }
    });
  };

  const handleMarkQueryKnown = (queryId: number, isKnown: boolean) => {
    markQueryMutation.mutate({ queryId, isKnown });
  };

  const handleAssignToGroup = (queryId: number, groupId: number | null) => {
    assignToGroupMutation.mutate({ queryId, groupId });
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Query Monitoring
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Accordion 
          type="single" 
          collapsible 
          className="w-full"
          value={activeAccordion}
          onValueChange={setActiveAccordion}
        >
          <AccordionItem value="monitoring-config">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Monitoring Configuration
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="pt-4">
                {isLoadingConfig ? (
                  <div className="flex justify-center">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="monitoring-active"
                        checked={isMonitoringActive}
                        onCheckedChange={setIsMonitoringActive}
                      />
                      <Label htmlFor="monitoring-active">Enable Query Monitoring</Label>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="interval">Check Interval (minutes)</Label>
                        <Input
                          id="interval"
                          type="number"
                          min="1"
                          max="60"
                          value={intervalMinutes}
                          onChange={(e) => setIntervalMinutes(parseInt(e.target.value))}
                        />
                      </div>
                      
                      <div className="flex items-end">
                        <Button
                          onClick={handleUpdateConfig}
                          disabled={updateConfigMutation.isPending}
                          className="mb-1"
                        >
                          {updateConfigMutation.isPending && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          )}
                          Save Configuration
                        </Button>
                      </div>
                    </div>
                    
                    {config?.lastRunAt && (
                      <div className="pt-2">
                        <p className="text-sm text-muted-foreground">
                          Last run: {formatDistanceToNow(new Date(config.lastRunAt))} ago
                        </p>
                      </div>
                    )}
                    
                    <div className="pt-4">
                      <Button 
                        onClick={handleStartMonitoring}
                        disabled={!isMonitoringActive || startMonitoringMutation.isPending}
                      >
                        {startMonitoringMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-2 h-4 w-4" />
                        )}
                        Start Monitoring Now
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
          
          <AccordionItem value="discovered-queries" className="border-t">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4" />
                Discovered Queries
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="pt-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowKnown(!showKnown)}
                      className="flex items-center gap-2"
                    >
                      {showKnown ? "Hide Known Queries" : "Show Known Queries"}
                    </Button>
                    
                    <Select 
                      value={selectedGroupId || ALL_QUERIES} 
                      onValueChange={(value) => setSelectedGroupId(value)}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Filter by Group" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_QUERIES}>All Queries</SelectItem>
                        <SelectItem value={UNGROUPED}>Ungrouped</SelectItem>
                        {groups.map((group) => (
                          <SelectItem key={group.id} value={group.id.toString()}>
                            {group.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => refetchQueries()}
                    className="flex items-center gap-2"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Refresh
                  </Button>
                </div>
                
                {isLoadingQueries ? (
                  <div className="flex justify-center p-4">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : queries.length === 0 ? (
                  <div className="text-center p-6 border rounded-md">
                    <p>No queries found.</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {config?.isActive 
                        ? "Start monitoring to discover queries or adjust your filters."
                        : "Enable monitoring in the configuration tab, then start monitoring to discover queries."}
                    </p>
                  </div>
                ) : (
                  <div className="border rounded-md">
                    <ScrollArea className="h-[400px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[100px]">Status</TableHead>
                            <TableHead>Query</TableHead>
                            <TableHead className="w-[150px]">First Seen</TableHead>
                            <TableHead className="w-[150px]">Last Seen</TableHead>
                            <TableHead className="w-[100px]">Call Count</TableHead>
                            <TableHead className="w-[150px]">Group</TableHead>
                            <TableHead className="w-[150px]">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {queries.map((query) => (
                            <TableRow key={query.id}>
                              <TableCell>
                                {query.isKnown ? (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                    Known
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                    New
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="max-h-20 overflow-y-auto">
                                  <code className="text-xs whitespace-pre-wrap break-all">
                                    {query.queryText}
                                  </code>
                                </div>
                              </TableCell>
                              <TableCell>
                                {formatDistanceToNow(new Date(query.firstSeenAt))} ago
                              </TableCell>
                              <TableCell>
                                {formatDistanceToNow(new Date(query.lastSeenAt))} ago
                              </TableCell>
                              <TableCell>{query.callCount}</TableCell>
                              <TableCell>
                                <Select 
                                  value={query.groupId?.toString() || UNGROUPED} 
                                  onValueChange={(value) => handleAssignToGroup(
                                    query.id, 
                                    value === UNGROUPED ? null : parseInt(value)
                                  )}
                                >
                                  <SelectTrigger className="w-[120px]">
                                    <SelectValue placeholder="Ungrouped" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value={UNGROUPED}>Ungrouped</SelectItem>
                                    {groups.map((group) => (
                                      <SelectItem key={group.id} value={group.id.toString()}>
                                        {group.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant={query.isKnown ? "outline" : "default"}
                                  size="sm"
                                  onClick={() => handleMarkQueryKnown(query.id, !query.isKnown)}
                                >
                                  {query.isKnown ? "Mark as New" : "Mark as Known"}
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </div>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
};

export default QueryMonitoringCard; 