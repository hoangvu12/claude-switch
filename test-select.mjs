// Test 2: @inquirer/prompts select - does this freeze?
import { select } from "@inquirer/prompts";

const answer = await select({
  message: "Pick one",
  choices: [
    { name: "Option A", value: "a" },
    { name: "Option B", value: "b" },
    { name: "Option C", value: "c" },
  ],
});

console.log(`You picked: ${answer}`);
