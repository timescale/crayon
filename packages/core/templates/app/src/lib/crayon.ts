import { createCrayon } from "runcrayon";
import { workflows, agents, nodes } from "../../generated/registry";
import "server-only";

type CrayonInstance = Awaited<ReturnType<typeof createCrayon>>;

let crayon: CrayonInstance | null = null;
let initPromise: Promise<CrayonInstance> | null = null;

export async function getCrayon(): Promise<CrayonInstance> {
  if (crayon) return crayon;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const instance = await createCrayon({
      databaseUrl: process.env.DATABASE_URL!,
      appName: "{{app_name}}",
      workflows,
      agents,
      nodes,
    });
    console.log("crayon initialized");
    return instance;
  })();

  crayon = await initPromise;
  return crayon;
}
