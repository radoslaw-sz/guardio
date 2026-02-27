import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { TopologyView } from "@/components/topology-view";

export default function TopologyPage() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <PageHeader
          breadcrumb={
            <Breadcrumb>
              <BreadcrumbItem>
                <BreadcrumbPage>Topology</BreadcrumbPage>
              </BreadcrumbItem>
            </Breadcrumb>
          }
        />
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <TopologyView />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
