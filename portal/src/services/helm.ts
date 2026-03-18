import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { config } from "../config.js";

const exec = promisify(execFile);

/** Timeout for kubectl info queries (pods, routes, secrets). */
const KUBECTL_TIMEOUT_MS = 15_000;
/** Timeout for helm operations (install, uninstall, list). */
const HELM_TIMEOUT_MS = 120_000;

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
  password: string;
  pods: PodStatus[];
}

function releaseName(username: string, suffix?: string): string {
  const base = `${config.helm.releasePrefix}${username.toLowerCase()}`;
  return suffix ? `${base}-${suffix}` : base;
}

async function helm(...args: string[]): Promise<string> {
  const { stdout } = await exec("helm", args, { timeout: HELM_TIMEOUT_MS });
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
    ], { timeout: KUBECTL_TIMEOUT_MS });
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

async function getPassword(releaseName: string): Promise<string> {
  try {
    const { stdout } = await exec("kubectl", [
      "get", "secret", `${releaseName}-auth`,
      "--namespace", config.helm.namespace,
      "-o", "jsonpath={.data.password}",
    ], { timeout: KUBECTL_TIMEOUT_MS });
    return stdout ? Buffer.from(stdout, "base64").toString() : "";
  } catch {
    return "";
  }
}

async function getRouteUrl(releaseName: string): Promise<string> {
  try {
    const { stdout } = await exec("kubectl", [
      "get", "route", releaseName,
      "--namespace", config.helm.namespace,
      "-o", "jsonpath={.spec.host}",
    ], { timeout: KUBECTL_TIMEOUT_MS });
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
      const [routeUrl, pods, password] = await Promise.all([
        getRouteUrl(r.name),
        getPodStatuses(r.name),
        getPassword(r.name),
      ]);
      return {
        name: r.name,
        username: r.name.replace(config.helm.releasePrefix, ""),
        status: r.status,
        updated: r.updated,
        routeUrl,
        password,
        pods,
      };
    })
  );
}

export async function createInstance(username: string, suffix?: string): Promise<Instance> {
  const name = releaseName(username, suffix);
  const password = randomBytes(16).toString("hex");

  await helm(
    "install",
    name,
    config.helm.chartPath,
    "--namespace",
    config.helm.namespace,
    "--set",
    `auth.password=${password}`,
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
    password,
    pods,
  };
}

export async function deleteInstance(releaseName: string): Promise<void> {
  await helm("uninstall", releaseName, "--namespace", config.helm.namespace);
}
