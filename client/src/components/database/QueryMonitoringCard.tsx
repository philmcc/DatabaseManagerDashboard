import React, { useState, useRef, useEffect } from "react";
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
import { Loader2, Database, Activity, Plus, RefreshCw, CalendarIcon, SearchIcon, XCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";

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
  const [dateRange, setDateRange] = useState<string>("all");
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(undefined);
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState<string>("");

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

  // Update the fetch queries function to include the new filters
  const fetchQueries = async () => {
    try {
      console.log('Fetching queries for database', databaseId, {
        showKnown,
        dateRange,
        selectedGroupId,
        searchQuery
      });
      
      // Construct URL with query parameters
      let apiUrl = `/api/databases/${databaseId}/discovered-queries`;
      
      // Add query parameters
      const params = new URLSearchParams();
      
      // Handle date range filter
      if (dateRange !== 'all') {
        let startDate: Date | undefined;
        let endDate: Date | undefined = new Date(); // Default end date is now
        
        // Calculate start date based on selected range
        const now = new Date();
        switch (dateRange) {
          case 'today':
            startDate = new Date(now.setHours(0, 0, 0, 0));
            break;
          case 'yesterday':
            startDate = new Date(now.setDate(now.getDate() - 1));
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(now.setHours(23, 59, 59, 999));
            break;
          case 'week':
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 7);
            break;
          case 'month':
            startDate = new Date(now);
            startDate.setMonth(now.getMonth() - 1);
            break;
          case 'custom':
            // For custom range, use the custom date selectors
            startDate = customStartDate;
            endDate = customEndDate;
            break;
        }
        
        // Add date parameters if available
        if (startDate) params.append('startDate', startDate.toISOString());
        if (endDate) params.append('endDate', endDate.toISOString());
        
        console.log('Date range filter:', { range: dateRange, startDate, endDate });
      } else {
        // When "all" is selected, don't add date filters
        console.log('Using "all time" filter - no date restrictions');
      }
      
      // Add other filters
      if (searchQuery) params.append('search', searchQuery);
      if (selectedGroupId && selectedGroupId !== ALL_QUERIES) {
        params.append('groupId', selectedGroupId === UNGROUPED ? 'null' : selectedGroupId);
      }
      
      // Add show known parameter
      params.append('showKnown', showKnown.toString());
      
      // Add cache-busting timestamp to prevent 304 responses
      params.append('_t', Date.now().toString());
      
      const queryString = params.toString();
      if (queryString) {
        apiUrl = `${apiUrl}?${queryString}`;
      }
      
      console.log('Fetching from URL:', apiUrl);
      
      // Set cache: 'no-store' to prevent caching
      const response = await fetch(apiUrl, {
        cache: 'no-store'
      });
      
      // Log response status
      console.log('Query fetch response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response from server:', errorText);
        throw new Error(`Failed to fetch queries: ${response.status}`);
      }
      
      const data = await response.json();
      console.log(`Fetched ${data.length} queries`);
      return data;
    } catch (error) {
      console.error('Error fetching queries:', error);
      throw error;
    }
  };

  // Update the useQuery hook to remove the random value from the query key
  const { data: queries = [], isLoading: isLoadingQueries, refetch: refetchQueries } = useQuery({
    queryKey: [
      `database-${databaseId}-discovered-queries`, 
      showKnown, 
      selectedGroupId, 
      dateRange,
      customStartDate?.toISOString(),
      customEndDate?.toISOString(),
      searchQuery
    ],
    queryFn: fetchQueries,
    // Keep these settings to ensure fresh data each time filters change
    staleTime: 0,
    cacheTime: 1000 * 60, // Cache for 1 minute instead of 0
    refetchOnWindowFocus: true,
    refetchOnMount: true
  });

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
        
        // Enhanced error logging
        if (!response.ok) {
          const errorText = await response.text();
          console.error('API Error Response:', errorText.substring(0, 500));
          console.error('Response headers:', Object.fromEntries([...response.headers]));
          throw new Error(`Failed to start monitoring: ${response.status} - ${errorText.substring(0, 100)}`);
        }
        
        const data = await response.json();
        console.log('API Response Data:', data);
        return data;
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
    
    // Call the actual monitoring endpoint directly
    startMonitoringMutation.mutate();
  };

  const handleMarkQueryKnown = (queryId: number, isKnown: boolean) => {
    markQueryMutation.mutate({ queryId, isKnown });
  };

  const handleAssignToGroup = (queryId: number, groupId: number | null) => {
    assignToGroupMutation.mutate({ queryId, groupId });
  };

  // Also update filter change handlers to use this function
  const handleDateRangeChange = (range: string) => {
    setDateRange(range);
    if (range !== "custom") {
      setCustomStartDate(undefined);
      setCustomEndDate(undefined);
      // Force a refetch after state updates
      setTimeout(() => refetchQueries(), 0);
    }
  };

  // Add this function to handle search input changes
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    // Use a small delay to avoid too many requests during typing
    clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      console.log("Search query changed, refetching:", value);
      refetchQueries();
    }, 500);
  };

  // Add this at the top of the component with other state variables
  const searchTimeoutRef = React.useRef<NodeJS.Timeout>();

  // Clean up the timeout on component unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  // Near the top of the return statement, add some debug output
  console.log('Render state:', { 
    isLoadingQueries, 
    queriesLength: queries.length, 
    showKnown 
  });

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
                <div className="flex flex-col space-y-4 mb-4">
                  <div className="flex items-center justify-between mb-2">
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
                  
                  {/* New Date Range Filter */}
                  <div className="flex items-center space-x-2">
                    <Label className="w-24">Time Range:</Label>
                    <div className="flex flex-wrap gap-2">
                      <Button 
                        variant={dateRange === "all" ? "default" : "outline"} 
                        size="sm" 
                        onClick={() => handleDateRangeChange("all")}
                      >
                        All Time
                      </Button>
                      <Button 
                        variant={dateRange === "hour" ? "default" : "outline"} 
                        size="sm" 
                        onClick={() => handleDateRangeChange("hour")}
                      >
                        Last Hour
                      </Button>
                      <Button 
                        variant={dateRange === "day" ? "default" : "outline"} 
                        size="sm" 
                        onClick={() => handleDateRangeChange("day")}
                      >
                        Last Day
                      </Button>
                      <Button 
                        variant={dateRange === "week" ? "default" : "outline"} 
                        size="sm" 
                        onClick={() => handleDateRangeChange("week")}
                      >
                        Last Week
                      </Button>
                      <Button 
                        variant={dateRange === "custom" ? "default" : "outline"} 
                        size="sm" 
                        onClick={() => {
                          handleDateRangeChange("custom");
                          if (!customStartDate) setCustomStartDate(new Date(Date.now() - 86400000)); // Default to last 24 hours
                          if (!customEndDate) setCustomEndDate(new Date());
                        }}
                      >
                        Custom
                      </Button>
                    </div>
                  </div>
                  
                  {/* Custom Date Range Picker - show only when custom is selected */}
                  {dateRange === "custom" && (
                    <div className="flex items-center space-x-2">
                      <Label className="w-24">Custom Range:</Label>
                      <div className="flex items-center gap-2">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className="w-[180px] justify-start text-left font-normal"
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {customStartDate ? format(customStartDate, "PPP") : "Start date"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar
                              mode="single"
                              selected={customStartDate}
                              onSelect={setCustomStartDate}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <span>to</span>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className="w-[180px] justify-start text-left font-normal"
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {customEndDate ? format(customEndDate, "PPP") : "End date"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar
                              mode="single"
                              selected={customEndDate}
                              onSelect={setCustomEndDate}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                  )}
                  
                  {/* Search Box */}
                  <div className="flex items-center space-x-2">
                    <Label className="w-24">Search Query:</Label>
                    <div className="flex-1">
                      <div className="relative">
                        <SearchIcon className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search query text..."
                          value={searchQuery}
                          onChange={(e) => handleSearchChange(e.target.value)}
                          className="pl-8"
                        />
                        {searchQuery && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSearchChange("")}
                            className="absolute right-1 top-1 h-7 w-7 p-0"
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Add a debug component at the end of the filters section */}
                {process.env.NODE_ENV === 'development' && (
                  <div className="text-xs text-muted-foreground border-t pt-2 mt-4">
                    <details>
                      <summary>Debug Filter Info</summary>
                      <div className="mt-2 space-y-1">
                        <div><strong>Show Known:</strong> {showKnown.toString()}</div>
                        <div><strong>Group ID:</strong> {selectedGroupId || 'all'}</div>
                        <div><strong>Date Range:</strong> {dateRange}</div>
                        {customStartDate && <div><strong>Custom Start:</strong> {customStartDate.toISOString()}</div>}
                        {customEndDate && <div><strong>Custom End:</strong> {customEndDate.toISOString()}</div>}
                        <div><strong>Search:</strong> "{searchQuery || '(none)'}"</div>
                        <div><strong>Query Count:</strong> {queries.length}</div>
                        <div><strong>Last Fetch:</strong> {new Date().toISOString()}</div>
                      </div>
                    </details>
                  </div>
                )}
                
                {isLoadingQueries ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="mr-2 h-8 w-8 animate-spin" />
                    <span>Loading queries...</span>
                  </div>
                ) : queries.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-gray-500">No queries found with the current filters</div>
                    {!showKnown && (
                      <div className="mt-2">
                        <Button variant="outline" onClick={() => setShowKnown(true)}>
                          Show Known Queries
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {queries.map((query) => (
                      <div key={query.id} className="border rounded-md overflow-hidden">
                        <Accordion type="single" collapsible className="w-full">
                          <AccordionItem value="details" className="border-none">
                            <AccordionTrigger className="px-4 py-3 hover:no-underline">
                              <div className="flex items-center justify-between w-full text-left">
                                <div className="flex items-center gap-3">
                                  {query.isKnown ? (
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                      Known
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                      New
                                    </span>
                                  )}
                                  <div className="font-mono text-sm truncate max-w-[500px]">
                                    {query.queryText.split('\n')[0].substring(0, 100)}
                                    {query.queryText.length > 100 ? '...' : ''}
                                  </div>
                                </div>
                                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                  <div>
                                    <span className="font-medium">Last seen:</span> {formatDistanceToNow(new Date(query.lastSeenAt))} ago
                                  </div>
                                  <div>
                                    <span className="font-medium">Calls:</span> {query.callCount}
                                  </div>
                                </div>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent>
                              <div className="px-4 pb-4 pt-0 space-y-4">
                                <div className="bg-muted p-3 rounded-md overflow-x-auto">
                                  <pre className="text-xs whitespace-pre-wrap break-all">{query.queryText}</pre>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <div className="text-sm">
                                      <span className="font-medium">First seen:</span> {formatDistanceToNow(new Date(query.firstSeenAt))} ago
                                    </div>
                                    <div className="text-sm">
                                      <span className="font-medium">Last seen:</span> {formatDistanceToNow(new Date(query.lastSeenAt))} ago
                                    </div>
                                    <div className="text-sm">
                                      <span className="font-medium">Call count:</span> {query.callCount}
                                    </div>
                                  </div>
                                  
                                  <div className="space-y-2">
                                    {query.meanTime !== null && query.meanTime !== undefined && (
                                      <div className="text-sm">
                                        <span className="font-medium">Mean time:</span> {typeof query.meanTime === 'number' ? query.meanTime.toFixed(2) : query.meanTime} ms
                                      </div>
                                    )}
                                    {query.minTime !== null && query.minTime !== undefined && (
                                      <div className="text-sm">
                                        <span className="font-medium">Min time:</span> {typeof query.minTime === 'number' ? query.minTime.toFixed(2) : query.minTime} ms
                                      </div>
                                    )}
                                    {query.maxTime !== null && query.maxTime !== undefined && (
                                      <div className="text-sm">
                                        <span className="font-medium">Max time:</span> {typeof query.maxTime === 'number' ? query.maxTime.toFixed(2) : query.maxTime} ms
                                      </div>
                                    )}
                                  </div>
                                </div>
                                
                                <div className="flex items-center justify-between pt-2 border-t">
                                  <div className="flex items-center gap-2">
                                    <Label htmlFor={`group-${query.id}`} className="text-sm">Group:</Label>
                                    <Select 
                                      value={query.groupId?.toString() || UNGROUPED} 
                                      onValueChange={(value) => handleAssignToGroup(
                                        query.id, 
                                        value === UNGROUPED ? null : parseInt(value)
                                      )}
                                    >
                                      <SelectTrigger id={`group-${query.id}`} className="w-[180px]">
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
                                  </div>
                                  
                                  <Button
                                    variant={query.isKnown ? "outline" : "default"}
                                    size="sm"
                                    onClick={() => handleMarkQueryKnown(query.id, !query.isKnown)}
                                  >
                                    {query.isKnown ? "Mark as New" : "Mark as Known"}
                                  </Button>
                                </div>
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      </div>
                    ))}
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