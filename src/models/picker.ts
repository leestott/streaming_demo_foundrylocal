/**
 * Interactive model picker – reads from stdin to let the user choose
 * a model from the Foundry Local catalog at runtime.
 *
 * Uses only Node.js built-ins (readline) – no external prompts library.
 */

import * as readline from "node:readline";
import type { FoundryModel } from "./catalog";
import { formatModelTable } from "./catalog";

/**
 * Display the model list and prompt the user to pick one.
 *
 * Returns the selected model ID.  If `stdin` is not a TTY (piped/CI),
 * falls back to the first model in the list.
 */
export async function pickModel(models: FoundryModel[]): Promise<string> {
  if (models.length === 0) {
    throw new Error("No models available in the Foundry Local catalog");
  }

  // Non-interactive fallback (CI / piped stdin)
  if (!process.stdin.isTTY) {
    console.log(`  ℹ  Non-interactive mode – auto-selecting first model: ${models[0].id}`);
    return models[0].id;
  }

  console.log(formatModelTable(models));

  // Also show a compact numbered list for quick reference
  console.log("  Available models:");
  models.forEach((m, i) => {
    console.log(`    ${i + 1}) ${m.id}`);
  });
  console.log();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<string>((resolve, reject) => {
    const ask = (): void => {
      rl.question(`  Select a model (1-${models.length}) or type model name: `, (answer) => {
        const trimmed = answer.trim();

        // Accept a number
        const num = parseInt(trimmed, 10);
        if (!isNaN(num) && num >= 1 && num <= models.length) {
          rl.close();
          const selected = models[num - 1].id;
          console.log(`\n  ✔  Selected: ${selected}\n`);
          resolve(selected);
          return;
        }

        // Accept a model ID typed directly
        const byId = models.find(
          (m) => m.id.toLowerCase() === trimmed.toLowerCase(),
        );
        if (byId) {
          rl.close();
          console.log(`\n  ✔  Selected: ${byId.id}\n`);
          resolve(byId.id);
          return;
        }

        console.log(`  ⚠  Invalid choice "${trimmed}". Enter a number or model ID.`);
        ask();
      });
    };

    rl.on("close", () => {
      // If closed without answer (Ctrl+C), reject
    });

    rl.on("SIGINT", () => {
      rl.close();
      reject(new Error("User cancelled model selection"));
    });

    ask();
  });
}
