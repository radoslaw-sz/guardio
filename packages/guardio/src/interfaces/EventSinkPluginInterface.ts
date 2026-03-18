export type GuardioEvent = {
  eventId: string;
  timestamp: string; // ISO

  eventType: string;
  actionType?: string;

  agentId?: string;
  agentNameSnapshot?: string;
  traceId?: string;
  spanId?: string;

  targetResource?: string;

  decision?: "ALLOWED" | "BLOCKED" | "MODIFIED";

  policyEvaluation?: Record<string, any>;

  requestPayload?: Record<string, any>;
  responsePayload?: Record<string, unknown>;
  metrics?: Record<string, any>;
  metadata?: Record<string, any>;

  /**
   * Simulation-related metadata. Indicates whether Simulation Mode was in effect
   * when this event was produced, and what activated it.
   */
  simulation?: {
    /** Whether Simulation Mode was enabled for this request. */
    enabled: boolean;
    /** Source of activation (e.g. global runtime setting vs per-request header). */
    source?: "global" | "header" | "tool";
  };

  httpStatus?: number;
  errorCode?: string;

  schemaVersion: "0.1.0";
};

export interface EventSinkPluginInterface {
  readonly name: string;

  emit(event: GuardioEvent): Promise<void>;

  flush?(): Promise<void>;

  shutdown?(): Promise<void>;
}
