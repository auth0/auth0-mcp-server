import type { Prompt } from '../utils/types.js';
import { ONBOARDING_PROMPT_DATA } from './onboarding.js';

export const PROMPTS: Prompt[] = [ONBOARDING_PROMPT_DATA.prompt];

export function getPromptContent(promptName: string, args?: Record<string, string>): string {
  if (promptName === 'auth0_onboarding') {
    return ONBOARDING_PROMPT_DATA.getContent();
  }

  throw new Error(`Unknown prompt: ${promptName}`);
}

export function generateReactIntegration(
  domain: string,
  clientId: string,
  callbackUrls: string[],
  logoutUrls: string[]
): string {
  return ONBOARDING_PROMPT_DATA.generateReactIntegration(
    domain,
    clientId,
    callbackUrls,
    logoutUrls
  );
}
