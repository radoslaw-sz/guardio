import { AppSidebar } from "@/components/app-sidebar"
import { PageHeader } from "@/components/page-header"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { ConnectionStatus } from "@/components/connection-status"
import { RecentActivity } from "@/components/recent-activity"

export default function Page() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <PageHeader
          breadcrumb={
            <Breadcrumb>
              <BreadcrumbItem>
                <BreadcrumbPage>Dashboard</BreadcrumbPage>
              </BreadcrumbItem>
            </Breadcrumb>
          }
        />
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          {/* Top row: Connection status cards */}
          <ConnectionStatus />
          
          {/* Bottom row: Activity */}
          <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-1 items-start">
            <RecentActivity />
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
