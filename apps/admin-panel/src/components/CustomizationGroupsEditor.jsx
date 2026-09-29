import React from 'react';
import { Plus, Trash2 } from 'lucide-react';

const makeId = () => globalThis.crypto?.randomUUID?.() || `choice-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export default function CustomizationGroupsEditor({ value = [], onChange, inherited = false }) {
  const groups = Array.isArray(value) ? value : [];
  const updateGroup = (index, patch) => onChange(groups.map((group, i) => i === index ? { ...group, ...patch } : group));
  const updateOption = (groupIndex, optionIndex, patch) => onChange(groups.map((group, i) => i !== groupIndex ? group : {
    ...group,
    options: (group.options || []).map((option, j) => j === optionIndex ? { ...option, ...patch } : option),
  }));

  return (
    <div className="space-y-3">
      {inherited && <p className="text-xs text-slate-500">These choices are added to the options inherited from the selected category.</p>}
      {groups.map((group, groupIndex) => (
        <div key={group.id || groupIndex} className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px_auto]">
            <input value={group.name || ''} onChange={event => updateGroup(groupIndex, { name: event.target.value })} placeholder="Group name (e.g. Neck style)" maxLength={80} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <select value={group.selectionType || 'SINGLE'} onChange={event => updateGroup(groupIndex, { selectionType: event.target.value })} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <option value="SINGLE">Choose one</option>
              <option value="MULTIPLE">Choose any</option>
            </select>
            <button type="button" onClick={() => onChange(groups.filter((_, i) => i !== groupIndex))} className="inline-flex items-center justify-center rounded-lg border border-red-100 px-3 py-2 text-red-600 hover:bg-red-50" title="Remove group"><Trash2 className="h-4 w-4" /></button>
          </div>
          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600"><input type="checkbox" checked={Boolean(group.required)} onChange={event => updateGroup(groupIndex, { required: event.target.checked })} />Customer must choose an option</label>
          <div className="space-y-2">
            {(group.options || []).map((option, optionIndex) => (
              <div key={option.id || optionIndex} className="grid grid-cols-[1fr_110px_auto] gap-2">
                <input value={option.name || ''} onChange={event => updateOption(groupIndex, optionIndex, { name: event.target.value })} placeholder="Choice name" maxLength={80} className="min-w-0 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                <label className="relative"><span className="absolute left-2 top-2 text-xs text-slate-400">₹</span><input type="number" min="0" step="0.01" value={option.price ?? 0} onChange={event => updateOption(groupIndex, optionIndex, { price: event.target.value })} aria-label="Additional price" className="w-full rounded-lg border border-slate-200 py-2 pl-6 pr-2 text-sm" /></label>
                <button type="button" onClick={() => updateGroup(groupIndex, { options: (group.options || []).filter((_, i) => i !== optionIndex) })} className="rounded-lg px-2 text-slate-400 hover:bg-slate-50 hover:text-red-600" title="Remove choice"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <button type="button" onClick={() => updateGroup(groupIndex, { options: [...(group.options || []), { id: makeId(), name: '', price: 0 }] })} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"><Plus className="h-3.5 w-3.5" />Add choice</button>
          </div>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...groups, { id: makeId(), name: '', selectionType: 'SINGLE', required: false, options: [{ id: makeId(), name: '', price: 0 }] }])} className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs font-bold text-brand-700 hover:bg-brand-100"><Plus className="h-3.5 w-3.5" />Add option group</button>
    </div>
  );
}
