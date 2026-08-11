const fs = require('fs');

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

class PidStore {
  constructor(filePath, fsImpl = fs) {
    this.filePath = filePath;
    this.fs = fsImpl;
  }

  exists() {
    return this.fs.existsSync(this.filePath);
  }

  read() {
    if (!this.exists()) {
      return null;
    }

    try {
      return parsePidRecord(this.fs.readFileSync(this.filePath, 'utf8'));
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
    this.fs.writeFileSync(this.filePath, JSON.stringify(record, null, 2), { mode: 0o600 });
    this.fs.chmodSync(this.filePath, 0o600);
    return record;
  }

  remove() {
    if (this.exists()) {
      this.fs.unlinkSync(this.filePath);
    }
  }
}

module.exports = {
  PidStore,
  parsePidRecord
};
