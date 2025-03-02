import React from "react";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Database,
  Tags,
  Home,
  Activity,
  Server,
  Grid,
  Clock,
  LogOut,
  User
} from "lucide-react";
import { useUser } from "@/hooks/use-user";

export default function Navbar() {
  const { user, logout } = useUser();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const handleLogout = async () => {
    try {
      const result = await logout();
      if (result.ok) {
        setLocation("/");
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: result.message || "Logout failed",
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to logout",
      });
    }
  };

  return (
    <nav className="border-b">
      <div className="px-4 h-14 flex items-center justify-between max-w-7xl mx-auto">
        <NavigationMenu>
          <NavigationMenuList>
            <NavigationMenuItem>
              <Link href="/dashboard">
                <NavigationMenuLink className="group inline-flex h-9 w-max items-center justify-center rounded-md bg-white px-4 py-2 text-sm font-medium transition-colors hover:bg-gray-100 hover:text-gray-900 focus:bg-gray-100 focus:text-gray-900 focus:outline-none disabled:pointer-events-none disabled:opacity-50 cursor-pointer">
                  <Home className="mr-2 h-4 w-4" />
                  Dashboard
                </NavigationMenuLink>
              </Link>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <Link href="/clusters">
                <NavigationMenuLink className="group inline-flex h-9 w-max items-center justify-center rounded-md bg-white px-4 py-2 text-sm font-medium transition-colors hover:bg-gray-100 hover:text-gray-900 focus:bg-gray-100 focus:text-gray-900 focus:outline-none disabled:pointer-events-none disabled:opacity-50 cursor-pointer">
                  <Grid className="mr-2 h-4 w-4" />
                  Clusters
                </NavigationMenuLink>
              </Link>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <Link href="/databases/new">
                <NavigationMenuLink className="group inline-flex h-9 w-max items-center justify-center rounded-md bg-white px-4 py-2 text-sm font-medium transition-colors hover:bg-gray-100 hover:text-gray-900 focus:bg-gray-100 focus:text-gray-900 focus:outline-none disabled:pointer-events-none disabled:opacity-50 cursor-pointer">
                  <Database className="mr-2 h-4 w-4" />
                  Add Database
                </NavigationMenuLink>
              </Link>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <Link href="/health-check/queries">
                <NavigationMenuLink className="group inline-flex h-9 w-max items-center justify-center rounded-md bg-white px-4 py-2 text-sm font-medium transition-colors hover:bg-gray-100 hover:text-gray-900 focus:bg-gray-100 focus:text-gray-900 focus:outline-none disabled:pointer-events-none disabled:opacity-50 cursor-pointer">
                  <Activity className="mr-2 h-4 w-4" />
                  Health Queries
                </NavigationMenuLink>
              </Link>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <Link href="/health-check/reports">
                <NavigationMenuLink className="group inline-flex h-9 w-max items-center justify-center rounded-md bg-white px-4 py-2 text-sm font-medium transition-colors hover:bg-gray-100 hover:text-gray-900 focus:bg-gray-100 focus:text-gray-900 focus:outline-none disabled:pointer-events-none disabled:opacity-50 cursor-pointer">
                  <Activity className="mr-2 h-4 w-4" />
                  Health Reports
                </NavigationMenuLink>
              </Link>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <Link href="/logs">
                <NavigationMenuLink className="group inline-flex h-9 w-max items-center justify-center rounded-md bg-white px-4 py-2 text-sm font-medium transition-colors hover:bg-gray-100 hover:text-gray-900 focus:bg-gray-100 focus:text-gray-900 focus:outline-none disabled:pointer-events-none disabled:opacity-50 cursor-pointer">
                  <Activity className="mr-2 h-4 w-4" />
                  View Logs
                </NavigationMenuLink>
              </Link>
            </NavigationMenuItem>
            <NavigationMenuItem>
              <Link href="/tags">
                <NavigationMenuLink className="group inline-flex h-9 w-max items-center justify-center rounded-md bg-white px-4 py-2 text-sm font-medium transition-colors hover:bg-gray-100 hover:text-gray-900 focus:bg-gray-100 focus:text-gray-900 focus:outline-none disabled:pointer-events-none disabled:opacity-50 cursor-pointer">
                  <Tags className="mr-2 h-4 w-4" />
                  Manage Tags
                </NavigationMenuLink>
              </Link>
            </NavigationMenuItem>
            {user?.role === "ADMIN" && (
              <NavigationMenuItem>
                <Link href="/users">
                  <NavigationMenuLink className="group inline-flex h-9 w-max items-center justify-center rounded-md bg-white px-4 py-2 text-sm font-medium transition-colors hover:bg-gray-100 hover:text-gray-900 focus:bg-gray-100 focus:text-gray-900 focus:outline-none disabled:pointer-events-none disabled:opacity-50 cursor-pointer">
                    Users
                  </NavigationMenuLink>
                </Link>
              </NavigationMenuItem>
            )}
          </NavigationMenuList>
        </NavigationMenu>

        <div className="flex items-center gap-4">
          <Link href="/profile-settings">
            <Button variant="outline" size="sm">
              <User className="mr-1 h-4 w-4" />
              Profile
            </Button>
          </Link>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="mr-1 h-4 w-4" />
            Logout
          </Button>
        </div>
      </div>
    </nav>
  );
}
