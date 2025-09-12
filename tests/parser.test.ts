import { extract } from "../src/parser/regexEngine";
import { parseWithPatterns } from "../src/parser";

function assert(cond: any, msg: string) {
  if (!cond) throw new Error(msg);
}

export function run() {
  const patterns = [
    { name: "json_block", intent: "extract-json", regex: "<<MIS:JSON>>(.*?)<<MIS:END>>", reflags: ["s", "g"] },
    { name: "error_block", intent: "extract-error", regex: "<<MIS:ERR>>(.*?)<<MIS:END>>", reflags: ["s", "g"] },
    { name: "start_end_block", intent: "extract-block", regex: "<<MIS:START>>(.*?)<<MIS:END>>", reflags: ["s", "g"] },
  ];

  const sample = [
    "noise before",
    "<<MIS:JSON>>{\"ok\":true}<<MIS:END>>",
    "<<MIS:ERR>>oh no<<MIS:END>>",
    "<<MIS:START>>artifact body<<MIS:END>>",
    "noise after",
  ].join("\n");

  const parsed = parseWithPatterns(sample, patterns);
  assert(parsed.json.length === 1 && parsed.json[0].includes("\"ok\":true"), "json block extraction failed");
  assert(parsed.errors.length === 1 && parsed.errors[0].includes("oh no"), "error block extraction failed");
  assert(parsed.blocks.length === 1 && parsed.blocks[0].includes("artifact body"), "start/end block extraction failed");

  // Direct extract test for global handling
  const jsonPattern = patterns.find((p) => p.name === "json_block")!;
  const multi = [
    "<<MIS:JSON>>one<<MIS:END>>",
    "<<MIS:JSON>>two<<MIS:END>>",
  ].join("\n");
  const matches = extract(multi, jsonPattern);
  assert(matches.length === 2 && matches[0] === "one" && matches[1] === "two", "global extraction failed");
}
