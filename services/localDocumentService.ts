import { DocumentAnalysisResult, ExtractedData } from "../types";
import * as pdfjsLib from 'pdfjs-dist';

// Use Vite's asset loading to get the local worker path
// This avoids CDN CORS issues and version mismatches
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

/**
 * Text item with layout info
 */
interface TextItem {
    str: string;
    x: number;
    y: number;
}

/**
 * Extract text from a uploaded PDF file, preserving line structure.
 */
export const extractTextFromPDF = async (file: File): Promise<string> => {
    try {
        const arrayBuffer = await file.arrayBuffer();
        // Load PDF
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        console.log(`PDF Loaded: ${pdf.numPages} pages.`);

        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();

            // Map and Filter items
            const items: TextItem[] = [];
            for (const item of textContent.items as any[]) {
                // Some items might be empty or whitespace
                if (!item.str || !item.str.trim()) continue;

                // Fallback for transform: use 0,0 if missing (shouldn't happen on standard text)
                const tx = item.transform ? item.transform[4] : 0;
                const ty = item.transform ? item.transform[5] : 0;

                items.push({
                    str: item.str,
                    x: tx,
                    y: ty
                });
            }

            // Sort by Y (Top to Bottom), then X (Left to Right)
            // PDF coordinates: Y typically starts from bottom-left (0,0) going UP. 
            // So higher Y is higher on page. We want format Text Top->Bottom.
            // So we sort DESCENDING by Y.
            items.sort((a, b) => {
                const yDiff = b.y - a.y;
                if (Math.abs(yDiff) < 8) { // Tolerance for same line
                    return a.x - b.x;
                }
                return yDiff;
            });

            // Reconstruct visually
            let currentY = items[0]?.y || 0;
            let lineText = '';

            for (const item of items) {
                // If Y difference is significant, it's a new line
                if (Math.abs(item.y - currentY) > 8) {
                    fullText += lineText.trim() + '\n';
                    lineText = '';
                    currentY = item.y;
                }
                lineText += item.str + ' ';
            }
            fullText += lineText.trim() + '\n';
        }

        console.log("Extraction Complete. Length:", fullText.length);
        return fullText;

    } catch (e: any) {
        console.error("PDF Extraction Failed:", e);
        throw new Error(`Falha na leitura do PDF: ${e.message}`);
    }
};

interface ParsedAppointment {
    patientName: string;
    time: string;
    contact: string;
    status: string;
    doctor?: string;
    date?: string;
    procedure?: string;
    insurance?: string;
}

/**
 * Parses using the specific User column order:
 * "HORÁRIO | DESCRIÇÃO (PACIENTE) | EVENTO | CONVÊNIO | CONTATO | STATUS"
 */
export const parseAgendaText = (text: string): ParsedAppointment[] => {
    const lines = text.split('\n');
    const appointments: ParsedAppointment[] = [];

    // Global Metadata
    let globalDoctor = '';
    let globalDate = '';

    // Patterns
    const timePattern = /(\d{2}:\d{2})\s?-\s?(\d{2}:\d{2})/;
    const singleTimePattern = /(\d{2}:\d{2})/;
    const datePattern = /(\d{2}\/\d{2}\/\d{4})/;
    const phonePattern = /(?:\(?\d{2}\)?\s?)?(?:9?\d{4}[-\.\s]?\d{4})/;

    // Keywords Lists (Comprehensive)
    const badLines = ['LIVRE', 'BLOQUEIO', 'Agenda do Dia', 'Relatório', 'Página', 'Impresso em', 'Emissão'];

    // Status - usually at end
    const statusKeywords = ['Confirmado', 'Realizado', 'Falta', 'Agendado', 'Desistencia', 'Cancelado'];

    // Insurance - usually column 4
    const insuranceKeywords = [
        'Unimed', 'Particular', 'Cassi', 'Iamspe', 'Bradesco', 'Sulamerica', 'Allianz', 'Porto Seguro',
        'Amil', 'Mediservice', 'Fusex', 'Apas', 'Cabesp', 'Geap', 'Saude Caixa', 'Postal Saude'
    ];

    // Event/Procedure - usually column 3
    const eventKeywords = [
        'Consulta', 'Retorno de Consulta', 'Retorno', 'Exame', 'Procedimento', 'Cirurgia', 'Avaliação',
        'Ecografia', 'Bioimpedancia', 'Teste Cutaneo', 'Imunoterapia', 'Pequena Cirurgia'
    ];
    // Sort logic: longest first to avoid partial matches (e.g. "Retorno de Consulta" vs "Retorno")
    eventKeywords.sort((a, b) => b.length - a.length);
    insuranceKeywords.sort((a, b) => b.length - a.length);


    // Helper to strip keywords
    const stripKeywords = (input: string, list: string[]): { cleaned: string, found: string[] } => {
        let cleaned = input;
        const found: string[] = [];
        for (const kw of list) {
            const regex = new RegExp(kw, 'gi');
            if (cleaned.match(regex)) {
                found.push(kw);
                cleaned = cleaned.replace(regex, '');
            }
        }
        return { cleaned, found };
    };

    // Header Scan
    for (const line of lines.slice(0, 15)) {
        if (!globalDate) {
            const d = line.match(datePattern);
            if (d) globalDate = d[1];
        }
        if (!globalDoctor) {
            // Match Name, allowing for underscores
            const dr = line.match(/(Dr\.|Dra\.|Medico|Prestador)[:\s]+([A-Za-z\s\._]+)/i);
            if (dr) {
                // Replace underscores with spaces and trim
                globalDoctor = dr[2].replace(/_/g, ' ').trim();
            }
        }
    }

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Validation: Must have time
        const timeRange = line.match(timePattern);
        const singleTime = line.match(singleTimePattern);

        // --- MULTILINE HANDLING ---
        // If line has NO time, check if it's a continuation of the previous appointment's name
        if (!timeRange && !singleTime) {
            if (appointments.length > 0) {
                const prev = appointments[appointments.length - 1];

                // Heuristic checks
                const isMetadata = line.match(/(Página|Impresso|Emissão|Unimed|Relatório|Dr\.|Data:)/i);

                if (!isMetadata && line.trim().length > 2) {
                    // The continuation line might ALSO contain wrapped column data (Event, Insurance, etc)
                    // So we must strip them from here too
                    let continuation = line.trim();

                    // Remove Phones
                    const foundPhones = continuation.match(new RegExp(phonePattern, 'g'));
                    if (foundPhones) foundPhones.forEach(p => continuation = continuation.replace(p, ''));

                    // Remove Status
                    const resStatus = stripKeywords(continuation, statusKeywords);
                    continuation = resStatus.cleaned;

                    // Remove Insurance & Event keywords from continuation line
                    const resIns = stripKeywords(continuation, insuranceKeywords);
                    continuation = resIns.cleaned;

                    const resEvt = stripKeywords(continuation, eventKeywords);
                    continuation = resEvt.cleaned;

                    // Cleanup formatting
                    continuation = continuation
                        .replace(/[-–]/g, '')
                        .replace(/\s+/g, ' ')
                        .replace(/\sPP$/, '').replace(/^PP\s/, '') // Remove PP artifact
                        .trim();

                    // Only append if there's actual text left (part of the name)
                    if (continuation.length > 0) {
                        prev.patientName = `${prev.patientName} ${continuation}`.trim();
                    }
                }
            }
            continue;
        }

        // Use the start time from range if available, else single found time
        const startTime = timeRange ? timeRange[1] : (singleTime ? singleTime[1] : '');
        if (!startTime) continue;

        // Filter bad lines
        if (badLines.some(bl => line.toUpperCase().includes(bl))) continue;

        // "Processing Strategy"
        let remaining = line;

        // 1. Remove Time Part (First occurance)
        remaining = remaining.replace(timeRange ? timeRange[0] : startTime, '').trim();

        // 2. Extract Status
        let status = 'Agendado';
        const resStatus = stripKeywords(remaining, statusKeywords);
        remaining = resStatus.cleaned;
        if (resStatus.found.length > 0) status = resStatus.found[0]; // Take first found status
        // Capitalize status
        status = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();

        // 3. Extract Contact (Phone)
        const foundPhones = remaining.match(new RegExp(phonePattern, 'g'));
        let contact = '';
        if (foundPhones) {
            contact = foundPhones.map(p => p.trim()).join(' / ');
            foundPhones.forEach(p => remaining = remaining.replace(p, ''));
        }

        // 4. Extract Insurance
        // We strip all found keywords to clean the name, but keep the first one as the 'Value'
        const resIns = stripKeywords(remaining, insuranceKeywords);
        remaining = resIns.cleaned;
        const insurance = resIns.found.length > 0 ? resIns.found[0] : '';

        // 5. Extract Event
        // We strip all found keywords, keep first as Value
        const resEvt = stripKeywords(remaining, eventKeywords);
        remaining = resEvt.cleaned;
        const event = resEvt.found.length > 0 ? resEvt.found[0] : '';

        // 6. Name is what's left
        let name = remaining
            .replace(/[-–]/g, '') // Remove stray dashes
            .replace(/\s+/g, ' ') // Collapse spaces
            .trim();

        // Clean leading/trailing non-letters
        name = name.replace(/^[^a-zA-Z]+/, '').replace(/[^a-zA-Z]+$/, '');

        // Specific Fix: Remove " PP" suffix or "PP" standalone if present at end
        name = name.replace(/\sPP$/, '').replace(/^PP\s/, '');

        // Minimal length check
        if (name.length < 3) continue;

        appointments.push({
            patientName: name,
            time: startTime,
            contact: contact,
            status: status,
            doctor: globalDoctor,
            date: globalDate,
            procedure: event,
            insurance: insurance
        });
    }

    return appointments;
};


export const generateLocalMessage = (
    data: ParsedAppointment,
    type: 'reschedule' | 'confirmation' | 'procedure_confirmation',
    prepText: string,
    signatureName: string
): string => {
    // Basic formatting
    const formattedDoctor = data.doctor && !data.doctor.match(/^(Dr|Dra)/i)
        ? `Dr(a). ${data.doctor}`
        : (data.doctor || "Dr(a). [Nome]");

    const dateObj = data.date || "[Data]";

    // Preparation Block
    const prepBlock = prepText ? `\n📝 *Preparo Necessário:*\n${prepText}\n` : '';

    if (type === 'reschedule') {
        return `Olá, ${data.patientName}, este contato refere-se à sua consulta no Centro de Diagnóstico Unimed (CDU), 9º andar. Tentamos o contato telefônico, mas não conseguimos falar com você.

Devido a um imprevisto na agenda do médico, sua consulta com o(a) ${formattedDoctor} precisou ser remarcada.

✅ Novo Agendamento: 
📅 Data: ${dateObj} 
⏰ Hora: ${data.time}
${prepBlock}
⚠️ Importante: Apresentar Documento com foto e Carteirinha da Unimed.

❌ Caso não seja possível a nova data agendada, por favor, entre em contato através da Central de Agendamento: 

📞 Telefone: (14) 3235-3350 
📱 WhatsApp: (14) 99648-4958

Pedimos desculpas pelo transtorno e agradecemos a compreensão.

Atenciosamente, 
${signatureName}`;
    }

    // Confirmation or Procedure Confirmation
    return `Olá, ${data.patientName}, este contato refere-se à sua consulta no Centro de Diagnóstico Unimed (CDU), 9º andar ( Oftalmologia ).

🩺 ${formattedDoctor}
📅 Data: ${dateObj}
⏰ Hora: ${data.time}
${prepBlock}
⚠️ Importante: Apresentar Documento com foto e Carteirinha da Unimed.

Em caso de dúvidas ou necessidade de reagendar, entre em contato através da Central de Agendamento: (14) 3235-3350 ou WhatsApp (14) 99648-4958.

Podemos confirmar?

Atenciosamente,
${signatureName}`;
};

export const processDocumentLocally = async (
    file: File,
    type: 'reschedule' | 'confirmation' | 'daily_summary' | 'procedure_confirmation',
    prepText: string = '',
    userName: string = 'Atendimento Unimed'
): Promise<DocumentAnalysisResult | DocumentAnalysisResult[]> => {

    const text = await extractTextFromPDF(file);
    console.log("Raw Extracted Text Sample:", text.substring(0, 500));
    const appointments = parseAgendaText(text);
    console.log("Parsed Appointments:", appointments.length);

    // DAILY SUMMARY LOGIC (Aggregated)
    if (type === 'daily_summary') {
        const total = appointments.length;
        const confirmed = appointments.filter(a => a.status.toLowerCase().includes('confirmado')).length;
        // Count anything not confirmed as pending for now, or simplify
        const pending = total - confirmed;

        const firstTime = appointments[0]?.time || "00:00";
        const lastTime = appointments[appointments.length - 1]?.time || "00:00";
        const doctor = appointments[0]?.doctor || "[Médico]";
        const date = appointments[0]?.date || "[Data]";

        const fmt = (n: number) => n < 10 ? `0${n}` : `${n}`;

        // Accurate counts based on parsed Procedure/EventType
        const primary = appointments.filter(a => a.procedure?.toLowerCase().includes('primeira')).length;
        const routine = appointments.filter(a => a.procedure?.toLowerCase().includes('consulta') && !a.procedure?.toLowerCase().includes('primeira')).length; // General consults
        const returns = appointments.filter(a => a.procedure?.toLowerCase().includes('retorno')).length;

        // Fallback: If no procedures detected (0), maybe everything is just "Consulta"?
        // Just leave as is, user will see 00 and can edit.

        const message = `Olá DR. "${doctor}" tudo bem!

Segue o resumo da sua agenda do dia ${date} até o momento:

📅 Período de atendimento: ${firstTime} às ${lastTime}
👥 Total de pacientes agendados: ${fmt(total)}

🧾 Distribuição dos atendimentos:

${fmt(primary)} - Primeira Consulta
${fmt(routine)} - Consulta / Segunda Consulta
${fmt(returns)} - Retorno

📌 Status dos agendamentos:

${fmt(confirmed)} - atendimentos confirmados
${fmt(pending)} - atendimento agendado (pendente de confirmação)

🕒 Horário livre:
Verificar manualmente na grade.

Obrigado,
${userName}`;

        return {
            extractedData: {
                patientName: "Resumo Diário",
                doctorName: doctor,
                date: date,
                time: `${firstTime} - ${lastTime}`,
                contact: "",
                procedure: ""
            },
            generatedMessage: message
        };
    }

    // NORMAL LIST LOGIC
    const results: DocumentAnalysisResult[] = appointments.map(appt => ({
        extractedData: {
            patientName: appt.patientName,
            doctorName: appt.doctor || "",
            date: appt.date || "",
            time: appt.time,
            contact: appt.contact,
            procedure: appt.procedure || ""
        },
        generatedMessage: generateLocalMessage(appt, type as any, prepText, userName)
    }));

    return results;
};
