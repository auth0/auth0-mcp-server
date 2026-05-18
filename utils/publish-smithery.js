#!/usr/bin/env node

/**
 * Publish the Auth0 MCP Server to Smithery as a stdio MCPB bundle.
 *
 * Smithery's publish API requires each tool in `serverCard.tools[]` to carry an
 * `inputSchema` (see `@smithery/api` SDK types), but MCPB's manifest spec only
 * permits `name` + `description` per tool. This script bridges the two: it
 * reads the built tool definitions from `dist/`, assembles a compliant
 * `serverCard`, and uploads the pre-built MCPB bundle via multipart PUT.
 *
 * Usage:
 *   SMITHERY_API_KEY=... node utils/publish-smithery.js [options]
 *
 * Options:
 *   --dry-run              Build the payload and print it, skip the API call.
 *   --bundle <path>        Path to the .mcpb bundle. Default: ./auth0-mcp-server.mcpb.
 *   --qualified-name <qn>  Smithery qualified name. Default: auth0 (namespace-only).
 *                          For namespaced servers use "owner/slug" form.
 *   --payload-out <p>      Write the payload JSON to this file as well.
 *
 * Requires: Node >= 18 (for global fetch/FormData/Blob), a built `dist/`, and
 * a packed `.mcpb` at the bundle path.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const opts = {
    dryRun: false,
    bundle: path.join(REPO_ROOT, 'auth0-mcp-server.mcpb'),
    qualifiedName: 'auth0',
    payloadOut: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--bundle') opts.bundle = argv[++i];
    else if (a === '--qualified-name') opts.qualifiedName = argv[++i];
    else if (a === '--payload-out') opts.payloadOut = argv[++i];
    else if (a === '-h' || a === '--help') {
      console.log(
        fs
          .readFileSync(fileURLToPath(import.meta.url), 'utf8')
          .split('\n')
          .slice(2, 23)
          .join('\n')
      );
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${a}`);
      process.exit(1);
    }
  }
  return opts;
}

function fail(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

async function loadManifest() {
  const p = path.join(REPO_ROOT, 'manifest.json');
  if (!fs.existsSync(p)) fail(`manifest.json not found at ${p}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

async function loadTools() {
  const distIndex = path.join(REPO_ROOT, 'dist', 'tools', 'index.js');
  if (!fs.existsSync(distIndex)) {
    fail('dist/tools/index.js not found. Run `npm run build` first.');
  }
  const mod = await import(distIndex);
  if (!Array.isArray(mod.TOOLS)) fail('dist/tools/index.js does not export TOOLS[]');
  return mod.TOOLS.map((t) => {
    const tool = {
      name: t.name,
      inputSchema: t.inputSchema ?? { type: 'object', properties: {} },
    };
    if (t.description) tool.description = t.description;
    if (t.annotations) tool.annotations = t.annotations;
    return tool;
  });
}

function buildPayload(manifest, tools) {
  return {
    type: 'stdio',
    runtime: 'node',
    serverCard: {
      serverInfo: {
        name: manifest.name,
        version: manifest.version,
        title: manifest.display_name,
        description: manifest.description,
        websiteUrl: manifest.homepage,
      },
      tools,
    },
  };
}

async function publish(opts, payload) {
  const apiKey = process.env.SMITHERY_API_KEY;
  if (!apiKey) fail('SMITHERY_API_KEY is not set in the environment.');

  if (!fs.existsSync(opts.bundle)) {
    fail(`Bundle not found at ${opts.bundle}. Run \`npm run build:mcpb\` first.`);
  }

  const qualifiedName = encodeURIComponent(opts.qualifiedName);
  const url = `https://api.smithery.ai/servers/${qualifiedName}/releases`;

  const bundleBytes = fs.readFileSync(opts.bundle);
  const form = new FormData();
  form.append('payload', JSON.stringify(payload));
  form.append(
    'bundle',
    new Blob([bundleBytes], { type: 'application/octet-stream' }),
    path.basename(opts.bundle)
  );

  console.log(`PUT ${url}`);
  console.log(`  bundle: ${opts.bundle} (${(bundleBytes.length / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`  tools:  ${payload.serverCard.tools.length}`);

  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const body = await res.text();
  console.log(`\nHTTP ${res.status}`);
  console.log(body);

  if (!res.ok) process.exit(1);

  try {
    const json = JSON.parse(body);
    if (json.deploymentId) {
      console.log(`\nDeployment ID: ${json.deploymentId}`);
      console.log('Watch the pipeline:');
      console.log(
        `  curl -N "https://api.smithery.ai/servers/${qualifiedName}/releases/${json.deploymentId}/stream" -H "Authorization: Bearer $SMITHERY_API_KEY"`
      );
    }
  } catch {
    /* already logged */
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const manifest = await loadManifest();

  const tools = await loadTools();
  const payload = buildPayload(manifest, tools);

  if (opts.payloadOut) {
    fs.writeFileSync(opts.payloadOut, JSON.stringify(payload, null, 2));
    console.log(`Wrote payload to ${opts.payloadOut}`);
  }

  if (opts.dryRun) {
    console.log(
      `Dry run — would PUT to https://api.smithery.ai/servers/${encodeURIComponent(opts.qualifiedName)}/releases`
    );
    console.log(
      `Payload (${Buffer.byteLength(JSON.stringify(payload))} bytes, ${tools.length} tools):`
    );
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  await publish(opts, payload);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
