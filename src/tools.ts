import { ACTION_HANDLERS, ACTION_TOOLS } from './tools-actions.js';
import { APPLICATION_HANDLERS, APPLICATION_TOOLS } from './tools-applications.js';
import { HandlerConfig, HandlerRequest, HandlerResponse, log, Tool } from './tools-common.js';
import { FORM_HANDLERS, FORM_TOOLS } from './tools-forms.js';
import { LOG_HANDLERS, LOG_TOOLS } from './tools-logs.js';
import { RESOURCE_SERVER_HANDLERS, RESOURCE_SERVER_TOOLS } from './tools-resource-servers.js';

// Combine all tools into a single array
export const TOOLS: Tool[] = [
  ...APPLICATION_TOOLS,
  ...RESOURCE_SERVER_TOOLS,
  ...ACTION_TOOLS,
  ...LOG_TOOLS,
  ...FORM_TOOLS,
];

// Combine all handlers into a single record
export const HANDLERS: Record<
  string,
  (request: HandlerRequest, config: HandlerConfig) => Promise<HandlerResponse>
> = {
  ...APPLICATION_HANDLERS,
  ...RESOURCE_SERVER_HANDLERS,
  ...ACTION_HANDLERS,
  ...LOG_HANDLERS,
  ...FORM_HANDLERS,
};
