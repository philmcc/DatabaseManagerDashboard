import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import type { SelectInstance } from "@db/schema";

const instanceSchema = z.object({
  hostname: z.string().min(1, "Hostname is required"),
  description: z.string().optional(),
  isWriter: z.boolean().default(false),
  defaultDatabaseName: z.string().optional(),
});

type FormData = z.infer<typeof instanceSchema>;

function InstanceForm() {
  const [location, navigate] = useLocation();
  const params = useParams<{ id?: string; clusterId?: string }>();
  const isEditing = params.id !== undefined;
  const clusterId = params.clusterId || (params.id ? undefined : null);

  const { data: instance, isLoading: isLoadingInstance } = useQuery<SelectInstance>(
    [`/api/instances/${params.id}`],
    { enabled: isEditing }
  );

  const { data: cluster } = useQuery<{ id: number; name: string }>(
    [`/api/clusters/${clusterId}`],
    { enabled: clusterId !== null && clusterId !== undefined }
  );

  const form = useForm<FormData>({
    resolver: zodResolver(instanceSchema),
    defaultValues: {
      hostname: instance?.hostname || "",
      description: instance?.description || "",
      isWriter: instance?.isWriter || false,
      defaultDatabaseName: instance?.defaultDatabaseName || "",
    },
  });

  const { mutate: updateWriterStatus } = useMutation({
    mutationFn: async (isWriter: boolean) => {
      const response = await fetch(`/api/instances/${params.id}/writer-status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isWriter }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Error updating writer status",
        description: error instanceof Error ? error.message : "An error occurred",
      });
      // Reset the switch if the update fails
      form.setValue("isWriter", !form.getValues("isWriter"));
    },
  });

  async function onSubmit(data: FormData) {
    try {
      const endpoint = isEditing 
        ? `/api/instances/${params.id}` 
        : `/api/clusters/${clusterId}/instances`;

      const response = await fetch(endpoint, {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      toast({
        title: `Instance ${isEditing ? "updated" : "created"} successfully`,
      });

      if (isEditing) {
        navigate(`/instances/${params.id}`);
      } else {
        navigate(`/clusters/${clusterId}`);
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save instance",
      });
    }
  }

  if (isEditing && isLoadingInstance) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>
            {isEditing ? "Edit Instance" : `New Instance${cluster ? ` for ${cluster.name}` : ""}`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="hostname"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hostname</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea {...field} />
                    </FormControl>
                    <FormDescription>
                      Provide a brief description of this instance's purpose
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="isWriter"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Writer Instance</FormLabel>
                      <FormDescription>
                        Make this instance the writer for the cluster. This will make all other instances readers.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={(checked) => {
                          if (isEditing) {
                            updateWriterStatus(checked);
                          }
                          field.onChange(checked);
                        }}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="defaultDatabaseName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default Database Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormDescription>
                      The default database to use for instance-level operations
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate(isEditing ? `/instances/${params.id}` : `/clusters/${clusterId}`)}
                >
                  Cancel
                </Button>
                <Button type="submit">
                  {isEditing ? "Update Instance" : "Create Instance"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

export default InstanceForm;
