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
    return syncPayToken;
  }

  if (!SYNC_CONFIG.baseURL || !SYNC_CONFIG.clientId || !SYNC_CONFIG.clientSecret) {
    console.error('[SYNCPAY] Configuração incompleta! Verifique o .env');
    throw new Error('Configuração da SyncPay incompleta');
  }

  try {
    console.log('[SYNCPAY] Obtendo novo token...');

    const response = await axios.post(
      `${SYNC_CONFIG.baseURL}/auth/token`,
      {
        clientId: SYNC_CONFIG.clientId,
        clientSecret: SYNC_CONFIG.clientSecret
      },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    const data = response.data;
    console.log('[SYNCPAY] Token obtido com sucesso!');

    syncPayToken = data.access_token || data.token || data.accessToken;
    const expiresIn = data.expires_in || data.expiresIn || 3600;
    tokenExpiresAt = Date.now() + (expiresIn * 1000) - 60000; // 1 min de folga

    return syncPayToken;
  } catch (error) {
    console.error('[SYNCPAY] Erro ao obter token:');
    console.error(error.response?.data || error.message);
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

    // Valida produto
    if (!upKey || !Object.prototype.hasOwnProperty.call(PRODUCTS, upKey)) {
      return res.status(400).json({
        success: false,
        error: 'Produto inválido'
      });
    }

    const amount = PRODUCTS[upKey];
    const txnId = `PIX_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

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
      expiration: 3600, // 1 hora
      description: `Pagamento - ${upKey}`,
      metadata: {
        upKey: upKey,
        txnId: txnId,
        customerName: nome || '',
        customerCpf: cpf || ''
      }
    };

    console.log('[SYNCPAY] Payload:', JSON.stringify(payload, null, 2));

    const syncPayResponse = await axios.post(
      `${SYNC_CONFIG.baseURL}/pix/create`,
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

    const pixData = syncPayResponse.data;
    console.log('[SYNCPAY] PIX criado com sucesso!');

    // =============================================
    // 🔥 RESPOSTA PARA O FRONTEND
    // =============================================
    return res.status(200).json({
      success: true,
      txnId: pixData.txid || pixData.txnId || txnId,
      qrcode: pixData.qrcode || pixData.pixCopiaECola || pixData.pixCode || '',
      qrcodeImage: pixData.qrcodeImage || pixData.qrCodeBase64 || pixData.qrCode || null,
      amount: pixData.value || pixData.amount || amount,
      status: pixData.status || 'pending',
      paid: false
    });

  } catch (error) {
    console.error('[SYNCPAY] Erro ao criar PIX:');

    // Erro da SyncPay
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
      return res.status(error.response.status || 500).json({
        success: false,
        error: error.response.data?.message || error.response.data?.error || 'Erro na SyncPay',
        details: error.response.data
      });
    }

    // Erro de timeout ou rede
    if (error.code === 'ECONNABORTED') {
      return res.status(408).json({
        success: false,
        error: 'Tempo limite excedido - SyncPay demorou para responder'
      });
    }

    console.error(error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'Erro interno ao gerar Pix'
    });
  }
});

// =============================================
// 🔥 STATUS DO PIX - SYNCPAY REAL
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

    // Se for MOCK, usa a lógica antiga (fallback)
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

    // =============================================
    // 🔥 CONSULTA STATUS NA SYNCPAY
    // =============================================
    const token = await getSyncPayToken();

    console.log('[SYNCPAY] Consultando status do PIX:', txnId);

    const syncPayResponse = await axios.get(
      `${SYNC_CONFIG.baseURL}/pix/status/${txnId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 15000
      }
    );

    const statusData = syncPayResponse.data;
    const status = statusData.status || 'pending';
    const paid = status === 'paid' || status === 'completed' || status === 'confirmed';

    console.log('[SYNCPAY] Status:', status, '| Paid:', paid);

    return res.status(200).json({
      paid,
      status: status,
      txnId: txnId,
      amount: statusData.value || statusData.amount || 0
    });

  } catch (error) {
    console.error('[SYNCPAY] Erro ao consultar status:');

    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
      // Se a transação não for encontrada, retorna pending
      if (error.response.status === 404) {
        return res.status(200).json({
          paid: false,
          status: 'pending',
          txnId: req.query.id,
          error: 'Transação não encontrada'
        });
      }
      return res.status(200).json({
        paid: false,
        status: 'pending',
        error: error.response.data?.message || 'Erro ao consultar status'
      });
    }

    return res.status(200).json({
      paid: false,
      status: 'pending',
      error: error.message
    });
  }
});

// =============================================
// 🔥 TRACKING (Meta CAPI)
// =============================================
app.post('/api/track', (req, res) => {
  const body = req.body || {};

  console.log('[TRACK]', {
    eventName: body.eventName || null,
    eventId: body.eventId || null,
    value: body.value || null,
    email: body.email || null,
    phone: body.phone || null
  });

  // Aqui você pode integrar com a Meta Conversions API
  // https://developers.facebook.com/docs/marketing-api/conversions-api/

  return res.status(200).json({
    success: true
  });
});

// =============================================
// 🔥 WEBHOOK - SYNCPAY CONFIRMA PAGAMENTO
// =============================================
app.post('/api/webhook', async (req, res) => {
  try {
    const webhookData = req.body;

    console.log('[WEBHOOK] Recebido:', JSON.stringify(webhookData, null, 2));

    // Estrutura esperada da SyncPay
    const { txid, status, value, metadata } = webhookData;

    if (status === 'paid' || status === 'completed' || status === 'confirmed') {
      console.log(`[WEBHOOK] ✅ Pagamento confirmado! TXID: ${txid}, Valor: R$ ${value}`);

      // 🔥 AQUI VOCÊ PODE DISPARAR O PRÓXIMO UPSELL
      // Se o frontend tiver um endpoint para redirecionar, você pode chamar via fetch
      // Ou apenas registrar no banco de dados
    }

    // Responde 200 para a SyncPay confirmar que recebeu
    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('[WEBHOOK] Erro:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
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
    console.log(`🚀 Servidor SyncPay rodando!`);
    console.log(`📍 http://localhost:${PORT}`);
    console.log(`🩺 Health: http://localhost:${PORT}/api/health`);
    console.log(`========================================`);
    console.log(`📌 Configuração SyncPay:`);
    console.log(`   BaseURL: ${SYNC_CONFIG.baseURL || '❌ NÃO CONFIGURADO'}`);
    console.log(`   ClientId: ${SYNC_CONFIG.clientId ? '✅ CONFIGURADO' : '❌ NÃO CONFIGURADO'}`);
    console.log(`   ClientSecret: ${SYNC_CONFIG.clientSecret ? '✅ CONFIGURADO' : '❌ NÃO CONFIGURADO'}`);
    console.log(`========================================`);
  });
}

module.exports = app;