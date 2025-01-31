import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Activity, GripVertical, Play } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import BaseLayout from "@/components/layout/base-layout";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";

const querySchema = z.object({
  title: z.string().min(1, "Title is required"),
  query: z.string().min(1, "Query is required"),
  runOnAllInstances: z.boolean(),
  active: z.boolean(),
});

type HealthCheckQuery = {
  id: number;
  title: string;
  query: string;
  runOnAllInstances: boolean;
  active: boolean;
  displayOrder: number;
};

export default function HealthCheckQueries() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedClusterId, setSelectedClusterId] = useState<string>("");

  // Fetch queries
  const { data: queries = [], isLoading: isLoadingQueries } = useQuery<HealthCheckQuery[]>({
    queryKey: ['/api/health-check-queries'],
    queryFn: async () => {
      const response = await fetch('/api/health-check-queries');
      if (!response.ok) throw new Error('Failed to fetch queries');
      return response.json();
    },
  });

  // Fetch clusters for the run report dropdown
  const { data: clusters = [] } = useQuery({
    queryKey: ['/api/clusters'],
    queryFn: async () => {
      const response = await fetch('/api/clusters');
      if (!response.ok) throw new Error('Failed to fetch clusters');
      return response.json();
    },
  });

  // Run health check mutation
  const runHealthCheck = useMutation({
    mutationFn: async (clusterId: string) => {
      const response = await fetch('/api/health-check-executions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clusterId }),
      });
      if (!response.ok) throw new Error('Failed to run health check');
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: "Health check started successfully",
      });
      // Redirect to reports page
      window.location.href = '/health-check/reports';
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Add new query mutation
  const addMutation = useMutation({
    mutationFn: async (data: z.infer<typeof querySchema>) => {
      const response = await fetch('/api/health-check-queries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to add query');
      }
      return response.json();
    },
    onMutate: () => {
      toast({
        title: "Saving...",
        description: "Adding new health check query",
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/health-check-queries'] });
      toast({
        title: "Success",
        description: `Query "${data.title}" added successfully`,
      });
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update query mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number, data: z.infer<typeof querySchema> }) => {
      console.log('Sending update request for query ID:', id, 'Data:', data);
      
      const response = await fetch(`/api/health-check-queries/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));
      
      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const error = contentType?.includes('application/json') 
          ? await response.json()
          : await response.text();
        console.error('Update error:', error);
        throw new Error(error.message || error.error || 'Failed to update query');
      }
      
      const responseData = await response.json();
      console.log('Update successful:', responseData);
      return responseData;
    },
    onMutate: () => {
      toast({
        title: "Saving...",
        description: "Updating health check query",
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/health-check-queries'] });
      toast({
        title: "Success",
        description: `Query "${data.title}" updated successfully`,
      });
      setEditingId(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Reorder mutation
  const reorderMutation = useMutation({
    mutationFn: async (queries: { id: number; displayOrder: number }[]) => {
      const response = await fetch('/api/health-check-queries/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries }),
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/health-check-queries'] });
      toast({
        title: "Success",
        description: "Query order updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const form = useForm<z.infer<typeof querySchema>>({
    resolver: zodResolver(querySchema),
    defaultValues: {
      title: "",
      query: "",
      runOnAllInstances: false,
      active: true,
    },
  });

  const onSubmit = (values: z.infer<typeof querySchema>) => {
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: values });
    } else {
      addMutation.mutate(values);
    }
  };

  const handleDragEnd = (result: any) => {
    if (!result.destination) return;

    const items = Array.from(queries);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    const updatedQueries = items.map((query, index) => ({
      id: query.id,
      displayOrder: index,
    }));

    reorderMutation.mutate(updatedQueries);
  };

  if (isLoadingQueries) {
    return (
      <BaseLayout>
        <div className="flex items-center justify-center p-8">
          <Activity className="h-8 w-8 animate-spin text-primary" />
        </div>
      </BaseLayout>
    );
  }

  return (
    <BaseLayout>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Health Check Queries
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Run Report Section */}
          <div className="mb-8 space-y-2">
            <div className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              Select Cluster
            </div>
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <Select value={selectedClusterId} onValueChange={setSelectedClusterId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a cluster to run health check" />
                  </SelectTrigger>
                  <SelectContent>
                    {clusters.map((cluster: any) => (
                      <SelectItem key={cluster.id} value={cluster.id.toString()}>
                        {cluster.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="default"
                onClick={() => selectedClusterId && runHealthCheck.mutate(selectedClusterId)}
                disabled={!selectedClusterId || runHealthCheck.isPending}
              >
                {runHealthCheck.isPending ? (
                  <>
                    <Activity className="mr-2 h-4 w-4 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    Run Report
                  </>
                )}
              </Button>
            </div>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter query title" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="query"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SQL Query</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Enter SQL query"
                        className="font-mono"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex gap-4">
                <FormField
                  control={form.control}
                  name="runOnAllInstances"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2">
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormLabel>Run on all instances</FormLabel>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="active"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2">
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormLabel>Active</FormLabel>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <Button 
                type="submit" 
                disabled={addMutation.isPending || updateMutation.isPending}
              >
                {addMutation.isPending || updateMutation.isPending ? (
                  <>
                    <Activity className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  editingId ? "Update Query" : "Add Query"
                )}
              </Button>
            </form>
          </Form>

          <div className="mt-8">
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="queries">
                {(provided) => (
                  <div 
                    {...provided.droppableProps} 
                    ref={provided.innerRef}
                    className="min-h-[500px] relative"
                  >
                    <Accordion type="single" collapsible className="space-y-2">
                      {queries.map((query, index) => (
                        <Draggable
                          key={query.id}
                          draggableId={query.id.toString()}
                          index={index}
                        >
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              style={{
                                ...provided.draggableProps.style,
                                touchAction: 'none',
                              }}
                              className={`bg-background rounded-lg shadow-sm hover:shadow-md transition-shadow ${
                                snapshot.isDragging ? 'bg-accent/50 shadow-md ring-1 ring-primary' : ''
                              }`}
                            >
                              <AccordionItem value={query.id.toString()} className="border">
                                <div className="flex items-center">
                                  <div
                                    {...provided.dragHandleProps}
                                    className="p-3 cursor-grab active:cursor-grabbing hover:bg-accent/50 rounded-l-lg self-stretch flex items-center z-10"
                                    style={{ touchAction: 'none' }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <GripVertical className="h-5 w-5 text-muted-foreground" />
                                  </div>
                                  <AccordionTrigger 
                                    className="flex-1 hover:no-underline px-4 min-h-[60px]"
                                  >
                                    <div className="flex items-center justify-between w-full pr-4">
                                      <span>{query.title}</span>
                                      <div className="flex items-center gap-2">
                                        {query.runOnAllInstances && (
                                          <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                                            All Instances
                                          </span>
                                        )}
                                        <span
                                          className={`text-xs px-2 py-1 rounded ${
                                            query.active
                                              ? "bg-green-100 text-green-800"
                                              : "bg-red-100 text-red-800"
                                          }`}
                                        >
                                          {query.active ? "Active" : "Inactive"}
                                        </span>
                                      </div>
                                    </div>
                                  </AccordionTrigger>
                                </div>
                                <AccordionContent>
                                  <div className="p-4 space-y-4">
                                    <pre className="bg-muted p-4 rounded-md overflow-x-auto">
                                      <code>{query.query}</code>
                                    </pre>
                                    <div className="flex justify-end">
                                      <Button
                                        variant="outline"
                                        onClick={() => {
                                          setEditingId(query.id);
                                          form.reset({
                                            title: query.title,
                                            query: query.query,
                                            runOnAllInstances: query.runOnAllInstances,
                                            active: query.active,
                                          });
                                        }}
                                      >
                                        Edit
                                      </Button>
                                    </div>
                                  </div>
                                </AccordionContent>
                              </AccordionItem>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </Accordion>
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          </div>
        </CardContent>
      </Card>
    </BaseLayout>
  );
}