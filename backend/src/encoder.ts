import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, realpath } from 'node:fs/promises';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ServerConfig } from './config.js';

export const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
export const MODEL_REVISION = '751bff37182d3f1213fa05d7196b954e230abad9';
export const MODEL_IDENTITY = `${MODEL_ID}@${MODEL_REVISION}:q8:cpu:mean-normalized:256:trim-v1`;
const hashes = {
  'config.json': '7135149f7cffa1a573466c6e4d8423ed73b62fd2332c575bf738a0d033f70df7',
  'tokenizer.json': 'da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0',
  'tokenizer_config.json': '9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3',
  'onnx/model_quantized.onnx': 'afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1',
  'README.md': '63ea99bf681a2e9eda4f6a537d5ed8fda95d1677111656da37e9cfd080c3af02',
} as const;

export interface TextEncoder {
  encode(text: string): Promise<Float64Array>;
  dispose?(): Promise<void>;
}

export function validVector(values: Float64Array): boolean {
  if (!(values instanceof Float64Array) || values.length !== 384 || !values.every(Number.isFinite)) return false;
  const magnitude = Math.hypot(...values);
  return Number.isFinite(magnitude) && Math.abs(magnitude - 1) < 1e-3;
}

// Resolve against backend/, not process.cwd(), so a built server started elsewhere
// still uses the same ignored local artifacts. No network, mkdir, or cache writes.
export function createLocalEncoder(config: Pick<ServerConfig, 'modelId' | 'modelCacheDir'>): TextEncoder {
  const backendDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const cacheDir = isAbsolute(config.modelCacheDir ?? '') ? resolve(config.modelCacheDir!) : resolve(backendDir, config.modelCacheDir ?? '.cache/models');
  const modelDir = join(cacheDir, MODEL_ID, MODEL_REVISION);
  let load: Promise<import('@huggingface/transformers').FeatureExtractionPipeline> | undefined;
  let disposed = false;
  async function initialize() {
    if (disposed || (config.modelId ?? MODEL_ID) !== MODEL_ID) throw new Error('Search model unavailable');
    const canonical = await realpath(modelDir);
    if (canonical !== modelDir) throw new Error('Search model cache path unavailable');
    for (const [file, expected] of Object.entries(hashes)) {
      const path = join(modelDir, file);
      const stat = await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink() || !resolve(path).startsWith(modelDir + sep)) throw new Error('Search artifact unavailable');
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(path)) hash.update(chunk);
      if (hash.digest('hex') !== expected) throw new Error('Search artifact checksum mismatch');
    }
    const { env, AutoTokenizer, AutoModel, FeatureExtractionPipeline } = await import('@huggingface/transformers');
    env.cacheDir = cacheDir;
    env.useFSCache = true;
    env.useBrowserCache = false;
    env.allowLocalModels = true;
    env.localModelPath = join(cacheDir, '__no_unrevisioned_local_models__');
    env.allowRemoteModels = false;
    env.fetch = () => { throw new Error('Remote model fetch blocked'); };
    const options = { revision: MODEL_REVISION, dtype: 'q8' as const, device: 'cpu' as const,
      local_files_only: true, cache_dir: cacheDir, session_options: { intraOpNumThreads: 2, interOpNumThreads: 1 } };
    const tokenizer = await AutoTokenizer.from_pretrained(modelDir, options);
    tokenizer.config.model_max_length = 256;
    if (tokenizer('shade '.repeat(600), { truncation: true }).input_ids.dims[1] > 256) throw new Error('Tokenizer cap unavailable');
    const model = await AutoModel.from_pretrained(modelDir, options);
    const pipeline = new FeatureExtractionPipeline({ task: 'feature-extraction', tokenizer, model });
    if (disposed) { await pipeline.dispose(); throw new Error('Search encoder closed'); }
    return pipeline;
  }
  return {
    async encode(text) {
      if (disposed) throw new Error('Search encoder closed');
      const pipeline = await (load ??= initialize());
      if (disposed) throw new Error('Search encoder closed');
      const tensor = await pipeline(text, { pooling: 'mean', normalize: true });
      if (tensor.dims.length !== 2 || tensor.dims[0] !== 1 || tensor.dims[1] !== 384) throw new Error('Invalid embedding shape');
      const vector = Float64Array.from(tensor.data);
      if (!validVector(vector)) throw new Error('Invalid embedding');
      return vector;
    },
    async dispose() {
      disposed = true;
      if (load) await load.then(pipeline => pipeline.dispose(), () => {});
    },
  };
}
