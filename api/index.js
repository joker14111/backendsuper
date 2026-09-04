require('dotenv').config();

const express = require('express');
const cors = require('cors');

const app = express();

const PORT = Number(process.env.PORT || 3000);

// Mantém as mesmas variáveis que você pretende usar depois.
// Neste projeto elas NÃO são usadas para chamar a SyncPay real.
const SYNC_CONFIG = {
  baseURL: process.env.SYNCPAY_BASE_URL || '',
  clientId: process.env.SYNCPAY_CLIENT_ID || '',
  clientSecret: process.env.SYNCPAY_CLIENT_SECRET || '',
  webhookUrl: process.env.SYNCPAY_WEBHOOK_URL || ''
};

// Valores ficam no servidor; o frontend envia somente a chave do produto.
const PRODUCTS = {
  seguro: 19.48,
  up1: 24.82,
  up2: 23.91,
  up3: 18.68,
  up4: 17.20,
  up5: 17.00,
  up6: 17.02,
  up7: 14.06,
  up8: 14.06,
  up9: 11.99,
  up10: 16.92,
  up11: 19.53,
  up12: 31.92,

  seguro_ds: 10.82,
  up1_ds: 12.41,
  up2_ds: 11.96,
  up3_ds: 9.34,
  up4_ds: 8.60,
  up5_ds: 8.50,
  up6_ds: 8.50,
  up7_ds: 7.03,
  up8_ds: 7.03,
  up9_ds: 6.00,
  up10_ds: 8.46,
  up11_ds: 9.77,
  up12_ds: 15.96
};

const AUTO_PAY_MS = Number(process.env.MOCK_AUTO_PAY_MS || 15000);

app.disable('x-powered-by');

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

app.use(express.json({ limit: '64kb' }));

// ===== HEALTH =====
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    mode: 'mock',
    syncConfigPresent: {
      baseURL: Boolean(SYNC_CONFIG.baseURL),
      clientId: Boolean(SYNC_CONFIG.clientId),
      clientSecret: Boolean(SYNC_CONFIG.clientSecret),
      webhookUrl: Boolean(SYNC_CONFIG.webhookUrl)
    },
    timestamp: new Date().toISOString()
  });
});

// ===== GERAR PIX MOCK =====
// Contrato compatível com o checkout:
// { success, txnId, qrcode, amount, paid }
app.post('/api/pix', (req, res) => {
  try {
    const body = req.body || {};
    const upKey = String(body.upKey || '').trim();

    if (!upKey || !Object.prototype.hasOwnProperty.call(PRODUCTS, upKey)) {
      return res.status(400).json({
        success: false,
        error: 'Produto inválido'
      });
    }

    const amount = PRODUCTS[upKey];
    const createdAt = Date.now();
    const random = Math.random().toString(36).slice(2, 10);
    const txnId = `MOCK_${createdAt}_${random}_${upKey}`;

    // String deliberadamente de teste; o frontend consegue transformá-la
    // em QR, mas ela não representa uma cobrança financeira real.
    const qrcode = `PIX_MOCK|TXN=${txnId}|AMOUNT=${amount.toFixed(2)}|PRODUCT=${upKey}`;

    console.log('[PIX MOCK] criado', {
      txnId,
      upKey,
      amount
    });

    return res.status(200).json({
      success: true,
      txnId,
      qrcode,
      amount,
      status: 'pending',
      paid: false
    });
  } catch (error) {
    console.error('[PIX MOCK] erro', error);

    return res.status(500).json({
      success: false,
      error: 'Erro interno ao gerar Pix de teste'
    });
  }
});

// ===== STATUS =====
// Seu frontend usa: GET /api/status?id=TRANSACTION_ID
app.get('/api/status', (req, res) => {
  try {
    const txnId = String(req.query.id || '').trim();

    if (!txnId) {
      return res.status(400).json({
        paid: false,
        status: 'invalid',
        error: 'ID não informado'
      });
    }

    const parts = txnId.split('_');

    if (parts[0] !== 'MOCK' || !parts[1]) {
      return res.status(200).json({
        paid: false,
        status: 'pending',
        txnId
      });
    }

    const createdAt = Number(parts[1]);
    const ageMs = Number.isFinite(createdAt) ? Date.now() - createdAt : 0;
    const paid = ageMs >= AUTO_PAY_MS;

    return res.status(200).json({
      paid,
      status: paid ? 'completed' : 'pending',
      txnId
    });
  } catch (error) {
    console.error('[STATUS MOCK] erro', error);

    return res.status(200).json({
      paid: false,
      status: 'pending'
    });
  }
});

// ===== TRACK =====
app.post('/api/track', (req, res) => {
  const body = req.body || {};

  console.log('[TRACK MOCK]', {
    eventName: body.eventName || null,
    eventId: body.eventId || null,
    value: body.value || null
  });

  return res.status(200).json({
    success: true
  });
});

// ===== 404 =====
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Rota não encontrada'
  });
});

// Localhost: npm start
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Servidor mock rodando em http://localhost:${PORT}`);
    console.log(`Health: http://localhost:${PORT}/api/health`);
  });
}

// Vercel importa este app.
module.exports = app;
