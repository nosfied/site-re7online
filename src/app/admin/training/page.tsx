"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminConsole } from "@/components/admin/AdminConsoleProvider";
import {
  createAdminTrainingContent,
  deleteAdminTrainingContent,
  fetchAdminTrainingContent,
  fetchAdminTrainingContentBlob,
  formatDateTime,
  publishAdminTrainingContent,
  replaceAdminTrainingContentFile,
  unpublishAdminTrainingContent,
  updateAdminTrainingContent,
  type AdminTrainingContentItem,
  type AdminTrainingContentPayload,
  type AdminTrainingContentStatus,
  type AdminTrainingContentType,
} from "@/lib/whatsappAdminApi";

type FormState = {
  id: string | null;
  title: string;
  description: string;
  category: string;
  type: AdminTrainingContentType;
  sortOrder: string;
  status: AdminTrainingContentStatus;
  downloadable: boolean;
  file: File | null;
};

type PreviewState = {
  item: AdminTrainingContentItem;
  objectUrl: string;
  contentType: string | null;
  fileName: string | null;
};

const EMPTY_FORM: FormState = {
  id: null,
  title: "",
  description: "",
  category: "Primeiros passos",
  type: "PDF",
  sortOrder: "0",
  status: "DRAFT",
  downloadable: true,
  file: null,
};

const CATEGORIES = [
  "Primeiros passos",
  "Caixa de entrada",
  "Contatos",
  "Campanhas",
  "Relatórios",
  "Configurações",
];

function formatBytes(value: number) {
  const units = ["B", "KB", "MB", "GB"];
  let amount = value;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }
  return `${amount.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function statusLabel(status: AdminTrainingContentStatus) {
  return status === "PUBLISHED" ? "Publicado" : "Rascunho";
}

function typeLabel(type: AdminTrainingContentType) {
  return type === "PDF" ? "PDF" : "Video MP4";
}

function toPayload(form: FormState): AdminTrainingContentPayload {
  return {
    title: form.title.trim(),
    description: form.description.trim(),
    category: form.category.trim() || "Primeiros passos",
    type: form.type,
    sortOrder: Number.parseInt(form.sortOrder, 10) || 0,
    status: form.status,
    downloadable: form.downloadable,
  };
}

function formFromItem(item: AdminTrainingContentItem): FormState {
  return {
    id: item.id,
    title: item.title,
    description: item.description ?? "",
    category: item.category,
    type: item.type,
    sortOrder: String(item.sortOrder),
    status: item.status,
    downloadable: item.downloadable,
    file: null,
  };
}

export default function AdminTrainingPage() {
  const { connection } = useAdminConsole();
  const [items, setItems] = useState<AdminTrainingContentItem[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);

  const load = useCallback(async () => {
    if (!connection.baseUrl || !connection.adminToken) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetchAdminTrainingContent(connection);
      setItems(response.items);
    } catch (err) {
      setError((err as Error).message || "Falha ao carregar treinamentos.");
    } finally {
      setLoading(false);
    }
  }, [connection]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (preview?.objectUrl) URL.revokeObjectURL(preview.objectUrl);
    };
  }, [preview?.objectUrl]);

  const groupedItems = useMemo(() => {
    const groups = new Map<string, AdminTrainingContentItem[]>();
    items.forEach((item) => {
      const group = groups.get(item.category) ?? [];
      group.push(item);
      groups.set(item.category, group);
    });
    return Array.from(groups.entries());
  }, [items]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setReplaceFile(null);
    setReplacingId(null);
  };

  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);
    const payload = toPayload(form);
    if (!payload.title) {
      setError("Informe o titulo.");
      return;
    }
    if (!form.id && !form.file) {
      setError("Selecione um arquivo PDF ou MP4.");
      return;
    }
    setSaving(true);
    try {
      if (form.id) {
        await updateAdminTrainingContent(connection, form.id, {
          title: payload.title,
          description: payload.description,
          category: payload.category,
          sortOrder: payload.sortOrder,
          status: payload.status,
          downloadable: payload.downloadable,
        });
        setSuccess("Treinamento atualizado.");
      } else {
        await createAdminTrainingContent(connection, payload, form.file as File);
        setSuccess("Treinamento criado.");
      }
      resetForm();
      await load();
    } catch (err) {
      setError((err as Error).message || "Falha ao salvar treinamento.");
    } finally {
      setSaving(false);
    }
  };

  const handleStatus = async (item: AdminTrainingContentItem) => {
    setError(null);
    setSuccess(null);
    try {
      if (item.status === "PUBLISHED") {
        await unpublishAdminTrainingContent(connection, item.id);
        setSuccess("Treinamento despublicado.");
      } else {
        await publishAdminTrainingContent(connection, item.id);
        setSuccess("Treinamento publicado.");
      }
      await load();
    } catch (err) {
      setError((err as Error).message || "Falha ao alterar publicacao.");
    }
  };

  const handleReplace = async (item: AdminTrainingContentItem) => {
    if (!replaceFile || replacingId !== item.id) {
      setReplacingId(item.id);
      setReplaceFile(null);
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      await replaceAdminTrainingContentFile(connection, item.id, replaceFile);
      setSuccess("Arquivo substituido.");
      setReplacingId(null);
      setReplaceFile(null);
      await load();
    } catch (err) {
      setError((err as Error).message || "Falha ao substituir arquivo.");
    }
  };

  const handleDelete = async (item: AdminTrainingContentItem) => {
    const confirmed = window.confirm("Excluir este treinamento? O arquivo tambem sera removido.");
    if (!confirmed) return;
    setError(null);
    setSuccess(null);
    try {
      await deleteAdminTrainingContent(connection, item.id);
      setSuccess("Treinamento excluido.");
      if (form.id === item.id) resetForm();
      await load();
    } catch (err) {
      setError((err as Error).message || "Falha ao excluir treinamento.");
    }
  };

  const handlePreview = async (item: AdminTrainingContentItem) => {
    setError(null);
    try {
      const response = await fetchAdminTrainingContentBlob(connection, item.id);
      const objectUrl = URL.createObjectURL(response.blob);
      setPreview((current) => {
        if (current?.objectUrl) URL.revokeObjectURL(current.objectUrl);
        return { item, objectUrl, contentType: response.contentType, fileName: response.fileName };
      });
    } catch (err) {
      setError((err as Error).message || "Falha ao abrir preview.");
    }
  };

  return (
    <div className="px-4 py-8 text-white md:px-8">
      <div className="mx-auto grid w-full max-w-7xl gap-4">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Treinamentos</h1>
            <p className="text-sm text-white/70">
              Conteudo global do Converta publicado no Centro de aprendizagem.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-md border border-re7-sky/30 bg-re7-sky/10 px-3 py-2 text-sm text-white hover:bg-re7-sky/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
        </header>

        {error ? (
          <p className="rounded-md border border-red-400/30 bg-red-900/30 p-3 text-sm text-red-100">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="rounded-md border border-emerald-400/30 bg-emerald-900/20 p-3 text-sm text-emerald-100">
            {success}
          </p>
        ) : null}

        <section className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">{form.id ? "Editar treinamento" : "Adicionar treinamento"}</h2>
              <p className="text-sm text-white/60">PDF e video MP4. Publicacao e retirada sao explicitas.</p>
            </div>
            {form.id ? (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-md border border-white/20 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
              >
                Novo conteúdo
              </button>
            ) : null}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="text-white/70">Titulo</span>
              <input
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                className="rounded-md border border-white/15 bg-white/10 px-3 py-2 text-white outline-none focus:border-re7-sky"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-white/70">Categoria</span>
              <input
                value={form.category}
                list="training-categories"
                onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                className="rounded-md border border-white/15 bg-white/10 px-3 py-2 text-white outline-none focus:border-re7-sky"
              />
              <datalist id="training-categories">
                {CATEGORIES.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
            </label>
            <label className="grid gap-1 text-sm md:col-span-2">
              <span className="text-white/70">Descricao</span>
              <textarea
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                rows={3}
                className="rounded-md border border-white/15 bg-white/10 px-3 py-2 text-white outline-none focus:border-re7-sky"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-white/70">Tipo</span>
              <select
                value={form.type}
                disabled={Boolean(form.id)}
                onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as AdminTrainingContentType }))}
                className="rounded-md border border-white/15 bg-white/10 px-3 py-2 text-white outline-none focus:border-re7-sky disabled:opacity-60"
              >
                <option value="PDF">PDF</option>
                <option value="VIDEO">Video MP4</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-white/70">Ordem</span>
              <input
                type="number"
                value={form.sortOrder}
                onChange={(event) => setForm((current) => ({ ...current, sortOrder: event.target.value }))}
                className="rounded-md border border-white/15 bg-white/10 px-3 py-2 text-white outline-none focus:border-re7-sky"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-white/70">Status</span>
              <select
                value={form.status}
                onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as AdminTrainingContentStatus }))}
                className="rounded-md border border-white/15 bg-white/10 px-3 py-2 text-white outline-none focus:border-re7-sky"
              >
                <option value="DRAFT">Rascunho</option>
                <option value="PUBLISHED">Publicado</option>
              </select>
            </label>
            <label className="flex items-center gap-2 self-end text-sm text-white/80">
              <input
                type="checkbox"
                checked={form.downloadable}
                onChange={(event) => setForm((current) => ({ ...current, downloadable: event.target.checked }))}
              />
              Permitir download
            </label>
            {!form.id ? (
              <label className="grid gap-1 text-sm md:col-span-2">
                <span className="text-white/70">Arquivo</span>
                <input
                  type="file"
                  accept={form.type === "PDF" ? "application/pdf,.pdf" : "video/mp4,.mp4"}
                  onChange={(event) => setForm((current) => ({ ...current, file: event.target.files?.[0] ?? null }))}
                  className="rounded-md border border-white/15 bg-white/10 px-3 py-2 text-white file:mr-3 file:rounded-md file:border-0 file:bg-re7-sky file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
                />
              </label>
            ) : null}
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={saving}
              className="rounded-md bg-re7-orange px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Salvando..." : form.id ? "Salvar alterações" : "Adicionar treinamento"}
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-white/5">
          <div className="border-b border-white/10 px-4 py-3">
            <h2 className="text-lg font-semibold">Conteudos cadastrados</h2>
          </div>
          {loading ? (
            <p className="p-4 text-sm text-white/70">Carregando...</p>
          ) : items.length === 0 ? (
            <div className="p-6 text-sm text-white/70">
              <p>Nenhum treinamento cadastrado.</p>
              <button
                type="button"
                onClick={() => resetForm()}
                className="mt-3 rounded-md border border-re7-sky/30 bg-re7-sky/10 px-3 py-2 text-sm text-white hover:bg-re7-sky/20"
              >
                Adicionar treinamento
              </button>
            </div>
          ) : (
            <div className="grid gap-5 p-4">
              {groupedItems.map(([category, categoryItems]) => (
                <div key={category} className="grid gap-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-white/60">{category}</h3>
                  <div className="overflow-x-auto rounded-lg border border-white/10">
                    <table className="min-w-[1040px] w-full text-left text-sm">
                      <thead className="bg-white/10 text-xs uppercase text-white/55">
                        <tr>
                          <th className="px-3 py-2">Titulo</th>
                          <th className="px-3 py-2">Tipo</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2">Ordem</th>
                          <th className="px-3 py-2">Arquivo</th>
                          <th className="px-3 py-2">Atualizado</th>
                          <th className="px-3 py-2">Acoes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {categoryItems.map((item) => (
                          <tr key={item.id} className="border-t border-white/10 align-top">
                            <td className="px-3 py-3">
                              <div className="max-w-sm">
                                <p className="font-semibold text-white">{item.title}</p>
                                <p className="mt-1 line-clamp-2 text-xs text-white/60">{item.description ?? "-"}</p>
                                <p className="mt-1 font-mono text-[11px] text-white/45">{item.contentId}</p>
                              </div>
                            </td>
                            <td className="px-3 py-3">{typeLabel(item.type)}</td>
                            <td className="px-3 py-3">
                              <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
                                item.status === "PUBLISHED"
                                  ? "bg-emerald-500/15 text-emerald-100"
                                  : "bg-amber-500/15 text-amber-100"
                              }`}>
                                {statusLabel(item.status)}
                              </span>
                            </td>
                            <td className="px-3 py-3">{item.sortOrder}</td>
                            <td className="px-3 py-3">
                              <div className="max-w-[220px]">
                                <p className="truncate text-white/80">{item.originalFilename}</p>
                                <p className="text-xs text-white/50">{formatBytes(item.sizeBytes)}</p>
                              </div>
                            </td>
                            <td className="px-3 py-3">{formatDateTime(item.updatedAt)}</td>
                            <td className="px-3 py-3">
                              <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={() => void handlePreview(item)} className="rounded-md border border-white/20 px-2.5 py-1.5 text-xs text-white/80 hover:bg-white/10">
                                  Visualizar
                                </button>
                                <button type="button" onClick={() => setForm(formFromItem(item))} className="rounded-md border border-white/20 px-2.5 py-1.5 text-xs text-white/80 hover:bg-white/10">
                                  Editar
                                </button>
                                <button type="button" onClick={() => void handleStatus(item)} className="rounded-md border border-re7-sky/30 bg-re7-sky/10 px-2.5 py-1.5 text-xs text-white hover:bg-re7-sky/20">
                                  {item.status === "PUBLISHED" ? "Despublicar" : "Publicar"}
                                </button>
                                <button type="button" onClick={() => void handleReplace(item)} className="rounded-md border border-white/20 px-2.5 py-1.5 text-xs text-white/80 hover:bg-white/10">
                                  {replacingId === item.id && replaceFile ? "Enviar arquivo" : "Substituir"}
                                </button>
                                <button type="button" onClick={() => void handleDelete(item)} className="rounded-md border border-red-400/30 bg-red-900/20 px-2.5 py-1.5 text-xs text-red-100 hover:bg-red-900/30">
                                  Excluir
                                </button>
                              </div>
                              {replacingId === item.id ? (
                                <input
                                  type="file"
                                  accept={item.type === "PDF" ? "application/pdf,.pdf" : "video/mp4,.mp4"}
                                  onChange={(event) => setReplaceFile(event.target.files?.[0] ?? null)}
                                  className="mt-2 max-w-xs text-xs text-white/70 file:mr-2 file:rounded-md file:border-0 file:bg-white/15 file:px-2 file:py-1 file:text-xs file:text-white"
                                />
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {preview ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => setPreview(null)}>
          <div className="w-full max-w-5xl rounded-xl border border-white/15 bg-[#081327] p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{preview.item.title}</h2>
                <p className="text-xs text-white/55">{preview.fileName ?? preview.item.originalFilename}</p>
              </div>
              <button type="button" onClick={() => setPreview(null)} className="rounded-md border border-white/20 px-3 py-1.5 text-sm text-white/80 hover:bg-white/10">
                Fechar
              </button>
            </div>
            {preview.item.type === "PDF" ? (
              <iframe src={preview.objectUrl} title={preview.item.title} className="h-[72vh] w-full rounded-lg border border-white/10 bg-white" />
            ) : (
              <video src={preview.objectUrl} controls className="max-h-[72vh] w-full rounded-lg bg-black" />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
