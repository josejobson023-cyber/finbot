const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// ─── CONFIGURAÇÕES ───────────────────────────────────────────────
const ZAPI_INSTANCE_ID = "SEU_INSTANCE_ID";   // Z-API > Instâncias > ID
const ZAPI_TOKEN       = "SEU_TOKEN";          // Z-API > Instâncias > Token
const ZAPI_CLIENT_TOKEN = "SEU_CLIENT_TOKEN";  // Z-API > Conta > Client-Token
const ANTHROPIC_KEY    = "SUA_CHAVE_ANTHROPIC";

const ZAPI_BASE = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}`;

// ─── MEMÓRIA DE GASTOS (em produção, use um banco de dados) ───────
const userExpenses = {}; // { "5511999999999": [{ amount, category, desc, time }] }

// ─── ENVIA MENSAGEM PELO WHATSAPP ─────────────────────────────────
async function sendMessage(phone, text) {
  await axios.post(
    `${ZAPI_BASE}/send-text`,
    { phone, message: text },
    { headers: { "Client-Token": ZAPI_CLIENT_TOKEN } }
  );
}

// ─── CLASSIFICA O GASTO COM CLAUDE ───────────────────────────────
async function classifyExpense(text) {
  const response = await axios.post(
    "https://api.anthropic.com/v1/messages",
    {
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      system: `Você é um assistente de finanças pessoais brasileiro. O usuário vai descrever um gasto.
Extraia as seguintes informações e responda SOMENTE com JSON válido, sem markdown:
- amount: valor numérico em reais (null se não informado)
- category: uma das categorias abaixo
- desc: descrição curta do gasto (máx 40 caracteres)

Categorias disponíveis:
🍔 Alimentação, 🚗 Transporte, 🏠 Moradia, 💊 Saúde, 🎮 Lazer,
👕 Roupas, 📚 Educação, 💡 Contas, 🛒 Mercado, ✈️ Viagem, 🐾 Pet, ❓ Outros

Exemplo de resposta:
{"amount": 45.50, "category": "🍔 Alimentação", "desc": "Almoço no restaurante"}`,
      messages: [{ role: "user", content: text }],
    },
    {
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
    }
  );

  const raw = response.data.content.find((b) => b.type === "text")?.text || "{}";
  return JSON.parse(raw.trim());
}

// ─── FORMATA VALOR EM REAIS ───────────────────────────────────────
const formatBRL = (v) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ─── GERA RESUMO DO USUÁRIO ───────────────────────────────────────
function buildSummary(expenses) {
  if (!expenses || expenses.length === 0) {
    return "📭 Nenhum gasto registrado ainda.";
  }

  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const byCategory = expenses.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount;
    return acc;
  }, {});

  const lines = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, val]) => `  ${cat}: ${formatBRL(val)}`);

  return [
    `📊 *Seu resumo de gastos*`,
    ``,
    ...lines,
    ``,
    `💰 *Total: ${formatBRL(total)}*`,
    `📋 ${expenses.length} registros`,
  ].join("\n");
}

// ─── WEBHOOK PRINCIPAL ────────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // responde imediatamente para o Z-API

  try {
    const { phone, text, fromMe } = req.body;

    // Ignora mensagens enviadas pelo próprio bot
    if (fromMe || !text || !phone) return;

    const msg = text.trim().toLowerCase();
    const userPhone = phone.replace(/\D/g, "");

    if (!userExpenses[userPhone]) userExpenses[userPhone] = [];

    // ─── COMANDOS ESPECIAIS ───────────────────────────────────────
    if (msg === "resumo" || msg === "/resumo") {
      const summary = buildSummary(userExpenses[userPhone]);
      await sendMessage(phone, summary);
      return;
    }

    if (msg === "limpar" || msg === "/limpar") {
      userExpenses[userPhone] = [];
      await sendMessage(phone, "🗑️ Todos os seus gastos foram apagados.");
      return;
    }

    if (msg === "ajuda" || msg === "/ajuda" || msg === "oi" || msg === "olá") {
      await sendMessage(
        phone,
        `👋 Olá! Sou seu *FinBot*, assistente de gastos com IA.\n\n` +
        `Me manda seus gastos assim:\n` +
        `• _"Gastei 45 no iFood"_\n` +
        `• _"Paguei 200 de aluguel"_\n` +
        `• _"Comprei ração pro cachorro 80 reais"_\n\n` +
        `Comandos disponíveis:\n` +
        `📊 *resumo* — ver total e categorias\n` +
        `🗑️ *limpar* — apagar todos os registros`
      );
      return;
    }

    // ─── REGISTRA GASTO COM IA ────────────────────────────────────
    await sendMessage(phone, "🤖 Analisando com IA...");

    const { amount, category, desc } = await classifyExpense(text);

    if (!amount || amount <= 0) {
      await sendMessage(
        phone,
        `🤔 Não consegui identificar um valor.\n\nTente: _"Gastei 50 reais no mercado"_`
      );
      return;
    }

    const expense = { amount, category, desc, time: new Date() };
    userExpenses[userPhone].push(expense);

    const total = userExpenses[userPhone].reduce((s, e) => s + e.amount, 0);

    await sendMessage(
      phone,
      `✅ *Gasto registrado!*\n\n` +
      `${category} — *${formatBRL(amount)}*\n` +
      `📝 ${desc}\n\n` +
      `💰 Total acumulado: *${formatBRL(total)}*\n\n` +
      `_Digite *resumo* para ver o detalhamento_`
    );

  } catch (err) {
    console.error("Erro no webhook:", err.message);
  }
});

// ─── INICIA SERVIDOR ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ FinBot rodando na porta ${PORT}`);
});
