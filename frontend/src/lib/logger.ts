export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LEVEL_WEIGHT: Record<Exclude<LogLevel, "silent">, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveLogLevel(): LogLevel {
  const envValue = String(import.meta.env.VITE_LOG_LEVEL ?? "").toLowerCase();
  if (envValue === "debug" || envValue === "info" || envValue === "warn" || envValue === "error" || envValue === "silent") {
    return envValue;
  }
  return import.meta.env.DEV ? "debug" : "warn";
}

const activeLevel = resolveLogLevel();

function shouldLog(level: Exclude<LogLevel, "silent">): boolean {
  if (activeLevel === "silent") {
    return false;
  }
  return LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[activeLevel as Exclude<LogLevel, "silent">];
}

function now(): string {
  return new Date().toISOString();
}

function print(level: Exclude<LogLevel, "silent">, message: string, payload?: unknown): void {
  if (!shouldLog(level)) {
    return;
  }

  const prefix = `[AIxRWA-FE][${level.toUpperCase()}][${now()}] ${message}`;
  if (payload !== undefined) {
    if (level === "debug") {
      console.debug(prefix, payload);
      return;
    }
    if (level === "info") {
      console.info(prefix, payload);
      return;
    }
    if (level === "warn") {
      console.warn(prefix, payload);
      return;
    }
    console.error(prefix, payload);
    return;
  }

  if (level === "debug") {
    console.debug(prefix);
    return;
  }
  if (level === "info") {
    console.info(prefix);
    return;
  }
  if (level === "warn") {
    console.warn(prefix);
    return;
  }
  console.error(prefix);
}

export const logger = {
  level: activeLevel,
  debug: (message: string, payload?: unknown) => print("debug", message, payload),
  info: (message: string, payload?: unknown) => print("info", message, payload),
  warn: (message: string, payload?: unknown) => print("warn", message, payload),
  error: (message: string, payload?: unknown) => print("error", message, payload),
};
