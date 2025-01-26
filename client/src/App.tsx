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
import LogsPage from "@/pages/logs";
import TagsPage from "@/pages/tags";
import { useUser } from "@/hooks/use-user";
import { Loader2 } from "lucide-react";

function Router() {
  const { user, isLoading } = useUser();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
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
        {user ? <DatabaseForm /> : <Home />}
      </Route>
      <Route path="/databases/:id/edit">
        {user ? <DatabaseForm /> : <Home />}
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