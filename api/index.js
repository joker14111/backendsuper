require('dotenv').config();

const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();

// =============================================
// 🔥 CONFIGURAÇÃO SYNCPAY (DO SEU CÓDIGO QUE FUNCIONA!)
// =============================================
const SYNC_CONFIG = {
    baseURL: process.env.SYNCPAY_BASE_URL,
    clientId: process.env.SYNCPAY_CLIENT_ID,
    clientSecret: process.env.SYNCPAY_CLIENT_SECRET,
    webhookUrl: process.env.SYNCPAY_WEBHOOK_URL
};

let bearerToken = null;
let tokenExpiresAt = null;

// =============================================
// 🔥 OBTER TOKEN - ENDPOINT CORRETO!
// =============================================
async function obterToken() {
    try {
        console.log('🔑 Gerando token...');

        const response = await axios.post(
            `${SYNC_CONFIG.baseURL}/api/partner/v1/auth-token`,
            {
                client_id: SYNC_CONFIG.clientId,
                client_secret: SYNC_CONFIG.clientSecret
            },
            {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            }
        );

        bearerToken = response.data.access_token;
        tokenExpiresAt = Date.now() + (response.data.expires_in * 1000);
        
        console.log('✅ Token gerado com sucesso!');
        return bearerToken;
        
    } catch (error) {
        console.error('❌ Erro ao gerar token:');

        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Dados:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Erro:', error.message);
        }

        throw error;
    }
}

async function getToken() {
    if (!bearerToken || Date.now() >= tokenExpiresAt) {
        await obterToken();
    }
    return bearerToken;
}

// =============================================
// 🔥 PRODUTOS
// =============================================
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
// 🔥 MIDDLEWARES
// =============================================
app.disable('x-powered-by');

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

app.options('*', cors());
app.use(express.json({ limit: '64kb' }));

// =============================================
// 🔥 ROTA: GERAR PIX - /api/pix (para o frontend)
// =============================================
app.post('/api/pix', async (req, res) => {
    try {
        const body = req.body || {};
        const upKey = String(body.upKey || '').trim();
        const { nome, cpf, email, phone } = body;

        console.log('📍 Gerando Pix para:', upKey);

        // Valida produto
        if (!upKey || !Object.prototype.hasOwnProperty.call(PRODUCTS, upKey)) {
            return res.status(400).json({
                success: false,
                error: 'Produto inválido'
            });
        }

        const valor = PRODUCTS[upKey];

        const token = await getToken();

        // =============================================
        // 🔥 PAYLOAD CORRETO DA SYNCPAY
        // =============================================
        const payload = {
            amount: parseFloat(valor),
            description: upKey,
            webhook_url: SYNC_CONFIG.webhookUrl,
            client: {
                name: nome || 'Cliente',
                cpf: (cpf || '').replace(/\D/g, '') || '00000000000',
                email: email || 'cliente@email.com',
                phone: (phone || '').replace(/\D/g, '') || '55999999999'
            }
        };

        console.log('📤 Payload:', JSON.stringify(payload, null, 2));

        // =============================================
        // 🔥 ENDPOINT CORRETO - /api/partner/v1/cash-in
        // =============================================
        const response = await axios.post(
            `${SYNC_CONFIG.baseURL}/api/partner/v1/cash-in`,
            payload,
            {
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );

        console.log('✅ Pix gerado com sucesso!');

        // =============================================
        // 🔥 RESPOSTA PARA O FRONTEND
        // =============================================
        return res.json({
            success: true,
            txnId: response.data.identifier,
            qrcode: response.data.pix_code || response.data.pixCode || '',
            qrcodeImage: response.data.qrcodeImage || response.data.qrCode || null,
            amount: parseFloat(valor),
            status: 'pending',
            paid: false
        });

    } catch (error) {
        console.error('❌ Erro ao gerar Pix:');

        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Dados:', JSON.stringify(error.response.data, null, 2));
            
            return res.status(error.response.status || 500).json({
                success: false,
                error: error.response.data?.message || 'Erro na SyncPay',
                details: error.response.data
            });
        }

        console.error('Erro:', error.message);

        return res.status(500).json({
            success: false,
            error: error.message || 'Erro ao gerar Pix'
        });
    }
});

// =============================================
// 🔥 ROTA: STATUS - /api/status (para o frontend)
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

        console.log(`🔍 Verificando pagamento: ${txnId}`);

        const token = await getToken();

        // =============================================
        // 🔥 ENDPOINT CORRETO - /api/partner/v1/transaction/${identifier}
        // =============================================
        const response = await axios.get(
            `${SYNC_CONFIG.baseURL}/api/partner/v1/transaction/${txnId}`,
            {
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'Cache-Control': 'no-cache'
                },
                timeout: 15000
            }
        );

        console.log('📥 Resposta:', JSON.stringify(response.data, null, 2));

        const transaction = response.data.data || response.data;
        const status = transaction.status || 'pending';
        const paid = status === 'completed' || status === 'confirmed' || status === 'paid';

        console.log(`📊 Status: ${status} | Paid: ${paid}`);

        return res.status(200).json({
            paid: paid,
            status: status,
            txnId: transaction.reference_id || txnId,
            amount: transaction.amount || 0
        });

    } catch (error) {
        console.error('❌ Erro ao consultar status:');

        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Dados:', JSON.stringify(error.response.data, null, 2));
        }

        // Não retorna erro, só pending
        return res.status(200).json({
            paid: false,
            status: 'pending',
            error: error.message
        });
    }
});

// =============================================
// 🔥 ROTA: TRACKING
// =============================================
app.post('/api/track', (req, res) => {
    console.log('[TRACK]', req.body);
    return res.status(200).json({ success: true });
});

// =============================================
// 🔥 ROTA: HEALTH
// =============================================
app.get('/api/health', async (req, res) => {
    try {
        await obterToken();

        res.json({
            status: 'online',
            mode: 'syncpay',
            tokenValido: !!bearerToken,
            baseURL: SYNC_CONFIG.baseURL ? '✅' : '❌',
            clientId: SYNC_CONFIG.clientId ? '✅' : '❌',
            clientSecret: SYNC_CONFIG.clientSecret ? '✅' : '❌',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        res.json({
            status: 'erro',
            mode: 'syncpay',
            message: error.message
        });
    }
});

// =============================================
// 🔥 WEBHOOK - CONFIRMA PAGAMENTO
// =============================================
app.post('/api/webhook', async (req, res) => {
    try {
        console.log('[WEBHOOK] Recebido:', JSON.stringify(req.body, null, 2));

        const data = req.body;
        const status = data.status || data.transaction?.status;
        const identifier = data.identifier || data.transaction?.reference_id;

        if (status === 'completed' || status === 'confirmed' || status === 'paid') {
            console.log(`✅ Pagamento confirmado! ID: ${identifier}`);
            // Aqui você pode disparar o próximo upsell
        }

        return res.status(200).json({ success: true });

    } catch (error) {
        console.error('[WEBHOOK] Erro:', error);
        return res.status(500).json({ success: false });
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
    const PORT = Number(process.env.PORT || 3000);
    app.listen(PORT, () => {
        console.log(`========================================`);
        console.log(`🚀 Servidor SyncPay rodando!`);
        console.log(`📍 http://localhost:${PORT}`);
        console.log(`🩺 Health: http://localhost:${PORT}/api/health`);
        console.log(`========================================`);
        console.log(`📌 Configuração SyncPay:`);
        console.log(`   BaseURL: ${SYNC_CONFIG.baseURL || '❌ NÃO CONFIGURADO'}`);
        console.log(`   ClientId: ${SYNC_CONFIG.clientId ? '✅' : '❌'}`);
        console.log(`   ClientSecret: ${SYNC_CONFIG.clientSecret ? '✅' : '❌'}`);
        console.log(`========================================`);
    });
}

module.exports = app;