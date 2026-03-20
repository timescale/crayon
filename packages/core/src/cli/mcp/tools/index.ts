import { listIntegrationsFactory } from "./listIntegrations.js";
import { listConnectionsFactory } from "./listConnections.js";
import { getConnectionFactory } from "./getConnection.js";
import { assignConnectionFactory } from "./assignConnection.js";

import { listWorkflowsFactory } from "./listWorkflows.js";
import { runWorkflowFactory } from "./runWorkflow.js";
import { runNodeFactory } from "./runNode.js";
import { listRunsFactory } from "./listRuns.js";
import { getRunFactory } from "./getRun.js";
import { getTraceFactory } from "./getTrace.js";
import { getSkillGuideFactory } from "./getSkillGuide.js";
import { listCronJobsFactory } from "./listCronJobs.js";
import { createCronJobFactory } from "./createCronJob.js";
import { updateCronJobFactory } from "./updateCronJob.js";
import { deleteCronJobFactory } from "./deleteCronJob.js";
import { listCronRunsFactory } from "./listCronRuns.js";
import { generateWebhookTokenFactory } from "./generateWebhookToken.js";
import { createVersionFactory } from "./createVersion.js";
import { listVersionsFactory } from "./listVersions.js";
import { restoreVersionFactory } from "./restoreVersion.js";

export async function getApiFactories() {
  return [
    listIntegrationsFactory,
    listConnectionsFactory,
    getConnectionFactory,
    assignConnectionFactory,

    listWorkflowsFactory,
    runWorkflowFactory,
    runNodeFactory,
    listRunsFactory,
    getRunFactory,
    getTraceFactory,

    listCronJobsFactory,
    createCronJobFactory,
    updateCronJobFactory,
    deleteCronJobFactory,
    listCronRunsFactory,
    generateWebhookTokenFactory,

    // Version management
    createVersionFactory,
    listVersionsFactory,
    restoreVersionFactory,

    getSkillGuideFactory,
  ] as const;
}
