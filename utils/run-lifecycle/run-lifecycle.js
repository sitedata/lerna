"use strict";

const log = require("libnpm/log");
const runScript = require("libnpm/run-script");
const figgyPudding = require("figgy-pudding");
const npmConf = require("@lerna/npm-conf");

module.exports = runLifecycle;
module.exports.createRunner = createRunner;

const LifecycleConfig = figgyPudding(
  {
    // provide aliases for some dash-cased props
    "ignore-prepublish": {},
    ignorePrepublish: "ignore-prepublish",
    "ignore-scripts": {},
    ignoreScripts: "ignore-scripts",
    "node-options": {},
    nodeOptions: "node-options",
    "script-shell": {},
    scriptShell: "script-shell",
    "scripts-prepend-node-path": {},
    scriptsPrependNodePath: "scripts-prepend-node-path",
    "unsafe-perm": {},
    unsafePerm: "unsafe-perm",
  },
  {
    other(key) {
      // allow any other keys _except_ circular objects
      return key !== "log" && key !== "logstream";
    },
  }
);

function runLifecycle(pkg, stage, _opts) {
  log.silly("run-lifecycle", stage, pkg.name);

  // back-compat for @lerna/npm-conf instances
  // https://github.com/isaacs/proto-list/blob/27764cd/proto-list.js#L14
  if ("root" in _opts) {
    // eslint-disable-next-line no-param-reassign
    _opts = _opts.snapshot;
  }

  const opts = LifecycleConfig(_opts);
  const dir = pkg.location;
  const config = {};

  // https://github.com/zkat/figgy-pudding/blob/7d68bd3/index.js#L42-L64
  for (const [key, val] of opts) {
    // omit falsy values
    if (val != null) {
      config[key] = val;
    }
  }

  // env.npm_config_prefix should be the package directory
  config.prefix = dir;

  // TODO: remove pkg._id when npm-lifecycle no longer relies on it
  pkg._id = `${pkg.name}@${pkg.version}`; // eslint-disable-line

  // bring along camelCased aliases
  const {
    ignorePrepublish,
    ignoreScripts,
    nodeOptions,
    scriptShell,
    scriptsPrependNodePath,
    unsafePerm,
  } = opts;

  return runScript(pkg, stage, dir, {
    config,
    dir,
    failOk: false,
    log,
    ignorePrepublish,
    ignoreScripts,
    nodeOptions,
    scriptShell,
    scriptsPrependNodePath,
    unsafePerm,
  }).then(
    () => pkg,
    err => {
      // propagate the exit code
      const exitCode = err.errno || 1;

      // error logging has already occurred on stderr, but we need to stop the chain
      log.error("lifecycle", "%j errored in %j, exiting %d", stage, pkg.name, exitCode);

      // ensure clean logging, avoiding spurious log dump
      err.name = "ValidationError";

      // our yargs.fail() handler expects a numeric .code, not .errno
      err.code = exitCode;
      process.exitCode = exitCode;

      // stop the chain
      throw err;
    }
  );
}

function createRunner(commandOptions) {
  const cfg = npmConf(commandOptions).snapshot;

  return (pkg, stage) => {
    if (pkg.scripts && pkg.scripts[stage]) {
      return runLifecycle(pkg, stage, cfg);
    }

    return Promise.resolve(pkg);
  };
}
