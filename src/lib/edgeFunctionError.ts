// supabase-js FunctionsHttpError/FunctionsRelayError put the raw fetch Response on
// `context` — its body must be read asynchronously to get the real server-side error message,
// otherwise callers only ever see the generic "Edge Function returned a non-2xx status code".
export const getEdgeFunctionErrorMessage = async (err: unknown, fallback = 'Edge function request failed'): Promise<string> => {
  if (err && typeof err === 'object') {
    const anyErr = err as any;

    const context = anyErr?.context;
    if (context && typeof context.clone === 'function') {
      try {
        const parsed = await context.clone().json();
        const msg = parsed?.error || parsed?.message;
        if (typeof msg === 'string' && msg.trim().length > 0) return msg;
      } catch {
        try {
          const text = await context.clone().text();
          if (text && text.trim().length > 0) return text;
        } catch {
          // ignore
        }
      }
    }

    const message = anyErr?.message;
    if (typeof message === 'string' && message.trim().length > 0) return message;
  }

  return fallback;
};
