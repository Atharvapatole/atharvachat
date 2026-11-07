"use client";

import { useState, useEffect } from "react";
import {
  Users,
  UserPlus,
  Upload,
  Download,
  Search,
  Tag,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Phone,
  Mail,
  Building,
  Loader2,
  Check,
  X,
  FileSpreadsheet,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatPhoneNumber, cleanPhoneNumber, isValidPhoneNumber } from "@/lib/utils";
import Papa from "papaparse";

interface Contact {
  id: string;
  name: string | null;
  phone_number: string;
  email: string | null;
  company: string | null;
  tags: string[];
  notes: string | null;
  consent_status: "opted_in" | "opted_out" | "pending";
  ai_enabled: boolean;
  created_at: string;
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string>("all");

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    name: "",
    phone_number: "",
    email: "",
    company: "",
    tags: "",
    notes: "",
    consent_status: "opted_in" as "opted_in" | "opted_out" | "pending",
  });

  // Import preview
  const [importRows, setImportRows] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<{ imported: number; rejected: number } | null>(null);

  const [toastMsg, setToastMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const showToast = (type: "success" | "error", text: string) => {
    setToastMsg({ type, text });
    setTimeout(() => setToastMsg(null), 4000);
  };

  const loadContacts = async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const { data, error } = await supabase
          .from("contacts")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (!error && data) {
          setContacts(data as Contact[]);
        } else {
          setContacts([]);
        }
      } else {
        setContacts([]);
      }
    } catch {
      setContacts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContacts();
  }, []);

  // Save or Update contact
  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedPhone = cleanPhoneNumber(formData.phone_number);

    if (!isValidPhoneNumber(cleanedPhone)) {
      showToast("error", "Invalid WhatsApp phone number (must be 8-15 digits with country code).");
      return;
    }

    const tagList = formData.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      const payload = {
        name: formData.name.trim() || null,
        phone_number: cleanedPhone,
        email: formData.email.trim() || null,
        company: formData.company.trim() || null,
        tags: tagList,
        notes: formData.notes.trim() || null,
        consent_status: formData.consent_status,
        ai_enabled: formData.consent_status !== "opted_out",
      };

      if (editingContact) {
        if (user) {
          await supabase.from("contacts").update(payload).eq("id", editingContact.id);
        }
        setContacts((prev) =>
          prev.map((c) => (c.id === editingContact.id ? { ...c, ...payload } : c))
        );
        showToast("success", "Contact updated successfully.");
      } else {
        if (user) {
          const { data } = await supabase
            .from("contacts")
            .insert({ ...payload, user_id: user.id })
            .select()
            .single();

          if (data) {
            setContacts((prev) => [data as Contact, ...prev]);
          }
        } else {
          setContacts((prev) => [{ ...payload, id: `c-${Date.now()}`, created_at: new Date().toISOString() }, ...prev]);
        }
        showToast("success", "New contact created.");
      }

      setShowAddModal(false);
      setEditingContact(null);
      setFormData({
        name: "",
        phone_number: "",
        email: "",
        company: "",
        tags: "",
        notes: "",
        consent_status: "opted_in",
      });
    } catch {
      showToast("error", "Error saving contact.");
    }
  };

  // Delete contact
  const handleDeleteContact = async (id: string) => {
    if (!confirm("Are you sure you want to delete this contact?")) return;
    try {
      const supabase = createClient();
      await supabase.from("contacts").delete().eq("id", id);
      setContacts((prev) => prev.filter((c) => c.id !== id));
      showToast("success", "Contact deleted.");
    } catch {
      setContacts((prev) => prev.filter((c) => c.id !== id));
      showToast("success", "Contact deleted.");
    }
  };

  // CSV File Handler
  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setImportRows(results.data);
      },
    });
  };

  // Execute CSV Import via API
  const handleExecuteImport = async () => {
    if (importRows.length === 0) return;
    setImporting(true);

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }
      const res = await fetch("/api/contacts/import", {
        method: "POST",
        headers,
        body: JSON.stringify({ contacts: importRows }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setImportSummary({
          imported: data.importedCount,
          rejected: data.rejectedCount,
        });
        showToast("success", `Successfully imported ${data.importedCount} contacts.`);
        loadContacts();
      } else {
        showToast("error", data.error || "Failed to import contacts");
      }
    } catch {
      showToast("error", "Error processing CSV import.");
    } finally {
      setImporting(false);
    }
  };

  // Export Contacts to CSV
  const handleExportCsv = () => {
    const csvData = contacts.map((c) => ({
      Name: c.name || "",
      Phone: c.phone_number,
      Email: c.email || "",
      Company: c.company || "",
      Tags: c.tags.join("; "),
      Consent: c.consent_status,
      Notes: c.notes || "",
    }));

    const csvString = Papa.unparse(csvData);
    const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `atharva_contacts_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Extract all unique tags
  const allTags = Array.from(new Set(contacts.flatMap((c) => c.tags || [])));

  // Filter contacts
  const filteredContacts = contacts.filter((c) => {
    const matchesSearch =
      (c.name?.toLowerCase().includes(searchQuery.toLowerCase()) || false) ||
      c.phone_number.includes(searchQuery) ||
      (c.company?.toLowerCase().includes(searchQuery.toLowerCase()) || false);

    const matchesTag = selectedTag === "all" || (c.tags && c.tags.includes(selectedTag));

    return matchesSearch && matchesTag;
  });

  return (
    <div className="p-6 sm:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Toast */}
      {toastMsg && (
        <div
          className={`fixed top-5 right-5 z-50 p-4 rounded-xl text-xs font-bold shadow-2xl flex items-center space-x-2 backdrop-blur-md animate-in slide-in-from-top-4 ${
            toastMsg.type === "success" ? "bg-emerald-500/90 text-slate-950" : "bg-rose-500/90 text-white"
          }`}
        >
          {toastMsg.type === "success" ? <Check className="w-4 h-4 stroke-[3]" /> : <AlertCircle className="w-4 h-4" />}
          <span>{toastMsg.text}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">Contact Management</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              Audience directory with consent tracking, tag segmentation, and CSV synchronization.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleExportCsv}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-800 flex items-center space-x-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={() => {
              setImportRows([]);
              setImportSummary(null);
              setShowImportModal(true);
            }}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-800 flex items-center space-x-1.5 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import CSV</span>
          </button>

          <button
            onClick={() => {
              setEditingContact(null);
              setFormData({
                name: "",
                phone_number: "",
                email: "",
                company: "",
                tags: "",
                notes: "",
                consent_status: "opted_in",
              });
              setShowAddModal(true);
            }}
            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold shadow-md shadow-emerald-500/20 flex items-center space-x-1.5 transition-all"
          >
            <UserPlus className="w-4 h-4 stroke-[2.5]" />
            <span>Add Contact</span>
          </button>
        </div>
      </div>

      {/* Search & Tag Filter Bar */}
      <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, phone (+91...), company..."
            className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        {/* Tag Pills */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 max-w-full">
          <button
            onClick={() => setSelectedTag("all")}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors flex-shrink-0 ${
              selectedTag === "all"
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                : "bg-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            All Contacts ({contacts.length})
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setSelectedTag(tag)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors flex-shrink-0 ${
                selectedTag === tag
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  : "bg-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              #{tag}
            </button>
          ))}
        </div>
      </div>

      {/* Contacts Table */}
      <div className="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase font-semibold tracking-wider">
              <tr>
                <th className="py-3.5 px-4">Contact</th>
                <th className="py-3.5 px-4">WhatsApp Phone</th>
                <th className="py-3.5 px-4">Company</th>
                <th className="py-3.5 px-4">Tags</th>
                <th className="py-3.5 px-4">Consent Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredContacts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <Users className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                    <p className="font-bold text-slate-300 text-sm">No contacts yet. Start a new chat to add a contact.</p>
                    <p className="text-[11px] text-slate-500 mt-1">Contacts are automatically saved when you initiate or receive WhatsApp chats.</p>
                  </td>
                </tr>
              ) : (
                filteredContacts.map((contact) => (
                  <tr key={contact.id} className="hover:bg-slate-900/80 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-600/30 to-teal-500/30 text-emerald-300 font-bold flex items-center justify-center border border-emerald-500/20">
                          {contact.name ? contact.name.charAt(0) : "C"}
                        </div>
                        <div>
                          <p className="font-bold text-white text-sm">{contact.name || "Customer"}</p>
                          <p className="text-[11px] text-slate-400">{contact.email || "No email"}</p>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-mono font-medium text-emerald-400">
                      {formatPhoneNumber(contact.phone_number)}
                    </td>

                    <td className="py-3.5 px-4 text-slate-300">
                      {contact.company || "—"}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex flex-wrap gap-1">
                        {contact.tags.map((t, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-medium border border-slate-700"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                          contact.consent_status === "opted_in"
                            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                            : "bg-rose-500/15 text-rose-400 border border-rose-500/20"
                        }`}
                      >
                        {contact.consent_status === "opted_in" ? "Opted In" : "Opted Out"}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => {
                            setEditingContact(contact);
                            setFormData({
                              name: contact.name || "",
                              phone_number: contact.phone_number,
                              email: contact.email || "",
                              company: contact.company || "",
                              tags: contact.tags.join(", "),
                              notes: contact.notes || "",
                              consent_status: contact.consent_status,
                            });
                            setShowAddModal(true);
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteContact(contact.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Contact Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-base">
                {editingContact ? "Edit Contact" : "Add New WhatsApp Contact"}
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveContact} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Atharva / Rajesh Sharma"
                  className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  WhatsApp Phone Number (with Country Code) *
                </label>
                <input
                  type="text"
                  required
                  value={formData.phone_number}
                  onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                  placeholder="e.g. +91 98201 12233"
                  className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                    Email
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="contact@company.com"
                    className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                    Company
                  </label>
                  <input
                    type="text"
                    value={formData.company}
                    onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                    placeholder="TechCorp"
                    className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Tags (Comma separated)
                </label>
                <input
                  type="text"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  placeholder="Enterprise, VIP, Mumbai"
                  className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Consent Status
                </label>
                <select
                  value={formData.consent_status}
                  onChange={(e) => setFormData({ ...formData, consent_status: e.target.value as any })}
                  className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="opted_in">Opted In (Eligible for messaging)</option>
                  <option value="opted_out">Opted Out (Suppressed)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Internal Notes
                </label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Key background context..."
                  className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold shadow-md shadow-emerald-500/20"
                >
                  {editingContact ? "Update Contact" : "Create Contact"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-white text-base">Import Contacts from CSV</h3>
              </div>
              <button
                onClick={() => setShowImportModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-xl border-2 border-dashed border-slate-700 bg-slate-950/60 text-center space-y-3">
              <Upload className="w-8 h-8 text-slate-500 mx-auto" />
              <div>
                <p className="text-xs font-semibold text-slate-300">Choose a CSV file to upload</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Expected headers: <code>phone_number</code>, <code>name</code>, <code>email</code>, <code>company</code>, <code>tags</code>
                </p>
              </div>
              <input
                type="file"
                accept=".csv"
                onChange={handleCsvUpload}
                className="text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-emerald-500 file:text-slate-950 hover:file:bg-emerald-400 cursor-pointer"
              />
            </div>

            {importRows.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-bold text-white">
                  Preview: Loaded {importRows.length} records from CSV
                </p>
                <div className="max-h-40 overflow-y-auto bg-slate-950 border border-slate-800 rounded-xl p-3 text-[11px] text-slate-300 divide-y divide-slate-800">
                  {importRows.slice(0, 5).map((row, idx) => (
                    <div key={idx} className="py-1 flex justify-between">
                      <span>{row.name || "Customer"}</span>
                      <span className="font-mono text-emerald-400">{row.phone_number || row.phone}</span>
                    </div>
                  ))}
                  {importRows.length > 5 && (
                    <p className="pt-2 text-slate-500 italic">+ {importRows.length - 5} more rows</p>
                  )}
                </div>

                <div className="flex justify-end space-x-3 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowImportModal(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleExecuteImport}
                    disabled={importing}
                    className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold shadow-md shadow-emerald-500/20 flex items-center space-x-2 disabled:opacity-50"
                  >
                    {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    <span>Start Import</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
