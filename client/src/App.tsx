import React from "react";
import { Route, Switch } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Dashboard from "@/pages/dashboard";
import AuthPage from "@/pages/auth-page";
import ResetPassword from "@/pages/reset-password";
import ProfileSettings from "@/pages/profile-settings";
import DatabaseForm from "@/pages/database-form";
import DatabaseDetails from "@/pages/database-details";
import LogsPage from "@/pages/logs";
import TagsPage from "@/pages/tags";
import ClustersPage from "@/pages/clusters";
import ClusterForm from "@/pages/cluster-form";
import ClusterDetails from "@/pages/cluster-details";
import InstanceForm from "@/pages/instance-form";
import InstanceDetails from "@/pages/instance-details";
import UserManagement from "@/pages/user-management";
import HealthCheckQueries from "@/pages/health-check-queries";
import HealthCheckReports from "@/pages/health-check-reports";
import { useUser } from "@/hooks/use-user";
import { Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import PermissionDenied from "@/pages/permission-denied";

function Router() {
  const { user, isLoading } = useUser();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }

  if (!user?.isApproved) {
    return <AuthPage />;
  }

  return (
    <Switch>
      <Route path="/" component={user ? Dashboard : Home} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/profile-settings">
        {user ? <ProfileSettings /> : <Home />}
      </Route>
      <Route path="/dashboard">
        {user ? <Dashboard /> : <Home />}
      </Route>
      <Route path="/logs">
        {user ? <LogsPage /> : <Home />}
      </Route>
      <Route path="/tags">
        {user ? <TagsPage /> : <Home />}
      </Route>
      <Route path="/databases/new">
        {user?.role === 'READER' ? <PermissionDenied /> : <DatabaseForm />}
      </Route>
      <Route path="/databases/:id">
        {user ? <DatabaseDetails /> : <Home />}
      </Route>
      <Route path="/databases/:id/edit">
        {user?.role !== 'READER' ? <DatabaseForm /> : <Home />}
      </Route>
      <Route path="/clusters">
        {user ? <ClustersPage /> : <Home />}
      </Route>
      <Route path="/clusters/new">
        {user?.role === 'READER' ? <PermissionDenied /> : <ClusterForm />}
      </Route>
      <Route path="/clusters/:id">
        {user ? <ClusterDetails /> : <Home />}
      </Route>
      <Route path="/clusters/:id/edit">
        {user?.role !== 'READER' ? <ClusterForm /> : <Home />}
      </Route>
      <Route path="/clusters/:clusterId/instances/new">
        {user?.role === 'READER' ? <PermissionDenied /> : <InstanceForm />}
      </Route>
      <Route path="/clusters/:clusterId/instances/:id/edit">
        {user?.role === 'READER' ? <PermissionDenied /> : <InstanceForm />}
      </Route>
      <Route path="/clusters/:clusterId/instances/:id">
        <InstanceDetails />
      </Route>
      <Route path="/instances/:id" match={(params) => !params.id.includes('/')}>
        {user ? <InstanceDetails /> : <Home />}
      </Route>
      <Route path="/users">
        {user?.role === 'ADMIN' ? <UserManagement /> : <Home />}
      </Route>
      <Route path="/health-check/queries">
        {user?.role === 'READER' ? <PermissionDenied /> : <HealthCheckQueries />}
      </Route>
      <Route path="/health-check/reports">
        {user ? <HealthCheckReports /> : <Home />}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;