import type { NotificationPluginInterface } from "../../interfaces/NotificationPluginInterface.js";
import { logger } from "../../logger.js";

/**
 * Default notification plugin: no-op. Replace with logging, metrics, or alerts.
 */
export class DefaultNotificationPlugin implements NotificationPluginInterface {
  notify(toolName: string, args: unknown): void {
    logger.debug({ toolName, args }, "Notification (default no-op)");
  }
}
