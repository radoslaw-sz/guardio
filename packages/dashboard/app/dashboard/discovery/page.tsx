import { AppSidebar } from "@/components/app-sidebar"
import { PageHeader } from "@/components/page-header"
import { Card } from "@/components/ui/card"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"

export default function DiscoveryPage() {
  const discoveredTools = [
    {
      id: 1,
      name: "filesystem",
      version: "1.0.0",
      status: "available",
      description: "Access and manipulate local filesystem",
      capabilities: ["read_file", "write_file", "list_directory", "delete_file"],
      lastDiscovered: "5 minutes ago",
    },
    {
      id: 2,
      name: "web_server",
      version: "2.1.3",
      status: "available",
      description: "HTTP/HTTPS web server capabilities",
      capabilities: ["make_request", "fetch_content", "parse_html", "follow_redirects"],
      lastDiscovered: "10 minutes ago",
    },
    {
      id: 3,
      name: "database_connector",
      version: "1.5.0",
      status: "pending",
      description: "Database query and management",
      capabilities: ["execute_sql", "inspect_schema", "manage_transactions"],
      lastDiscovered: "15 minutes ago",
    },
    {
      id: 4,
      name: "image_processing",
      version: "3.0.2",
      status: "available",
      description: "Image manipulation and analysis",
      capabilities: ["resize_image", "convert_format", "apply_filters", "extract_metadata"],
      lastDiscovered: "20 minutes ago",
    },
    {
      id: 5,
      name: "code_executor",
      version: "1.2.0",
      status: "unavailable",
      description: "Execute code in sandboxed environment",
      capabilities: ["run_python", "run_javascript", "run_bash"],
      lastDiscovered: "1 hour ago",
    },
    {
      id: 6,
      name: "api_gateway",
      version: "2.0.1",
      status: "available",
      description: "API integration and management",
      capabilities: ["list_endpoints", "test_api", "generate_client"],
      lastDiscovered: "30 minutes ago",
    },
  ]

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
      case 'unavailable':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    }
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <PageHeader
          breadcrumb={
            <Breadcrumb>
              <BreadcrumbItem>
                <BreadcrumbPage>Discovery</BreadcrumbPage>
              </BreadcrumbItem>
            </Breadcrumb>
          }
        />
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          {/* Discovery Stats */}
          <div className="grid auto-rows-min gap-4 md:grid-cols-3">
            <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 p-6">
              <div className="text-sm font-medium text-blue-600 dark:text-blue-300 mb-2">Total Discovered</div>
              <div className="text-3xl font-bold text-blue-900 dark:text-blue-50 mb-2">{discoveredTools.length}</div>
              <div className="text-xs text-blue-700 dark:text-blue-200">MCP Tools found</div>
            </Card>
            <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 p-6">
              <div className="text-sm font-medium text-green-600 dark:text-green-300 mb-2">Available</div>
              <div className="text-3xl font-bold text-green-900 dark:text-green-50 mb-2">
                {discoveredTools.filter(t => t.status === 'available').length}
              </div>
              <div className="text-xs text-green-700 dark:text-green-200">Ready to connect</div>
            </Card>
            <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900 p-6">
              <div className="text-sm font-medium text-purple-600 dark:text-purple-300 mb-2">Last Scan</div>
              <div className="text-lg font-bold text-purple-900 dark:text-purple-50 mb-2">5 minutes ago</div>
              <div className="text-xs text-purple-700 dark:text-purple-200">Auto-refresh enabled</div>
            </Card>
          </div>

          {/* Discovered Tools List */}
          <Card className="bg-white dark:bg-gray-950 p-6 border border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Discovered MCP Tools</h2>
              <button className="text-xs bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded-lg transition-colors">
                Refresh Scan
              </button>
            </div>
            <div className="space-y-3">
              {discoveredTools.map((tool) => (
                <Card key={tool.id} className="p-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="font-semibold text-sm">{tool.name}</div>
                        <span className="text-xs text-gray-500 dark:text-gray-400">v{tool.version}</span>
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-400">{tool.description}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(tool.status)}`}>
                        {tool.status}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{tool.lastDiscovered}</div>
                    </div>
                  </div>
                  
                  {/* Capabilities */}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {tool.capabilities.map((cap, idx) => (
                      <span key={idx} className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1 rounded">
                        {cap}
                      </span>
                    ))}
                  </div>

                  {/* Action Button */}
                  {tool.status === 'available' && (
                    <div className="mt-3">
                      <button className="text-xs bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-700 dark:text-blue-200 px-3 py-1 rounded transition-colors">
                        Connect
                      </button>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </Card>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
