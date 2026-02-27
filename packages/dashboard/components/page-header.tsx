"use client"

import React from "react"
import { Separator } from "@/components/ui/separator"
import {
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { ModeToggle } from "@/components/mode-toggle"

interface PageHeaderProps {
  breadcrumb?: React.ReactNode
  children?: React.ReactNode
}

export function PageHeader({ breadcrumb, children }: PageHeaderProps) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between px-4 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mr-2 data-[orientation=vertical]:h-4"
        />
        {breadcrumb}
      </div>
      <div className="flex items-center gap-2">
        {children}
        <ModeToggle />
      </div>
    </header>
  )
}
