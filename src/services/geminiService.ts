import { GoogleGenAI, Type } from "@google/genai";

export interface Lead {
  id: string;
  name: string;
  address: string;
  phone: string;
  niche: string;
  city: string;
  state: string;
  hasWebsite: boolean;
  hasWhatsApp: boolean;
  notes?: string;
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export async function searchLeads(niche: string, city: string, state: string): Promise<Lead[]> {
  const prompt = `Use a pesquisa do Google Maps e da Web para encontrar 10 empresas do nicho "${niche}" em "${city}, ${state}" que NÃO possuam site oficial (website) e que tenham um número de telefone/WhatsApp visível.
  
  Para cada empresa, retorne:
  1. Nome da empresa
  2. Endereço completo
  3. Telefone/WhatsApp
  4. Confirmação de que não possui site (hasWebsite: false)
  5. Se o telefone parece ser WhatsApp corporal (hasWhatsApp: true)
  
  Foque em resultados reais do Google Maps.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              address: { type: Type.STRING },
              phone: { type: Type.STRING },
              niche: { type: Type.STRING },
              city: { type: Type.STRING },
              state: { type: Type.STRING },
              hasWebsite: { type: Type.BOOLEAN },
              hasWhatsApp: { type: Type.BOOLEAN },
              notes: { type: Type.STRING },
            },
            required: ["name", "address", "phone", "hasWebsite", "hasWhatsApp"],
          },
        },
        tools: [{ googleSearch: {} }],
      },
    });

    const leads = JSON.parse(response.text || "[]") as Lead[];
    return leads.map((l, i) => ({
      ...l,
      id: `${Date.now()}-${i}`,
      city: l.city || city,
      state: l.state || state,
      niche: l.niche || niche,
    }));
  } catch (error) {
    console.error("Erro ao buscar leads:", error);
    return [];
  }
}
