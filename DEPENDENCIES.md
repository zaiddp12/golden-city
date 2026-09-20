# Local model runtime

Bundled @mlc-ai/web-llm 0.2.85 (Apache-2.0), npm distribution verified 2026-09-19. The generated ES module includes upstream embedded WebAssembly and loglevel. No JavaScript is loaded from a CDN at runtime. Development bundler: esbuild 0.25.9. The model is not included in this archive.

Default model: Qwen2.5-1.5B-Instruct-q4f16_1-MLC; q4f32_1 is selected only if shader-f16 is absent. Model card documents Arabic support and Apache-2.0 license. Upstream estimated GPU memory is 1629.75 MB (f16) or 1888.97 MB (f32), plus browser/system overhead. Actual first download size is reported by the runtime; provision approximately 1.5 GB free storage and 2 GB free GPU/shared memory. No paid fallback.

Official sources:
- https://webllm.mlc.ai/docs/user/basic_usage.html
- https://webllm.mlc.ai/docs/user/advanced_usage.html
- https://github.com/mlc-ai/web-llm
- https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct (base model license and language support)
- https://huggingface.co/mlc-ai/Qwen2.5-1.5B-Instruct-q4f16_1-MLC
- https://huggingface.co/mlc-ai/Qwen2.5-1.5B-Instruct-q4f32_1-MLC

The bundled runtime model library version is v0_2_84/base, from its prebuiltAppConfig (not guessed). After explicit activation it downloads model weights/tokenizer from Hugging Face and the compiled model library from raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs. Browser caching is best effort, subject to quota/eviction.

Security boundary: the model generates only a validated finite read-query plan; server authorization still applies. The local model then selects sentence IDs from deterministic server facts; arbitrary generated numbers are never used in the answer. Record notes are never model system instructions. No SQL, mutations, URLs, account roles or user IDs can be selected by the model. Direct query chips do not use AI and are labelled accordingly. Logging out destroys the worker and panel, and clears in-memory results. Model weights may remain in the browser cache and contain no client data.

Rebuild (development only):
1. In a temporary build directory run npm install --ignore-scripts --no-audit --no-fund @mlc-ai/web-llm@0.2.85 esbuild@0.25.9.
2. entry.js: export { WebWorkerMLCEngine, WebWorkerMLCEngineHandler, prebuiltAppConfig } from '@mlc-ai/web-llm';
3. node_modules/.bin/esbuild entry.js --bundle --format=esm --platform=browser --minify --legal-comments=eof --outfile=webllm-0.2.85.js.
4. Preserve upstream license files and legal comments.

## Embedded font

The stylesheet embeds Tajawal, Copyright 2018 Boutros International (http://www.boutrosfonts.com), distributed under the SIL Open Font License 1.1. The complete unmodified license is included in `TAJAWAL-OFL.txt`. Source verified 2026-09-19: https://raw.githubusercontent.com/google/fonts/main/ofl/tajawal/OFL.txt. Font family: https://fonts.google.com/specimen/Tajawal. The existing font asset was retained without regeneration.
