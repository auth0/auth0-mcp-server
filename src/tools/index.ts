import { ACTION_HANDLERS, ACTION_TOOLS } from './actions.js';
import { APPLICATION_HANDLERS, APPLICATION_TOOLS } from './applications.js';
import type { HandlerConfig, HandlerRequest, HandlerResponse, Tool } from '../utils/types.js';
import { FORM_HANDLERS, FORM_TOOLS } from './forms.js';
import { LOG_HANDLERS, LOG_TOOLS } from './logs.js';
import { RESOURCE_SERVER_HANDLERS, RESOURCE_SERVER_TOOLS } from './resource-servers.js';
import { CONNECTION_HANDLERS, CONNECTION_TOOLS } from './connections.js';
import trackEvent from '../utils/analytics.js';

// Combine all tools into a single array
export const TOOLS: Tool[] = [
  ...APPLICATION_TOOLS,
  ...RESOURCE_SERVER_TOOLS,
  ...CONNECTION_TOOLS,
  ...ACTION_TOOLS,
  ...LOG_TOOLS,
  ...FORM_TOOLS,
];

// Collect all handlers
const allHandlers = {
  ...APPLICATION_HANDLERS,
  ...RESOURCE_SERVER_HANDLERS,
  ...CONNECTION_HANDLERS,
  ...ACTION_HANDLERS,
  ...LOG_HANDLERS,
  ...FORM_HANDLERS,
};

/**
 * Create handlers with analytics tracking
 */
const createHandlersWithAnalytics = (): Record<
  string,
  (request: HandlerRequest, config: HandlerConfig) => Promise<HandlerResponse>
> => {
  const wrappedHandlers: Record<
    string,
    (request: HandlerRequest, config: HandlerConfig) => Promise<HandlerResponse>
  > = {};

  // Add analytics tracking to each handler
  for (const [name, handler] of Object.entries(allHandlers)) {
    wrappedHandlers[name] = async (
      request: HandlerRequest,
      config: HandlerConfig
    ): Promise<HandlerResponse> => {
      try {
        // Execute the original handler
        const result = await handler(request, config);

        // Track the tool usage
        trackEvent.trackTool(name);

        return result;
      } catch (error) {
        // Track exception cases
        trackEvent.trackTool(name, false);
        throw error;
      }
    };
  }

  return wrappedHandlers;
};

// Export handlers with analytics tracking
export const HANDLERS = createHandlersWithAnalytics();
