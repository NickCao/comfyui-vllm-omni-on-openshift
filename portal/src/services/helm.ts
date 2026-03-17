import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "../config.js";

const exec = promisify(execFile);

export interface HelmRelease {
  name: string;
  namespace: string;
  revision: string;
  updated: string;
  status: string;
  chart: string;
  app_version: string;
}

export interface Instance {
  name: string;
  username: string;
  status: string;
  updated: string;
  routeUrl: string;
}

function releaseName(username: string, suffix?: string): string {
  const base = `${config.helm.releasePrefix}${username.toLowerCase()}`;
  return suffix ? `${base}-${suffix}` : base;
}

async function helm(...args: string[]): Promise<string> {
  const { stdout } = await exec("helm", args);
  return stdout;
}

async function getRouteUrl(releaseName: string): Promise<string> {
  try {
    const { stdout } = await exec("kubectl", [
      "get", "route", releaseName,
      "--namespace", config.helm.namespace,
      "-o", "jsonpath={.spec.host}",
    ]);
    return stdout ? `https://${stdout}` : "";
  } catch {
    return "";
  }
}

export async function listInstances(): Promise<Instance[]> {
  const output = await helm(
    "list",
    "--namespace",
    config.helm.namespace,
    "--filter",
    `^${config.helm.releasePrefix}`,
    "--output",
    "json"
  );

  const releases: HelmRelease[] = JSON.parse(output);
  return Promise.all(
    releases.map(async (r) => ({
      name: r.name,
      username: r.name.replace(config.helm.releasePrefix, ""),
      status: r.status,
      updated: r.updated,
      routeUrl: await getRouteUrl(r.name),
    }))
  );
}

export async function getInstance(username: string): Promise<Instance | null> {
  const instances = await listInstances();
  return instances.find((i) => i.username === username) ?? null;
}

export async function createInstance(username: string, suffix?: string): Promise<Instance> {
  const name = releaseName(username, suffix);

  const setArgs: string[] = [];
  if (config.helm.defaultValues.vllmOmniUrl) {
    setArgs.push("--set", `vllmOmniUrl=${config.helm.defaultValues.vllmOmniUrl}`);
  }

  await helm(
    "install",
    name,
    config.helm.chartPath,
    "--namespace",
    config.helm.namespace,
    ...setArgs
  );

  return {
    name,
    username,
    status: "deployed",
    updated: new Date().toISOString(),
    routeUrl: await getRouteUrl(name),
  };
}

export async function deleteInstance(releaseName: string): Promise<void> {
  await helm("uninstall", releaseName, "--namespace", config.helm.namespace);
}
