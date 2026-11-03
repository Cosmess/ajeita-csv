/// <reference lib="webworker" />
import { serveRequests } from "./serve";

serveRequests(self as unknown as DedicatedWorkerGlobalScope);
