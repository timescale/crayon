import { listIntegrationsFactory } from "./listIntegrations.js";
import { getConnectionInfoFactory } from "./getConnectionInfo.js";

import { listWorkflowsFactory } from "./listWorkflows.js";
import { runWorkflowFactory } from "./runWorkflow.js";
import { runNodeFactory } from "./runNode.js";
import { listRunsFactory } from "./listRuns.js";
import { getRunFactory } from "./getRun.js";
import { getTraceFactory } from "./getTrace.js";
import { getSkillGuideFactory } from "./getSkillGuide.js";

export async function getApiFactories() {
  return [
    listIntegrationsFactory,
    getConnectionInfoFactory,

    listWorkflowsFactory,
    runWorkflowFactory,
    runNodeFactory,
    listRunsFactory,
    getRunFactory,
    getTraceFactory,

    getSkillGuideFactory,
  ] as const;
}
