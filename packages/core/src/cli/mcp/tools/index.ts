import { createAppFactory } from "./createApp.js";
import { createDatabaseFactory } from "./createDatabase.js";
import { setupAppSchemaFactory } from "./setupAppSchema.js";
import { listIntegrationsFactory } from "./listIntegrations.js";
import { getConnectionInfoFactory } from "./getConnectionInfo.js";
import { startDevUiFactory } from "./startDevUi.js";
import { listWorkflowsFactory } from "./listWorkflows.js";
import { runWorkflowFactory } from "./runWorkflow.js";
import { runNodeFactory } from "./runNode.js";
import { listRunsFactory } from "./listRuns.js";
import { getRunFactory } from "./getRun.js";
import { getTraceFactory } from "./getTrace.js";

export async function getApiFactories() {
  return [
    createAppFactory,
    createDatabaseFactory,
    setupAppSchemaFactory,
    listIntegrationsFactory,
    getConnectionInfoFactory,
    startDevUiFactory,
    listWorkflowsFactory,
    runWorkflowFactory,
    runNodeFactory,
    listRunsFactory,
    getRunFactory,
    getTraceFactory,
  ] as const;
}
