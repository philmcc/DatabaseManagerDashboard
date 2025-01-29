import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
import { Activity, GripVertical } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import BaseLayout from "@/components/layout/base-layout";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";

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

  // Fetch queries
  const { data: queries = [], isLoading: isLoadingQueries } = useQuery<HealthCheckQuery[]>({
    queryKey: ['/api/health-check-queries'],
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to load queries: ${error.message}`,
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
      const response = await fetch(`/api/health-check-queries/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to update query');
      return response.json();
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
    mutationFn: async (queries: { id: number, displayOrder: number }[]) => {
      const response = await fetch('/api/health-check-queries/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries }),
      });
      if (!response.ok) throw new Error('Failed to reorder queries');
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
                  <div {...provided.droppableProps} ref={provided.innerRef}>
                    <Accordion type="single" collapsible>
                      {queries.map((query, index) => (
                        <Draggable
                          key={query.id}
                          draggableId={query.id.toString()}
                          index={index}
                        >
                          {(provided) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                            >
                              <AccordionItem value={query.id.toString()} className="border mb-2">
                                <div className="flex items-center">
                                  <div
                                    {...provided.dragHandleProps}
                                    className="p-2 cursor-grab"
                                  >
                                    <GripVertical className="h-5 w-5 text-muted-foreground" />
                                  </div>
                                  <AccordionTrigger className="flex-1">
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