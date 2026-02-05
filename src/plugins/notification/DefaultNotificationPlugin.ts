import type { NotificationPluginInterface } from "../../interfaces/NotificationPluginInterface.js";

/**
 * Default notification plugin: no-op. Replace with logging, metrics, or alerts.
 */
export class DefaultNotificationPlugin implements NotificationPluginInterface {
  notify(_toolName: string, _args: unknown): void {
    // Empty for now
  }
}
