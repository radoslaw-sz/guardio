/**
 * Notification plugin interface for side effects when tool calls are
 * intercepted (e.g. logging, metrics, alerts). Can be no-op for now.
 */
export interface NotificationPluginInterface {
  /**
   * Notify about a tool call event (e.g. before/after approval).
   * @param toolName - Name of the tool
   * @param args - Arguments passed to the tool
   */
  notify(toolName: string, args: unknown): void;
}
