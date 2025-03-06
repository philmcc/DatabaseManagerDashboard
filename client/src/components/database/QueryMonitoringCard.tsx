import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionItem, AccordionContent, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type QueryGroup = {
  id: number;
  name: string;
  description: string | null;
  isKnown: boolean;
};

type DiscoveredQuery = {
  id: number;
  queryText: string;
  group: string | null;
  status: string;
  lastRun: string;
  isKnown: boolean;
  name?: string;
};

const QueryMonitoringCard = ({ databaseId }: { databaseId: number }) => {
  const [queries, setQueries] = useState<DiscoveredQuery[]>([]);
  const [groups, setGroups] = useState<QueryGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDescription, setNewGroupDescription] = useState("");

  // Fetch queries data
  const { data: queriesData } = useQuery({
    queryKey: [`database-${databaseId}-discovered-queries`],
    queryFn: async () => {
      // Replace with actual API call when ready
      return [] as DiscoveredQuery[];
    },
    onSuccess: (data) => {
      setQueries(data);
    }
  });

  // Fetch groups data
  const { data: groupsData } = useQuery({
    queryKey: [`database-${databaseId}-query-groups`],
    queryFn: async () => {
      // Replace with actual API call when ready
      return [] as QueryGroup[];
    },
    onSuccess: (data) => {
      setGroups(data);
    }
  });

  const handleMarkQueryKnown = (id: number, isKnown: boolean) => {
    // Implement the logic to mark a query as known or new
    console.log(`Marking query ${id} as ${isKnown ? 'known' : 'new'}`);
  };

  const handleUpdateInterval = (value: number) => {
    // Implement the logic to update the interval
    console.log(`Updating interval to ${value}`);
  };

  const handleAssignToGroup = (queryId: number, groupId: number | null) => {
    // Implement the logic to assign a query to a group
    console.log(`Assigning query ${queryId} to group ${groupId}`);
  };

  return (
    <Card className="mt-6">
      <CardContent className="pt-6">
        <Accordion type="single" collapsible>
          <AccordionItem value="item-1">
            <AccordionTrigger>Query Monitoring</AccordionTrigger>
            <AccordionContent>
              <div className="flex space-x-4 mt-4">
                <div className="flex-1">
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select filter" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Queries</SelectItem>
                      <SelectItem value="known">Known Queries</SelectItem>
                      <SelectItem value="unknown">Unknown Queries</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select group" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Groups</SelectItem>
                      <SelectItem value="ungrouped">Ungrouped</SelectItem>
                      {groups.map((group) => (
                        <SelectItem key={group.id} value={group.id.toString()}>
                          {group.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recent">Most Recent</SelectItem>
                      <SelectItem value="oldest">Oldest</SelectItem>
                      <SelectItem value="calls">Most Calls</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mt-4">
                {queries.length > 0 ? (
                  <div className="space-y-4">
                    <ScrollArea className="h-[400px]">
                      <Table>
                        <TableBody>
                          {queries.map((query) => (
                            <TableRow key={query.id}>
                              <TableCell>{query.name}</TableCell>
                              <TableCell>{query.group}</TableCell>
                              <TableCell>{query.status}</TableCell>
                              <TableCell>{query.lastRun}</TableCell>
                              <TableCell>
                                <Select>
                                  <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="Assign to Group" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="">Ungrouped</SelectItem>
                                    {groups.map((group) => (
                                      <SelectItem key={group.id} value={group.id.toString()}>
                                        {group.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>
                                <div className="flex space-x-2">
                                  <Button
                                    variant={query.isKnown ? "outline" : "default"}
                                    size="sm"
                                    onClick={() => handleMarkQueryKnown(query.id, !query.isKnown)}
                                  >
                                    {query.isKnown ? "Mark as New" : "Mark as Known"}
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </div>
                ) : (
                  <div className="text-center p-6 border rounded-md">
                    <p>No queries found.</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Start monitoring to discover queries or adjust your filters.
                    </p>
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