"use client";

import { useState, useEffect, useTransition, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Users, Eye } from "lucide-react";
import LoadingSpinner from "@/components/LoadingSpinner";
import DataTable, { type DataTableColumn } from "@/components/ui/DataTable";
import Button from "@/components/ui/PrimaryButton";
import AddNewClientModal from "@/components/AddNewClientModal";
import * as q from "@/app/actions/query-bridge";
import type { ClientsListPatient } from "@/lib/map-inserted-patient-to-list-row";
import { patientFullName } from "@/lib/patient-name";
import { recordBranchLabel } from "@/lib/agency-branches";
import type { ClientListQuery, ClientListSortKey } from "@/lib/client-list";
import { useAgencyBranchOptions } from "@/hooks/useAgencyBranchOptions";
import { toast } from "sonner";

interface ClientsContentProps {
  clients: ClientsListPatient[];
  totalCount: number;
  activeCount: number;
  totalAllCount: number;
  page: number;
  pageSize: number;
  search: string;
  statusFilter: string;
  branchesEnabled?: boolean;
  branchFilter?: string;
  sortKey?: ClientListSortKey;
  sortDir?: "asc" | "desc";
  error?: string | null;
}

export default function ClientsContent({ clients, totalCount, page, pageSize, search, statusFilter,
  branchesEnabled = false, branchFilter = "", sortKey = "created_at", sortDir = "desc", error = null,
}: ClientsContentProps) {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [navigatingClientId, setNavigatingClientId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [portalMounted, setPortalMounted] = useState(false);
  const navigationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const branchOptions = useAgencyBranchOptions(branchesEnabled);
  const serverQuery = useMemo<ClientListQuery>(() => ({ page, q: search, status: statusFilter, branch: branchFilter, sortKey, sortDir }),
    [page, search, statusFilter, branchFilter, sortKey, sortDir]);
  const serverKey = JSON.stringify(serverQuery);
  const lastServerKey = useRef(serverKey);
  const lastNavigation = useRef<string | null>(null);
  const [query, setQuery] = useState(serverQuery);
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const blocked = isPending || !!navigatingClientId || !!savingId;

  useEffect(() => {
    setPortalMounted(true);
    return () => { if (navigationTimer.current) clearTimeout(navigationTimer.current); };
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(query.q), 400);
    return () => clearTimeout(timer);
  }, [query.q]);
  // DataTable batches filter/sort and page-reset callbacks into one query update.
  // Back/forward navigation restores server state without sending another request.
  useEffect(() => {
    if (lastServerKey.current !== serverKey) {
      lastServerKey.current = serverKey;
      lastNavigation.current = null;
      setQuery(serverQuery);
      setDebouncedSearch(serverQuery.q);
      return;
    }
    if (query.q !== debouncedSearch || JSON.stringify(query) === serverKey) return;
    const params = new URLSearchParams(window.location.search);
    ["page", "q", "status", "branch", "sortKey", "sortDir"].forEach(key => params.delete(key));
    if (query.page > 0) params.set("page", String(query.page));
    if (query.q.trim()) params.set("q", query.q.trim());
    params.set("status", query.status);
    if (branchesEnabled && query.branch) params.set("branch", query.branch);
    if (query.sortKey !== "created_at" || query.sortDir !== "desc") {
      params.set("sortKey", query.sortKey);
      params.set("sortDir", query.sortDir);
    }
    const destination = `?${params.toString()}`;
    if (lastNavigation.current === destination) return;
    lastNavigation.current = destination;
    startTransition(() => router.push(destination, { scroll: false }));
  }, [serverKey, serverQuery, query, debouncedSearch, branchesEnabled, router]);

  const changeQuery = (values: Partial<ClientListQuery>) => setQuery(current => ({ ...current, ...values }));
  const refresh = () => startTransition(() => router.refresh());
  const openClient = (clientId: string) => {
    if (blocked) return;
    setNavigatingClientId(clientId);
    navigationTimer.current = setTimeout(() => setNavigatingClientId(null), 25_000);
    startTransition(() => router.push(`/pages/agency/clients/${clientId}`));
  };
  const toggleStatus = async (client: ClientsListPatient) => {
    if (blocked) return;
    setSavingId(client.id);
    try {
      const result = await q.updatePatientStatus(client.id, client.status === "active" ? "inactive" : "active");
      if (result.error) { toast.error("Unable to update client status. Please try again."); return; }
      refresh();
    } catch {
      toast.error("Unable to update client status. Please try again.");
    } finally { setSavingId(null); }
  };
  const initials = (name: string) => name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  const representative = (client: ClientsListPatient, index: number) => {
    const person = client.patients_representatives[index];
    return person ? <span className="block"><span className="block">{person.name}</span>
      <span className="block text-xs text-gray-500">{person.relationship} {person.phone_number && `(${person.phone_number})`}</span></span> : "—";
  };
  const columns: DataTableColumn<ClientsListPatient>[] = [
    { key: "name", label: "Client", sortable: true, render: client => <span className="flex items-center gap-3 whitespace-nowrap">
      <span className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold text-sm">{initials(patientFullName(client))}</span>
      <span><span className="block text-sm font-medium text-gray-900">{patientFullName(client)}</span>
        <span className="block text-sm text-gray-500">Age {client.age || "N/A"}</span></span></span> },
    { key: "gender", label: "Gender", sortable: true, render: client => client.gender || "N/A" },
    { key: "class", label: "Class", sortable: true, render: client => client.class
      ? <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full">{client.class}</span> : "N/A" },
    { key: "phone", label: "Patient Phone", sortable: true, render: client => client.phone_number?.trim() || "—" },
    { key: "emergency_contact", label: "Emergency Contact", sortable: true, render: client => client.emergency_contact_name?.trim()
      ? <span className="block"><span className="block">{client.emergency_contact_name}</span><span className="block text-xs text-gray-500">{client.emergency_phone?.trim() || "No phone"}</span></span> : "—" },
    { key: "representative_1", label: "Representative #1", sortable: true, render: client => representative(client, 0) },
    branchesEnabled ? { key: "branch_name", label: "Branch", sortable: true, render: recordBranchLabel }
      : { key: "representative_2", label: "Representative #2", sortable: true, render: client => representative(client, 1) },
    { key: "status", label: "Status", sortable: true, retainEmphasis: true, render: client =>
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${client.status === "active" ? "bg-green-100 text-green-700" : client.status === "pending" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-500"}`}>
        {client.status === "active" ? "Active" : client.status === "pending" ? "Intake" : "Inactive"}</span> },
  ];
  const choices = branchOptions.result?.success ? branchOptions.result.data : [];
  const branchFilters = branchesEnabled ? [{ key: "branch", label: "Filter clients by branch", value: query.branch,
    options: [{ value: "", label: "All branches" }, ...choices.map(branch => ({ value: branch.id, label: branch.name + (branch.status !== "active" ? " (inactive)" : "") })),
      ...(query.branch && !choices.some(branch => branch.id === query.branch) ? [{ value: query.branch, label: "Selected branch" }] : [])],
    onChange: (branch: string) => changeQuery({ branch }) }] : [];

  return <div className="space-y-6">
    {portalMounted && navigatingClientId && createPortal(<div aria-busy="true" aria-live="polite"><LoadingSpinner overlayZClass="z-[200]" /></div>, document.body)}
    <div><h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Users className="w-7 h-7 text-blue-600" />Client Management</h1>
      <p className="text-sm text-gray-600 mt-1">Manage your clients and their care plans</p></div>
    <div className="flex flex-wrap items-center gap-3">
      <div className="inline-flex bg-gray-100 rounded-xl p-1 gap-1" aria-label="Client status">
        {(["active", "pending", "inactive", "all"] as const).map(status => <button key={status} type="button" disabled={blocked} aria-pressed={query.status === status}
          onClick={() => changeQuery({ status, page: 0 })}
          className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${query.status === status ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
          {status === "all" ? "All" : status === "pending" ? "Intake" : status.charAt(0).toUpperCase() + status.slice(1)}</button>)}
      </div>
      {branchesEnabled && branchOptions.loading && <p role="status" className="text-sm text-gray-500">Loading branch choices…</p>}
      {branchesEnabled && !branchOptions.loading && branchOptions.result && !branchOptions.result.success &&
        <div role="alert" className="text-sm text-danger">Unable to load branch choices. <Button type="button" variant="secondary" size="sm" onClick={branchOptions.retry}>Retry branch choices</Button></div>}
    </div>
    <DataTable label="Clients" entityLabel="clients" rows={clients} columns={columns} getRowKey={client => client.id} getRowLabel={patientFullName}
      pagination={{ page, pageSize, totalCount, onPageChange: next => changeQuery({ page: next }) }}
      search={{ value: query.q, onChange: value => changeQuery({ q: value }), placeholder: "Search clients by name, email, or phone..." }} filters={branchFilters}
      sort={{ value: { key: query.sortKey, dir: query.sortDir }, onChange: key => changeQuery({ sortKey: key as ClientListSortKey, sortDir: query.sortKey === key && query.sortDir === "asc" ? "desc" : "asc" }) }}
      addAction={{ label: "Add New Client", onClick: () => setIsModalOpen(true) }} onRefresh={refresh} onRetry={refresh}
      loading={isPending} disabled={blocked} error={error}
      rowNavigation={{ columnKey: "name", onOpen: client => openClient(client.id) }}
      rowActions={client => [{ label: "View Details", icon: Eye, href: `/pages/agency/clients/${client.id}` },
        { label: client.status === "active" ? "Deactivate" : "Activate", onClick: () => toggleStatus(client), destructive: client.status === "active", positive: client.status !== "active" }]} />
    <AddNewClientModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSuccess={() => { setIsModalOpen(false); refresh(); }} />
  </div>;
}
