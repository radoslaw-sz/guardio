import pino from "pino";
import pinoPretty from "pino-pretty";

const level =
  (process.env.LOG_LEVEL as pino.Level) ||
  (process.env.NODE_ENV === "development" ? "debug" : "info");
const usePretty =
  process.env.LOG_PRETTY === "1" || process.env.NODE_ENV === "development";

const prettyStream = usePretty
  ? pinoPretty({
      colorize: true,
      translateTime: "SYS:standard",
    })
  : undefined;

export const logger = pino(
  {
    level,
    base: { name: "guardio" },
  },
  prettyStream ?? process.stdout
);

export type Logger = pino.Logger;
