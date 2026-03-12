import { z } from "zod";
import type {
  PolicyPluginInterface,
  PolicyRequestContext,
  PolicyResult,
  PluginRepository,
} from "../../interfaces/index.js";
import type { PolicyPluginContext } from "../../interfaces/PolicyPluginContext.js";
import type { PolicyPluginDefinition } from "../../config/plugin-types.js";
import { logger } from "../../logger.js";

export const rateLimitToolConfigSchema = z.object({
  /** Maximum calls allowed per time window. */
  limit: z.number().int().min(1).describe("Maximum calls allowed per window"),
  /** Time window duration in seconds. */
  windowSeconds: z
    .number()
    .int()
    .min(1)
    .describe("Time window in seconds"),
});

export type RateLimitToolPolicyPluginConfig = z.infer<typeof rateLimitToolConfigSchema>;

interface RateLimitData extends Record<string, unknown> {
  windowStart: number;
  count: number;
}

/**
 * RJSF UI schema for the rate-limit-tool policy configuration form.
 */
export const RATE_LIMIT_TOOL_UI_SCHEMA: object = {
  limit: {
    "ui:title": "Request Limit",
    "ui:description": "Maximum number of calls allowed per time window",
    "ui:placeholder": "10",
  },
  windowSeconds: {
    "ui:title": "Window (seconds)",
    "ui:description": "Time window duration in seconds",
    "ui:placeholder": "60",
  },
};

/**
 * Rate limiting policy plugin that enforces a maximum number of tool calls
 * within a configurable time window. Uses PluginRepository for persistence.
 *
 * Uses fixed time windows (e.g., 0:00-1:00, 1:00-2:00) for simplicity.
 * If PluginRepository is not available, fails open (allows all requests).
 */
export class RateLimitToolPolicyPlugin implements PolicyPluginInterface {
  readonly name = "rate-limit-tool";

  private readonly limit: number;
  private readonly windowSeconds: number;
  private readonly windowMs: number;
  private readonly repo?: PluginRepository;

  getConfigSchema(): z.ZodType {
    return rateLimitToolConfigSchema;
  }

  getUiSchema(): object {
    return RATE_LIMIT_TOOL_UI_SCHEMA;
  }

  constructor(config: Record<string, unknown>, context?: PolicyPluginContext) {
    const parsed = rateLimitToolConfigSchema.safeParse(config);
    if (!parsed.success) {
      throw new Error(
        `RateLimitToolPolicyPlugin invalid config: ${parsed.error.message}`,
      );
    }
    this.limit = parsed.data.limit;
    this.windowSeconds = parsed.data.windowSeconds;
    this.windowMs = this.windowSeconds * 1000;
    this.repo = context?.pluginRepository;

    if (!this.repo) {
      logger.warn(
        { plugin: this.name },
        "RateLimitToolPolicyPlugin initialized without PluginRepository; rate limiting will be disabled",
      );
    }
  }

  async evaluate(context: PolicyRequestContext): Promise<PolicyResult> {
    if (!this.repo) {
      logger.debug(
        { toolName: context.toolName, plugin: this.name },
        "No PluginRepository available; allowing request (fail-open)",
      );
      return { verdict: "allow" };
    }

    const now = Date.now();
    const currentWindowStart = Math.floor(now / this.windowMs);
    const contextKey = `ratelimit:${context.toolName}`;

    const doc = await this.repo.getDocument(contextKey);
    const storedData = doc?.data as RateLimitData | undefined;

    const storedWindowStart = storedData?.windowStart ?? 0;
    const isNewWindow = storedWindowStart !== currentWindowStart;
    const currentCount = isNewWindow ? 0 : (storedData?.count ?? 0);

    const resetsAtMs = (currentWindowStart + 1) * this.windowMs;
    const resetsAt = new Date(resetsAtMs).toISOString();

    if (currentCount >= this.limit) {
      logger.debug(
        {
          toolName: context.toolName,
          plugin: this.name,
          currentCount,
          limit: this.limit,
          windowSeconds: this.windowSeconds,
        },
        "Rate limit exceeded",
      );
      return {
        verdict: "block",
        code: "RATE_LIMIT_EXCEEDED",
        reason: `Rate limit exceeded: ${currentCount}/${this.limit} calls in ${this.windowSeconds}s window. Resets at ${resetsAt}.`,
        metadata: {
          currentCount,
          limit: this.limit,
          windowSeconds: this.windowSeconds,
          resetsAt,
        },
      };
    }

    const newCount = currentCount + 1;
    const newData: RateLimitData = {
      windowStart: currentWindowStart,
      count: newCount,
    };
    await this.repo.saveDocument(contextKey, newData, doc?.id);

    logger.debug(
      {
        toolName: context.toolName,
        plugin: this.name,
        count: newCount,
        limit: this.limit,
        windowSeconds: this.windowSeconds,
      },
      "Rate limit check passed",
    );

    return {
      verdict: "allow",
      metadata: {
        currentCount: newCount,
        limit: this.limit,
        windowSeconds: this.windowSeconds,
        resetsAt,
      },
    };
  }
}

export const rateLimitToolDefinition: PolicyPluginDefinition = {
  name: "rate-limit-tool",
  factory: (config, context) => new RateLimitToolPolicyPlugin(config, context),
  configSchema: rateLimitToolConfigSchema,
  uiSchema: RATE_LIMIT_TOOL_UI_SCHEMA,
};
