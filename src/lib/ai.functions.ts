import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const unidadeSchema = z.object({
  nome: z.string(),
  budget: z.number(),
  gasto: z.number(),
});

const inputSchema = z.object({
  periodo: z.string(),
  variantes: z.array(z.object({
    label: z.string(), // "com acumulado" | "sem acumulado"
    budget_total: z.number(),
    gasto_total: z.number(),
    saldo: z.number(),
    unidades: z.array(unidadeSchema),
  })).length(2),
});

type Analise = { positivos: string; atencao: string; riscos: string };

function parseAnalise(text: string): Analise {
  const grab = (label: string) => {
    const re = new RegExp(`${label}\\s*:\\s*([\\s\\S]*?)(?=(?:Pontos de atenção|Pontos positivos|Riscos)\\s*:|$)`, "i");
    const m = text.match(re);
    return (m?.[1] ?? "").trim();
  };
  return {
    positivos: grab("Pontos positivos") || "—",
    atencao: grab("Pontos de atenção") || "—",
    riscos: grab("Riscos") || "—",
  };
}

async function callGemini(prompt: string): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY não configurada");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            "Você é analista financeiro sênior. Responda SEMPRE em pt-BR, texto curto e objetivo, formato exato:\nPontos positivos:\n- item\nPontos de atenção:\n- item\nRiscos:\n- item\nSem introdução, sem despedida.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AI Gateway ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as any;
  return data?.choices?.[0]?.message?.content ?? "";
}

function buildPrompt(periodo: string, v: z.infer<typeof inputSchema>["variantes"][number]) {
  const linhas = v.unidades
    .map((u) => {
      const pct = u.budget > 0 ? ((u.gasto / u.budget) * 100).toFixed(1) : "—";
      return `- ${u.nome}: budget R$ ${u.budget.toFixed(2)}, gasto R$ ${u.gasto.toFixed(2)} (${pct}%)`;
    })
    .join("\n");
  return `Período: ${periodo}\nVisão: ${v.label}\nBudget total: R$ ${v.budget_total.toFixed(2)}\nGasto total: R$ ${v.gasto_total.toFixed(2)}\nSaldo: R$ ${v.saldo.toFixed(2)}\n\nPor unidade:\n${linhas}`;
}

export const gerarAnaliseIA = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const [a, b] = await Promise.all([
      callGemini(buildPrompt(data.periodo, data.variantes[0])),
      callGemini(buildPrompt(data.periodo, data.variantes[1])),
    ]);
    return {
      variantes: [
        { label: data.variantes[0].label, ...parseAnalise(a) },
        { label: data.variantes[1].label, ...parseAnalise(b) },
      ] as Array<Analise & { label: string }>,
    };
  });