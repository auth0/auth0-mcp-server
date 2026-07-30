/**
 * Resolves `%PLACEHOLDER%` tokens in a template string using a quickstart spec's
 * placeholder definitions. Each placeholder resolves to a literal string, an input
 * value (via `inputKey`), or an environment value (via `environmentKey`), with optional
 * `prefix`/`suffix` wrapping.
 *
 * Lives in a dependency-free module so both the callback-URL resolution (onboarding.ts)
 * and the LLM prompt injection (quickstart-guide.ts) can share it without a circular import.
 */
export function resolvePlaceholders(
  prompt: string,
  placeholders: Record<string, unknown>,
  inputValues: Record<string, string>,
  environment: Record<string, string>
): string {
  let result = prompt;

  for (const [placeholder, definition] of Object.entries(placeholders)) {
    let resolved: string | undefined;

    if (typeof definition === 'string') {
      resolved = definition;
    } else if (definition && typeof definition === 'object') {
      const def = definition as Record<string, unknown>;

      if (typeof def.inputKey === 'string') {
        resolved = inputValues[def.inputKey];
      } else if (typeof def.environmentKey === 'string') {
        resolved = environment[def.environmentKey];
      }

      if (resolved !== undefined && (def.prefix || def.suffix)) {
        const prefix = typeof def.prefix === 'string' ? def.prefix : '';
        const suffix = typeof def.suffix === 'string' ? def.suffix : '';
        resolved = `${prefix}${resolved}${suffix}`;
      }
    }

    if (resolved !== undefined) {
      result = result.split(placeholder).join(resolved);
    }
  }

  return result;
}
