const fs = require('fs');
const path = require('path');

function parsePidRecord(content) {
  const trimmed = content.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    const record = parsed && typeof parsed === 'object' ? parsed : { pid: parsed };
    const pid = Number(record.pid);
    return Number.isInteger(pid) && pid > 0 ? { ...record, pid } : null;
  } catch {
    const pid = Number(trimmed);
    return Number.isInteger(pid) && pid > 0 ? { pid } : null;
  }
}

/**
 * Stores the daemon PID record. Reads fall back to the legacy in-repo
 * `dsf.pid` so an older daemon can still be stopped after upgrading.
 */
class PidStore {
  constructor(filePath, options = {}) {
    this.filePath = filePath;
    this.legacyPath = options.legacyPath || null;
    this.fs = options.fs || fs;
  }

  existingPath() {
    if (this.fs.existsSync(this.filePath)) {
      return this.filePath;
    }
    if (this.legacyPath && this.fs.existsSync(this.legacyPath)) {
      return this.legacyPath;
    }
    return null;
  }

  exists() {
    return this.existingPath() !== null;
  }

  read() {
    const filePath = this.existingPath();
    if (!filePath) {
      return null;
    }

    try {
      return parsePidRecord(this.fs.readFileSync(filePath, 'utf8'));
    } catch {
      return null;
    }
  }

  write(pid, mainFile) {
    const record = {
      pid,
      mainFile,
      startedAt: new Date().toISOString()
    };
    this.fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    this.fs.writeFileSync(this.filePath, JSON.stringify(record, null, 2), { mode: 0o600 });
    this.fs.chmodSync(this.filePath, 0o600);
    return record;
  }

  remove() {
    for (const filePath of [this.filePath, this.legacyPath]) {
      if (filePath && this.fs.existsSync(filePath)) {
        try {
          this.fs.unlinkSync(filePath);
        } catch {
          // Another process may have removed it first.
        }
      }
    }
  }
}

module.exports = {
  PidStore,
  parsePidRecord
};
