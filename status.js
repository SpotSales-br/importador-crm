const BASE = (process.env.N8N_WEBHOOK_BASE || 'https://webhookapp3.spotsales.ai/webhook').replace(/\/+$/, '');

module.exports = async (req, res) => {
  try {
    const jobId = String((req.query && req.query.jobId) || '');
    const r = await fetch(BASE + '/importar-crm-status?jobId=' + encodeURIComponent(jobId));
    const text = await r.text();
    res.status(r.status).setHeader('Content-Type', 'application/json').send(text);
  } catch (e) {
    res.status(502).json({ error: 'falha ao falar com o N8N: ' + e.message });
  }
};
