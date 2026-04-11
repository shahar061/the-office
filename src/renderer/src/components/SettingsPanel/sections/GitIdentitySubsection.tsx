import React, { useEffect, useState } from 'react';
import type { GitIdentity } from '@shared/types';
import { useSettingsStore } from '../../../stores/settings.store';
import { colors } from '../../../theme';

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  header: {
    fontSize: '14px',
    fontWeight: 700 as const,
    color: colors.text,
  },
  description: {
    fontSize: '11px',
    color: colors.textMuted,
    marginBottom: '4px',
  },
  list: {
    display: 'flex',
    flexDirection: 'column' as const,
    border: `1px solid ${colors.border}`,
    borderRadius: '6px',
    overflow: 'hidden',
  },
  row: (selected: boolean, hovered: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 14px 12px 16px',
    borderBottom: `1px solid ${colors.borderLight}`,
    fontSize: '12px',
    cursor: selected ? 'default' : 'pointer',
    background: selected
      ? 'rgba(59, 130, 246, 0.08)'
      : hovered
        ? 'rgba(148, 163, 184, 0.04)'
        : 'transparent',
    boxShadow: selected ? `inset 3px 0 0 ${colors.accent}` : 'none',
    transition: 'background 150ms ease, box-shadow 150ms ease',
  }),
  rowLast: {
    borderBottom: 'none',
  },
  radioWrap: {
    position: 'relative' as const,
    width: '14px',
    height: '14px',
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hiddenRadio: {
    position: 'absolute' as const,
    opacity: 0,
    pointerEvents: 'none' as const,
    width: 0,
    height: 0,
    margin: 0,
  },
  indicator: (selected: boolean, rowHovered: boolean) => ({
    width: '14px',
    height: '14px',
    borderRadius: '3px',
    background: selected ? colors.accent : colors.bgDark,
    border: `1px solid ${
      selected ? colors.accent : rowHovered ? colors.textMuted : colors.border
    }`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box' as const,
    transition: 'background 150ms ease, border-color 150ms ease',
  }),
  indicatorDot: {
    width: '4px',
    height: '4px',
    background: colors.text,
  },
  label: (selected: boolean) => ({
    fontWeight: selected ? 700 : 600,
    color: colors.text,
    minWidth: '100px',
  }),
  meta: {
    color: colors.textMuted,
    fontFamily: 'monospace',
    fontSize: '11px',
    flex: 1,
  },
  defaultPill: {
    fontSize: '9px',
    fontWeight: 700 as const,
    letterSpacing: '0.5px',
    color: colors.accent,
    background: 'rgba(59, 130, 246, 0.12)',
    padding: '2px 6px',
    borderRadius: '3px',
    textTransform: 'uppercase' as const,
    marginRight: '4px',
  },
  iconBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: colors.textMuted,
    fontSize: '13px',
    padding: '2px 6px',
  },
  addBtn: {
    alignSelf: 'flex-start',
    background: 'rgba(59, 130, 246, 0.1)',
    border: `1px solid ${colors.accent}`,
    borderRadius: '4px',
    color: colors.accent,
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 600 as const,
    padding: '6px 14px',
    fontFamily: 'inherit',
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    padding: '12px',
    background: colors.bgDark,
    border: `1px solid ${colors.border}`,
    borderRadius: '6px',
  },
  input: {
    padding: '6px 10px',
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: '4px',
    color: colors.text,
    fontSize: '12px',
    fontFamily: 'inherit',
  },
  formButtons: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
  },
  saveBtn: {
    background: colors.accent,
    border: 'none',
    borderRadius: '4px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: 600 as const,
    padding: '6px 12px',
    fontFamily: 'inherit',
  },
  cancelBtn: {
    background: 'transparent',
    border: `1px solid ${colors.border}`,
    borderRadius: '4px',
    color: colors.textMuted,
    cursor: 'pointer',
    fontSize: '11px',
    padding: '6px 12px',
    fontFamily: 'inherit',
  },
  importPrompt: {
    padding: '12px',
    background: 'rgba(59, 130, 246, 0.05)',
    border: `1px solid rgba(59, 130, 246, 0.3)`,
    borderRadius: '6px',
    fontSize: '12px',
    color: colors.text,
  },
  deleteConfirm: {
    padding: '12px',
    background: 'rgba(239, 68, 68, 0.08)',
    border: `1px solid rgba(239, 68, 68, 0.3)`,
    borderRadius: '6px',
    fontSize: '12px',
    color: '#fca5a5',
  },
  deleteButtons: {
    display: 'flex',
    gap: '8px',
    marginTop: '8px',
  },
};

interface IdentityForm {
  label: string;
  name: string;
  email: string;
}

const EMPTY_FORM: IdentityForm = { label: '', name: '', email: '' };

export function GitIdentitySubsection() {
  const settings = useSettingsStore((s) => s.settings);
  const identities = settings?.gitIdentities ?? [];
  const defaultId = settings?.defaultGitIdentityId ?? null;

  const [importCandidate, setImportCandidate] = useState<{ name: string; email: string } | null>(null);
  const [importChecked, setImportChecked] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [form, setForm] = useState<IdentityForm>(EMPTY_FORM);

  // On first mount with no identities, try to import from gitconfig
  useEffect(() => {
    if (importChecked || identities.length > 0) return;
    setImportChecked(true);
    (async () => {
      try {
        const result = await window.office.importGitconfigIdentity();
        if (result) setImportCandidate(result);
      } catch {
        // Ignore
      }
    })();
  }, [importChecked, identities.length]);

  async function handleImport() {
    if (!importCandidate) return;
    await window.office.addGitIdentity({
      label: 'Imported',
      name: importCandidate.name,
      email: importCandidate.email,
    });
    setImportCandidate(null);
  }

  function startAdd() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setAddOpen(true);
    setImportCandidate(null);
  }

  function startEdit(identity: GitIdentity) {
    setForm({ label: identity.label, name: identity.name, email: identity.email });
    setEditingId(identity.id);
    setAddOpen(true);
  }

  function cancelForm() {
    setAddOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function saveForm() {
    if (!form.label.trim() || !form.name.trim() || !form.email.trim()) return;
    if (editingId) {
      await window.office.updateGitIdentity(editingId, {
        label: form.label.trim(),
        name: form.name.trim(),
        email: form.email.trim(),
      });
    } else {
      await window.office.addGitIdentity({
        label: form.label.trim(),
        name: form.name.trim(),
        email: form.email.trim(),
      });
    }
    cancelForm();
  }

  function startDelete(id: string) {
    setDeleteConfirmId(id);
  }

  async function confirmDelete(id: string) {
    await window.office.deleteGitIdentity(id);
    setDeleteConfirmId(null);
  }

  async function setAsDefault(id: string) {
    await window.office.setDefaultGitIdentity(id);
  }

  if (!settings) {
    return <div style={{ color: colors.textMuted, fontStyle: 'italic' }}>Loading…</div>;
  }

  return (
    <div style={styles.root}>
      <div style={styles.header}>Git Identity</div>
      <div style={styles.description}>Who The Office commits as on your behalf.</div>

      {/* Import prompt */}
      {identities.length === 0 && importCandidate && (
        <div style={styles.importPrompt}>
          No identities yet. Import from <code>~/.gitconfig</code>?
          <br />
          Found: <strong>{importCandidate.name}</strong> &lt;{importCandidate.email}&gt;
          <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
            <button style={styles.saveBtn} onClick={handleImport}>
              Import
            </button>
            <button style={styles.cancelBtn} onClick={startAdd}>
              Add manually
            </button>
          </div>
        </div>
      )}

      {/* Identities list */}
      {identities.length > 0 && (
        <div style={styles.list} role="radiogroup" aria-label="Default git identity">
          {identities.map((identity, idx) => (
            <IdentityRow
              key={identity.id}
              identity={identity}
              isDefault={defaultId === identity.id}
              isLast={idx === identities.length - 1}
              onSetDefault={() => setAsDefault(identity.id)}
              onEdit={() => startEdit(identity)}
              onDelete={() => startDelete(identity.id)}
            />
          ))}
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirmId && (
        <div style={styles.deleteConfirm}>
          Delete this identity? Projects currently assigned to it will fall back to the default.
          This can't be undone.
          <div style={styles.deleteButtons}>
            <button style={styles.cancelBtn} onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </button>
            <button
              style={{ ...styles.saveBtn, background: '#ef4444' }}
              onClick={() => confirmDelete(deleteConfirmId)}
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Add / edit form */}
      {addOpen && (
        <div style={styles.form}>
          <input
            style={styles.input}
            placeholder="Label (e.g. Work)"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
          />
          <input
            style={styles.input}
            placeholder="Name (e.g. Jane Doe)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            style={styles.input}
            placeholder="Email (e.g. jane@acme.com)"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <div style={styles.formButtons}>
            <button style={styles.cancelBtn} onClick={cancelForm}>
              Cancel
            </button>
            <button style={styles.saveBtn} onClick={saveForm}>
              Save
            </button>
          </div>
        </div>
      )}

      {/* Add button when not already showing the form */}
      {!addOpen && identities.length > 0 && (
        <button style={styles.addBtn} onClick={startAdd}>
          + Add identity
        </button>
      )}

      {/* "Add manually" shortcut when no identities and no import candidate */}
      {identities.length === 0 && !importCandidate && !addOpen && (
        <button style={styles.addBtn} onClick={startAdd}>
          + Add identity
        </button>
      )}
    </div>
  );
}

interface IdentityRowProps {
  identity: GitIdentity;
  isDefault: boolean;
  isLast: boolean;
  onSetDefault: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function IdentityRow({
  identity,
  isDefault,
  isLast,
  onSetDefault,
  onEdit,
  onDelete,
}: IdentityRowProps) {
  const [hovered, setHovered] = useState(false);

  const handleRowClick = (e: React.MouseEvent) => {
    // Don't hijack clicks on inner buttons (edit/delete)
    if ((e.target as HTMLElement).closest('button')) return;
    if (!isDefault) onSetDefault();
  };

  return (
    <div
      style={{
        ...styles.row(isDefault, hovered),
        ...(isLast ? styles.rowLast : {}),
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleRowClick}
    >
      <label style={styles.radioWrap} title="Set as default">
        <input
          type="radio"
          name="default-git-identity"
          checked={isDefault}
          onChange={onSetDefault}
          style={styles.hiddenRadio}
        />
        <span style={styles.indicator(isDefault, hovered)}>
          {isDefault && <span style={styles.indicatorDot} />}
        </span>
      </label>
      <span style={styles.label(isDefault)}>{identity.label}</span>
      <span style={styles.meta}>
        {identity.name} · {identity.email}
      </span>
      {isDefault && <span style={styles.defaultPill}>Default</span>}
      <button style={styles.iconBtn} onClick={onEdit} title="Edit">
        ✎
      </button>
      <button style={styles.iconBtn} onClick={onDelete} title="Delete">
        🗑
      </button>
    </div>
  );
}
