import { create0pflow } from "0pflow";

// Initialize 0pflow with workflow directory
export const pflow = await create0pflow({
  workflowDir: "./generated/workflows",
});
