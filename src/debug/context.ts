import { DebugDriver } from "./types";

let driver: DebugDriver | undefined;
export function setGlobalDebugDriver(d?: DebugDriver) { driver = d; }
export function getGlobalDebugDriver(): DebugDriver | undefined { return driver; }

