const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// ─── CONFIGURAÇÕES ───────────────────────────────────────────────
const ZAPI_INSTANCE_ID  = process.env.ZAPI_INSTANCE_ID;
const ZAPI_TOKEN        = process.env.ZAPI_TOKEN;
const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN;
const GROQ_KEY          = process.env.GROQ_KEY;

const ZAPI_BASE = `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}`;

// ─── MEMÓRIA DE GASTOS ────────────────────────────────────────────
const userExpenses = {};

// ─── ENVIA MENSAGEM PELO WHATSAPP ─────────────────────────────────
async function sendMessage(phone, text) {
  await axios.post(
    `${ZAPI_BASE}/send-text`,
    { phone, message: text },
    { headers: { "Client-Token": ZAPI_CLIENT_TOKEN } }
  );
}

// ─── CLASSIFICA O GASTO COM GROQ ─────────────────────────────────
async function classifyExpense(text) {
  const response = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: "llama3-8b-8192",
      messages: [
        {
          role: "system",
          content: `Você é um assistente de finanças pessoais brasileiro. O usuário vai descrever um gasto.
Extraia as seguintes informações e responda SOMENTE com JSON válido, sem markdown:
- amount: valor numérico em reais (null se não informado)
- category: uma das categorias abaixo
- desc: descrição curta do gasto (máx 40 caracteres)

Categorias: 🍔 Alimentação, 🚗 Transporte, 🏠 Moradia, 💊 Saúde, 🎮 Lazer, 👕 Roupas, 📚 Educação, 💡 Contas, 🛒 Mercado, ✈️ Viagem, 🐾 Pet, ❓ Outros

Exemplo: {"amount": 45.50, "category": "🍔 Alimentação", "desc": "Almoço no restaurante"}`,
        },
        { role: "user", content: text },
      ],
      max_tokens: 200,
      temperature: 0.1,
    },
    {
      headers: {
        Authorization: `Bearer ${GROQ_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  const raw = response.data.choices[0].message.content || "{}";
  return JSON.parse(raw.replace(/```json|```/g, "").trim());
}

const formatBRL = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function buildSummary(expenses) {
  if (!expenses || expenses.length === 0) return "📭 Nenhum gasto registrado ainda.";
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const byCategory = expenses.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount;
    return acc;
  }, {});
  const lines = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([cat, val]) => `  ${cat}: ${formatBRL(val)}`);
  return [`📊 *Seu resumo de gastos*`, ``, ...lines, ``, `💰 *Total: ${formatBRL(total)}*`, `📋 ${expenses.length} registros`].join("\n");
}

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const { phone, text, fromMe } = req.body;
    if (fromMe || !text || !phone) return;
    const msg = text.trim().toLowerCase();
    const userPhone = phone.replace(/\D/g, "");
    if (!userExpenses[userPhone]) userExpenses[userPhone] = [];

    if (msg === "resumo" || msg === "/resumo") { await sendMessage(phone, buildSummary(userExpenses[userPhone])); return; }
    if (msg === "limpar" || msg === "/limpar") { userExpenses[userPhone] = []; await sendMessage(phone, "🗑️ Todos os seus gastos foram apagados."); return; }
    if (["ajuda", "/ajuda", "oi", "olá"].includes(msg)) {
      await sendMessage(phone, `👋 Olá! Sou seu *FinBot*.\n\nExemplos:\n• _"Gastei 45 no iFood"_\n• _"Paguei 200 de aluguel"_\n\nComandos:\n📊 *resumo* — ver categorias\n🗑️ *limpar* — apagar registros`);
      return;
    }

    await sendMessage(phone, "🤖 Analisando com IA...");
    const { amount, category, desc } = await classifyExpense(text);

    if (!amount || amount <= 0) { await sendMessage(phone, `🤔 Não consegui identificar um valor.\n\nTente: _"Gastei 50 reais no mercado"_`); return; }

    userExpenses[userPhone].push({ amount, category, desc, time: new Date() });
    const total = userExpenses[userPhone].reduce((s, e) => s + e.amount, 0);
    await sendMessage(phone, `✅ *Gasto registrado!*\n\n${category} — *${formatBRL(amount)}*\n📝 ${desc}\n\n💰 Total: *${formatBRL(total)}*\n\n_Digite *resumo* para ver o detalhamento_`);
  } catch (err) {
    console.error("Erro:", err.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ FinBot rodando na porta ${PORT}`));
