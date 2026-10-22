// CallZinha: processador do filtro de ruído forte (DeepFilterNet3), roda dentro do AudioWorklet.
// Cola própria e enxuta para o df_bg.wasm (wasm-bindgen) do pacote deepfilternet3-noise-filter (veja LEIAME.txt).
// Economia: no mudo a IA não roda (só copia o som); ao desligar, a instância inteira é solta e a memória volta.
'use strict';

function czDfInstance(module) {
  let wasm = null, f32 = null, u8 = null, outBuf = null;
  const F = () => (f32 && f32.buffer === wasm.memory.buffer) ? f32 : (f32 = new Float32Array(wasm.memory.buffer));
  const U = () => (u8 && u8.buffer === wasm.memory.buffer) ? u8 : (u8 = new Uint8Array(wasm.memory.buffer));
  const str = (p, n) => { const m = U(); let s = ''; p >>>= 0; for (let i = 0; i < n; i++) s += String.fromCharCode(m[p + i]); return s; };
  const imports = { './df_bg.js': {
    __wbg___wbindgen_throw_344f42d3211c4765: (p, n) => { throw new Error(str(p, n)); },
    __wbg_getRandomValues_cc7f052a444bb2ce: (p, n) => {
      const a = U().subarray(p >>> 0, (p >>> 0) + n);
      if (globalThis.crypto && globalThis.crypto.getRandomValues) globalThis.crypto.getRandomValues(a);
      else for (let i = 0; i < n; i++) a[i] = (Math.random() * 256) | 0;   // o AudioWorklet não tem crypto
    },
    // A saída de cada quadro é copiada para um buffer reaproveitado: nada de lixo novo a cada 10 ms no thread de áudio
    __wbg_new_from_slice_ddf8b82c4d6af38e: (p, n) => {
      if (!outBuf || outBuf.length !== n) outBuf = new Float32Array(n);
      const m = F(), o = (p >>> 0) >>> 2;
      for (let i = 0; i < n; i++) outBuf[i] = m[o + i];
      return outBuf;
    },
    __wbindgen_init_externref_table: () => {
      const t = wasm.__wbindgen_externrefs, o = t.grow(4);
      t.set(0, undefined); t.set(o, undefined); t.set(o + 1, null); t.set(o + 2, true); t.set(o + 3, false);
    }
  } };
  wasm = new WebAssembly.Instance(module, imports).exports;
  wasm.__wbindgen_start();
  return {
    create(bytes, lim) {
      const p = wasm.__wbindgen_malloc_command_export(bytes.length, 1) >>> 0;
      U().set(bytes, p);
      return wasm.df_create(p, bytes.length, lim) >>> 0;
    },
    frameLen: (st) => wasm.df_get_frame_length(st) >>> 0,
    process(st, frame) {
      const p = wasm.__wbindgen_malloc_command_export(frame.length * 4, 4) >>> 0;   // o wasm libera depois do quadro
      F().set(frame, p >>> 2);
      return wasm.df_process_frame(st, p, frame.length);
    },
    setLim: (st, v) => wasm.df_set_atten_lim(st, v),
    mem: () => wasm.memory.buffer.byteLength
  };
}

class CzDfn extends AudioWorkletProcessor {
  constructor(opt) {
    super();
    const o = (opt && opt.processorOptions) || {};
    this.ok = false; this.bypass = !!o.bypass; this.dead = false; this.df = null;
    this.port.onmessage = (e) => {
      const d = e.data || {};
      if (d.destroy) { this.free(); return; }
      if (typeof d.bypass === 'boolean') this.setBypass(d.bypass);
      if (typeof d.lim === 'number' && this.ok) { try { this.df.setLim(this.st, d.lim); } catch (err) {} }
      if (d.mem) this.port.postMessage({ mem: this.df ? this.df.mem() : 0 });
    };
    try {
      this.df = czDfInstance(o.module);
      this.st = this.df.create(new Uint8Array(o.model), typeof o.lim === 'number' ? o.lim : 50);
      this.n = this.df.frameLen(this.st);                // 480 amostras = 10 ms a 48 kHz
      this.inp = new Float32Array(this.n); this.inLen = 0;
      this.size = 4096; this.ring = new Float32Array(this.size);
      this.prime();
      this.ok = true;
      this.port.postMessage({ ready: true, n: this.n, mem: this.df.mem() });
    } catch (err) {
      this.df = null;
      this.port.postMessage({ error: String((err && err.message) || err) });
    }
  }
  // A saída começa 1 quadro atrasada: com blocos de 128 e quadros de 480, assim nunca falta som (sem picote)
  prime() { this.ring.fill(0); this.r = 0; this.w = this.n; this.fill = this.n; this.inLen = 0; }
  setBypass(b) {
    if (b === this.bypass) return;
    this.bypass = b;
    if (!b && this.ok) this.prime();
  }
  free() { this.dead = true; this.ok = false; this.df = null; this.inp = this.ring = null; }
  process(inputs, outputs) {
    if (this.dead) return false;
    const out = outputs[0] && outputs[0][0];
    const inp = inputs[0] && inputs[0][0];
    if (!out || !inp) return true;
    if (!this.ok || this.bypass) { out.set(inp); return true; }
    const n = this.n, buf = this.inp, ring = this.ring, size = this.size, len = inp.length;
    let k = 0;
    while (k < len) {
      let take = n - this.inLen; if (take > len - k) take = len - k;
      for (let j = 0; j < take; j++) buf[this.inLen + j] = inp[k + j];
      this.inLen += take; k += take;
      if (this.inLen === n) {
        this.inLen = 0;
        let y;
        try { y = this.df.process(this.st, buf); }
        catch (err) { this.ok = false; this.port.postMessage({ error: String((err && err.message) || err) }); out.set(inp); return true; }
        let w = this.w;
        for (let j = 0; j < n; j++) { ring[w] = y[j]; if (++w === size) w = 0; }
        this.w = w; this.fill += n;
      }
    }
    if (this.fill >= out.length) {
      let r = this.r;
      for (let j = 0; j < out.length; j++) { out[j] = ring[r]; if (++r === size) r = 0; }
      this.r = r; this.fill -= out.length;
    }
    return true;
  }
}
registerProcessor('cz-dfn', CzDfn);
