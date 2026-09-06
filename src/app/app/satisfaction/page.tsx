"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/app/AppShell";
import { FeedbackToast, usePausableFeedbackAutoDismiss } from "@/components/ui/FeedbackToast";
import {
  AppApiError,
  AppSatisfactionQuestion,
  AppSatisfactionQuestionStatus,
  AppSatisfactionPolicy,
  AppSatisfactionResponse,
  AppSatisfactionSurvey,
  AppSatisfactionSurveyStatus,
  AppSatisfactionType,
  AppSession,
  clearAppSession,
  createAppSatisfactionQuestion,
  createAppSatisfactionResponse,
  createAppSatisfactionSurvey,
  fetchAppSatisfaction,
  fetchAppSatisfactionPolicy,
  loadAppSession,
  saveAppSession,
  updateAppSatisfactionQuestion,
  updateAppSatisfactionPolicy,
  updateAppSatisfactionSurvey,
} from "@/lib/appClientApi";
import { getAppErrorUxMessage } from "@/lib/appUxLabels";

type TabKey = "questions" | "surveys" | "responses";

type QuestionForm = {
  id: string;
  key: string;
  type: AppSatisfactionType;
  title: string;
  questionText: string;
  commentPrompt: string;
  commentEnabled: boolean;
  status: AppSatisfactionQuestionStatus;
};

type SurveyForm = {
  id: string;
  questionId: string;
  channel: string;
  type: AppSatisfactionType;
  status: AppSatisfactionSurveyStatus;
  questionText: string;
  commentEnabled: boolean;
  expiresAt: string;
};

type PolicyForm = {
  enabled: boolean;
  questionText: string;
  commentEnabled: boolean;
  commentOfferText: string;
  commentPromptText: string;
  thankYouText: string;
  newServiceGateText: string;
  ttlMinutes: string;
  eligibility: AppSatisfactionPolicy["eligibility"];
};

const QUESTION_EMPTY: QuestionForm = {
  id: "",
  key: "",
  type: "csat",
  title: "",
  questionText: "",
  commentPrompt: "",
  commentEnabled: true,
  status: "active",
};

const SURVEY_EMPTY: SurveyForm = {
  id: "",
  questionId: "",
  channel: "",
  type: "csat",
  status: "draft",
  questionText: "",
  commentEnabled: true,
  expiresAt: "",
};

const RESPONSE_EMPTY = {
  surveyId: "",
  score: 5,
  comment: "",
};

const POLICY_EMPTY: PolicyForm = {
  enabled: false,
  questionText: "",
  commentEnabled: false,
  commentOfferText: "",
  commentPromptText: "",
  thankYouText: "",
  newServiceGateText: "",
  ttlMinutes: "15",
  eligibility: "HUMAN_ONLY",
};

function policyToForm(policy: AppSatisfactionPolicy): PolicyForm {
  return {
    enabled: policy.enabled,
    questionText: policy.questionText,
    commentEnabled: policy.commentEnabled,
    commentOfferText: policy.commentOfferText,
    commentPromptText: policy.commentPromptText,
    thankYouText: policy.thankYouText,
    newServiceGateText: policy.newServiceGateText,
    ttlMinutes: String(policy.ttlMinutes),
    eligibility: policy.eligibility,
  };
}

function canManageSatisfaction(role: string) {
  const normalized = role.trim().toUpperCase();
  return normalized === "SUPERVISOR" || normalized === "ADMIN";
}

function normalizeError(error: AppApiError, fallback: string) {
  if (error.status === 401) return "Sessão expirada. Faça login novamente.";
  if (error.status === 403) return "Seu perfil não tem permissão para gerenciar satisfação.";
  if (error.errorCode === "feature_not_enabled") return "Satisfação não está habilitada para esta organização.";
  if (error.errorCode === "duplicate_satisfaction_record") return "Já existe um registro de satisfação com estes dados.";
  if (error.errorCode?.endsWith("_not_found")) return "O registro selecionado não pertence a esta organização ou não existe.";
  return getAppErrorUxMessage({ status: error.status, errorCode: error.errorCode, message: error.message, fallback });
}

function StatusPill({ status }: { status: string }) {
  const label =
    status === "active"
      ? "Ativa"
      : status === "inactive"
        ? "Inativa"
        : status === "archived"
          ? "Arquivada"
          : status === "responded"
            ? "Respondida"
            : status === "sent"
              ? "Enviada"
              : status === "cancelled"
                ? "Cancelada"
                : "Rascunho";
  return <span className="rounded-full border px-2 py-0.5 text-[11px] theme-muted">{label}</span>;
}

function toLocalDateTimeInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function fromLocalDateTimeInput(value: string) {
  return value ? new Date(value).toISOString() : null;
}

export default function SatisfactionPage() {
  const router = useRouter();
  const [session, setSession] = useState<AppSession | null>(null);
  const [tab, setTab] = useState<TabKey>("questions");
  const [questions, setQuestions] = useState<AppSatisfactionQuestion[]>([]);
  const [surveys, setSurveys] = useState<AppSatisfactionSurvey[]>([]);
  const [responses, setResponses] = useState<AppSatisfactionResponse[]>([]);
  const [policyForm, setPolicyForm] = useState<PolicyForm>(POLICY_EMPTY);
  const [policySource, setPolicySource] = useState<string>("json_fallback");
  const [questionForm, setQuestionForm] = useState(QUESTION_EMPTY);
  const [surveyForm, setSurveyForm] = useState(SURVEY_EMPTY);
  const [responseForm, setResponseForm] = useState(RESPONSE_EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const toastHandlers = usePausableFeedbackAutoDismiss(Boolean(error || success), () => {
    setError(null);
    setSuccess(null);
  });

  const handleUnauthorized = useCallback(() => {
    clearAppSession();
    router.replace("/app/login");
  }, [router]);

  const loadSatisfaction = useCallback(
    async (activeSession: AppSession) => {
      setLoading(true);
      setError(null);
      try {
        const [response, policyResponse] = await Promise.all([
          fetchAppSatisfaction(activeSession),
          fetchAppSatisfactionPolicy(activeSession),
        ]);
        setQuestions(response.questions);
        setSurveys(response.surveys);
        setResponses(response.responses);
        setPolicyForm(policyToForm(policyResponse.policy));
        setPolicySource(policyResponse.configSource);
      } catch (err) {
        const typed = err as AppApiError;
        if (typed.status === 401) {
          handleUnauthorized();
          return;
        }
        setError(normalizeError(typed, "Não foi possível carregar satisfação."));
      } finally {
        setLoading(false);
      }
    },
    [handleUnauthorized]
  );

  useEffect(() => {
    const stored = loadAppSession();
    if (!stored) {
      router.replace("/app/login");
      return;
    }
    if (!canManageSatisfaction(stored.user.role)) {
      router.replace("/app/inbox");
      return;
    }
    saveAppSession(stored);
    setSession(stored);
    void loadSatisfaction(stored);
  }, [loadSatisfaction, router]);

  const unansweredSurveys = useMemo(
    () => surveys.filter((survey) => survey.status !== "responded" && !responses.some((item) => item.surveyId === survey.id)),
    [responses, surveys]
  );

  const saveQuestion = async () => {
    if (!session || !questionForm.title.trim() || !questionForm.questionText.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        key: questionForm.key || undefined,
        type: questionForm.type,
        title: questionForm.title,
        questionText: questionForm.questionText,
        commentPrompt: questionForm.commentPrompt || null,
        commentEnabled: questionForm.commentEnabled,
        status: questionForm.status,
      };
      if (questionForm.id) {
        await updateAppSatisfactionQuestion(session, questionForm.id, payload);
        setSuccess("Pergunta atualizada.");
      } else {
        await createAppSatisfactionQuestion(session, payload);
        setSuccess("Pergunta criada.");
      }
      setQuestionForm(QUESTION_EMPTY);
      await loadSatisfaction(session);
    } catch (err) {
      setError(normalizeError(err as AppApiError, "Não foi possível salvar a pergunta."));
    } finally {
      setSaving(false);
    }
  };

  const savePolicy = async () => {
    if (!session || !policyForm.questionText.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const ttlMinutes = policyForm.ttlMinutes.trim() ? Number(policyForm.ttlMinutes) : undefined;
      const response = await updateAppSatisfactionPolicy(session, {
        enabled: policyForm.enabled,
        questionText: policyForm.questionText,
        commentEnabled: policyForm.commentEnabled,
        commentOfferText: policyForm.commentOfferText,
        commentPromptText: policyForm.commentPromptText,
        thankYouText: policyForm.thankYouText,
        newServiceGateText: policyForm.newServiceGateText,
        ttlMinutes,
        eligibility: policyForm.eligibility,
      });
      setPolicyForm(policyToForm(response.policy));
      setPolicySource(response.configSource);
      setSuccess("Configuração automática atualizada.");
      await loadSatisfaction(session);
    } catch (err) {
      setError(normalizeError(err as AppApiError, "Não foi possível salvar a configuração automática."));
    } finally {
      setSaving(false);
    }
  };

  const saveSurvey = async () => {
    if (!session || !surveyForm.questionText.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        questionId: surveyForm.questionId || null,
        channel: surveyForm.channel || null,
        type: surveyForm.type,
        status: surveyForm.status,
        questionText: surveyForm.questionText,
        commentEnabled: surveyForm.commentEnabled,
        expiresAt: fromLocalDateTimeInput(surveyForm.expiresAt),
      };
      if (surveyForm.id) {
        await updateAppSatisfactionSurvey(session, surveyForm.id, payload);
        setSuccess("Pesquisa atualizada.");
      } else {
        await createAppSatisfactionSurvey(session, payload);
        setSuccess("Pesquisa criada.");
      }
      setSurveyForm(SURVEY_EMPTY);
      await loadSatisfaction(session);
    } catch (err) {
      setError(normalizeError(err as AppApiError, "Não foi possível salvar a pesquisa."));
    } finally {
      setSaving(false);
    }
  };

  const saveResponse = async () => {
    if (!session || !responseForm.surveyId) return;
    setSaving(true);
    setError(null);
    try {
      await createAppSatisfactionResponse(session, {
        surveyId: responseForm.surveyId,
        score: responseForm.score,
        comment: responseForm.comment || null,
      });
      setResponseForm(RESPONSE_EMPTY);
      setSuccess("Resposta registrada.");
      await loadSatisfaction(session);
    } catch (err) {
      setError(normalizeError(err as AppApiError, "Não foi possível registrar a resposta."));
    } finally {
      setSaving(false);
    }
  };

  if (!session) {
    return (
      <main className="min-h-screen theme-bg p-6 theme-fg">
        <p className="theme-muted">Carregando...</p>
      </main>
    );
  }

  return (
    <AppShell session={session} title="Satisfacao" subtitle="Pesquisas NPS e CSAT em rollout controlado.">
      <FeedbackToast message={success} variant="success" {...toastHandlers} />
      <FeedbackToast message={error} variant="error" {...toastHandlers} />
      <section className="space-y-5">
        <div className="grid gap-3 md:grid-cols-3">
          <SummaryCard label="Perguntas" value={questions.length} />
          <SummaryCard label="Pesquisas" value={surveys.length} />
          <SummaryCard label="Respostas" value={responses.length} />
        </div>

        <FormPanel title="Envio automático após atendimento">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm theme-muted">
              <input
                type="checkbox"
                checked={policyForm.enabled}
                onChange={(event) => setPolicyForm({ ...policyForm, enabled: event.target.checked })}
              />
              Enviar pesquisa ao finalizar atendimento
            </label>
            <span className="rounded-full border px-2 py-1 text-xs theme-muted">
              Fonte: {policySource === "db" ? "configuração salva" : "padrão"}
            </span>
          </div>
          <Textarea
            label="Pergunta enviada automaticamente"
            value={policyForm.questionText}
            onChange={(value) => setPolicyForm({ ...policyForm, questionText: value })}
          />
          <Input
            label="Expiração em minutos"
            type="number"
            value={policyForm.ttlMinutes}
            onChange={(value) => setPolicyForm({ ...policyForm, ttlMinutes: value })}
          />
          <label className="flex items-center gap-2 text-sm theme-muted">
            <input
              type="checkbox"
              checked={policyForm.commentEnabled}
              onChange={(event) => setPolicyForm({ ...policyForm, commentEnabled: event.target.checked })}
            />
            Permitir comentário opcional após a nota
          </label>
          <Textarea
            label="Texto oferecendo comentário"
            value={policyForm.commentOfferText}
            onChange={(value) => setPolicyForm({ ...policyForm, commentOfferText: value })}
            disabled={!policyForm.commentEnabled}
          />
          <Textarea
            label="Prompt para comentário"
            value={policyForm.commentPromptText}
            onChange={(value) => setPolicyForm({ ...policyForm, commentPromptText: value })}
            disabled={!policyForm.commentEnabled}
          />
          <Textarea
            label="Mensagem de agradecimento"
            value={policyForm.thankYouText}
            onChange={(value) => setPolicyForm({ ...policyForm, thankYouText: value })}
          />
          <details className="border-t pt-3">
            <summary className="cursor-pointer text-sm font-semibold theme-fg">Avançado</summary>
            <div className="mt-3 space-y-3">
              <Select
                label="Elegibilidade"
                value={policyForm.eligibility}
                onChange={(value) => setPolicyForm({ ...policyForm, eligibility: value as AppSatisfactionPolicy["eligibility"] })}
                options={[
                  ["HUMAN_ONLY", "Somente atendimento humano atribuído"],
                  ["DIRECTED_SERVICE", "Atendimento direcionado"],
                ]}
              />
              <Textarea
                label="Mensagem para novo atendimento"
                value={policyForm.newServiceGateText}
                onChange={(value) => setPolicyForm({ ...policyForm, newServiceGateText: value })}
              />
            </div>
          </details>
          <ActionRow
            primaryLabel="Salvar configuração"
            disabled={saving || !policyForm.questionText.trim()}
            onPrimary={savePolicy}
            onCancel={() => {
              if (session) void loadSatisfaction(session);
            }}
          />
        </FormPanel>

        <div className="flex flex-wrap gap-2">
          {(["questions", "surveys", "responses"] as TabKey[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className={`rounded-md border px-3 py-2 text-sm ${tab === item ? "theme-button-primary" : "theme-button-secondary"}`}
            >
              {item === "questions" ? "Perguntas" : item === "surveys" ? "Pesquisas" : "Respostas"}
            </button>
          ))}
        </div>

        {loading ? <p className="theme-muted">Carregando satisfação...</p> : null}

        {tab === "questions" ? (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,420px)_1fr]">
            <FormPanel title={questionForm.id ? "Editar pergunta" : "Nova pergunta"}>
              <Input label="Titulo" value={questionForm.title} onChange={(value) => setQuestionForm({ ...questionForm, title: value })} />
              <Input label="Chave" value={questionForm.key} onChange={(value) => setQuestionForm({ ...questionForm, key: value })} />
              <Select
                label="Tipo"
                value={questionForm.type}
                onChange={(value) => setQuestionForm({ ...questionForm, type: value as "csat" | "nps" })}
                options={[
                  ["csat", "CSAT 1-5"],
                  ["nps", "NPS 0-10"],
                ]}
              />
              <Textarea
                label="Pergunta"
                value={questionForm.questionText}
                onChange={(value) => setQuestionForm({ ...questionForm, questionText: value })}
              />
              <Input
                label="Prompt de comentario"
                value={questionForm.commentPrompt}
                onChange={(value) => setQuestionForm({ ...questionForm, commentPrompt: value })}
              />
              <Select
                label="Status"
                value={questionForm.status}
                onChange={(value) => setQuestionForm({ ...questionForm, status: value as "active" | "inactive" | "archived" })}
                options={[
                  ["active", "Ativa"],
                  ["inactive", "Inativa"],
                  ["archived", "Arquivada"],
                ]}
              />
              <label className="flex items-center gap-2 text-sm theme-muted">
                <input
                  type="checkbox"
                  checked={questionForm.commentEnabled}
                  onChange={(event) => setQuestionForm({ ...questionForm, commentEnabled: event.target.checked })}
                />
                Permitir comentario
              </label>
              <ActionRow
                primaryLabel={questionForm.id ? "Atualizar" : "Criar"}
                disabled={saving || !questionForm.title.trim() || !questionForm.questionText.trim()}
                onPrimary={saveQuestion}
                onCancel={() => setQuestionForm(QUESTION_EMPTY)}
              />
            </FormPanel>
            <ListPanel>
              {questions.map((item) => (
                <ListItem key={item.id} title={item.title} subtitle={`${item.type.toUpperCase()} - ${item.questionText}`}>
                  <StatusPill status={item.status} />
                  <button
                    type="button"
                    className="rounded-md border px-2 py-1 text-xs theme-button-secondary"
                    onClick={() =>
                      setQuestionForm({
                        id: item.id,
                        key: item.key,
                        type: item.type,
                        title: item.title,
                        questionText: item.questionText,
                        commentPrompt: item.commentPrompt ?? "",
                        commentEnabled: item.commentEnabled,
                        status: item.status,
                      })
                    }
                  >
                    Editar
                  </button>
                </ListItem>
              ))}
            </ListPanel>
          </div>
        ) : null}

        {tab === "surveys" ? (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,420px)_1fr]">
            <FormPanel title={surveyForm.id ? "Editar pesquisa" : "Nova pesquisa"}>
              <Select
                label="Pergunta base"
                value={surveyForm.questionId}
                onChange={(value) => {
                  const question = questions.find((item) => item.id === value);
                  setSurveyForm({
                    ...surveyForm,
                    questionId: value,
                    type: question?.type ?? surveyForm.type,
                    questionText: question?.questionText ?? surveyForm.questionText,
                    commentEnabled: question?.commentEnabled ?? surveyForm.commentEnabled,
                  });
                }}
                options={[["", "Sem pergunta base"], ...questions.map((item) => [item.id, item.title] as [string, string])]}
              />
              <Select
                label="Tipo"
                value={surveyForm.type}
                onChange={(value) => setSurveyForm({ ...surveyForm, type: value as "csat" | "nps" })}
                options={[
                  ["csat", "CSAT 1-5"],
                  ["nps", "NPS 0-10"],
                ]}
              />
              <Textarea
                label="Pergunta"
                value={surveyForm.questionText}
                onChange={(value) => setSurveyForm({ ...surveyForm, questionText: value })}
              />
              <Input label="Canal" value={surveyForm.channel} onChange={(value) => setSurveyForm({ ...surveyForm, channel: value })} />
              <Select
                label="Status"
                value={surveyForm.status}
                onChange={(value) =>
                  setSurveyForm({
                    ...surveyForm,
                    status: value as "draft" | "pending" | "sent" | "responded" | "expired" | "cancelled",
                  })
                }
                options={[
                  ["draft", "Rascunho"],
                  ["pending", "Pendente"],
                  ["sent", "Enviada"],
                  ["responded", "Respondida"],
                  ["expired", "Expirada"],
                  ["cancelled", "Cancelada"],
                ]}
              />
              <Input
                label="Expira em"
                type="datetime-local"
                value={surveyForm.expiresAt}
                onChange={(value) => setSurveyForm({ ...surveyForm, expiresAt: value })}
              />
              <label className="flex items-center gap-2 text-sm theme-muted">
                <input
                  type="checkbox"
                  checked={surveyForm.commentEnabled}
                  onChange={(event) => setSurveyForm({ ...surveyForm, commentEnabled: event.target.checked })}
                />
                Permitir comentario
              </label>
              <ActionRow
                primaryLabel={surveyForm.id ? "Atualizar" : "Criar"}
                disabled={saving || !surveyForm.questionText.trim()}
                onPrimary={saveSurvey}
                onCancel={() => setSurveyForm(SURVEY_EMPTY)}
              />
            </FormPanel>
            <ListPanel>
              {surveys.map((item) => (
                <ListItem key={item.id} title={item.questionText} subtitle={`${item.type.toUpperCase()} - ${item.channel ?? "canal não definido"}`}>
                  <StatusPill status={item.status} />
                  <button
                    type="button"
                    className="rounded-md border px-2 py-1 text-xs theme-button-secondary"
                    onClick={() =>
                      setSurveyForm({
                        id: item.id,
                        questionId: item.questionId ?? "",
                        channel: item.channel ?? "",
                        type: item.type,
                        status: item.status,
                        questionText: item.questionText,
                        commentEnabled: item.commentEnabled,
                        expiresAt: toLocalDateTimeInput(item.expiresAt),
                      })
                    }
                  >
                    Editar
                  </button>
                </ListItem>
              ))}
            </ListPanel>
          </div>
        ) : null}

        {tab === "responses" ? (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,420px)_1fr]">
            <FormPanel title="Registrar resposta manual">
              <Select
                label="Pesquisa"
                value={responseForm.surveyId}
                onChange={(value) => setResponseForm({ ...responseForm, surveyId: value })}
                options={[["", "Selecione"], ...unansweredSurveys.map((item) => [item.id, item.questionText] as [string, string])]}
              />
              <Input
                label="Nota"
                type="number"
                value={String(responseForm.score)}
                onChange={(value) => setResponseForm({ ...responseForm, score: Number(value) })}
              />
              <Textarea
                label="Comentario"
                value={responseForm.comment}
                onChange={(value) => setResponseForm({ ...responseForm, comment: value })}
              />
              <ActionRow
                primaryLabel="Registrar"
                disabled={saving || !responseForm.surveyId}
                onPrimary={saveResponse}
                onCancel={() => setResponseForm(RESPONSE_EMPTY)}
              />
            </FormPanel>
            <ListPanel>
              {responses.map((item) => (
                <ListItem
                  key={item.id}
                  title={`Nota ${item.score}`}
                  subtitle={`${item.category ?? "sem categoria"} - ${item.comment ?? "sem comentario"}`}
                >
                  <span className="text-xs theme-muted">{new Date(item.respondedAt).toLocaleString("pt-BR")}</span>
                </ListItem>
              ))}
            </ListPanel>
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-4 theme-card">
      <p className="text-xs uppercase tracking-wide theme-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold theme-fg">{value}</p>
    </div>
  );
}

function FormPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3 rounded-md border p-4 theme-card">
      <h2 className="text-base font-semibold theme-fg">{title}</h2>
      {children}
    </div>
  );
}

function ListPanel({ children }: { children: ReactNode }) {
  return <div className="space-y-3">{children}</div>;
}

function ListItem({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <article className="flex flex-col gap-3 rounded-md border p-4 theme-card md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        <h3 className="break-words text-sm font-semibold theme-fg">{title}</h3>
        <p className="mt-1 line-clamp-2 break-words text-xs theme-muted">{subtitle}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>
    </article>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="theme-muted">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border px-3 py-2 text-sm theme-input"
      />
    </label>
  );
}

function Textarea({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="theme-muted">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        rows={4}
        className="w-full rounded-md border px-3 py-2 text-sm theme-input disabled:cursor-not-allowed disabled:opacity-60"
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="theme-muted">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border px-3 py-2 text-sm theme-input"
      >
        {options.map(([optionValue, labelText]) => (
          <option key={optionValue} value={optionValue}>
            {labelText}
          </option>
        ))}
      </select>
    </label>
  );
}

function ActionRow({
  primaryLabel,
  disabled,
  onPrimary,
  onCancel,
}: {
  primaryLabel: string;
  disabled: boolean;
  onPrimary: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={disabled} onClick={onPrimary} className="rounded-md px-3 py-2 text-sm theme-button-primary">
        {primaryLabel}
      </button>
      <button type="button" onClick={onCancel} className="rounded-md border px-3 py-2 text-sm theme-button-secondary">
        Limpar
      </button>
    </div>
  );
}
