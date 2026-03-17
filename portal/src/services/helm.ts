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

export interface PodStatus {
  name: string;
  phase: string;
  ready: boolean;
  restarts: number;
  message: string;
}

export interface Instance {
  name: string;
  username: string;
  status: string;
  updated: string;
  routeUrl: string;
  pods: PodStatus[];
}

function releaseName(username: string, suffix?: string): string {
  const base = `${config.helm.releasePrefix}${username.toLowerCase()}`;
  return suffix ? `${base}-${suffix}` : base;
}

async function helm(...args: string[]): Promise<string> {
  const { stdout } = await exec("helm", args);
  return stdout;
}

interface KubePod {
  metadata: { name: string };
  status: {
    phase: string;
    containerStatuses?: {
      ready: boolean;
      restartCount: number;
      state: {
        waiting?: { reason: string; message?: string };
        terminated?: { reason: string };
      };
    }[];
  };
}

async function getPodStatuses(releaseName: string): Promise<PodStatus[]> {
  try {
    const { stdout } = await exec("kubectl", [
      "get", "pods",
      "--namespace", config.helm.namespace,
      "-l", `app.kubernetes.io/instance=${releaseName}`,
      "-o", "json",
    ]);
    const data = JSON.parse(stdout);
    return (data.items as KubePod[]).map((pod) => {
      const cs = pod.status.containerStatuses?.[0];
      const waiting = cs?.state?.waiting;
      const terminated = cs?.state?.terminated;
      return {
        name: pod.metadata.name,
        phase: waiting?.reason ?? terminated?.reason ?? pod.status.phase,
        ready: cs?.ready ?? false,
        restarts: cs?.restartCount ?? 0,
        message: waiting?.message ?? "",
      };
    });
  } catch {
    return [];
  }
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
    releases.map(async (r) => {
      const [routeUrl, pods] = await Promise.all([
        getRouteUrl(r.name),
        getPodStatuses(r.name),
      ]);
      return {
        name: r.name,
        username: r.name.replace(config.helm.releasePrefix, ""),
        status: r.status,
        updated: r.updated,
        routeUrl,
        pods,
      };
    })
  );
}

export async function getInstance(username: string): Promise<Instance | null> {
  const instances = await listInstances();
  return instances.find((i) => i.username === username) ?? null;
}

export async function createInstance(username: string, suffix?: string): Promise<Instance> {
  const name = releaseName(username, suffix);

  await helm(
    "install",
    name,
    config.helm.chartPath,
    "--namespace",
    config.helm.namespace,
  );

  const [routeUrl, pods] = await Promise.all([
    getRouteUrl(name),
    getPodStatuses(name),
  ]);
  return {
    name,
    username,
    status: "deployed",
    updated: new Date().toISOString(),
    routeUrl,
    pods,
  };
}

export async function deleteInstance(releaseName: string): Promise<void> {
  await helm("uninstall", releaseName, "--namespace", config.helm.namespace);
}
