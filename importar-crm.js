// Repassa o upload do site para o webhook do N8N (evita CORS e esconde a URL do N8N do navegador)
const BASE = (process.env.N8N_WEBHOOK_BASE || 'https://webhookapp3.spotsales.ai/webhook').replace(/\/+$/, '');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'use POST' });
  try {
    const { file, dryRun } = req.body || {};
    if (!file) return res.status(400).json({ error: 'arquivo ausente' });
    const fd = new FormData();
    fd.append('file', new Blob([Buffer.from(file, 'base64')], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'planilha.xlsx');
    fd.append('dryRun', String(!!dryRun));
    const r = await fetch(BASE + '/importar-crm', { method: 'POST', body: fd });
    const text = await r.text();
    res.status(r.status).setHeader('Content-Type', 'application/json').send(text);
  } catch (e) {
    res.status(502).json({ error: 'falha ao falar com o N8N: ' + e.message });
  }
};
