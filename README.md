# FinBot WhatsApp com Z-API + Claude

Bot de controle de gastos pelo WhatsApp com categorização automática por IA.

---

## Pré-requisitos

- Node.js 18+
- Conta no [Z-API](https://z-api.io) (plano gratuito funciona)
- Chave da API do Claude em [console.anthropic.com](https://console.anthropic.com)
- Servidor com URL pública (use [Railway](https://railway.app) grátis ou [ngrok](https://ngrok.com) para testes)

---

## Configuração

### 1. Instale as dependências
```bash
npm install
```

### 2. Preencha as credenciais no server.js
```js
const ZAPI_INSTANCE_ID  = "SEU_INSTANCE_ID";   // Z-API > Instâncias > ID
const ZAPI_TOKEN        = "SEU_TOKEN";          // Z-API > Instâncias > Token
const ZAPI_CLIENT_TOKEN = "SEU_CLIENT_TOKEN";   // Z-API > Conta > Client-Token
const ANTHROPIC_KEY     = "SUA_CHAVE_ANTHROPIC";
```

### 3. Suba o servidor
```bash
npm start
```

### 4. Configure o Webhook no Z-API
No painel do Z-API, vá em **Instâncias > Webhooks** e adicione:
```
https://SEU_SERVIDOR/webhook
```

---

## Como usar no WhatsApp

Mande mensagens naturais para o número conectado:

| Mensagem | Resultado |
|---|---|
| "Gastei 45 no iFood" | Registra R$ 45,00 em 🍔 Alimentação |
| "Paguei 200 de aluguel" | Registra R$ 200,00 em 🏠 Moradia |
| "Comprei ração pro cachorro 80 reais" | Registra R$ 80,00 em 🐾 Pet |
| `resumo` | Mostra total por categoria |
| `limpar` | Apaga todos os registros |
| `ajuda` | Mostra instruções |

---

## Deploy grátis no Railway

1. Crie conta em [railway.app](https://railway.app)
2. Clique em **New Project > Deploy from GitHub**
3. Suba este código em um repositório
4. Adicione as variáveis de ambiente nas configurações
5. Copie a URL gerada e configure no Z-API

---

## Observação

Os gastos ficam em memória enquanto o servidor estiver rodando.
Para persistência permanente, substitua o objeto `userExpenses` por um banco de dados como SQLite ou MongoDB.
