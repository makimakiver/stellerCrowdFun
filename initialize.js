import 'dotenv/config';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { sync as glob } from 'glob';

// Load environment variables starting with PUBLIC_ into the environment,
// so we don't need to specify duplicate variables in .env
for (const key in process.env) {
  if (key.startsWith('PUBLIC_')) {
    process.env[key.substring(7)] = process.env[key];
  }
}

console.log('###################### Initializing ########################');

// Get dirname (equivalent to the Bash version)
const __filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(__filename);

// variable for later setting pinned version of soroban in "$(dirname/target/bin/soroban)"
const cli = 'stellar';

// Function to execute and log shell commands
function exe(command) {
  console.log(command);
  execSync(command, { stdio: 'inherit' });
}

function fundAll() {
  exe(`${cli} keys generate ${args}  ${account}`);
}

function removeFiles(pattern) {
  console.log(`remove ${pattern}`);
  glob(pattern).forEach((entry) => rmSync(entry));
}

function buildAll() {
  removeFiles(`${dirname}/target/wasm32-unknown-unknown/release/*.wasm`);
  removeFiles(`${dirname}/target/wasm32-unknown-unknown/release/*.d`);
  exe(`${cli} contract build`);
}

function filenameNoExtension(filename) {
  return path.basename(filename, path.extname(filename));
}

function deploy(wasm) {
  exe(`${cli} contract deploy --wasm ${wasm} --ignore-checks --alias ${filenameNoExtension(wasm)}`);
}

function deployAll() {
  const contractsDir = `${dirname}/.soroban/contract-ids`;
  mkdirSync(contractsDir, { recursive: true });

  const wasmFiles = glob(`${dirname}/target/wasm32-unknown-unknown/release/*.wasm ${args} --source-account=${account}`);

  wasmFiles.forEach(deploy);
}

function contracts() {
  const contractFiles = glob(`${dirname}/.soroban/contract-ids/*.json`);
  return contractFiles
    .map(path => ({
      alias: filenameNoExtension(path),
      ...JSON.parse(readFileSync(path))
    }))
    .filter(data => data.ids[passphrase])
    .map(data => ({alias: data.alias, id: data.ids[passphrase]}));
}

function bind({alias, id}) {
  exe(`${cli} contract bindings typescript --contract-id ${id} --output-dir ${dirname}/packages/${alias} --overwrite`);
}

function bindAll() {
  contracts().forEach(bind);
}

function importContract({id, alias}) {
  const outputDir = `${dirname}/src/contracts/`;

  mkdirSync(outputDir, { recursive: true });
  const importContent =
    `import * as Client from '${alias}';\n` +
    `import { rpcUrl } from './util';\n\n` +
    `export default new Client.Client({\n` +
    `  ...Client.networks.${sorobanNetwork},\n` +
    `  rpcUrl,\n` +
    `${
      sorobanNetwork === "local" || "standalone"
        ? `  allowHttp: true,\n`
        : null
    }` +
    `});\n`;

  const outputPath = `${outputDir}/${alias}.ts`;

  writeFileSync(outputPath, importContent);

  console.log(`Created import for ${alias}`);
}

function importAll() {
  contracts().forEach(importContract);
}

const account = process.env.SOROBAN_ACCOUNT ?? "default";
const passphrase = process.env.SOROBAN_NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015";
const sorobanNetwork = process.env.SOROBAN_NETWORK ?? "testnet";
const args = `--rpc-url=${process.env.SOROBAN_RPC_URL ?? "https://soroban-testnet.stellar.org:443"} --network-passphrase="${passphrase}" --network="${sorobanNetwork}"`;
// Calling the functions (equivalent to the last part of your bash script)
fundAll();
buildAll();
deployAll();
bindAll();
importAll();
