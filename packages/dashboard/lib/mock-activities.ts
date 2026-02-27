export interface ActivityEntry {
  id: string;
  timestamp: Date;
  type: "allowed" | "denied";
  agent: string;
  tool: string;
  policy?: string;
}

export const MOCK_ACTIVITIES: ActivityEntry[] = [
  {
    id: "1",
    timestamp: new Date(Date.now() - 5 * 60000),
    type: "allowed",
    agent: "Claude Agent",
    tool: "file_system",
    policy: "Default Policy",
  },
  {
    id: "2",
    timestamp: new Date(Date.now() - 15 * 60000),
    type: "allowed",
    agent: "Research Bot",
    tool: "web_search",
    policy: "Research Policy",
  },
  {
    id: "3",
    timestamp: new Date(Date.now() - 35 * 60000),
    type: "denied",
    agent: "Unknown Agent",
    tool: "system_command",
    policy: "Security Policy",
  },
  {
    id: "4",
    timestamp: new Date(Date.now() - 1 * 3600000),
    type: "allowed",
    agent: "Data Processor",
    tool: "database_query",
    policy: "Default Policy",
  },
  {
    id: "5",
    timestamp: new Date(Date.now() - 2 * 3600000),
    type: "denied",
    agent: "Test Agent",
    tool: "admin_panel",
    policy: "Admin Policy",
  },
  {
    id: "6",
    timestamp: new Date(Date.now() - 3 * 3600000),
    type: "allowed",
    agent: "Analytics Engine",
    tool: "data_export",
    policy: "Analytics Policy",
  },
  {
    id: "7",
    timestamp: new Date(Date.now() - 4 * 3600000),
    type: "denied",
    agent: "Suspicious Bot",
    tool: "credential_access",
    policy: "Security Policy",
  },
  {
    id: "8",
    timestamp: new Date(Date.now() - 5 * 3600000),
    type: "allowed",
    agent: "Deployment Bot",
    tool: "deployment",
    policy: "CI/CD Policy",
  },
  {
    id: "9",
    timestamp: new Date(Date.now() - 6 * 3600000),
    type: "allowed",
    agent: "Monitoring Service",
    tool: "metrics_read",
    policy: "Monitoring Policy",
  },
  {
    id: "10",
    timestamp: new Date(Date.now() - 7 * 3600000),
    type: "denied",
    agent: "Rogue Process",
    tool: "system_shutdown",
    policy: "Security Policy",
  },
];
