import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
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

function Router() {
  const { user, isLoading } = useUser();
  
  // Define canWrite based on user role
  const canWrite = user && (user.role === 'ADMIN' || user.role === 'WRITER');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }

  // Important: Move the reset-password route outside the authenticated routes
  // so it can be accessed without being logged in
  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      <Route path="/reset-password" component={ResetPassword} />
      
      {!user ? (
        <Route path="/:rest*" component={AuthPage} />
      ) : (
        <>
          <Route path="/" exact>
            {() => <Redirect to="/dashboard" />}
          </Route>
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/profile-settings" component={ProfileSettings} />
          <Route path="/logs" component={LogsPage} />
          <Route path="/tags" component={TagsPage} />
          <Route path="/databases/new">
            {canWrite ? <DatabaseForm /> : <Dashboard />}
          </Route>
          <Route path="/databases/:id" component={DatabaseDetails} />
          <Route path="/databases/:id/edit">
            {canWrite ? <DatabaseForm /> : <Dashboard />}
          </Route>
          <Route path="/clusters" component={ClustersPage} />
          <Route path="/clusters/new">
            {canWrite ? <ClusterForm /> : <Dashboard />}
          </Route>
          <Route path="/clusters/:id" component={ClusterDetails} />
          <Route path="/clusters/:id/edit">
            {canWrite ? <ClusterForm /> : <Dashboard />}
          </Route>
          <Route path="/clusters/:clusterId/instances/new">
            {canWrite ? <InstanceForm /> : <Dashboard />}
          </Route>
          <Route path="/clusters/:clusterId/instances/:id/edit">
            {canWrite ? <InstanceForm /> : <Dashboard />}
          </Route>
          <Route path="/clusters/:clusterId/instances/:id" component={InstanceDetails} />
          <Route path="/instances/:id" component={InstanceDetails} />
          <Route path="/users">
            {user.role === 'ADMIN' ? <UserManagement /> : <Dashboard />}
          </Route>
          <Route path="/health-check/queries">
            {canWrite ? <HealthCheckQueries /> : <Dashboard />}
          </Route>
          <Route path="/health-check/reports" component={HealthCheckReports} />
          <Route component={NotFound} />
        </>
      )}
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router />
      <Toaster />
    </QueryClientProvider>
  );
}