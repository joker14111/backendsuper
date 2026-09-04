# Backend Express + Vercel (mock)

Este projeto atende o contrato do frontend atual:

- `POST /api/pix`
- `GET /api/status?id=TRANSACTION_ID`
- `POST /api/track`
- `GET /api/health`

## Local

1. Copie `.env.example` para `.env`.
2. Rode:

```bash
npm install
npm start
```

Servidor:

```text
http://localhost:3000
```

Teste:

```text
http://localhost:3000/api/health
```

## Frontend

Use:

```js
const API_URL = 'http://localhost:3000/api';
```

O POST `/api/pix` retorna:

```json
{
  "success": true,
  "txnId": "MOCK_...",
  "qrcode": "PIX_MOCK|...",
  "amount": 19.48,
  "status": "pending",
  "paid": false
}
```

Por padrão `/api/status?id=...` passa para `paid: true` 15 segundos após a criação.

## Vercel

O entrypoint é `index.js`, que exporta o app Express.
Não é necessário chamar `app.listen()` na Vercel; o bloco de `listen`
é executado apenas quando você roda `node index.js` localmente.

Configure as variáveis de ambiente no painel da Vercel quando necessário.
# backendsuper
