import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useLocation, useParams } from "wouter";
import BaseLayout from "@/components/layout/base-layout";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database } from "lucide-react";
import { SelectDatabaseConnection, SelectInstance, SelectTag } from "@db/schema";
import { useEffect, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  instanceId: z.coerce.number().min(1, "Instance is required"),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  databaseName: z.string().min(1, "Database name is required"),
  tags: z.array(z.coerce.number()).default([]),
  useSSHTunnel: z.boolean().default(false),
  sshHost: z.string().optional(),
  sshPort: z.coerce.number().default(22),
  sshUsername: z.string().optional(),
  sshPassword: z.string().optional(),
  sshPrivateKey: z.string().optional(),
  sshKeyPassphrase: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

export default function DatabaseForm() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const params = useParams();
  const isEditMode = params.id != null;
  const [isTestingConnection, setIsTestingConnection] = useState(false);

  const { data: existingDatabase, isLoading: isLoadingDatabase } = useQuery<SelectDatabaseConnection>({
    queryKey: [`/api/databases/${params.id}`],
    enabled: isEditMode,
  });

  const { data: instances = [] } = useQuery<SelectInstance[]>({
    queryKey: ['/api/instances'],
  });

  const { data: tags = [] } = useQuery<SelectTag[]>({
    queryKey: ['/api/tags'],
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      tags: [],
    },
  });

  // Update form values when existing database data is loaded
  useEffect(() => {
    if (existingDatabase) {
      form.reset({
        name: existingDatabase.name,
        instanceId: existingDatabase.instanceId || undefined,
        username: existingDatabase.username,
        password: existingDatabase.password,
        databaseName: existingDatabase.databaseName,
        tags: existingDatabase.tags?.map(t => t.tagId) || [],
        useSSHTunnel: existingDatabase.useSSHTunnel || false,
        sshHost: existingDatabase.sshHost || "",
        sshPort: existingDatabase.sshPort || 22,
        sshUsername: existingDatabase.sshUsername || "",
        sshPassword: existingDatabase.sshPassword || "",
        sshPrivateKey: existingDatabase.sshPrivateKey || "",
        sshKeyPassphrase: existingDatabase.sshKeyPassphrase || "",
      });
    }
  }, [existingDatabase, form]);

  // Test connection mutation
  const { mutate: testConnection } = useMutation({
    mutationFn: async (values: FormData) => {
      setIsTestingConnection(true);
      try {
        const res = await fetch("/api/test-connection", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Accept": "application/json" // Explicitly request JSON
          },
          body: JSON.stringify({
            instanceId: values.instanceId,
            username: values.username,
            password: values.password,
            databaseName: values.databaseName
          }),
          credentials: "include",
        });

        const contentType = res.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          throw new Error('Server returned unexpected response format');
        }

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.message || errorData.error || 'Connection test failed');
        }

        return res.json();
      } finally {
        setIsTestingConnection(false);
      }
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Connection test successful",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    },
  });

  const { mutateAsync: createDatabase, isPending: isCreating } = useMutation({
    mutationFn: async (values: FormData) => {
      const res = await fetch("/api/databases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
        credentials: "include",
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error("You don't have permission to create databases. Writer or Admin access is required.");
        }
        const error = await res.text();
        throw new Error(error);
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/databases'] });
      queryClient.invalidateQueries({ queryKey: ['/api/database-logs'] });
    },
  });

  const { mutateAsync: updateDatabase, isPending: isUpdating } = useMutation({
    mutationFn: async (values: FormData) => {
      const res = await fetch(`/api/databases/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.text();
        throw new Error(error);
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/databases'] });
      queryClient.invalidateQueries({ queryKey: [`/api/databases/${params.id}`] });
      queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0].toString().includes('/api/database-logs')
      });
    },
  });

  const onSubmit = async (values: FormData) => {
    try {
      if (isEditMode) {
        await updateDatabase(values);
        toast({
          title: "Success",
          description: "Database connection updated successfully",
        });
      } else {
        await createDatabase(values);
        toast({
          title: "Success",
          description: "Database connection added successfully",
        });
      }
      setLocation("/");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  };

  const handleTestConnection = () => {
    const values = form.getValues();
    if (!values.instanceId || !values.username || !values.password || !values.databaseName) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please fill in all required fields before testing the connection",
      });
      return;
    }
    testConnection(values);
  };

  if (isEditMode && isLoadingDatabase) {
    return (
      <BaseLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <p>Loading database details...</p>
        </div>
      </BaseLayout>
    );
  }

  const selectedInstance = instances.find(
    instance => instance.id === form.watch('instanceId')
  );

  return (
    <BaseLayout>
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              {isEditMode ? "Edit Database Connection" : "Add Database Connection"}
            </CardTitle>
            <p className="mt-2 text-sm text-muted-foreground">
              Note: Database connections are now automatically maintained by scanning instances.
              Use this form only for manual overrides or to add extra entries at the cluster level.
            </p>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="My Production Database" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="instanceId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Instance</FormLabel>
                      <Select
                        onValueChange={(value) => field.onChange(parseInt(value, 10))}
                        value={field.value?.toString()}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select an instance" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {instances.map((instance) => (
                            <SelectItem key={instance.id} value={instance.id.toString()}>
                              {instance.hostname} ({instance.isWriter ? 'Writer' : 'Reader'})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {selectedInstance && (
                  <div className="rounded-md bg-muted p-4 text-sm">
                    <p>Selected Instance Details:</p>
                    <p>Hostname: {selectedInstance.hostname}</p>
                    <p>Port: {selectedInstance.port}</p>
                    <p>Role: {selectedInstance.isWriter ? 'Writer' : 'Reader'}</p>
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="databaseName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Database Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="tags"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tags</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          const currentTags = field.value || [];
                          const tagId = parseInt(value);
                          if (!currentTags.includes(tagId)) {
                            field.onChange([...currentTags, tagId]);
                          }
                        }}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select tags" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {tags.map((tag) => (
                            <SelectItem key={tag.id} value={tag.id.toString()}>
                              {tag.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {field.value?.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {field.value.map((tagId) => {
                            const tag = tags.find(t => t.id === tagId);
                            if (!tag) return null;
                            return (
                              <div
                                key={tag.id}
                                className="bg-secondary text-secondary-foreground px-2 py-1 rounded-md text-sm flex items-center gap-2"
                              >
                                {tag.name}
                                <button
                                  type="button"
                                  onClick={() => {
                                    field.onChange(field.value.filter(id => id !== tagId));
                                  }}
                                  className="hover:text-destructive"
                                >
                                  ×
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="mt-4">
                  <FormField
                    control={form.control}
                    name="useSSHTunnel"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>
                            Connect via SSH Tunnel
                          </FormLabel>
                          <FormDescription>
                            Use this when direct connection to the database is not possible
                          </FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>

                {form.watch('useSSHTunnel') && (
                  <div className="space-y-4 mt-4 p-4 border rounded-md">
                    <h3 className="font-medium">SSH Tunnel Configuration</h3>
                    
                    <FormField
                      control={form.control}
                      name="sshHost"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>SSH Host</FormLabel>
                          <FormControl>
                            <Input placeholder="ssh.example.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="sshPort"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>SSH Port</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              placeholder="22"
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="sshUsername"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>SSH Username</FormLabel>
                          <FormControl>
                            <Input placeholder="username" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <Tabs defaultValue="password" className="w-full">
                      <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="password">Password</TabsTrigger>
                        <TabsTrigger value="key">Private Key</TabsTrigger>
                        <TabsTrigger value="file">PEM File</TabsTrigger>
                      </TabsList>
                      
                      <TabsContent value="password">
                        <FormField
                          control={form.control}
                          name="sshPassword"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>SSH Password</FormLabel>
                              <FormControl>
                                <Input type="password" placeholder="password" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </TabsContent>
                      
                      <TabsContent value="key">
                        <FormField
                          control={form.control}
                          name="sshPrivateKey"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Private Key</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Paste your private key here"
                                  className="h-28"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="sshKeyPassphrase"
                          render={({ field }) => (
                            <FormItem className="mt-4">
                              <FormLabel>Key Passphrase (if any)</FormLabel>
                              <FormControl>
                                <Input
                                  type="password"
                                  placeholder="passphrase"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </TabsContent>
                      
                      <TabsContent value="file">
                        <FormItem>
                          <FormLabel>PEM File</FormLabel>
                          <FormControl>
                            <Input 
                              type="file" 
                              accept=".pem,.key,.ppk"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onload = (event) => {
                                    const contents = event.target?.result as string;
                                    form.setValue('sshPrivateKey', contents);
                                  };
                                  reader.readAsText(file);
                                }
                              }}
                            />
                          </FormControl>
                          <FormDescription>
                            Upload a .pem file containing your private key
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                        
                        <FormField
                          control={form.control}
                          name="sshKeyPassphrase"
                          render={({ field }) => (
                            <FormItem className="mt-4">
                              <FormLabel>Key Passphrase (if any)</FormLabel>
                              <FormControl>
                                <Input
                                  type="password"
                                  placeholder="passphrase"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </TabsContent>
                    </Tabs>
                  </div>
                )}

                <div className="flex justify-between items-center">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleTestConnection}
                    disabled={isTestingConnection}
                  >
                    {isTestingConnection ? "Testing..." : "Test Connection"}
                  </Button>

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setLocation("/")}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={isCreating || isUpdating}>
                      {isEditMode
                        ? (isUpdating ? "Updating..." : "Update Database")
                        : (isCreating ? "Adding..." : "Add Database")
                      }
                    </Button>
                  </div>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </BaseLayout>
  );
}