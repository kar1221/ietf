export const Logger = {
  log(message: string, scope?: string) {
    console.log(scope ? `[${scope}] ${message}` : message);
  },

  warn(message: string, scope?: string) {
    console.warn(scope ? `[${scope}] ${message}` : message);
  },

  error(message: string, scope?: string) {
    console.error(scope ? `[${scope}] ${message}` : message);
  }
};
