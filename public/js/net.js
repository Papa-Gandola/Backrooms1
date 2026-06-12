// WebSocket-клиент: подключение, отправка состояния, раздача событий подписчикам.

export class Net {
  constructor() {
    this.ws = null;
    this.handlers = new Map();
    this.connected = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      this.ws = new WebSocket(`${proto}://${location.host}`);
      this.ws.onopen = () => { this.connected = true; resolve(); };
      this.ws.onerror = (e) => reject(e);
      this.ws.onclose = () => {
        this.connected = false;
        this._emit('close', {});
      };
      this.ws.onmessage = (ev) => {
        let m;
        try { m = JSON.parse(ev.data); } catch { return; }
        this._emit(m.t, m);
      };
    });
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(fn);
  }

  _emit(type, m) {
    const fns = this.handlers.get(type);
    if (fns) for (const fn of fns) fn(m);
  }

  send(obj) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }
}
