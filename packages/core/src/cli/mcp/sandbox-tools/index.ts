import { readFileFactory } from "./readFile.js";
import { writeFileFactory } from "./writeFile.js";
import { editFileFactory } from "./editFile.js";
import { listDirectoryFactory } from "./listDirectory.js";
import { bashFactory } from "./bash.js";
import { getApiFactories } from "../tools/index.js";

export async function getSandboxApiFactories() {
  const crayonTools = await getApiFactories();
  return [
    // Sandbox filesystem + bash tools
    readFileFactory,
    writeFileFactory,
    editFileFactory,
    listDirectoryFactory,
    bashFactory,
    // Crayon workflow engine tools
    ...crayonTools,
  ] as const;
}
