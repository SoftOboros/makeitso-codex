import { parseMiFrames } from "../src/debug/mi";

function assert(cond: any, msg: string) { if (!cond) throw new Error(msg); }

export function run() {
  const sample = '1^done,stack=[frame={level="0",addr="0x0000000100003f20",func="main",file="app.c",line="12"},frame={level="1",addr="0x0000000100003f10",func="_start",file="crt0.c",line="8"}]';
  const frames = parseMiFrames(sample);
  assert(frames.length === 2, "expected two frames");
  assert(frames[0].func === "main" && frames[0].file === "app.c" && frames[0].line === 12, "parsed main frame");
}
