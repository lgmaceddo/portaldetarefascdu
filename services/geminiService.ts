import { GoogleGenAI, Type, Schema } from "@google/genai";
import { DocumentAnalysisResult } from "../types";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

/**
 * Parses a file (PDF or Image) to extract structured data and generate a message.
 * Supports 'individual', 'batch' or 'daily_summary' modes.
 * Supports 'reschedule', 'confirmation', or 'daily_summary' message templates.
 * Now accepts 'userName' to personalize signatures.
 */
export const processDocument = async (
  fileBase64: string,
  mimeType: string,
  additionalContext: string,
  mode: 'individual' | 'batch' = 'individual',
  type: 'reschedule' | 'confirmation' | 'daily_summary' = 'reschedule',
  preparationText?: string,
  userName?: string // New parameter for automatic name insertion
): Promise<DocumentAnalysisResult | DocumentAnalysisResult[]> => {
  try {
    const model = 'gemini-3-flash-preview';

    // Default signature logic: If userName exists, use it. If not, use "Atendimento Unimed".
    const signatureName = userName || "Atendimento Unimed";

    // 1. DAILY SUMMARY LOGIC (Specific branch)
    if (type === 'daily_summary') {
      const prompt = `
            Você é um assistente administrativo de uma clínica médica.
            Analise a imagem/PDF da agenda do dia.

            **Objetivo:** Gerar um resumo estatístico ("Espelho Diário") para o médico prestador.

            **Instruções de Extração e Contagem:**
            1. **Prestador:** Identifique o nome do médico.
            2. **Data:** Identifique a data da agenda.
            3. **Período:** Identifique o horário do PRIMEIRO e do ÚLTIMO atendimento.
            4. **Contagens:**
               - Total de pacientes.
               - Contar "Primeiras consultas".
               - Contar "Segundas consultas" (ou Consulta).
               - Contar "Retornos".
               - Contar outros (Intercâmbio, etc).
            5. **Status:** Confirmados vs Pendentes.

            **REGRAS DE FORMATAÇÃO RIGOROSA (OBRIGATÓRIO):**
            1. **Zeros à Esquerda:** Para QUALQUER número de contagem menor que 10, você DEVE adicionar um zero à esquerda.
               - Exemplo CORRETO: "01", "08", "09", "10".
            2. **Terminologia Exata:**
               - Para primeiras consultas: "- Primeira Consulta"
               - Para segundas consultas: "- Segunda Consulta"
               - Para retornos: "- Retorno"
            3. **Hífens de Padronização:**
               - Todos os itens de contagem (distribuição e status) DEVEM ter um hífen separando o número do texto. Ex: "05 - atendimentos confirmados".

            **Contexto Adicional:** "${additionalContext}"

            **MODELO DE RESPOSTA:**
            Preencha os colchetes com os dados extraídos, respeitando as regras acima.

            ---
            Olá DR. "*[Nome do Prestador]*" tudo bem!

            Segue o resumo da sua agenda do dia *[Data]* até o momento:

            📅 Período de atendimento: *[Horário Início] às [Horário Fim]*
            👥 Total de pacientes agendados: *[Total com zero à esquerda]*

            🧾 Distribuição dos atendimentos:

            *[Qtd] - Primeira Consulta*
            *[Qtd] - Segunda Consulta* (se houver)
            *[Qtd] - Retorno*
            *[Qtd] - atendimentos por intercâmbio/outros* (se houver)

            📌 Status dos agendamentos:

            *[Qtd] - atendimentos confirmados*
            *[Qtd] - atendimento agendado (pendente de confirmação)*

            🕒 Horário livre:

            *[Descrever horários livres ou "Sem horários livres identificados"]*

            Obrigado,
            ${signatureName}
            ---
        `;

      const responseSchema: Schema = {
        type: Type.OBJECT,
        properties: {
          extractedData: {
            type: Type.OBJECT,
            properties: {
              patientName: { type: Type.STRING, description: "Use 'Resumo Diário' aqui" },
              doctorName: { type: Type.STRING },
              date: { type: Type.STRING },
              time: { type: Type.STRING, description: "Use o período completo aqui" },
              contact: { type: Type.STRING, description: "Deixe vazio" },
              procedure: { type: Type.STRING, description: "Deixe vazio" },
            }
          },
          generatedMessage: { type: Type.STRING, description: "O texto do resumo completo formatado." }
        },
        required: ["extractedData", "generatedMessage"]
      };

      const response = await ai.models.generateContent({
        model: model,
        contents: {
          parts: [
            { inlineData: { mimeType: mimeType, data: fileBase64 } },
            { text: prompt },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: responseSchema,
        },
      });

      const text = response.text;
      if (!text) throw new Error("No response generated.");
      return JSON.parse(text);
    }

    // 2. STANDARD LOGIC (Reschedule / Confirmation)

    // Format preparation block if exists
    const prepBlock = preparationText
      ? `\n📝 *Preparo Necessário:*\n${preparationText}\n`
      : '';

    // Define templates with placeholders for preparation and dynamic user name
    const templates = {
      reschedule: `
          Olá, "nome do paciente", este contato refere-se à sua consulta no Centro de Diagnóstico Unimed (CDU), 9º andar. Tentamos o contato telefônico, mas não conseguimos falar com você.

          Devido a um imprevisto na agenda do médico, sua consulta com o(a) Dr(a). "Nome do Médico" precisou ser remarcada.

          ✅ Novo Agendamento: 
          📅 Data: "data extraída" 
          ⏰ Hora: "horário extraído"
          ${prepBlock}
          ⚠️ Importante: Apresentar Documento com foto e Carteirinha da Unimed.

          ❌ Caso não seja possível a nova data agendada, por favor, entre em contato através da Central de Agendamento: 

          📞 Telefone: (14) 3235-3350 
          📱 WhatsApp: (14) 99648-4958

          Pedimos desculpas pelo transtorno e agradecemos a compreensão.

          Atenciosamente, 
          ${signatureName}
        `,
      confirmation: `Olá, "nome do paciente", este contato refere-se à sua consulta no Centro de Diagnóstico Unimed (CDU), 9º andar ( Oftalmologia ).

🩺 Dr(a). "Nome do Médico"
📅 Data: "data extraída"
⏰ Hora: "horário extraído"
${prepBlock}
⚠️ Importante: Apresentar Documento com foto e Carteirinha da Unimed.

Em caso de dúvidas ou necessidade de reagendar, entre em contato através da Central de Agendamento: (14) 3235-3350 ou WhatsApp (14) 99648-4958.

Podemos confirmar?

Atenciosamente,
${signatureName}`
    };

    // Note: Daily Summary template is handled in the if block above, so we cast type strictly here for templates access
    const selectedTemplate = templates[type as 'reschedule' | 'confirmation'];

    const mappingInstructions = `
      **Instruções de Mapeamento:**
      1. **Prestador**: Nome do médico (ex: ORLANDO_COSTA -> Dr(a). Orlando Costa).
      2. **Data**: Data da consulta (ex: 25/11/2025).
      3. **HORÁRIO**: Se intervalo (ex: "13:00 - 13:15"), pegue APENAS o INÍCIO (ex: 13:00).
      4. **DESCRIÇÃO**: Nome completo do paciente.
      5. **CONTATO**: Telefone/celular.
      6. **EVENTO/STATUS**: Ignore linhas com "HORÁRIO LIVRE". Apenas agendados/confirmados.
    `;

    let prompt = '';
    let responseSchema: Schema;

    const itemSchema: Schema = {
      type: Type.OBJECT,
      properties: {
        extractedData: {
          type: Type.OBJECT,
          properties: {
            patientName: { type: Type.STRING, description: "Nome completo do paciente" },
            doctorName: { type: Type.STRING, description: "Nome do médico" },
            date: { type: Type.STRING, description: "Data do agendamento" },
            time: { type: Type.STRING, description: "Horário de início" },
            procedure: { type: Type.STRING, description: "Tipo do evento" },
            contact: { type: Type.STRING, description: "Telefone de contato" },
          },
        },
        generatedMessage: {
          type: Type.STRING,
          description: "A mensagem formatada exatamente conforme o modelo."
        },
      },
      required: ["extractedData", "generatedMessage"],
    };

    if (mode === 'batch') {
      prompt = `
            Você é um assistente administrativo. Analise o documento COMPLETO.
            Identifique TODOS os agendamentos válidos de pacientes diferentes na lista.
            
            ${mappingInstructions}
            
            Para CADA paciente encontrado, gere um objeto contendo os dados extraídos e a mensagem personalizada seguindo ESTRITAMENTE o modelo abaixo (respeitando rigorosamente as quebras de linha):
            ${selectedTemplate}

            Contexto: "${additionalContext}"
        `;

      responseSchema = {
        type: Type.ARRAY,
        items: itemSchema
      };
    } else {
      prompt = `
            Você é um assistente administrativo. Analise o documento.
            
            ${mappingInstructions}
            
            Contexto: "${additionalContext}"
            *Se o usuário especificou um nome no contexto, busque esse paciente. Caso contrário, extraia o PRIMEIRO paciente válido encontrado.*

            Gere a mensagem seguindo ESTRITAMENTE o modelo (respeitando rigorosamente as quebras de linha):
            ${selectedTemplate}
        `;

      responseSchema = {
        type: Type.OBJECT,
        properties: itemSchema.properties,
        required: itemSchema.required
      };
    }

    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          { inlineData: { mimeType: mimeType, data: fileBase64 } },
          { text: prompt },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response generated.");

    return JSON.parse(text);
  } catch (error) {
    console.error("Error processing document:", error);
    throw new Error("Falha ao processar o documento.");
  }
};