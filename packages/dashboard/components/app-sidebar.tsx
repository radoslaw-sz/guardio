"use client";

import * as React from "react";
import {
  Activity,
  GalleryVerticalEnd,
  LayoutDashboard,
  Network,
  Shield,
} from "lucide-react";

import { NavMain, type NavGroup } from "@/components/nav-main";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

const navGroups: NavGroup[] = [
  {
    label: "Platform",
    items: [
      { title: "Dashboard", url: "/", icon: LayoutDashboard },
      { title: "Topology", url: "/dashboard/topology", icon: Network },
      { title: "Policies", url: "/dashboard/policies", icon: Shield },
      { title: "Activity", url: "/dashboard/activity", icon: Activity },
    ],
  },
  {
    label: "Resources",
    items: [
      { title: "Agents", url: "/dashboard/agents", icon: GalleryVerticalEnd },
      { title: "MCPs", url: "/dashboard/mcps", icon: Network },
    ],
  },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="cursor-default">
              <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                <Shield className="size-4" />
              </div>
              <span className="truncate font-medium">Guardio</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain groups={navGroups} />
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
