// A minimal synchronous promise for browser-module tests: assertions can inspect the DOM right after a reply.
class Sync {
  constructor() { this.state = 'pending'; this.cbs = []; }
  then(ok, fail) {
    const next = new Sync();
    const run = () => { try { if (this.state === 'ok') next.resolve(ok ? ok(this.value) : this.value); else if (fail) next.resolve(fail(this.value)); else next.reject(this.value); } catch (e) { next.reject(e); } };
    if (this.state === 'pending') this.cbs.push(run); else run();
    return next;
  }
  catch(fail) { return this.then(undefined, fail); }
  resolve(value) { if (value && typeof value.then === 'function') { value.then(v => this.resolve(v), e => this.reject(e)); return; } this.state = 'ok'; this.value = value; this.cbs.splice(0).forEach(run => run()); }
  reject(error) { this.state = 'err'; this.value = error; this.cbs.splice(0).forEach(run => run()); }
}
module.exports = { Sync };
