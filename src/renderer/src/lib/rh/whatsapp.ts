/**
 * WhatsApp do RH — monta o link wa.me com o número do candidato e a mensagem
 * pronta (confirmação de entrevista). NÃO envia nada automático: abre o
 * WhatsApp Web/app com o texto já escrito para o RH revisar e dar enviar.
 */

function onlyDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** (11) 93047-6634 → 5511930476634 (Brasil por padrão). */
export function whatsappNumber(phone: string): string {
  const digits = onlyDigits(phone);
  if (digits.length <= 11) return `55${digits}`;
  return digits;
}

export function whatsappLink(phone: string, message: string): string {
  return `https://wa.me/${whatsappNumber(phone)}?text=${encodeURIComponent(message)}`;
}

export function openWhatsApp(phone: string, message: string): void {
  window.open(whatsappLink(phone, message), "_blank", "noopener");
}

type InviteInput = {
  candidateName: string;
  scheduledAt: string;
  mode: "online" | "presencial";
  address?: string | null;
  meetingUrl?: string | null;
  interviewer?: string | null;
};

/** Mensagem de confirmação de entrevista, pronta para o RH revisar. */
export function interviewInviteMessage(input: InviteInput): string {
  const when = new Date(input.scheduledAt);
  const date = when.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
  const time = when.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const firstName =
    input.candidateName.trim().split(/\s+/)[0] || input.candidateName;
  const lines: string[] = [
    `Olá, ${firstName}! Tudo bem?`,
    "",
    `Que notícia boa: você passou na triagem e podemos seguir com você! Vamos agendar sua entrevista:`,
    "",
    `📅 Data: ${date}`,
    `🕐 Horário: ${time}`,
  ];
  if (input.mode === "presencial") {
    lines.push(
      `📍 Local: ${input.address || "Endereço será confirmado em seguida"}`,
    );
  } else {
    lines.push(
      `💻 Link da reunião: ${input.meetingUrl || "será enviado antes da entrevista"}`,
    );
  }
  if (input.interviewer)
    lines.push(`👤 Entrevistador(a): ${input.interviewer}`);
  lines.push(
    "",
    "Se precisar remarcar ou tiver qualquer dúvida, é só responder esta mensagem.",
    "",
    "Equipe de RH — Digaspi",
  );
  return lines.join("\n");
}

/** Link do formulário de cadastro (Google Forms) enviado aos pré-aprovados. */
export const RH_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSey5r1_ulpCwVgdiuXaoDfgePDPMsQI0uM-F-CO1uUT1lsOEg/viewform?usp=sharing&ouid=116250720896867340489";

type PreHireFormInput = {
  candidateName: string;
  /** Unidade que receberá a pessoa (ex.: "Loja 41"). */
  storeName: string;
  /** Função definida pelo RH — NÃO usar o cargo escolhido pelo candidato. */
  role: string;
};

/**
 * Mensagem pronta p/ enviar o formulário de cadastro ao pré-aprovado:
 * parabeniza, passa o link e já informa Unidade/Função que a pessoa deve
 * preencher no formulário.
 */
export function preHireFormMessage(input: PreHireFormInput): string {
  const firstName =
    input.candidateName.trim().split(/\s+/)[0] || input.candidateName;
  return [
    `Olá, ${firstName}! Tudo bem?`,
    "",
    "Parabéns, você passou no processo seletivo! 🎉 Estamos muito felizes em ter você com a gente.",
    "",
    "Agora falta pouco para finalizar: preencha o formulário de cadastro abaixo com os seus dados:",
    RH_FORM_URL,
    "",
    "Ao abrir, preencha exatamente assim:",
    `🏢 Unidade: ${input.storeName}`,
    `💼 Função: ${input.role}`,
    "",
    "Tem alguma dúvida? É só responder esta mensagem.",
    "",
    "Equipe de RH — Digaspi",
  ].join("\n");
}
