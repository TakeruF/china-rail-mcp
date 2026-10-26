const endpoint = document.getElementById('endpoint');
const copy = document.getElementById('copy-url');
const feedback = document.getElementById('copy-feedback');
const status = document.getElementById('health-status');
const refresh = document.getElementById('refresh-health');
const output = document.getElementById('command-output');
const input = document.getElementById('command-input');
const form = document.getElementById('command-form');
const history = [];
let historyIndex = 0;
let draft = '';
let composing = false;
let generation = 0;
let pendingHealth;
document.getElementById('year').textContent = String(new Date().getFullYear());
document.getElementById('command-controls').hidden = false;

async function copyEndpoint() {
  let ok = false;
  try {
    await navigator.clipboard.writeText(endpoint.textContent.trim());
    ok = true;
  } catch {
    // Keep the visible URL selectable when clipboard access is unavailable.
  }
  const message = ok ? feedback.dataset.success : feedback.dataset.fallback;
  feedback.textContent = message;
  return { ok, message };
}
copy.addEventListener('click', copyEndpoint);

function checkHealth() {
  if (pendingHealth) return pendingHealth;
  refresh.disabled = true;
  status.removeAttribute('data-state');
  status.removeAttribute('title');
  status.lastElementChild.textContent = status.dataset.pending;
  pendingHealth = (async () => {
    try {
      const response = await fetch('/china-rail/health', {
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      });
      const health = await response.json();
      if (!response.ok || health.status !== 'ok' || health.service !== 'china-rail-mcp')
        throw new Error('Unavailable');
      status.dataset.state = 'ok';
      status.lastElementChild.textContent = status.dataset.ok;
      status.title = status.dataset.detail;
      return { ok: true, message: `${status.dataset.ok}\n${status.dataset.detail}` };
    } catch {
      status.dataset.state = 'error';
      status.lastElementChild.textContent = status.dataset.error;
      return { ok: false, message: status.dataset.error };
    } finally {
      refresh.disabled = false;
    }
  })().finally(() => {
    pendingHealth = undefined;
  });
  return pendingHealth;
}
refresh.addEventListener('click', checkHealth);
checkHealth();

function print(message, className = 'command-result') {
  const line = document.createElement('p');
  line.className = className;
  line.textContent = message;
  output.append(line);
  while (output.children.length > 40) output.firstElementChild.remove();
  output.scrollTop = output.scrollHeight;
}

async function runCommand(value) {
  const command = value.trim();
  if (!command) return;
  if (history.at(-1) !== command) history.push(command);
  if (history.length > 20) history.shift();
  historyIndex = history.length;
  draft = '';
  input.value = '';
  const [name, ...args] = command.toLowerCase().split(/\s+/u);
  if (name === 'clear' && args.length === 0) {
    generation++;
    output.replaceChildren();
    return;
  }
  print(`> ${command}`, 'command-echo');
  const currentGeneration = generation;
  let result;
  if (name === 'lang') {
    if (args.length === 1 && ['ja', 'zh', 'ko', 'en'].includes(args[0])) {
      location.assign(`/${args[0]}`);
      return;
    }
    result = { ok: false, message: output.dataset.lang };
  } else if (args.length > 0) {
    result = { ok: false, message: output.dataset.unknown };
  } else if (name === 'help') {
    result = { ok: true, message: output.dataset.help };
  } else if (name === 'list') {
    result = { ok: true, message: `China Rail\n${endpoint.textContent.trim()}` };
  } else if (name === 'copy') {
    result = await copyEndpoint();
  } else if (name === 'status') {
    result = await checkHealth();
  } else if (name === 'train') {
    result = {
      ok: true,
      message: "     ____\n ___|_[]_|___\n| [] [] []   \\__\n'--O------O-----'\n==================",
    };
  } else {
    result = { ok: false, message: output.dataset.unknown };
  }
  // A slow network response must not repopulate a console the user just cleared.
  if (generation === currentGeneration)
    print(result.message, result.ok ? 'command-result' : 'command-error');
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!composing) runCommand(input.value);
});
input.addEventListener('compositionstart', () => {
  composing = true;
});
input.addEventListener('compositionend', () => {
  composing = false;
});
input.addEventListener('keydown', (event) => {
  if (event.isComposing || composing || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  if (historyIndex === history.length) draft = input.value;
  historyIndex = Math.max(
    0,
    Math.min(history.length, historyIndex + (event.key === 'ArrowUp' ? -1 : 1)),
  );
  input.value = historyIndex === history.length ? draft : history[historyIndex];
  input.setSelectionRange(input.value.length, input.value.length);
});
document.querySelectorAll('[data-command]').forEach((button) => {
  button.addEventListener('click', () => {
    runCommand(button.dataset.command);
  });
});
