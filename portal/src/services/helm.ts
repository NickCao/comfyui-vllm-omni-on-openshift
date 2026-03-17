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

function releaseName(username: string): string {
  return `${config.helm.releasePrefix}${username}`;
}

async function helm(...args: string[]): Promise<string> {
  const { stdout } = await exec("helm", args);
  return stdout;
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
  return releases.map((r) => ({
    name: r.name,
    username: r.name.replace(config.helm.releasePrefix, ""),
    status: r.status,
    updated: r.updated,
    routeUrl: "",
  }));
}

export async function getInstance(username: string): Promise<Instance | null> {
  const instances = await listInstances();
  return instances.find((i) => i.username === username) ?? null;
}

export async function createInstance(username: string): Promise<Instance> {
  const name = releaseName(username);

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
    routeUrl: "",
  };
}

export async function deleteInstance(username: string): Promise<void> {
  const name = releaseName(username);
  await helm("uninstall", name, "--namespace", config.helm.namespace);
}
