import { describe, it, expect, vi, beforeEach} from "vitest";
import { resolveCallbackUrls, UrlSource } from "../../src/utils/onboarding";
import type { QuickstartSpec } from "../../src/utils/onboarding";

vi.mock("fs/promises", () => ({
    readFile: vi.fn(),
}));

import { readFile } from "fs/promises";
import { deflate } from "zlib";

const mockReadFile = vi.mocked(readFile);

const defaultSpec: QuickstartSpec = {
    defaultAppOrigin: "http://localhost:3000",
    callbackPath: "/callback",
    logoutPath: "/logout"
};

describe("resolveCallbackUrls", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    describe("with explicit base url", () => {
        it("should use the explicit URL as base", async () => {
            const explicitBaseUrl = "http://localhost:4000";
            const result = await resolveCallbackUrls(undefined, defaultSpec, explicitBaseUrl);

            expect(result.base_url).toBe(explicitBaseUrl);
            expect(result.callback_urls).toEqual([`${explicitBaseUrl}/callback`]);
            expect(result.logout_urls).toEqual([`${explicitBaseUrl}/logout`]);
            expect(result.web_origins).toEqual([explicitBaseUrl]);
            expect(result.url_source).toBe(UrlSource.Explicit);
        });

        it("should strip trailing slashes from explicit URL", async () => {
            const result = await resolveCallbackUrls(undefined, defaultSpec, "http://localhost:4000////");
            expect(result.base_url).toBe("http://localhost:4000");
        });

        it("should trim whitespace from explicit URL", async () => {
            const result = await resolveCallbackUrls(undefined, defaultSpec, "   http://localhost:4000  ");
            expect(result.base_url).toBe("http://localhost:4000");
        });

        it("should trim whitespaces and strip trailing slashes together", async () => {
            const result = await resolveCallbackUrls(undefined, defaultSpec, "  http://localhost:4000/// ");
            expect(result.base_url).toBe("http://localhost:4000");
        });

        it("should take priority over projectPath", async () => {
            const expectedBaseUrl = "http://explicit:8080";
            const result = await resolveCallbackUrls("/some/project", defaultSpec, expectedBaseUrl);

            expect(result.base_url).toBe(expectedBaseUrl);
            expect(result.url_source).toBe(UrlSource.Explicit);
        });
    });

    describe("projectPath with no explicitBaseUrl", () => {
        describe("detect port from package.json", () => {
            it("should detect --port flag in dev script", async () => {
                mockReadFile.mockImplementation(async (filePath: any) => {
                    if (filePath.endsWith("package.json")) {
                        return JSON.stringify({ scripts: { dev: "vite --port 5173" } });
                    }
                    throw new Error("ENOENT");
                });

                const result = await resolveCallbackUrls("/project", defaultSpec);
                expect(result.base_url).toBe("http://localhost:5173");
                expect(result.url_source).toBe(UrlSource.ProjectConfig);
            });

            it("should detect -p flag in dev script", async () => {
                mockReadFile.mockImplementation(async (filePath:any) => {
                    if (filePath.endsWith("package.json")) {
                        return JSON.stringify({ scripts: { dev: "next dev -p 4000" } });
                    }
                    throw new Error("ENOENT");
                });

                const result = await resolveCallbackUrls("/project", defaultSpec);

                expect(result.base_url).toBe("http://localhost:4000");
                expect(result.url_source).toBe(UrlSource.ProjectConfig);
            });

            it("should fall back to start script if no dev script", async () => {
                mockReadFile.mockImplementation(async (filePath: any) => {
                    if (filePath.endsWith("package.json")) {
                        return JSON.stringify({ scripts: { start: "react-scripts start --port 3001" } });
                    }
                    throw new Error("ENOENT");
                });

                const result = await resolveCallbackUrls("/project", defaultSpec);

                expect(result.base_url).toBe("http://localhost:3001");
                expect(result.url_source).toBe(UrlSource.ProjectConfig);
            });

            it("should not detect port if not --port or -p flag", async () => {
                mockReadFile.mockImplementation(async (filePath: any) => {
                    if (filePath.endsWith("package.json")) {
                        return JSON.stringify({ scripts: { dev: 'vite' } });
                    }
                    throw new Error("ENOENT");
                });

                const result = await resolveCallbackUrls("/project", defaultSpec);

                expect(result.base_url).toBe("http://localhost:3000");
                expect(result.url_source).toBe(UrlSource.FrameWorkDefault);
            });
        });

        describe("port from vite config", () => {
            it("should detect port from vite.config.ts", async () => {
                mockReadFile.mockImplementation(async (filePath: any) => {
                    if (filePath.endsWith("package.json")) {
                        return JSON.stringify({ scripts: { dev: "vite" } } );
                    }
                    if (filePath.endsWith("vite.config.ts")) {
                        return `export default defineConfig({ server: { port: 8080 } })`;
                    }
                    throw new Error('ENOENT');
                });

                const result = await resolveCallbackUrls("/project", defaultSpec);

                expect(result.base_url).toBe("http://localhost:8080");
                expect(result.url_source).toBe(UrlSource.ProjectConfig);
            });

            it("should detect port from vite.config.js", async () => {
                mockReadFile.mockImplementation(async (filePath: any) => {
                      if (filePath.endsWith('package.json')) {
                          return JSON.stringify({ scripts: { dev: 'vite' } });
                      }
                      if (filePath.endsWith('vite.config.js')) {
                          return `module.exports = { server: { port: 9090 } }`;
                      }
                      throw new Error('ENOENT');
                  });

                  const result = await resolveCallbackUrls('/project', defaultSpec);

                  expect(result.base_url).toBe('http://localhost:9090');
                  expect(result.url_source).toBe(UrlSource.ProjectConfig);
            });

            it('should detect port from vite.config.mts', async () => {
                mockReadFile.mockImplementation(async (filePath: any) => {
                    if (filePath.endsWith('package.json')) {
                        return JSON.stringify({});
                    }
                    if (filePath.endsWith('vite.config.mts')) {
                        return `export default { server: { port: 7777 } }`;
                    }
                    throw new Error('ENOENT');
                });

                const result = await resolveCallbackUrls('/project', defaultSpec);

                expect(result.base_url).toBe('http://localhost:7777');
                expect(result.url_source).toBe(UrlSource.ProjectConfig);
            });

            it("should not detect port if vite config has no server.port", async () => {
                mockReadFile.mockImplementation(async (filePath: any) => {
                    if (filePath.endsWith("package.json")) {
                        return JSON.stringify({});
                    }
                    if (filePath.endsWith("vite.config.ts")) {
                        return `export default defineConfig({ plugins: [react()] })`;
                    }
                    throw new Error('ENOENT');
                });

                const result = await resolveCallbackUrls('/project', defaultSpec);

                expect(result.base_url).toBe('http://localhost:3000');
                expect(result.url_source).toBe(UrlSource.FrameWorkDefault);
            });
        });

        describe("port from angular.json", () => {
            it("should detect port from angular.json serve options", async () => {
                mockReadFile.mockImplementation(async (filePath: any) => {
                    if (filePath.endsWith("package.json")) {
                        return JSON.stringify({});
                    }
                    if (filePath.endsWith("angular.json")) {
                        return JSON.stringify({
                            projects: {
                                myApp: {
                                    architect: {
                                        serve: { options: { port: 4200 } },
                                    }
                                }
                            }
                        })
                    }
                    throw new Error("ENOENT");
                });

                const result = await resolveCallbackUrls("/project", defaultSpec);
                
                expect(result.base_url).toBe("http://localhost:4200");
                expect(result.url_source).toBe(UrlSource.ProjectConfig);
            });

            it("should return null if angular.json has no port", async () => {
                mockReadFile.mockImplementation(async (filePath: any) => {
                    if (filePath.endsWith("package.json")) {
                        return JSON.stringify({});
                    }
                    if (filePath.endsWith("angular.json")) {
                        return JSON.stringify({
                            projects: {
                                myApp: {
                                    architect: {
                                        server: { options: {} },
                                    }
                                }
                            }
                        })
                    }
                    throw new Error("ENOENT");
                });

                const result = await resolveCallbackUrls("/project", defaultSpec);

                expect(result.base_url).toBe("http://localhost:3000");
                expect(result.url_source).toBe(UrlSource.FrameWorkDefault);
            });
        });

        describe("detection priority", () => {
            it("should prefer package.json port over vite config", async () => {
                mockReadFile.mockImplementation(async (filePath: any) => {
                    if (filePath.endsWith('package.json')) {
                        return JSON.stringify({ scripts: { dev: 'vite --port 1111' } });
                    }
                    if (filePath.endsWith('vite.config.ts')) {
                        return `export default { server: { port: 2222 } }`;
                    }
                    throw new Error('ENOENT');
                });

                const result = await resolveCallbackUrls("/project", defaultSpec);

                expect(result.base_url).toBe("http://localhost:1111");
            });

            it("should prefer vite config over angular.json", async () => {
                mockReadFile.mockImplementation(async (filePath: any) => {
                    if (filePath.endsWith('package.json')) {
                        return JSON.stringify({});
                    }
                    if (filePath.endsWith('vite.config.ts')) {
                        return `export default { server: { port: 2222 } }`;
                    }
                    if (filePath.endsWith('angular.json')) {
                        return JSON.stringify({
                            projects: { app: { architect: { serve: { options: { port: 3333 } } } } },
                        });
                    }
                    throw new Error('ENOENT');
                });

                const result = await resolveCallbackUrls("/project", defaultSpec);

                expect(result.base_url).toBe("http://localhost:2222");
            });

            it("should fall back to framework default when no port is detected", async () => {
                mockReadFile.mockImplementation(async () => {
                    throw new Error('ENOENT');
                });

                const result = await resolveCallbackUrls("/project", defaultSpec);

                expect(result.base_url).toBe('http://localhost:3000');
                expect(result.url_source).toBe(UrlSource.FrameWorkDefault);
            });
        });

        describe("with no projectPath and no explicitBaseUrl", () => {
            it("should use framework default origin", async () => {
                const expectedBaseUrl = "http://localhost:3000";
                const result = await resolveCallbackUrls(undefined, defaultSpec);

                expect(result.base_url).toBe(expectedBaseUrl);
                expect(result.callback_urls).toEqual([`${expectedBaseUrl}/callback`]);
                expect(result.logout_urls).toEqual([`${expectedBaseUrl}/logout`]);
                expect(result.web_origins).toEqual([expectedBaseUrl]);
                expect(result.url_source).toBe(UrlSource.FrameWorkDefault);
            });
        });

        describe("callback and logout path handling", () => {
            it("should use base URL when callbackPath is empty", async () => {
                const spec: QuickstartSpec = {
                    defaultAppOrigin: "http://localhost:3000",
                    callbackPath: "",
                    logoutPath: "/logout"
                }

                const result = await resolveCallbackUrls(undefined, spec);

                expect(result.callback_urls).toEqual(["http://localhost:3000"]);
                expect(result.logout_urls).toEqual(["http://localhost:3000/logout"]);
            });

            it("should use base URL when logoutPath is empty", async () => {
                const spec: QuickstartSpec = {
                    defaultAppOrigin: "http://localhost:3000",
                    callbackPath: "/callback",
                    logoutPath: "",
                };

                const result = await resolveCallbackUrls(undefined, spec);

                expect(result.callback_urls).toEqual(["http://localhost:3000/callback"]);
                expect(result.logout_urls).toEqual(["http://localhost:3000"]);
            });

            it("should use base URL for both when callbackPath and logoutPath are empty", async () => {
                const baseUrl = "http://localhost:3000";
                
                const spec: QuickstartSpec = {
                    defaultAppOrigin: baseUrl,
                    callbackPath: "",
                    logoutPath: "",
                };

                const result = await resolveCallbackUrls(undefined, spec);

                expect(result.callback_urls).toEqual([baseUrl]);
                expect(result.logout_urls).toEqual([baseUrl]);
            });
        });

        describe("file read error handling", () => {
            it("should handle malformed JSON in package.json gracefully", async () => {
                mockReadFile.mockImplementation(async (filePath: any) => {
                    if (filePath.endsWith("package.json")) {
                        return "{ invalid json }";
                    }
                    throw new Error("ENOENT");
                });

                const result = await resolveCallbackUrls("/project", defaultSpec);

                expect(result.base_url).toBe("http://localhost:3000");
                expect(result.url_source).toBe(UrlSource.FrameWorkDefault);
            });

            it("should handle malformed JSON in angular.json gracefully", async () => {
                mockReadFile.mockImplementation(async (filePath: any) => {
                    if (filePath.endsWith("pacakage.json")) {
                        return JSON.stringify({});
                    }
                    if (filePath.endsWith("angular.json")) {
                        return "{ not valid }";
                    }
                    throw new Error("ENOENT");
                });

                const result = await resolveCallbackUrls("/project", defaultSpec);

                expect(result.base_url).toBe("http://localhost:3000");
                expect(result.url_source).toBe(UrlSource.FrameWorkDefault);
            });
        });
    });
});