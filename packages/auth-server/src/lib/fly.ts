/**
 * Fly Machines REST API client.
 *
 * Used primarily for checking machine state in the status endpoint.
 * App creation, deploys, and secrets are handled via flyctl (see flyctl.ts).
 */

const FLY_MACHINES_API = "https://api.machines.dev";

function getToken(): string {
  const token = process.env.FLY_API_TOKEN;
  if (!token) {
    throw new Error(
      "FLY_API_TOKEN not configured. See deployment docs for setup.",
    );
  }
  return token;
}

/**
 * Make an authenticated REST API call to Fly Machines.
 */
async function flyApiCall(
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };

  let bodyInit: BodyInit | undefined;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    bodyInit = JSON.stringify(body);
  }

  const url = `${FLY_MACHINES_API}${path}`;
  const maxRetries = 5;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, { method, headers, body: bodyInit });

    if (
      (response.status === 502 || response.status === 503) &&
      attempt < maxRetries
    ) {
      console.log(
        `[fly] ${response.status} on ${method} ${path} (attempt ${attempt}/${maxRetries})`,
      );
      await new Promise((r) => setTimeout(r, attempt * 3000));
      continue;
    }

    return response;
  }

  throw new Error("Unexpected end of retry loop");
}

// ── Types ─────────────────────────────────────────────────────────

export interface MachineInfo {
  id: string;
  name: string;
  state: string;
  region: string;
  config?: {
    image?: string;
    env?: Record<string, string>;
  };
  events?: Array<{
    type: string;
    status: string;
    timestamp: number;
  }>;
}

// ── Machine config types ─────────────────────────────────────────

export interface MachineService {
  ports: Array<{
    port: number;
    handlers: string[];
  }>;
  protocol: string;
  internal_port: number;
  autostop: string;            // "off" | "stop" | "suspend"
  autostart: boolean;
  min_machines_running: number;
}

export interface MachineGuest {
  cpu_kind: string;
  cpus: number;
  memory_mb: number;
}

export interface CreateMachineConfig {
  image: string;
  services?: MachineService[];
  guest?: MachineGuest;
  env?: Record<string, string>;
  mounts?: Array<{ volume: string; path: string }>;
  auto_destroy?: boolean;
}

export interface VolumeInfo {
  id: string;
  name: string;
  region: string;
  size_gb: number;
}

// ── Volume mutations ─────────────────────────────────────────────

/**
 * Create a volume for a Fly app. Pass `compute` matching the intended machine
 * guest so Fly places the volume on a host that can also run the machine.
 */
export async function createVolume(
  appName: string,
  name: string,
  sizeGb: number,
  region: string,
  compute: MachineGuest,
): Promise<VolumeInfo> {
  const response = await flyApiCall(
    "POST",
    `/v1/apps/${encodeURIComponent(appName)}/volumes`,
    { name, size_gb: sizeGb, region, compute },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create volume for "${appName}" (${response.status}): ${text}`);
  }

  return (await response.json()) as VolumeInfo;
}

// ── Volume mutations (delete) ────────────────────────────────────

export async function deleteVolume(appName: string, volumeId: string): Promise<void> {
  const response = await flyApiCall(
    "DELETE",
    `/v1/apps/${encodeURIComponent(appName)}/volumes/${encodeURIComponent(volumeId)}`,
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to delete volume "${volumeId}" (${response.status}): ${text}`);
  }
}

// ── Machine mutations ────────────────────────────────────────────

/**
 * Create a new machine for a Fly app.
 */
export async function createMachine(
  appName: string,
  config: CreateMachineConfig,
  region?: string,
): Promise<MachineInfo> {
  const response = await flyApiCall(
    "POST",
    `/v1/apps/${encodeURIComponent(appName)}/machines`,
    { config, ...(region ? { region } : {}) },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to create machine for "${appName}" (${response.status}): ${text}`,
    );
  }

  return (await response.json()) as MachineInfo;
}

/**
 * Stop a specific machine.
 */
export async function stopMachine(
  appName: string,
  machineId: string,
): Promise<void> {
  const response = await flyApiCall(
    "POST",
    `/v1/apps/${encodeURIComponent(appName)}/machines/${encodeURIComponent(machineId)}/stop`,
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to stop machine "${machineId}" (${response.status}): ${text}`,
    );
  }
}

// ── Machine queries ───────────────────────────────────────────────

/**
 * List all machines for a Fly app.
 */
export async function listMachines(appName: string): Promise<MachineInfo[]> {
  const response = await flyApiCall(
    "GET",
    `/v1/apps/${encodeURIComponent(appName)}/machines`,
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to list machines for "${appName}" (${response.status}): ${text}`,
    );
  }

  return (await response.json()) as MachineInfo[];
}

/**
 * Get info for a specific machine. Returns null if not found.
 */
export async function getMachine(
  appName: string,
  machineId: string,
): Promise<MachineInfo | null> {
  const response = await flyApiCall(
    "GET",
    `/v1/apps/${encodeURIComponent(appName)}/machines/${encodeURIComponent(machineId)}`,
  );

  if (response.status === 404) return null;

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to get machine "${machineId}" (${response.status}): ${text}`,
    );
  }

  return (await response.json()) as MachineInfo;
}
