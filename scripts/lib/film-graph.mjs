/**
 * @fileoverview Stage graph: declared inputs/outputs/hash, skip-if-unchanged,
 * per-scene partial rebuild, state file, per-run logs, crash-resume.
 *
 * Wraps stage implementations; does not reimplement them. Pure helpers
 * (hashInputs, decideSkip, mergeState) are unit-testable without the filesystem.
 * @module scripts/lib/film-graph
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/** SHA-256 of a set of input files (path + bytes), sorted for determinism. */
export function hashInputs(root, inputs) {
  const parts = [];
  for (const rel of [...inputs].sort()) {
    const abs = path.resolve(root, rel);
    if (!fs.existsSync(abs)) { parts.push(`${rel}|MISSING`); continue; }
    const st = fs.statSync(abs);
    if (st.isDirectory()) {
      for (const f of fs.readdirSync(abs).sort()) {
        const fp = path.join(abs, f);
        if (fs.statSync(fp).isFile()) {
          parts.push(`${rel}/${f}|${fs.statSync(fp).size}|${crypto.createHash('sha256').update(fs.readFileSync(fp)).digest('hex')}`);
        }
      }
    } else {
      parts.push(`${rel}|${st.size}|${crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex')}`);
    }
  }
  return crypto.createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 16);
}

/**
 * Pure skip decision: skip when hash unchanged AND all outputs exist, unless
 * force. Returns { skip:boolean, reason:string }.
 */
export function decideSkip({ hash, outputsExist, stateHash, force = false }) {
  if (force) return { skip: false, reason: 'force' };
  if (!outputsExist) return { skip: false, reason: 'outputs missing' };
  if (hash !== stateHash) return { skip: false, reason: 'inputs changed' };
  return { skip: true, reason: 'unchanged' };
}

/** Pure state merge for a stage's per-scene checkpoints. */
export function mergeState(prev, stage, scene, record) {
  const next = JSON.parse(JSON.stringify(prev || {}));
  next.stages = next.stages || {};
  next.stages[stage] = next.stages[stage] || { hash: null, scenes: {}, runs: [] };
  if (scene) next.stages[stage].scenes[scene] = record;
  else next.stages[stage].hash = record.hash;
  next.stages[stage].updated = new Date().toISOString();
  return next;
}

export class StageGraph {
  constructor({ root, cfg, configHashValue, logPrefix = 'film' }) {
    this.root = path.resolve(root);
    this.cfg = cfg;
    this.configHashValue = configHashValue;
    this.statePath = path.resolve(this.root, cfg.paths.state);
    this.logsDir = path.resolve(this.root, cfg.paths.logs);
    fs.mkdirSync(this.logsDir, { recursive: true });
    fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
    this.state = fs.existsSync(this.statePath)
      ? JSON.parse(fs.readFileSync(this.statePath, 'utf8'))
      : { version: 1, stages: {} };
    this.runId = `${Date.now()}-${process.pid}`;
    this.logFile = path.join(this.logsDir, `${this.runId}-${logPrefix}.log`);
    this._logStream = fs.createWriteStream(this.logFile, { flags: 'a' });
  }

  log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    process.stdout.write(line);
    this._logStream.write(line);
  }

  save() {
    this.state.updated = new Date().toISOString();
    fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2) + '\n', 'utf8');
  }

  /** Execute a stage: {name, inputs, outputs, run(ctx), scene?}. */
  async runStage(stage, { force = false, only = null, verbose = false } = {}) {
    const hash = hashInputs(this.root, [...stage.inputs, 'film.config.json', this.cfg.story]);
    const outputsExist = stage.outputs.length > 0 && stage.outputs.every((o) => fs.existsSync(path.resolve(this.root, o)));
    const prev = this.state.stages?.[stage.name] || {};
    const sceneKey = stage.scene || null;
    if (only && sceneKey && only !== sceneKey) {
      this.log(`[skip] ${stage.name}/${sceneKey}: --only ${only} filters this scene`);
      return { skipped: true, reason: 'filtered by --only' };
    }
    const stateHash = sceneKey ? prev.scenes?.[sceneKey]?.hash : prev.hash;
    const decision = decideSkip({ hash, outputsExist, stateHash, force });
    if (decision.skip) {
      this.log(`[skip] ${stage.name}${sceneKey ? `/${sceneKey}` : ''}: ${decision.reason} (${hash})`);
      return { skipped: true, reason: decision.reason, hash };
    }
    this.log(`[run] ${stage.name}${sceneKey ? `/${sceneKey}` : ''}: ${decision.reason} (${hash})`);
    try {
      const result = await stage.run({ graph: this, hash, force, verbose, only });
      this.state = mergeState(this.state, stage.name, sceneKey, { hash, ts: new Date().toISOString(), ok: true, result });
      this.save();
      this.log(`[done] ${stage.name}${sceneKey ? `/${sceneKey}` : ''}`);
      return { skipped: false, hash, result };
    } catch (err) {
      this.state = mergeState(this.state, stage.name, sceneKey, { hash, ts: new Date().toISOString(), ok: false, error: String(err.message || err) });
      this.save();
      // Errors: cause + file + exact fix; stack only with --verbose (handled by CLI).
      throw err;
    }
  }

  close() { this._logStream.end(); }
}
