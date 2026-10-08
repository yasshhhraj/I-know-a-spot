// Synthetic local inference check; never pass member data to this script.
// From backend/: node scripts/minilm-smoke.mjs --download (explicit cache fill)
//                node scripts/minilm-smoke.mjs            (strictly cache-only)
import { mkdir, lstat, rename, unlink } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline as streamToFile } from 'node:stream/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { env, AutoModel, AutoTokenizer, FeatureExtractionPipeline } from '@huggingface/transformers';

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--download')) {
  console.error('Usage: node scripts/minilm-smoke.mjs [--download]');
  process.exitCode = 1;
} else {
  const download = args[0] === '--download';
  const model = 'Xenova/all-MiniLM-L6-v2';
  const revision = '751bff37182d3f1213fa05d7196b954e230abad9';
  const cacheRelativePath = 'backend/.cache/models';
  const backendDir = dirname(dirname(fileURLToPath(import.meta.url)));
  const cacheRoot = join(backendDir, '.cache');
  const cacheDir = join(cacheRoot, 'models');
  const modelDir = join(cacheDir, model, revision);
  const artifactHashes = {
    'config.json': '7135149f7cffa1a573466c6e4d8423ed73b62fd2332c575bf738a0d033f70df7',
    'tokenizer.json': 'da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0',
    'tokenizer_config.json': '9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3',
    'onnx/model_quantized.onnx': 'afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1',
    'README.md': '63ea99bf681a2e9eda4f6a537d5ed8fda95d1677111656da37e9cfd080c3af02',
  };
  const samples = [
    { id: 'garden', text: 'A quiet shaded garden with a bench for reading beneath leafy trees.' },
    { id: 'doorway', text: 'An old doorway with carved stone and intriguing textures.' },
    { id: 'court', text: 'An outdoor basketball court with painted lines and hoops.' },
  ];
  const query = 'A peaceful place to read in the shade';
  const now = () => performance.now();
  const mib = (bytes) => Math.round((bytes / 1024 / 1024) * 100) / 100;
  const round = (value) => Math.round(value * 1000) / 1000;

  function vector(tensor) {
    if (tensor.dims.length !== 2 || tensor.dims[0] !== 1 || tensor.dims[1] !== 384 || tensor.data.length !== 384) {
      throw new Error('Expected one 384-dimensional embedding');
    }
    const values = Float64Array.from(tensor.data);
    if (!values.every(Number.isFinite)) throw new Error('Embedding contains a non-finite value');
    const magnitude = Math.hypot(...values);
    if (Math.abs(magnitude - 1) > 1e-3) throw new Error('Embedding is not normalized');
    return values;
  }

  function cosine(a, b) {
    return a.reduce((sum, value, index) => sum + value * b[index], 0);
  }

  async function main() {
    const baseline = { rss: process.memoryUsage().rss, maxRss: process.resourceUsage().maxRSS };
    // Refuse symlink redirection before allowing the installed runtime to write its cache.
    if (download) {
      for (const dir of [cacheRoot, cacheDir, join(cacheDir, 'Xenova'), join(cacheDir, model), modelDir, join(modelDir, 'onnx')]) {
        try {
          if (!(await lstat(dir)).isDirectory()) throw new Error('Cache path is not a real directory');
        } catch (error) {
          if (error?.code !== 'ENOENT') throw error;
          await mkdir(dir);
        }
      }
    }

    // v4.3.1's pipeline and tokenizer preflight helpers discard revision options.
    // Fetch known artifacts ourselves at an immutable revision, then load the
    // resulting directory with networking disabled in every runtime mode.
    const downloadStart = now();
    if (download) {
      for (const file of Object.keys(artifactHashes)) {
        const destination = join(modelDir, file);
        try {
          if (!(await lstat(destination)).isFile()) throw new Error('Model artifact is not a regular file');
          continue;
        } catch (error) { if (error?.code !== 'ENOENT') throw error; }
        const temporary = `${destination}.tmp.${process.pid}`;
        try {
          const response = await fetch(`https://huggingface.co/${model}/resolve/${revision}/${file}`, {
            signal: AbortSignal.timeout(60_000),
          });
          if (!response.ok || !response.body) throw new Error(`Model artifact download failed (${response.status}): ${file}`);
          await streamToFile(Readable.fromWeb(response.body), createWriteStream(temporary, { flags: 'wx' }));
          await rename(temporary, destination);
        } catch (error) {
          await unlink(temporary).catch(() => {});
          throw error;
        }
      }
    }
    const downloadMs = now() - downloadStart;
    for (const [file, expected] of Object.entries(artifactHashes)) {
      const hash = createHash('sha256');
      for await (const bytes of createReadStream(join(modelDir, file))) hash.update(bytes);
      if (hash.digest('hex') !== expected) throw new Error(`Model artifact checksum mismatch: ${file}`);
    }

    env.cacheDir = cacheDir;
    env.useFSCache = true;
    env.useBrowserCache = false;
    // v4 requires local models enabled for local_files_only, even for filesystem-cache hits.
    // Avoid the package's default unrevisioned local-model directory.
    env.allowLocalModels = true;
    env.localModelPath = join(cacheDir, '__no_unrevisioned_local_models__');
    env.allowRemoteModels = false;
    env.fetch = () => { throw new Error('Network request attempted during local inference'); };

    let encoder;
    try {
      const startedLoad = now();
      const options = {
        revision,
        dtype: 'q8',
        device: 'cpu',
        local_files_only: true,
        cache_dir: cacheDir,
        session_options: { intraOpNumThreads: 2, interOpNumThreads: 1 },
      };
      const tokenizer = await AutoTokenizer.from_pretrained(modelDir, options);
      tokenizer.config.model_max_length = 256; // Upstream sentence-transformers policy; leave cached JSON unchanged.
      if (tokenizer('shade '.repeat(600), { truncation: true }).input_ids.dims[1] > 256) {
        throw new Error('Tokenizer did not enforce the 256-token policy');
      }
      const loadedModel = await AutoModel.from_pretrained(modelDir, options);
      encoder = new FeatureExtractionPipeline({ task: 'feature-extraction', tokenizer, model: loadedModel });
      const modelLoadMs = now() - startedLoad;
      const embed = async (text) => vector(await encoder(text, { pooling: 'mean', normalize: true }));

      const firstStart = now();
      const garden = await embed(samples[0].text);
      const firstInferenceMs = now() - firstStart;
      const descriptions = [garden, await embed(samples[1].text), await embed(samples[2].text)];
      const queryVector = await embed(query);
      const repeated = await embed(query);
      if (Math.abs(cosine(queryVector, queryVector) - 1) > 1e-3 ||
          Math.max(...queryVector.map((value, index) => Math.abs(value - repeated[index]))) > 1e-5) {
        throw new Error('Self cosine or repeated embedding check failed');
      }

      const scores = samples.map(({ id }, index) => ({ id, score: cosine(queryVector, descriptions[index]) }))
        .sort((a, b) => b.score - a.score);
      if (scores[0].id !== 'garden') throw new Error('Synthetic garden did not rank first');

      const warmMs = [];
      for (let i = 0; i < 5; i++) {
        const start = now();
        await embed(query);
        warmMs.push(now() - start);
      }
      warmMs.sort((a, b) => a - b);
      console.log(JSON.stringify({
        cacheOnly: !download,
        model, revision, dtype: 'q8', device: 'cpu', maxTokens: 256, cache: cacheRelativePath,
        runtime: { node: process.version, transformers: env.version },
        timingsMs: {
          ...(download ? { artifactPreparation: round(downloadMs) } : {}),
          modelLoad: round(modelLoadMs), firstInference: round(firstInferenceMs),
          warmQueryMedianOfFive: round(warmMs[2]),
        },
        memoryMiB: {
          beforeLoadRss: mib(baseline.rss), beforeLoadMaxRss: round(baseline.maxRss / 1024),
          rss: mib(process.memoryUsage().rss), maxRss: round(process.resourceUsage().maxRSS / 1024),
        },
        artifactsVerified: Object.keys(artifactHashes).length,
        scores: scores.map(({ id, score }) => ({ id, score: round(score) })),
        note: 'Synthetic smoke timings only; not a production benchmark',
      }));
    } finally {
      await encoder?.dispose();
    }
  }

  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
