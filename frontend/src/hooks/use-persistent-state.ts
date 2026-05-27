import * as React from "react";

export function usePersistentState<T>(
  key: string,
  initialValue: T,
) {
  const [value, setValue] = React.useState<T>(() => {
    if (typeof window === "undefined") {
      return initialValue;
    }

    try {
      const stored = window.localStorage.getItem(key);
      if (stored === null) {
        return initialValue;
      }
      return JSON.parse(stored) as T;
    } catch {
      return initialValue;
    }
  });

  React.useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore storage failures and keep the UI interactive.
    }
  }, [key, value]);

  return [value, setValue] as const;
}
