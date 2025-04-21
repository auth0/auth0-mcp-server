/*
 * Analytics implementation for tracking events to Heap Analytics
 */
import crypto from 'crypto';
import { createRequire } from 'module';
import { log } from './logger.js';

const require = createRequire(import.meta.url);
const packageJson = require('../../package.json');

// Extract package coordinates
const packageVersion = packageJson.version;

// Constants
const EVENT_NAME_PREFIX = 'Auth0 MCP-server';

// Common property keys
const VERSION_KEY = 'version';
const OS_KEY = 'os';
const ARCH_KEY = 'arch';
const NODE_VERSION = 'node_version';
const APP_NAME = 'app_name';

interface HeapEvent {
  app_id: string;
  identity?: string;
  event: string;
  timestamp: number;
  properties?: Record<string, string | number | boolean>;
}

/**
 * TrackEvent class for managing analytics events
 */
export class TrackEvent {
  private appId: string;
  private endpoint: string;
  /**
   * Constructor for TrackEvent
   *
   * @param appId - Heap app ID
   * @param endpoint - Heap endpoint URL
   */
  constructor(appId: string, endpoint: string) {
    this.appId = appId;
    this.endpoint = endpoint;
  }
  /**
   * Track a command run event
   *
   * @param command - The command path that was run
   */
  trackCommandRun(command: string): void {
    const eventName = this.generateRunEventName(command);
    this.track(eventName);
  }

  /**
   * Track init event
   *
   * @param clientType - Type of client being configured
   */
  trackInit(clientType?: string): void {
    const eventName = `${EVENT_NAME_PREFIX} - Init`;
    const properties = {
      clientType: clientType || 'unknown',
      ...this.getCommonProperties(),
    };
    this.track(eventName, properties);
  }

  /**
   * Track server run event
   *
   */
  trackServerRun(): void {
    const eventName = `${EVENT_NAME_PREFIX} - Run`;
    this.track(eventName);
  }

  /**
   * Track tool usage event
   *
   * @param toolName - The name of the tool being used
   * @param success - Whether the tool execution was successful
   */
  trackTool(toolName: string, success: boolean = true): void {
    const eventName = `${EVENT_NAME_PREFIX} - Tool - ${toolName}`;
    const properties = {
      success,
      ...this.getCommonProperties(),
    };
    this.track(eventName, properties);
  }

  /**
   * Internal method to track an event
   *
   * @param eventName - Name of the event to track
   * @param customProperties - Additional properties for the event
   */
  private track(
    eventName: string,
    customProperties?: Record<string, string | number | boolean>
  ): void {
    if (!this.shouldTrack()) {
      return;
    }

    const event = this.createEvent(eventName, customProperties);
    this.sendEvent(event).catch((err) => {
      // Silently handle errors in tracking
      log('Analytics tracking error:', err?.message);
    });
  }

  /**
   * Creates an event object
   */
  private createEvent(
    eventName: string,
    customProperties?: Record<string, string | number | boolean>
  ): HeapEvent {
    return {
      app_id: this.appId,
      identity: crypto.randomUUID(),
      event: eventName,
      timestamp: this.timestamp(),
      properties: {
        ...this.getCommonProperties(),
        ...customProperties,
      },
    };
  }

  /**
   * Sends an event to Heap Analytics
   */
  private async sendEvent(event: HeapEvent): Promise<void> {
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      });

      if (!response.ok) {
        const errorText = await response.text();
        log(`Heap track API error: ${response.status} - ${errorText}`);
      }
    } catch (error) {
      log('Error sending event to Heap:', error);
      throw error;
    }
  }

  /**
   * Generate a run event name from a command path
   */
  private generateRunEventName(command: string): string {
    return this.generateEventName(command, 'Run');
  }

  /**
   * Generate an event name from a command path and action
   */
  private generateEventName(command: string, action: string): string {
    const commands = command.split(' ').map((cmd) => cmd.charAt(0).toUpperCase() + cmd.slice(1));

    if (commands.length === 1) {
      return `${EVENT_NAME_PREFIX} - ${commands[0]} - ${action}`;
    } else if (commands.length === 2) {
      return `${EVENT_NAME_PREFIX} - ${commands[0]} - ${commands[1]} - ${action}`;
    } else if (commands.length >= 3) {
      return `${EVENT_NAME_PREFIX} - ${commands[1]} - ${commands.slice(2).join(' ')} - ${action}`;
    } else {
      return EVENT_NAME_PREFIX;
    }
  }

  /**
   * Get common properties for all events
   */
  private getCommonProperties(): Record<string, string> {
    return {
      [APP_NAME]: EVENT_NAME_PREFIX,
      [VERSION_KEY]: packageVersion,
      [OS_KEY]: process.platform,
      [ARCH_KEY]: process.arch,
      [NODE_VERSION]: process.version,
    };
  }

  /**
   * Determine if tracking should be enabled
   */
  private shouldTrack(): boolean {
    return process.env.AUTH0_MCP_ANALYTICS !== 'false';
  }

  /**
   * Get current timestamp in milliseconds
   */
  private timestamp(): number {
    return Date.now();
  }
}

const HEAP_CONFIG = {
  appId: '1279799279',
  endpoint: 'https://heapanalytics.com/api/track',
};

const trackEvent = new TrackEvent(HEAP_CONFIG.appId, HEAP_CONFIG.endpoint);
export default trackEvent;
