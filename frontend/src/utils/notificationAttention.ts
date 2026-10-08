// Kept by the app provider so changing pages does not replay the sign-in alert.
export function createNotificationAttention() {
  let session = '';
  let seen = new Set<string>();
  let initialised = false;
  let attention = false;
  return {
    observe(sessionId: string, keys: string[]) {
      if (session !== sessionId) {
        session = sessionId;
        seen = new Set();
        initialised = false;
        attention = false;
      }
      const first = !initialised;
      const added = keys.filter(key => !seen.has(key));
      const alert = keys.length > 0 && (first || added.length > 0);
      if (alert) attention = true;
      if (!keys.length) attention = false;
      seen = new Set(keys);
      initialised = true;
      return {first, added, alert, attention};
    },
    acknowledge() { attention = false; },
  };
}
