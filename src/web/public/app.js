/**
 * Foundry Local Streaming Validation – Dashboard client-side logic
 */

// ── State ────────────────────────────────────────────────
let selectedModel = null;
let serviceReady = false;

// ── Helpers ──────────────────────────────────────────────

function $(id) { return document.getElementById(id); }

function showLoading(el, msg) {
  el.innerHTML = `<p class="loading-text"><span class="spinner"></span>${msg}</p>`;
}

function showError(el, msg) {
  el.innerHTML = `<p class="error-text">${escapeHtml(msg)}</p>`;
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

async function api(url, opts) {
  const res = await fetch(url, opts);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

function enableProbeButtons() {
  $('btn-run-all').disabled = !selectedModel;
  $('btn-probe-ns').disabled = !selectedModel;
  $('btn-probe-raw').disabled = !selectedModel;
  $('btn-probe-sdk').disabled = !selectedModel;
  $('btn-benchmark').disabled = !serviceReady;
}

// ── Service Detection ────────────────────────────────────

async function detectService() {
  const el = $('service-status');
  showLoading(el, 'Detecting Foundry Local service...');

  try {
    const data = await api('/api/status');

    const statusClass = data.running ? 'status-running' : 'status-stopped';
    const statusText = data.running ? '🟢 Running' : '🔴 Stopped';

    el.innerHTML = `
      <div class="service-info">
        <div class="info-item">
          <span class="label">Status</span>
          <span class="status-badge ${statusClass}">${statusText}</span>
        </div>
        ${data.detectedVia ? `
        <div class="info-item">
          <span class="label">Detected Via</span>
          <span class="value">${escapeHtml(data.detectedVia.toUpperCase())}</span>
        </div>` : ''}
        ${data.port ? `
        <div class="info-item">
          <span class="label">Port</span>
          <span class="value">${data.port}</span>
        </div>` : ''}
        ${data.baseUrl || data.configuredBaseUrl ? `
        <div class="info-item">
          <span class="label">Base URL</span>
          <span class="value">${escapeHtml(data.configuredBaseUrl || data.baseUrl)}</span>
        </div>` : ''}
        ${data.statusUrl ? `
        <div class="info-item">
          <span class="label">Status URL</span>
          <span class="value">${escapeHtml(data.statusUrl)}</span>
        </div>` : ''}
      </div>
    `;

    // Update version bar with info from status response
    if (data.versions) {
      renderVersionBar(data.versions);
    }

    if (data.running) {
      serviceReady = true;
      enableProbeButtons();
      loadModels();
    }
  } catch (err) {
    showError(el, err.message);
  }
}

// ── Model Loading ────────────────────────────────────────

async function loadModels() {
  const el = $('model-list');
  showLoading(el, 'Loading model catalog...');

  try {
    const data = await api('/api/models');
    const models = data.models || [];

    if (models.length === 0) {
      el.innerHTML = '<p class="muted">No models found. Load models into Foundry Local.</p>';
      return;
    }

    el.innerHTML = `<div class="model-grid">${
      models.map(m => `
        <div class="model-card" data-model="${escapeHtml(m.id)}" onclick="selectModel('${escapeHtml(m.id)}')">
          <div class="model-icon">🤖</div>
          <div class="model-info">
            <div class="model-name">${escapeHtml(m.id)}</div>
            <div class="model-owner">${escapeHtml(m.owned_by || 'unknown')}</div>
          </div>
        </div>
      `).join('')
    }</div>`;
  } catch (err) {
    showError(el, err.message);
  }
}

function selectModel(modelId) {
  selectedModel = modelId;
  $('current-model').textContent = modelId;

  // Update visual selection
  document.querySelectorAll('.model-card').forEach(card => {
    card.classList.toggle('selected', card.dataset.model === modelId);
  });

  enableProbeButtons();
}

// ── Probe Execution ──────────────────────────────────────

async function runAllProbes() {
  if (!selectedModel) return;

  const el = $('probe-results');
  showLoading(el, `Running all probes on ${selectedModel}... (this may take up to 90 seconds)`);
  disableAllButtons();

  try {
    const report = await api('/api/probes/all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: selectedModel }),
    });

    renderProbeReport(el, report);
  } catch (err) {
    showError(el, err.message);
  } finally {
    enableProbeButtons();
    enableAllButtons();
  }
}

async function runSingleProbe(name) {
  if (!selectedModel) return;

  const el = $('probe-results');
  showLoading(el, `Running ${name} probe on ${selectedModel}...`);
  disableAllButtons();

  try {
    const result = await api(`/api/probe/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: selectedModel }),
    });

    el.innerHTML = renderProbeCard(result);
  } catch (err) {
    showError(el, err.message);
  } finally {
    enableProbeButtons();
    enableAllButtons();
  }
}

function renderProbeReport(el, report) {
  const probes = report.probes || [];
  let html = probes.map(p => renderProbeCard(p)).join('');

  // Overall verdict
  const allOk = probes.every(p => p.outcome === 'OK');
  const nonStreamOk = probes.find(p => p.probe === 'non-streaming')?.outcome === 'OK';
  const streamHang = probes.filter(p => p.probe !== 'non-streaming').some(p =>
    ['HANG', 'NO_FIRST_EVENT', 'TIMEOUT'].includes(p.outcome)
  );

  if (allOk) {
    html += '<div class="verdict-banner all-ok">🎉 ALL PROBES PASSED — streaming and non-streaming both work.</div>';
  } else if (nonStreamOk && streamHang) {
    html += '<div class="verdict-banner streaming-hang">⚠️ STREAMING HANG DETECTED — non-streaming works but streaming hangs. This reproduces the known Foundry Local v0.5 streaming issue.</div>';
  } else {
    html += '<div class="verdict-banner some-fail">❌ Some probes failed. See details above.</div>';
  }

  el.innerHTML = html;
}

function renderProbeCard(p) {
  const outcomeClass = `outcome-${p.outcome.toLowerCase().replace(/_/g, '_')}`;
  return `
    <div class="probe-result-card ${outcomeClass}">
      <div class="probe-header">
        <span class="probe-name">${probeDisplayName(p.probe)}</span>
        <span class="outcome-badge ${outcomeClass}">${p.outcome}</span>
      </div>
      <div class="probe-metrics">
        ${p.httpStatus !== undefined ? `<div class="metric"><span class="metric-label">HTTP Status</span> <span class="metric-value">${p.httpStatus}</span></div>` : ''}
        <div class="metric"><span class="metric-label">Total</span> <span class="metric-value">${p.timings.totalMs} ms</span></div>
        ${p.timings.ttfbMs !== undefined ? `<div class="metric"><span class="metric-label">TTFB</span> <span class="metric-value">${p.timings.ttfbMs} ms</span></div>` : ''}
        ${p.timings.firstEventMs !== undefined ? `<div class="metric"><span class="metric-label">1st Event</span> <span class="metric-value">${p.timings.firstEventMs} ms</span></div>` : ''}
        ${p.chunkCount !== undefined ? `<div class="metric"><span class="metric-label">Chunks</span> <span class="metric-value">${p.chunkCount}</span></div>` : ''}
        ${p.doneReceived !== undefined ? `<div class="metric"><span class="metric-label">[DONE]</span> <span class="metric-value">${p.doneReceived ? '✅' : '❌'}</span></div>` : ''}
      </div>
      ${p.tokenPreview ? `<div class="token-preview">${escapeHtml(p.tokenPreview)}</div>` : ''}
      ${p.error ? `<div class="error-text">${escapeHtml(p.error)}</div>` : ''}
    </div>
  `;
}

function probeDisplayName(probe) {
  const names = {
    'non-streaming': '📡 Probe 1: Non-streaming (stream: false)',
    'raw-streaming': '🌊 Probe 2: Raw SSE Streaming',
    'copilot-sdk-streaming': '🔧 Probe 3: Copilot SDK BYOK Streaming',
  };
  return names[probe] || probe;
}

// ── Benchmark ────────────────────────────────────────────

async function runBenchmark() {
  const el = $('benchmark-results');
  showLoading(el, 'Running benchmark on all models... (this may take several minutes)');
  disableAllButtons();

  try {
    const report = await api('/api/benchmark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    renderBenchmarkReport(el, report);
  } catch (err) {
    showError(el, err.message);
  } finally {
    enableProbeButtons();
    enableAllButtons();
  }
}

function renderBenchmarkReport(el, report) {
  const entries = report.entries || [];

  let html = `
    <div style="overflow-x:auto">
    <table class="benchmark-table">
      <thead>
        <tr>
          <th>Model</th>
          <th>Non-Stream</th>
          <th>Streaming</th>
          <th>Chunks</th>
          <th>TTFB</th>
          <th>1st Event</th>
          <th>Verdict</th>
        </tr>
      </thead>
      <tbody>
  `;

  for (const e of entries) {
    const nsIcon = e.nonStreaming.outcome === 'OK' ? '✅' : '❌';
    const sIcon = e.streaming.outcome === 'OK' ? '✅' : '❌';
    const chunks = e.streaming.chunkCount ?? '–';
    const ttfb = e.streaming.timings.ttfbMs !== undefined ? `${e.streaming.timings.ttfbMs}ms` : '–';
    const firstEvt = e.streaming.timings.firstEventMs !== undefined ? `${e.streaming.timings.firstEventMs}ms` : '–';
    const verdictClass = `verdict-${e.verdict.toLowerCase()}`;

    html += `
      <tr>
        <td>${escapeHtml(e.model)}</td>
        <td>${nsIcon} ${e.nonStreaming.outcome}</td>
        <td>${sIcon} ${e.streaming.outcome}</td>
        <td>${chunks}</td>
        <td>${ttfb}</td>
        <td>${firstEvt}</td>
        <td><span class="verdict-badge ${verdictClass}">${e.verdict}</span></td>
      </tr>
    `;
  }

  html += `
      </tbody>
    </table>
    </div>
    <div class="benchmark-summary">
      <div class="summary-stat">
        <div class="stat-value">${report.totalModels}</div>
        <div class="stat-label">Total Models</div>
      </div>
      <div class="summary-stat">
        <div class="stat-value" style="color: var(--green)">${report.modelsWithStreaming}</div>
        <div class="stat-label">Streaming OK</div>
      </div>
      <div class="summary-stat">
        <div class="stat-value" style="color: var(--red)">${report.modelsWithoutStreaming}</div>
        <div class="stat-label">Streaming Fail</div>
      </div>
    </div>
  `;

  el.innerHTML = html;
}

// ── Report Loading ───────────────────────────────────────

async function loadReport() {
  const el = $('report-content');
  showLoading(el, 'Loading probe report...');

  try {
    const data = await api('/api/report');
    el.innerHTML = `<pre class="report-json">${escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
  } catch (err) {
    showError(el, err.message);
  }
}

async function loadBenchmarkReport() {
  const el = $('report-content');
  showLoading(el, 'Loading benchmark report...');

  try {
    const data = await api('/api/benchmark-report');
    el.innerHTML = `<pre class="report-json">${escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
  } catch (err) {
    showError(el, err.message);
  }
}

// ── Button state helpers ─────────────────────────────────

function disableAllButtons() {
  document.querySelectorAll('.btn').forEach(b => b.disabled = true);
}

function enableAllButtons() {
  $('btn-detect').disabled = false;
  $('btn-refresh-models').disabled = false;
  enableProbeButtons();
}

// ── Auto-detect on load ──────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
  detectService();
});

// ── Version Info ─────────────────────────────────────────

function renderVersionBar(versions) {
  const el = $('version-bar');
  if (!versions) {
    el.innerHTML = '<span class="version-loading">Version info unavailable</span>';
    return;
  }

  const method = versions.detectionMethod || 'cli';
  const methodLabel = method === 'sdk' ? '🔧 SDK' : '💻 CLI';
  const methodClass = method === 'sdk' ? 'method-sdk' : 'method-cli';

  el.innerHTML = `
    <div class="version-items">
      <span class="version-item">
        <span class="version-label">Detection</span>
        <span class="version-value version-method ${methodClass}">${methodLabel}</span>
      </span>
      <span class="version-sep">|</span>
      <span class="version-item">
        <span class="version-label">App</span>
        <span class="version-value">v${escapeHtml(versions.app || '?')}</span>
      </span>
      ${versions.foundryCli ? `
      <span class="version-sep">|</span>
      <span class="version-item">
        <span class="version-label">Foundry CLI</span>
        <span class="version-value">v${escapeHtml(versions.foundryCli)}</span>
      </span>` : ''}
      ${versions.foundrySDK ? `
      <span class="version-sep">|</span>
      <span class="version-item">
        <span class="version-label">Foundry SDK</span>
        <span class="version-value">v${escapeHtml(versions.foundrySDK)}</span>
      </span>` : ''}
      ${versions.openaiSDK ? `
      <span class="version-sep">|</span>
      <span class="version-item">
        <span class="version-label">OpenAI SDK</span>
        <span class="version-value">v${escapeHtml(versions.openaiSDK)}</span>
      </span>` : ''}
      <span class="version-sep">|</span>
      <span class="version-item">
        <span class="version-label">Node.js</span>
        <span class="version-value">v${escapeHtml(versions.node || '?')}</span>
      </span>
    </div>
  `;
}
