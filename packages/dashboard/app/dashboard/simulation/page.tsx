"use client"

import { AppSidebar } from "@/components/app-sidebar"
import { PageHeader } from "@/components/page-header"
import { SimulationPageContent } from "@/components/simulation-page-content"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"

export default function SimulationPage() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <PageHeader
          breadcrumb={
            <Breadcrumb>
              <BreadcrumbItem>
                <BreadcrumbPage>Simulation</BreadcrumbPage>
              </BreadcrumbItem>
            </Breadcrumb>
          }
        />
        <SimulationPageContent />
      </SidebarInset>
    </SidebarProvider>
  )
}

