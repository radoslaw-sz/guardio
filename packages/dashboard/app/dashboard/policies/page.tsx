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
import { PoliciesPageContent } from "@/components/policies-page-content"

export default function PoliciesPage() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <PageHeader
          breadcrumb={
            <Breadcrumb>
              <BreadcrumbItem>
                <BreadcrumbPage>Policies</BreadcrumbPage>
              </BreadcrumbItem>
            </Breadcrumb>
          }
        />
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <div>
            <h2 className="text-lg font-semibold mb-1">Policies</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Policy instances control which tools agents can use. Create one and assign it globally or to specific agents and tools.
            </p>
            <PoliciesPageContent />
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
