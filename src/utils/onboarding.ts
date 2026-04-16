import { readFile } from "fs/promises";
import { join } from "path";

export interface QuickstartSpec {
    defaultAppOrigin: string;
    callbackPath: string;
    logoutPath: string;
}

export enum UrlSource {
    Explicit = "explicit",
    ProjectConfig = "project_config",
    FrameWorkDefault = "framework_default"
}

export interface ResolvedCallbackUrls {
    base_url: string;
    callback_urls: string[];
    logout_urls: string[];
    web_origins: string[];
    url_source: UrlSource
}

// Port Detection Helpers

const readJsonFile = async (filePath: string) => {
    try {
        const content = await readTextFile(filePath);
        return content ? JSON.parse(content) : null;
    } catch {
        return null;
    }
}

const readTextFile = async (filePath: string) => {
    try {
        return await readFile(filePath, "utf-8");
    } catch {
        return null;
    }
}

const extractPortFromDevScript = (packageJson: any): number | null => {
    const devScript = packageJson?.scripts?.dev ?? packageJson?.scripts?.start;
    if (typeof devScript !== "string") return null;

    const match = devScript.match(/(?:-p|--port)\s+(\d+)/);
    return match ? parseInt(match[1], 10) : null;
}

async function detectPortFromViteConfig(projectPath: string): Promise<number | null> {
    for (const filename of ['vite.config.ts', 'vite.config.js', 'vite.config.mts', 'vite.config.mjs']) {
      const content = await readTextFile(join(projectPath, filename));
      if (!content) continue;

      const match = content.match(/server\s*:\s*\{[^}]*port\s*:\s*(\d+)/s);
      if (match) return parseInt(match[1], 10);
    }
    return null;
  }

async function detectPortFromAngularJson(projectPath: string): Promise<number | null> {
    const angularJson = await readJsonFile(join(projectPath, 'angular.json'));
    if (!angularJson) return null;

    const projects = angularJson.projects ?? {};
    for (const project of Object.values(projects) as any[]) {
      const port = project?.architect?.serve?.options?.port;
      if (typeof port === 'number') return port;
    }
    return null;
  }

  async function detectPortFromProject(projectPath: string): Promise<number | null> {
    // Try package.json dev script first
    const packageJson = await readJsonFile(join(projectPath, 'package.json'));
    if (packageJson) {
      const port = extractPortFromDevScript(packageJson);
      if (port) return port;
    }

    // Try vite config
    const vitePort = await detectPortFromViteConfig(projectPath);
    if (vitePort) return vitePort;

    // Try angular.json
    const angularPort = await detectPortFromAngularJson(projectPath);
    if (angularPort) return angularPort;

    return null;
  }

  function replacePort(baseUrl: string, port: number): string {
    const url = new URL(baseUrl);
    url.port = String(port);
    return url.origin;
  }

export const resolveCallbackUrls = async (
    projectPath: string | undefined, 
    quickstartSpec: QuickstartSpec,
    explicitBaseUrl?: string
): Promise<ResolvedCallbackUrls> => {
    let baseUrl: string;
    let urlSource: UrlSource;
    // TODO: Add tests for this to ensure white spaces and slashes are removed
    if (explicitBaseUrl) {
        baseUrl = explicitBaseUrl.trim().replace(/\/+$/, "");
        urlSource = UrlSource.Explicit;
    } else if (projectPath) {
        const detectedPort = await detectPortFromProject(projectPath);

        if (detectedPort) {
            baseUrl = replacePort(quickstartSpec.defaultAppOrigin, detectedPort);
            urlSource = UrlSource.ProjectConfig;
        } else {
            baseUrl = quickstartSpec.defaultAppOrigin
            urlSource = UrlSource.FrameWorkDefault;
        }
    } else {
        baseUrl = quickstartSpec.defaultAppOrigin;
        urlSource = UrlSource.FrameWorkDefault;
    }

    const callbackUrl = quickstartSpec.callbackPath
        ? `${baseUrl}${quickstartSpec.callbackPath}`
        : baseUrl;
    
    const logoutUrl = quickstartSpec.logoutPath
        ? `${baseUrl}${quickstartSpec.logoutPath}`
        : baseUrl;
    
    return {
        base_url: baseUrl,
        callback_urls: [callbackUrl],
        logout_urls: [logoutUrl],
        web_origins: [baseUrl],
        url_source: urlSource,
    }
} 