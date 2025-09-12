/** Minimal parsers for GDB/MI outputs we care about. */

export function parseMiFrames(resultLine: string) {
  // Expect pattern like: 1^done,stack=[frame={level="0",addr="0x...",func="main",file="app.c",line="12"},frame={...}]
  const m = resultLine.match(/\bstack=\[(.*)\]$/);
  if (!m) return [] as any[];
  const inner = m[1];
  const frames: any[] = [];
  // Split at '},frame={' boundaries; normalize to start with 'frame={'
  const parts = inner.split(/},\s*frame=\{/).map((p, i) => (i === 0 ? p.replace(/^frame=\{/, "") : p));
  for (let part of parts) {
    part = part.replace(/}\s*$/, "");
    const obj: Record<string, any> = {};
    const rx = /(\w+)="([^"]*)"/g;
    let t: RegExpExecArray | null;
    while ((t = rx.exec(part)) !== null) {
      const k = t[1];
      const v = t[2];
      obj[k] = k === "line" ? Number(v) : v;
    }
    if (Object.keys(obj).length) frames.push({ func: obj.func || obj.fn, file: obj.file, line: obj.line, addr: obj.addr, level: obj.level });
  }
  return frames;
}
