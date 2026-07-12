// Test 1: Raw readline - does this freeze?
import * as readline from "node:readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true,
});

rl.question("Type something and press Enter: ", (answer) => {
  console.log(`You typed: ${answer}`);
  rl.close();
});
