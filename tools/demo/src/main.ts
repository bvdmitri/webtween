// The demo page: pick a clip, choose how much to slow it, watch the progress, get the MP4.
import type { SlowRequest, SlowResult } from './protocol';

const MS_PER_SECOND = 1000;

function element(id: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(`#${id}`);
  if (found === null) throw new Error(`the page has no #${id}`);
  return found;
}

const form = element('form') as HTMLFormElement;
const status = element('status') as HTMLPreElement;
const bar = element('progress') as HTMLProgressElement;
const result = element('result') as HTMLVideoElement;
const download = element('download') as HTMLAnchorElement;

function request(): SlowRequest | undefined {
  const data = new FormData(form);
  const file = data.get('file');
  if (!(file instanceof File) || file.size === 0) return undefined;
  const [start, end] = [Number(data.get('start')), Number(data.get('end'))];
  const backend = data.get('backend') === 'wasm' ? 'wasm' : 'auto';
  return {
    file,
    factor: Number(data.get('factor')),
    backend,
    ...(end > start && { range: { start, end } }),
  };
}

function show(message: SlowResult, name: string): void {
  if (message.type === 'error') {
    status.textContent = `Failed: ${message.message}`;
    return;
  }
  if (message.type === 'done') {
    const url = URL.createObjectURL(new Blob([message.mp4], { type: 'video/mp4' }));
    result.src = url;
    download.href = url;
    download.download = name.replace(/\.[^.]+$/u, '') + '-slow.mp4';
    download.hidden = false;
    status.textContent += `\nDone in ${(message.elapsedMs / MS_PER_SECOND).toFixed(1)} s.`;
    return;
  }
  bar.max = message.totalFrames;
  bar.value = message.sourceFrames;
  const perFrame = message.generatedFrames === 0 ? 0 : message.generateMs / message.generatedFrames;
  status.textContent = [
    `Backend: ${message.backend}`,
    `Source frames: ${message.sourceFrames} of ${message.totalFrames}`,
    `Output frames: ${message.outputFrames} (${message.generatedFrames} generated)`,
    `Per generated frame: ${perFrame.toFixed(1)} ms`,
    `Elapsed: ${(message.elapsedMs / MS_PER_SECOND).toFixed(1)} s`,
  ].join('\n');
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const asked = request();
  if (asked === undefined) return;
  download.hidden = true;
  status.textContent = 'Loading the model and the runtime...';
  const worker = new Worker(new URL('worker.ts', import.meta.url), { type: 'module' });
  worker.addEventListener('message', (message: MessageEvent<SlowResult>) => {
    show(message.data, asked.file.name);
    if (message.data.type !== 'progress') worker.terminate();
  });
  worker.postMessage(asked);
});
