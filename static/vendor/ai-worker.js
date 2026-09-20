/* WebLLM inference runs only in this dedicated, same-origin worker. */
import { WebWorkerMLCEngineHandler } from './webllm-0.2.85.js';
const handler = new WebWorkerMLCEngineHandler();
self.onmessage = event => handler.onmessage(event);
