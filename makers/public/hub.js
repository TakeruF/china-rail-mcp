const endpoint = document.getElementById('endpoint');
const copy = document.getElementById('copy-url');
const feedback = document.getElementById('copy-feedback');
const status = document.getElementById('health-status');
const refresh = document.getElementById('refresh-health');
document.getElementById('year').textContent = String(new Date().getFullYear());

copy.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(endpoint.textContent.trim());
    feedback.textContent = '接続URLをコピーしました。';
  } catch {
    feedback.textContent = 'URLを選択してコピーしてください。';
  }
});

async function checkHealth() {
  refresh.disabled = true;
  status.removeAttribute('data-state');
  status.lastElementChild.textContent = '状況を確認中';
  try {
    const response = await fetch('/china-rail/health', {
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    const health = await response.json();
    if (!response.ok || health.status !== 'ok' || health.service !== 'china-rail-mcp')
      throw new Error('Unavailable');
    status.dataset.state = 'ok';
    status.lastElementChild.textContent = 'サーバー応答あり';
    status.title =
      'MCPサーバーの応答を確認しました。12306の列車データ取得状態は検索時に確認されます。';
  } catch {
    status.dataset.state = 'error';
    status.lastElementChild.textContent = '応答を確認できません';
  } finally {
    refresh.disabled = false;
  }
}
refresh.addEventListener('click', checkHealth);
checkHealth();
