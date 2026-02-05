import type { InterventionPluginInterface } from "../../interfaces/InterventionPluginInterface.js";
import type { InterventionRequestContext } from "../../interfaces/InterventionTypes.js";

/**
 * Default intervention plugin: no-op. Receives config from guardio config; override act() for side effects.
 */
export class DefaultInterventionPlugin implements InterventionPluginInterface {
  readonly name = "default";

  constructor(private readonly config: Record<string, unknown> = {}) {}

  act(_context: InterventionRequestContext): void {
    // Empty for now; config is available as this.config for subclasses or future use
  }
}
