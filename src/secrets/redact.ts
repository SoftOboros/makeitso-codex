/**
 * Redactor: masks sensitive values in strings/objects.
 */

export class Redactor {
  private needles: string[] = [];
  private patterns: RegExp[] = [];

  addSecret(secret?: string) {
    if (!secret || typeof secret !== "string" || secret.length < 4) return;
    if (!this.needles.includes(secret)) this.needles.push(secret);
    // Add generic token-like regexes if looks like a token
    if (/[A-Za-z0-9_-]{12,}/.test(secret)) {
      const head = secret.slice(0, 4).replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      this.patterns.push(new RegExp(head + "[A-Za-z0-9_-]{8,}", "g"));
    }
  }

  redact(text: string): string {
    let out = text;
    for (const v of this.needles) {
      if (!v) continue;
      const rx = new RegExp(v.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"), "g");
      out = out.replace(rx, "******");
    }
    for (const rx of this.patterns) {
      out = out.replace(rx, "******");
    }
    return out;
  }

  redactObj<T>(obj: T): T {
    if (obj == null) return obj;
    if (typeof obj === "string") return this.redact(obj) as unknown as T;
    if (Array.isArray(obj)) return obj.map((v) => this.redactObj(v)) as unknown as T;
    if (typeof obj === "object") {
      const out: any = Array.isArray(obj) ? [] : {};
      for (const [k, v] of Object.entries(obj as any)) out[k] = this.redactObj(v as any);
      return out as T;
    }
    return obj;
  }
}

let globalRedactor: Redactor | undefined;
export function setGlobalRedactor(r?: Redactor) { globalRedactor = r; }
export function getGlobalRedactor(): Redactor | undefined { return globalRedactor; }

