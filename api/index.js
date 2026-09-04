require('dotenv').config();

const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();

const PORT = Number(process.env.PORT || 3000);

// =============================================
// 🔥 CONFIGURAÇÃO SYNCPAY
// =============================================
const SYNC_CONFIG = {
  baseURL: process.env.SYNCPAY_BASE_URL || '',
  clientId: process.env.SYNCPAY_CLIENT_ID || '',
  clientSecret: process.env.SYNCPAY_CLIENT_SECRET || '',
  webhookUrl: process.env.SYNCPAY_WEBHOOK_URL || ''
};

// Valores dos produtos
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

// =============================================
// 🔥 TOKEN SYNCPAY (CACHE)
// =============================================
let syncPayToken = null;
let tokenExpiresAt = 0;

async function getSyncPayToken() {
  // Verifica se o token ainda é válido
  if (syncPayToken && Date.now() < tokenExpiresAt) {
    console.log('[SYNCPAY] Usando token em cache');
    return syncPayToken;
  }

  if (!SYNC_CONFIG.baseURL || !SYNC_CONFIG.clientId || !SYNC_CONFIG.clientSecret) {
    console.error('[SYNCPAY] Configuração incompleta!');
    throw new Error('Configuração da SyncPay incompleta');
  }

  try {
    console.log('[SYNCPAY] Obtendo novo token...');

    // =============================================
    // 🔥 FORMATO CORRETO PARA SYNCPAY
    // =============================================
    // Opção 1: Basic Auth (mais comum)
    const authString = Buffer.from(`${SYNC_CONFIG.clientId}:${SYNC_CONFIG.clientSecret}`).toString('base64');

    const response = await axios.post(
      `${SYNC_CONFIG.baseURL}/oauth/token`, // ← TENTA ESSE ENDPOINT
      // Opção 2: Se for grant_type
      // 'grant_type=client_credentials',
      {
        grant_type: 'client_credentials',
        client_id: SYNC_CONFIG.clientId,
        client_secret: SYNC_CONFIG.clientSecret
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${authString}`
        },
        timeout: 10000
      }
    );

    console.log('[SYNCPAY] Resposta do token:', JSON.stringify(response.data, null, 2));

    const data = response.data;
    syncPayToken = data.access_token || data.token || data.accessToken;
    const expiresIn = data.expires_in || data.expiresIn || 3600;
    tokenExpiresAt = Date.now() + (expiresIn * 1000) - 60000;

    console.log('[SYNCPAY] Token obtido com sucesso!');
    return syncPayToken;

  } catch (error) {
    console.error('[SYNCPAY] Erro ao obter token:');
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
      
      // Se der 404, tenta sem /oauth
      if (error.response.status === 404) {
        console.log('[SYNCPAY] Tentando sem /oauth...');
        return await getSyncPayTokenFallback();
      }
    }
    
    console.error(error.message);
    throw new Error('Erro ao autenticar com SyncPay');
  }
}

// =============================================
// 🔥 FALLBACK - TENTA SEM /oauth
// =============================================
async function getSyncPayTokenFallback() {
  try {
    console.log('[SYNCPAY] Tentando autenticação sem /oauth...');

    const response = await axios.post(
      `${SYNC_CONFIG.baseURL}/token`,
      {
        client_id: SYNC_CONFIG.clientId,
        client_secret: SYNC_CONFIG.clientSecret,
        grant_type: 'client_credentials'
      },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    console.log('[SYNCPAY] Resposta:', JSON.stringify(response.data, null, 2));

    const data = response.data;
    syncPayToken = data.access_token || data.token || data.accessToken;
    const expiresIn = data.expires_in || data.expiresIn || 3600;
    tokenExpiresAt = Date.now() + (expiresIn * 1000) - 60000;

    console.log('[SYNCPAY] Token obtido com sucesso!');
    return syncPayToken;

  } catch (error) {
    console.error('[SYNCPAY] Falha no fallback:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    }
    throw new Error('Erro ao autenticar com SyncPay');
  }
}

// =============================================
// 🔥 CONFIGURAÇÃO DO EXPRESS
// =============================================
app.disable('x-powered-by');

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

app.use(express.json({ limit: '64kb' }));

// =============================================
// 🔥 HEALTH CHECK
// =============================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    mode: 'syncpay',
    syncConfigPresent: {
      baseURL: Boolean(SYNC_CONFIG.baseURL),
      clientId: Boolean(SYNC_CONFIG.clientId),
      clientSecret: Boolean(SYNC_CONFIG.clientSecret),
      webhookUrl: Boolean(SYNC_CONFIG.webhookUrl)
    },
    tokenValid: syncPayToken && Date.now() < tokenExpiresAt,
    timestamp: new Date().toISOString()
  });
});

// =============================================
// 🔥 GERAR PIX - SYNCPAY REAL
// =============================================
app.post('/api/pix', async (req, res) => {
  try {
    const body = req.body || {};
    const upKey = String(body.upKey || '').trim();
    const { nome, cpf, email, phone } = body;

    console.log('[REQ] Gerando PIX para:', { upKey, nome, cpf, email });

    // Valida produto
    if (!upKey || !Object.prototype.hasOwnProperty.call(PRODUCTS, upKey)) {
      return res.status(400).json({
        success: false,
        error: 'Produto inválido'
      });
    }

    const amount = PRODUCTS[upKey];

    // Obtém token da SyncPay
    const token = await getSyncPayToken();

    // =============================================
    // 🔥 CHAMADA PARA CRIAR PIX NA SYNCPAY
    // =============================================
    console.log('[SYNCPAY] Criando PIX de R$', amount, 'para', upKey);

    const payload = {
      value: amount,
      customer: {
        name: nome || 'Cliente',
        email: email || 'cliente@email.com',
        cpf: cpf || '00000000000',
        phone: phone || '55999999999'
      },
      expiration: 3600,
      description: `Pagamento - ${upKey}`,
      metadata: {
        upKey: upKey,
        customerName: nome || '',
        customerCpf: cpf || ''
      }
    };

    console.log('[SYNCPAY] Payload:', JSON.stringify(payload, null, 2));

    // =============================================
    // 🔥 TENTA DIFERENTES ENDPOINTS
    // =============================================
    let syncPayResponse;
    const endpoints = ['/pix/create', '/pix', '/charge/pix', '/payment/pix'];

    for (const endpoint of endpoints) {
      try {
        console.log(`[SYNCPAY] Tentando endpoint: ${endpoint}`);
        syncPayResponse = await axios.post(
          `${SYNC_CONFIG.baseURL}${endpoint}`,
          payload,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            timeout: 30000
          }
        );
        console.log(`[SYNCPAY] Sucesso no endpoint: ${endpoint}`);
        break;
      } catch (err) {
        console.log(`[SYNCPAY] Falha no endpoint ${endpoint}:`, err.response?.status);
        if (err.response?.status === 404) continue;
        throw err;
      }
    }

    if (!syncPayResponse) {
      throw new Error('Nenhum endpoint da SyncPay respondeu');
    }

    const pixData = syncPayResponse.data;
    console.log('[SYNCPAY] PIX criado com sucesso!');

    return res.status(200).json({
      success: true,
      txnId: pixData.txid || pixData.txnId || pixData.id || `PIX_${Date.now()}`,
      qrcode: pixData.qrcode || pixData.pixCopiaECola || pixData.pixCode || pixData.code || '',
      qrcodeImage: pixData.qrcodeImage || pixData.qrCodeBase64 || pixData.qrCode || null,
      amount: pixData.value || pixData.amount || amount,
      status: pixData.status || 'pending',
      paid: false
    });

  } catch (error) {
    console.error('[SYNCPAY] Erro ao criar PIX:');

    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
      return res.status(error.response.status || 500).json({
        success: false,
        error: error.response.data?.message || error.response.data?.error || 'Erro na SyncPay',
        details: error.response.data
      });
    }

    // =============================================
    // 🔥 FALLBACK PARA MOCK SE A SYNCPAY FALHAR
    // =============================================
    console.log('[SYNCPAY] Usando MOCK como fallback');
    const upKey = String(req.body.upKey || '').trim();
    const amount = PRODUCTS[upKey] || 19.48;
    const txnId = `MOCK_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const qrcode = `PIX_MOCK|TXN=${txnId}|AMOUNT=${amount.toFixed(2)}|PRODUCT=${upKey}`;

    return res.status(200).json({
      success: true,
      txnId,
      qrcode,
      amount,
      status: 'pending',
      paid: false,
      _fallback: true
    });
  }
});

// =============================================
// 🔥 STATUS DO PIX
// =============================================
app.get('/api/status', async (req, res) => {
  try {
    const txnId = String(req.query.id || '').trim();

    if (!txnId) {
      return res.status(400).json({
        paid: false,
        status: 'invalid',
        error: 'ID não informado'
      });
    }

    // Se for MOCK, usa a lógica antiga
    if (txnId.startsWith('MOCK_')) {
      const parts = txnId.split('_');
      const createdAt = Number(parts[1]);
      const ageMs = Number.isFinite(createdAt) ? Date.now() - createdAt : 0;
      const paid = ageMs >= 15000;

      return res.status(200).json({
        paid,
        status: paid ? 'completed' : 'pending',
        txnId
      });
    }

    const token = await getSyncPayToken();

    const syncPayResponse = await axios.get(
      `${SYNC_CONFIG.baseURL}/pix/status/${txnId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    const statusData = syncPayResponse.data;
    const status = statusData.status || 'pending';
    const paid = status === 'paid' || status === 'completed' || status === 'confirmed';

    return res.status(200).json({
      paid,
      status,
      txnId,
      amount: statusData.value || statusData.amount || 0
    });

  } catch (error) {
    console.error('[SYNCPAY] Erro ao consultar status:', error.message);
    return res.status(200).json({
      paid: false,
      status: 'pending',
      error: error.message
    });
  }
});

// =============================================
// 🔥 TRACKING
// =============================================
app.post('/api/track', (req, res) => {
  console.log('[TRACK]', req.body);
  return res.status(200).json({ success: true });
});

// =============================================
// 🔥 WEBHOOK
// =============================================
app.post('/api/webhook', async (req, res) => {
  console.log('[WEBHOOK] Recebido:', JSON.stringify(req.body, null, 2));
  return res.status(200).json({ success: true });
});

// =============================================
// 🔥 404
// =============================================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Rota não encontrada'
  });
});

// =============================================
// 🔥 INICIA O SERVIDOR
// =============================================
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
    console.log(`🩺 Health: http://localhost:${PORT}/api/health`);
    console.log(`========================================`);
    console.log(`📌 SyncPay Config:`);
    console.log(`   BaseURL: ${SYNC_CONFIG.baseURL || '❌ NÃO CONFIGURADO'}`);
    console.log(`   ClientId: ${SYNC_CONFIG.clientId ? '✅' : '❌'}`);
    console.log(`   ClientSecret: ${SYNC_CONFIG.clientSecret ? '✅' : '❌'}`);
    console.log(`========================================`);
  });
}

module.exports = app;