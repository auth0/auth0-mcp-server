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
const EVENT_NAME_PREFIX = 'auth0-mcp-server';

// Analytics schema version, emitted to Heap as `analytics_version`. Bump when the
// meaning of tracked data changes so the shift is queryable in Heap.
const ANALYTICS_SCHEMA_VERSION = '2.0.0';

// Common property keys
const VERSION_KEY = 'version';
const ANALYTICS_VERSION_KEY = 'analytics_version';
const OS_KEY = 'os';
const ARCH_KEY = 'arch';
const NODE_VERSION = 'node_version';
const APP_NAME = 'app_name';

/**
 * Why credential resolution fell back to generic Auth0 vars instead of the framework spec.
 * 'unsupported': the framework has no quickstart spec.
 * 'cdn_unavailable': a supported framework's spec couldn't be fetched (e.g. CDN outage),
 *   so a supported user silently got generic vars — worth surfacing in analytics.
 */
export type CredentialResolutionFallbackReason = 'unsupported' | 'cdn_unavailable';

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
  private identity: string;
  /**
   * Constructor for TrackEvent
   *
   * @param appId - Heap app ID
   * @param endpoint - Heap endpoint URL
   */
  constructor(appId: string, endpoint: string) {
    this.appId = appId;
    this.endpoint = endpoint;
    // Generate the identity once so all events in a session share one identity,
    // rather than creating a new UUID per event (which fragments user tracking).
    this.identity = crypto.randomUUID();
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
    const eventName = `${EVENT_NAME_PREFIX}-init`;
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
    const eventName = `${EVENT_NAME_PREFIX}-run`;
    this.track(eventName);
  }

  /**
   * Track tool usage event
   *
   * @param toolName - The name of the tool being used
   * @param success - Whether the tool execution was successful
   */
  trackTool(toolName: string, success: boolean = true): void {
    const eventName = `${EVENT_NAME_PREFIX}-tool-${toolName}`;
    const properties = {
      success,
      ...this.getCommonProperties(),
    };
    this.track(eventName, properties);
  }

  /**
   * Track an onboarding flow step
   *
   * Captures the framework dimension and per-step outcome that the generic
   * tool-usage event does not, so the multi-step onboarding flow can be
   * analyzed end to end.
   *
   * @param step - The onboarding step (e.g. 'create_application', 'save_credentials', 'quickstart_guide')
   * @param framework - The framework being onboarded
   * @param outcome - Whether the step succeeded or failed
   * @param extraProperties - Additional step-specific properties
   */
  trackOnboardingStep(
    step: string,
    framework: string,
    outcome: 'success' | 'failure',
    extraProperties?: Record<string, string | number | boolean>
  ): void {
    const eventName = `${EVENT_NAME_PREFIX}-onboarding-${step}`;
    const properties = {
      step,
      framework,
      success: outcome === 'success',
      ...extraProperties,
      ...this.getCommonProperties(),
    };
    this.track(eventName, properties);
  }

  /**
   * Track credential resolution event
   *
   * @param framework - The framework used for credential resolution
   * @param resolution_path - Whether the spec or fallback path was used
   * @param secret_generated - Whether AUTH0_SECRET was auto-generated
   * @param keys_written - The env keys written to the file
   * @param fallback_reason - Why the fallback path was taken (only set when resolution_path is 'fallback')
   */
  trackCredentialResolution(
    framework: string,
    resolution_path: 'spec' | 'fallback',
    secret_generated: boolean,
    keys_written: string[],
    fallback_reason?: CredentialResolutionFallbackReason
  ): void {
    const eventName = `${EVENT_NAME_PREFIX}-credential-resolution`;
    const properties = {
      framework,
      resolution_path,
      secret_generated,
      keys_written: [...keys_written].sort().join(','),
      ...(fallback_reason ? { fallback_reason } : {}),
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
      identity: this.identity,
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
    const commands = command
      .trim()
      .split(/\s+/)
      .map((cmd) => cmd.charAt(0).toUpperCase() + cmd.slice(1));

    if (commands.length === 1) {
      return `${EVENT_NAME_PREFIX}-${commands[0]}-${action}`;
    } else if (commands.length === 2) {
      return `${EVENT_NAME_PREFIX}-${commands[0]}-${commands[1]}-${action}`;
    } else if (commands.length >= 3) {
      return `${EVENT_NAME_PREFIX}-${commands[1]}-${commands.slice(2).join(' ')}-${action}`;
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
      [ANALYTICS_VERSION_KEY]: ANALYTICS_SCHEMA_VERSION,
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
