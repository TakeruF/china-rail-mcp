const endpoint = document.getElementById('endpoint');
const copy = document.getElementById('copy-url');
const feedback = document.getElementById('copy-feedback');
const status = document.getElementById('health-status');
const refresh = document.getElementById('refresh-health');
document.getElementById('year').textContent = String(new Date().getFullYear());

copy.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(endpoint.textContent.trim());
    feedback.textContent = feedback.dataset.success;
  } catch {
    feedback.textContent = feedback.dataset.fallback;
  }
});

async function checkHealth() {
  refresh.disabled = true;
  status.removeAttribute('data-state');
  status.removeAttribute('title');
  status.lastElementChild.textContent = status.dataset.pending;
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
  } catch {
    status.dataset.state = 'error';
    status.lastElementChild.textContent = status.dataset.error;
  } finally {
    refresh.disabled = false;
  }
}
refresh.addEventListener('click', checkHealth);
checkHealth();
