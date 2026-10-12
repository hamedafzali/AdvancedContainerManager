// Node 25+ ships a global localStorage that throws unless --localstorage-file
// is set, and jest-environment-node touches it while copying globals. Turn web
// storage off for the test run when this Node knows the flag.
const { spawnSync } = require("child_process");

const flag = "--no-experimental-webstorage";
const env = { ...process.env };
if (process.allowedNodeEnvironmentFlags.has("--experimental-webstorage")) {
  env.NODE_OPTIONS = [env.NODE_OPTIONS, flag].filter(Boolean).join(" ");
}

const result = spawnSync(process.execPath, [require.resolve("jest/bin/jest"), ...process.argv.slice(2)], {
  stdio: "inherit",
  env,
});
process.exit(result.status ?? 1);
