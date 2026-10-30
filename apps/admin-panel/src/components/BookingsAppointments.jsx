import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar, Home, Clock, User, Phone, Mail, Package, ChevronLeft, ChevronRight,
  RefreshCw, CheckCircle, XCircle, AlertCircle, MapPin, Scissors, Edit3, Save, X,
  FileText, Truck, Star, Eye, SlidersHorizontal, ArrowRight, Loader2, BadgeCheck,
  Ban, ClipboardList, UserCheck, Tag, IndianRupee, Ruler, ChevronDown, ChevronUp,
  ShoppingBag, Navigation, CheckCircle2, Circle, RotateCcw, Plus, Minus, ShoppingCart, Sparkles
} from 'lucide-react';
import api from '../utils/api';

// ─── Utilities ─────────────────────────────────────────────────────────────────
const isSameDay = (d1, d2) => {
  const a = new Date(d1), b = new Date(d2);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
};
const fmtDate = (d, opts = {}) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', ...opts });
const fmtCurrency = n => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
const formatOrderId = (inv) => inv ? String(inv).replace(/^INV-/i, 'ORD-') : (inv || '');

// ─── Delivery stages ──────────────────────────────────────────────────────────
const STAGES = [
  { key: 'PENDING', label: 'Order Placed', sub: 'Awaiting confirmation', color: '#f59e0b', Icon: ShoppingBag },
  { key: 'PAID', label: 'Measurement Session', sub: 'Fitting appointment set', color: '#8b5cf6', Icon: Clock },
  { key: 'PROCESSING', label: 'Stitching', sub: 'Artisans working', color: '#3b82f6', Icon: Package },
  { key: 'SHIPPED', label: 'Product Ready', sub: 'Custom stitching complete', color: '#0891b2', Icon: MapPin },
  { key: 'OUT_FOR_DELIVERY', label: 'Out for Delivery', sub: 'Delivery on the way', color: '#059669', Icon: Navigation },
  { key: 'DELIVERED', label: 'Delivered', sub: 'Customer received', color: '#16a34a', Icon: CheckCircle2 },
];
const HAPPY = STAGES.map(s => s.key);

// ─── Status colours ───────────────────────────────────────────────────────────
const APPT_COLOR = {
  PENDING: 'bg-amber-50  text-amber-700  border-amber-300',
  CONFIRMED: 'bg-emerald-50 text-emerald-700 border-emerald-300',
  COMPLETED: 'bg-blue-50   text-blue-700   border-blue-300',
  CONSULTED: 'bg-teal-50   text-teal-700   border-teal-300',
  ORDERED:   'bg-indigo-50 text-indigo-700 border-indigo-300',
  CANCELLED: 'bg-red-50    text-red-700    border-red-300',
  RESCHEDULED: 'bg-purple-50 text-purple-700 border-purple-300',
  ASSIGNED: 'bg-indigo-50 text-indigo-700 border-indigo-300',
};
const DOT_COLOR = {
  PENDING: 'bg-amber-400', CONFIRMED: 'bg-emerald-400', COMPLETED: 'bg-blue-400',
  CONSULTED: 'bg-teal-400', ORDERED: 'bg-indigo-500',
  CANCELLED: 'bg-red-400', RESCHEDULED: 'bg-purple-400', ASSIGNED: 'bg-indigo-400',
};
const Badge = ({ status, small }) => (
  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold border ${small ? 'text-[10px]' : 'text-[11px]'} ${APPT_COLOR[status] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
    <span className={`w-1.5 h-1.5 rounded-full ${DOT_COLOR[status] || 'bg-slate-400'}`} />
    {status?.replace(/_/g, ' ')}
  </span>
);

// ─── Measurement fields config ────────────────────────────────────────────────
const MEAS_FIELDS = [
  { key: 'fullLength', label: 'Full Length', unit: 'in' },
  { key: 'shoulderWidth', label: 'Shoulder Width', unit: 'in' },
  { key: 'upperChest', label: 'Upper Chest', unit: 'in' },
  { key: 'bust', label: 'Bust', unit: 'in' },
  { key: 'waist', label: 'Waist', unit: 'in' },
  { key: 'hip', label: 'Hip', unit: 'in' },
  { key: 'armLength', label: 'Arm Length', unit: 'in' },
  { key: 'sleeveLength', label: 'Sleeve Length', unit: 'in' },
  { key: 'neck', label: 'Neck', unit: 'in' },
  { key: 'skirtLength', label: 'Skirt Length', unit: 'in' },
  { key: 'pantLength', label: 'Pant Length', unit: 'in' },
];
const EMPTY_MEAS = () => Object.fromEntries(MEAS_FIELDS.map(f => [f.key, '']));

// ─── DayNavigator ─────────────────────────────────────────────────────────────
function DayNavigator({ value, onChange, appointments = [], visits = [], orders = [], section = 'fittings' }) {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(value); d.setDate(value.getDate() - 3 + i); return d; });
  
  const localDateStr = `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;

  const getDayStats = (dateObj) => {
    let total = 0;
    let newCount = 0;

    if (section === 'fittings') {
      appointments.forEach(a => {
        if (a.status === 'CANCELLED' || a.productType === 'SLOT_BOOKING') return;
        if (isSameDay(a.date, dateObj)) {
          total++;
          if (a.status === 'PENDING' || a.status === 'CONFIRMED') newCount++;
        }
      });
    } else if (section === 'home') {
      visits.forEach(v => {
        if (v.status === 'CANCELLED') return;
        const vDate = v.preferredDate || v.createdAt;
        if (isSameDay(vDate, dateObj)) {
          total++;
          if (v.status === 'PENDING' || v.status === 'ASSIGNED') newCount++;
        }
      });
    } else if (section === 'slots') {
      appointments.forEach(a => {
        if (a.status === 'CANCELLED' || a.productType !== 'SLOT_BOOKING') return;
        if (isSameDay(a.date, dateObj)) {
          total++;
          if (a.status === 'PENDING' || a.status === 'CONFIRMED') newCount++;
        }
      });
    } else if (section === 'orders' || section === 'quick_orders') {
      orders.forEach(o => {
        if (o.status === 'CANCELLED') return;
        if (isSameDay(o.createdAt, dateObj)) {
          total++;
          if (o.status === 'PENDING' || o.status === 'PAID') newCount++;
        }
      });
    } else {
      appointments.forEach(a => {
        if (a.status === 'CANCELLED') return;
        if (isSameDay(a.date, dateObj)) {
          total++;
          if (a.status === 'PENDING' || a.status === 'CONFIRMED') newCount++;
        }
      });
      visits.forEach(v => {
        if (v.status === 'CANCELLED') return;
        const vDate = v.preferredDate || v.createdAt;
        if (isSameDay(vDate, dateObj)) {
          total++;
          if (v.status === 'PENDING' || v.status === 'ASSIGNED') newCount++;
        }
      });
      orders.forEach(o => {
        if (o.status === 'CANCELLED') return;
        if (isSameDay(o.createdAt, dateObj)) {
          total++;
          if (o.status === 'PENDING' || o.status === 'PAID') newCount++;
        }
      });
    }

    return { total, newCount };
  };

  return (
    <div className="bg-[#FAF9FC] rounded-3xl border border-slate-200/80 shadow-sm p-2.5 flex items-center gap-3 transition-all overflow-x-auto w-full">
      <div className="flex items-center gap-2 shrink-0">
        <div className="relative p-2.5 rounded-2xl bg-white border border-slate-200/80 text-slate-600 hover:text-brand-600 hover:border-brand-200 hover:bg-brand-50/50 cursor-pointer shadow-xs transition-all flex items-center justify-center" title="Select Specific Date">
          <Calendar className="w-4 h-4 pointer-events-none" />
          <input type="date" value={localDateStr} onChange={(e) => { 
            if(e.target.value) {
              const [y, m, d] = e.target.value.split('-');
              onChange(new Date(y, m - 1, d));
            }
          }} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10" />
        </div>
        
        <button onClick={() => onChange(new Date())}
          className={`px-3.5 py-2 rounded-2xl text-[11px] font-black tracking-wider uppercase transition-all border ${
            isSameDay(value, today)
              ? 'bg-[#D8BFD8] text-[#2B1B2B] border-[#C5A3C5] shadow-xs'
              : 'bg-white text-slate-500 border-slate-200/80 hover:bg-slate-100'
          }`}>
          Today
        </button>

        <div className="w-px h-6 bg-slate-200 mx-1 shrink-0" />

        <button onClick={() => { const d = new Date(value); d.setDate(d.getDate() - 1); onChange(d); }}
          className="p-2 rounded-2xl bg-white border border-slate-200/80 text-slate-500 hover:bg-slate-100 hover:text-[#3D2E3D] shadow-xs transition-all shrink-0">
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-2 flex-1 overflow-x-auto scrollbar-none py-1 px-1">
        {days.map((d, i) => {
          const isSel = isSameDay(d, value);
          const { total, newCount } = getDayStats(d);

          return (
            <button key={i} onClick={() => onChange(d)}
              className={`flex-1 min-w-[72px] max-w-[105px] flex flex-col items-center justify-between py-2 px-1.5 rounded-2xl border transition-all duration-200 select-none ${
                isSel
                  ? 'bg-[#D8BFD8] border-[#C4A4C4] text-[#2B1B2B] shadow-md ring-2 ring-[#D8BFD8]/50 scale-[1.04]'
                  : 'bg-white border-slate-200/70 text-slate-600 hover:border-purple-200 hover:bg-purple-50/40 shadow-xs'
              }`}>
              {/* Badges */}
              <div className="flex items-center gap-1 mb-1.5">
                <span title="Total items on this date"
                  className={`text-[9px] font-black px-1.5 py-0.5 rounded-md ${
                    isSel ? 'bg-white/80 text-[#2B1B2B]' : 'bg-slate-100 text-slate-600'
                  }`}>
                  {total} <span className="text-[7.5px] font-bold opacity-75">total</span>
                </span>
                {newCount > 0 && (
                  <span title="New items"
                    className={`text-[9px] font-black px-1.5 py-0.5 rounded-md ${
                      isSel ? 'bg-[#3D2E3D] text-white' : 'bg-emerald-100 text-emerald-700'
                    }`}>
                    +{newCount} <span className="text-[7.5px] font-bold opacity-80">new</span>
                  </span>
                )}
              </div>

              <span className={`text-[10px] font-extrabold uppercase tracking-wider ${isSel ? 'text-[#3D263D]' : 'text-slate-400'}`}>
                {d.toLocaleDateString('en', { weekday: 'short' }).toUpperCase()}
              </span>
              <span className={`text-base font-black leading-tight mt-0.5 ${isSel ? 'text-[#1F101F]' : 'text-[#3D2E3D]'}`}>
                {d.getDate()}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center shrink-0">
        <button onClick={() => { const d = new Date(value); d.setDate(d.getDate() + 1); onChange(d); }}
          className="p-2 rounded-2xl bg-white border border-slate-200/80 text-slate-500 hover:bg-slate-100 hover:text-[#3D2E3D] shadow-xs transition-all shrink-0">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Order Pipeline ──────────────────────────────────────────────────────────
function OrderPipeline({ order, onAdvance }) {
  const curIdx = HAPPY.indexOf(order.status);
  if (order.status === 'CANCELLED') return (
    <div className="rounded-xl bg-red-50 border border-red-200 p-4 flex items-center gap-3">
      <XCircle className="w-5 h-5 text-red-500 shrink-0" />
      <div><p className="text-sm font-bold text-red-700">Order Cancelled</p>
        <p className="text-xs text-red-400">{order.paymentStatus === 'REFUNDED' ? 'Refund initiated.' : 'This order has been cancelled.'}</p></div>
    </div>
  );
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Order Progress — tap next step to advance</p>
      {STAGES.map((stage, idx) => {
        const { Icon } = stage;
        const isDone = idx < curIdx, isCur = idx === curIdx, isNext = idx === curIdx + 1;
        return (
          <button key={stage.key} onClick={() => isNext && onAdvance(stage.key)} disabled={!isNext}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${isCur ? 'border-2 shadow-sm' : isDone ? 'opacity-50 cursor-default bg-slate-50 border-slate-100'
              : isNext ? 'hover:shadow-md cursor-pointer hover:scale-[1.01]' : 'opacity-30 cursor-not-allowed bg-white border-slate-100'
              }`}
            style={isCur ? { borderColor: stage.color, backgroundColor: stage.color + '12' } : isNext ? { borderColor: stage.color + '60', backgroundColor: stage.color + '08' } : {}}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isDone ? 'bg-slate-200' : ''}`}
              style={!isDone ? { backgroundColor: isCur ? stage.color : stage.color + '20' } : {}}>
              {isDone ? <CheckCircle2 className="w-4 h-4 text-slate-500" /> : <Icon className="w-4 h-4" style={{ color: isCur ? '#fff' : stage.color }} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-bold ${isDone ? 'text-slate-400' : ''}`} style={!isDone ? { color: stage.color } : {}}>{stage.label}</p>
              <p className="text-[10px] text-slate-400">{stage.sub}</p>
            </div>
            {isCur && <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ color: stage.color, backgroundColor: stage.color + '20' }}>Current</span>}
            {isNext && <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">Set →</span>}
            {isDone && <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Done</span>}
          </button>
        );
      })}
      {order.status !== 'DELIVERED' && (
        <button onClick={() => onAdvance('CANCELLED')}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-red-100 hover:bg-red-50 text-left transition-all">
          <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center shrink-0"><XCircle className="w-4 h-4 text-red-400" /></div>
          <div className="flex-1"><p className="text-xs font-bold text-red-500">Cancel Order</p><p className="text-[10px] text-red-400">Restores inventory · triggers refund if paid</p></div>
          <span className="text-[9px] font-bold text-red-400 bg-red-50 px-2 py-0.5 rounded-full border border-red-100">Irreversible</span>
        </button>
      )}
    </div>
  );
}

// ─── Measurement Grid ─────────────────────────────────────────────────────────
function MeasurementGrid({ meas, editing, onChange }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {MEAS_FIELDS.map(f => (
        <div key={f.key} className="bg-white rounded-xl border border-slate-100 p-2.5">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{f.label}</p>
          {editing ? (
            <div className="flex items-center gap-1 mt-1">
              <input type="number" value={meas[f.key] || ''} onChange={e => onChange(f.key, e.target.value)}
                className="w-full text-sm font-bold text-slate-700 border-b border-brand-300 bg-transparent focus:outline-none py-0.5"
                placeholder="0" />
              <span className="text-[10px] text-slate-400 shrink-0">{f.unit}</span>
            </div>
          ) : (
            <p className={`text-sm font-bold mt-1 ${meas[f.key] ? 'text-slate-800' : 'text-slate-300'}`}>
              {meas[f.key] ? `${meas[f.key]} ${f.unit}` : '—'}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function CustomMeasurementsEditor({ rows = [], editing, onChange }) {
  const update = (index, key, value) => onChange(rows.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Custom Measurements</p>
        {editing && <button type="button" onClick={() => onChange([...rows, { name: '', value: '', unit: 'in' }])} className="text-[10px] font-bold text-brand-600 flex items-center gap-1"><Plus className="w-3 h-3" />Add custom</button>}
      </div>
      {rows.length === 0 && <p className="text-[11px] text-slate-400">No custom measurements added.</p>}
      {rows.map((row, index) => (
        <div key={`${index}-${row.name}`} className="grid grid-cols-[1fr_0.7fr_0.45fr_auto] gap-2 items-center">
          {editing ? <>
            <input value={row.name || ''} onChange={e => update(index, 'name', e.target.value)} placeholder="Name (e.g. Armhole)" className="min-w-0 text-xs border border-slate-200 rounded-lg px-2 py-2" />
            <input value={row.value || ''} onChange={e => update(index, 'value', e.target.value)} placeholder="Value" className="min-w-0 text-xs border border-slate-200 rounded-lg px-2 py-2" />
            <input value={row.unit || ''} onChange={e => update(index, 'unit', e.target.value)} placeholder="in" className="min-w-0 text-xs border border-slate-200 rounded-lg px-2 py-2" />
            <button type="button" onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))} aria-label="Remove custom measurement" className="p-1.5 text-slate-400 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
          </> : <div className="col-span-4 flex justify-between rounded-lg bg-white border border-slate-100 px-3 py-2 text-xs"><span className="font-semibold text-slate-700">{row.name}</span><span className="text-slate-500">{row.value} {row.unit}</span></div>}
        </div>
      ))}
    </div>
  );
}

// ─── Full Detail Drawer (right-side slide-over) ───────────────────────────────
function DetailDrawer({ appt, visit, orders, staffList, onClose, onRefresh, setActiveTab }) {
  const isAppt = !!appt;
  const item = appt || visit;
  const userId = appt?.userId || visit?.customerId;

  const [activePanel, setActivePanel] = useState('overview');
  const [measurements, setMeasurements] = useState([]);
  const [activeMeasId, setActiveMeasId] = useState('');
  const [measEdit, setMeasEdit] = useState(EMPTY_MEAS());
  const [customMeasEdit, setCustomMeasEdit] = useState([]);
  const [measEditing, setMeasEditing] = useState(false);
  const [measSaving, setMeasSaving] = useState(false);
  const [linkedOrders, setLinkedOrders] = useState([]);
  const [customerHistoryOrders, setCustomerHistoryOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderAssignments, setOrderAssignments] = useState({});
  const [showMeasurementGate, setShowMeasurementGate] = useState(false);

  // Editable fields
  const [orderStatus, setOrderStatus] = useState('');
  const [payStatus, setPayStatus] = useState('');
  const [fabricType, setFabricType] = useState('');
  const [customizations, setCustomizations] = useState('');
  const [tailorNotes, setTailorNotes] = useState('');
  const [apptNotes, setApptNotes] = useState(item?.notes || '');
  const [editingNotes, setEditingNotes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [showNewProfile, setShowNewProfile] = useState(false);
  const [creatingProfile, setCreatingProfile] = useState(false);

  // Load customer measurements and linked orders
  useEffect(() => {
    if (!userId) return;
    api.getMeasurements(userId).then(data => {
      setMeasurements(data || []);
      if (data?.length > 0) {
        setActiveMeasId(data[0].id);
        const p = data[0];
        setMeasEdit(Object.fromEntries(MEAS_FIELDS.map(f => [f.key, p[f.key] || ''])));
        setCustomMeasEdit(Array.isArray(p.customMeasurements) ? p.customMeasurements : []);
      }
    }).catch(() => { });
  }, [userId]);

  useEffect(() => {
    const customerOrders = (orders || []).filter(o =>
      (o.userId && o.userId === userId) ||
      (o.customerName && item && (o.customerName === (item.userName || item.customerName)))
    );
    setCustomerHistoryOrders(customerOrders);

    let linked = [];
    if (item.orderId) {
      const found = (orders || []).find(o => o.id === item.orderId);
      if (found) linked = [found];
    }
    setLinkedOrders(linked);

    if (linked.length > 0) {
      const o = linked[0];
      setSelectedOrder(o);
      setOrderAssignments(Object.fromEntries((o.items || []).map(orderItem => [orderItem.id, orderItem.measurementProfileId || o.measurementProfileId || ''])));
      setOrderStatus(o.status || '');
      setPayStatus(o.paymentStatus || '');
      setFabricType(o.fabricType || '');
      setCustomizations(o.customizations || '');
      setTailorNotes(o.tailorNotes || '');
    } else if (customerOrders.length > 0) {
      const o = customerOrders.find(x => x.id === selectedOrder?.id) || customerOrders[0];
      setSelectedOrder(o);
      setOrderAssignments(Object.fromEntries((o.items || []).map(orderItem => [orderItem.id, orderItem.measurementProfileId || o.measurementProfileId || ''])));
      setOrderStatus(o.status || '');
      setPayStatus(o.paymentStatus || '');
      setFabricType(o.fabricType || '');
      setCustomizations(o.customizations || '');
      setTailorNotes(o.tailorNotes || '');
    } else {
      setSelectedOrder(null);
      setOrderAssignments({});
    }
  }, [orders, userId, item.orderId]);

  const switchMeasProfile = (id) => {
    setActiveMeasId(id);
    const p = measurements.find(m => m.id === id);
    if (p) setMeasEdit(Object.fromEntries(MEAS_FIELDS.map(f => [f.key, p[f.key] || ''])));
    if (p) setCustomMeasEdit(Array.isArray(p.customMeasurements) ? p.customMeasurements : []);
    setMeasEditing(false);
  };

  const saveMeasurements = async () => {
    if (!activeMeasId) return;
    setMeasSaving(true);
    try {
      const customMeasurements = customMeasEdit.filter(row => row.name?.trim() && String(row.value || '').trim());
      await api.updateMeasurements(activeMeasId, { ...measEdit, customMeasurements });
      const updated = measurements.map(m => m.id === activeMeasId ? { ...m, ...measEdit, customMeasurements } : m);
      setMeasurements(updated);
      setMeasEditing(false);
    } catch (e) { alert(e.message); }
    finally { setMeasSaving(false); }
  };

  const createNewProfile = async () => {
    if (!newProfileName.trim() || !userId) return;
    setCreatingProfile(true);
    try {
      const customMeasurements = customMeasEdit.filter(row => row.name?.trim() && String(row.value || '').trim());
      const created = await api.createMeasurementProfile({ userId, profileName: newProfileName.trim(), ...measEdit, customMeasurements });
      const updated = [...measurements, created];
      setMeasurements(updated);
      setActiveMeasId(created.id);
      setNewProfileName('');
      setShowNewProfile(false);
      setCustomMeasEdit([]);
    } catch (e) { alert(e.message); }
    finally { setCreatingProfile(false); }
  };

  const saveOrder = async () => {
    if (!selectedOrder) return;
    if (orderStatus === 'PROCESSING' && (selectedOrder.items || []).some(orderItem => !orderAssignments[orderItem.id])) {
      setShowMeasurementGate(true);
      return;
    }
    const openSizingAfterSave = orderStatus === 'PAID' && selectedOrder.status !== 'PAID'
      && window.confirm('Move this order to the measurement stage and open sizing to add or assign measurements now?');
    setSaving(true);
    try {
      await api.updateOrderDetails(selectedOrder.id, {
        status: orderStatus, paymentStatus: payStatus, fabricType, customizations, tailorNotes,
        orderItemMeasurements: (selectedOrder.items || []).map(orderItem => ({ orderItemId: orderItem.id, measurementProfileId: orderAssignments[orderItem.id] || null })),
      });
      await onRefresh();
      if (openSizingAfterSave) setActivePanel('sizing');
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const advanceOrderStage = async (newStatus) => {
    if (!selectedOrder) return;
    if (newStatus === 'PROCESSING' && (selectedOrder.items || []).some(orderItem => !orderAssignments[orderItem.id])) {
      setShowMeasurementGate(true);
      return;
    }
    const openSizingAfterSave = newStatus === 'PAID' && selectedOrder.status !== 'PAID'
      && window.confirm('Move this order to the measurement stage and open sizing to add or assign measurements now?');
    setStatusUpdating(true);
    try {
      await api.updateOrderDetails(selectedOrder.id, {
        status: newStatus,
        orderItemMeasurements: (selectedOrder.items || []).map(orderItem => ({ orderItemId: orderItem.id, measurementProfileId: orderAssignments[orderItem.id] || null })),
      });
      setOrderStatus(newStatus);
      setSelectedOrder(prev => ({ ...prev, status: newStatus }));
      await onRefresh();
      if (openSizingAfterSave) setActivePanel('sizing');
    } catch (e) { alert(e.message); }
    finally { setStatusUpdating(false); }
  };

  const saveOrderMeasurements = async () => {
    if (!selectedOrder) return;
    setMeasSaving(true);
    try {
      const orderItemMeasurements = (selectedOrder.items || []).map(orderItem => ({
        orderItemId: orderItem.id,
        measurementProfileId: orderAssignments[orderItem.id] || null,
      }));
      await api.updateOrderDetails(selectedOrder.id, { orderItemMeasurements });
      setSelectedOrder(previous => ({ ...previous, items: previous.items.map(orderItem => ({ ...orderItem, measurementProfileId: orderAssignments[orderItem.id] || null })) }));
      await onRefresh();
    } catch (e) { alert(e.message); }
    finally { setMeasSaving(false); }
  };

  const saveApptNotes = async () => {
    setSaving(true);
    try {
      if (isAppt) await api.updateAppointment(item.id, { notes: apptNotes });
      setEditingNotes(false);
      await onRefresh();
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const updateApptStatus = async (status) => {
    setStatusUpdating(true);
    try {
      if (isAppt) await api.updateAppointmentStatus(item.id, status);
      await onRefresh();
    } catch (e) { alert(e.message); }
    finally { setStatusUpdating(false); }
  };

  const linkOrder = async (orderId) => {
    setStatusUpdating(true);
    try {
      if (isAppt) {
        await api.updateAppointment(item.id, { orderId });
      } else {
        await api.updateStoreVisit(item.id, { orderId });
      }
      await onRefresh();
    } catch (e) { alert(e.message); }
    finally { setStatusUpdating(false); }
  };

  const getPanels = () => {
    if (isAppt && item.type === 'CONSULTATION' && item.status === 'PENDING') {
      return [{ id: 'overview', label: 'Overview', icon: Eye }];
    }
    return [
      { id: 'overview', label: 'Overview', icon: Eye },
      { id: 'sizing', label: 'Sizing', icon: Ruler },
    ];
  };

  const PANELS = getPanels();

  const renderParsedNotes = (notes) => {
    if (!notes) return <span className="text-slate-300 italic">No notes added. Click Edit to add.</span>;

    if (notes.includes('ProductImage:') || notes.includes('Category:') || notes.includes('Fitting Address:')) {
      const categoryMatch = notes.match(/Category:\s*([\s\S]*?)(?=\s*ProductImage:|\s*Fitting Address:|$)/);
      const imageMatch = notes.match(/ProductImage:\s*(https?:\/\/[^\s]+)/);
      const fittingMatch = notes.match(/Fitting Address:\s*([\s\S]*?)(?=\s*Category:|\s*ProductImage:|$)/);

      let cleanNotes = notes;
      if (categoryMatch) cleanNotes = cleanNotes.replace(categoryMatch[0], '');
      if (imageMatch) cleanNotes = cleanNotes.replace(imageMatch[0], '');
      if (fittingMatch) cleanNotes = cleanNotes.replace(fittingMatch[0], '');
      cleanNotes = cleanNotes.trim();

      return (
        <div className="space-y-3">
          {imageMatch && (
            <div className="w-full h-40 rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
              <img src={imageMatch[1]} alt="Product" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {categoryMatch && (
              <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Product Details</span>
                <span className="text-sm font-bold text-slate-700 truncate block">{categoryMatch[1].trim()}</span>
              </div>
            )}
            {fittingMatch && (
              <div className="bg-white p-2.5 rounded-xl border border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Fitting Address</span>
                <span className="text-sm font-bold text-slate-700 truncate block">{fittingMatch[1].trim()}</span>
              </div>
            )}
          </div>
          {cleanNotes && (
            <div className="bg-white p-3 rounded-xl border border-slate-100">
              <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Additional Notes</span>
              <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{cleanNotes}</p>
            </div>
          )}
        </div>
      );
    }

    return <span className="whitespace-pre-wrap">{notes}</span>;
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      {/* Drawer */}
      <div className="relative ml-auto h-full w-full max-w-2xl bg-white shadow-2xl flex flex-col animate-in slide-in-from-right-4 duration-300">
        {/* Drawer Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white shrink-0">
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${isAppt ? 'bg-brand-100' : 'bg-indigo-100'}`}>
              {isAppt ? <Scissors className="w-6 h-6 text-brand-600" /> : <Home className="w-6 h-6 text-indigo-600" />}
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-800 leading-tight">{item.userName || item.customerName || 'Customer'}</h2>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <Badge status={item.status} small />
                {isAppt && item.timeSlot && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-brand-50 text-brand-700 border border-brand-200 px-2 py-0.5 rounded-full">
                    <Clock className="w-3 h-3" />{item.timeSlot}
                  </span>
                )}
                {isAppt && item.type && (
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{item.type.replace(/_/g, ' ')}</span>
                )}
              </div>
              {/* Contact quick-view */}
              <div className="flex flex-wrap gap-3 mt-2">
                {item.user?.email && <span className="text-[10px] text-slate-400 flex items-center gap-1"><Mail className="w-3 h-3" />{item.user.email}</span>}
                {item.user?.phoneNumber && <span className="text-[10px] text-slate-400 flex items-center gap-1"><Phone className="w-3 h-3" />{item.user.phoneNumber}</span>}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Panel Tabs */}
        <div className="flex gap-1 px-6 pt-4 border-b border-slate-100 shrink-0 overflow-x-auto">
          {PANELS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setActivePanel(id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all whitespace-nowrap border-b-2 -mb-px ${activePanel === id ? 'border-brand-500 text-brand-700 bg-brand-50' : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}>
              <Icon className="w-3.5 h-3.5" />{label}
            </button>
          ))}
        </div>

        {/* Panel Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* ── OVERVIEW Panel ─────────────────────────────────── */}
          {activePanel === 'overview' && (
            <div className="space-y-5">
              {/* Quick status buttons */}
              {isAppt && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Update Status</p>
                  <div className="flex flex-wrap gap-2">
                    {['CANCELLED', 'ORDERED', 'CONSULTED'].includes(item.status) ? (
                      <button disabled className="px-3 py-1.5 rounded-xl text-xs font-bold border transition-all disabled:opacity-100 bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed">
                        {item.status.replace(/_/g, ' ')}
                      </button>
                    ) : (
                      ['PENDING', 'CONFIRMED', 'CONSULTED', 'ORDERED', 'CANCELLED', 'RESCHEDULED'].map(s => (
                        <button key={s} onClick={() => updateApptStatus(s)} disabled={item.status === s || statusUpdating}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all disabled:opacity-50 ${item.status === s ? 'bg-brand-500 text-[#3D2E3D] border-brand-400 shadow-sm' : 'border-slate-200 text-slate-500 hover:border-brand-300 hover:text-brand-700 hover:bg-brand-50'
                            }`}>
                          {statusUpdating && item.status !== s ? <Loader2 className="w-3 h-3 animate-spin inline" /> : s.replace(/_/g, ' ')}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Product info */}
              <div className="bg-slate-50 rounded-2xl p-4 space-y-3 border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Appointment Details</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Product Type', value: isAppt ? item.productType : item.requirements },
                    { label: 'Date', value: fmtDate(isAppt ? item.date : item.preferredDate) },
                    { label: isAppt ? 'Time Slot' : 'Assigned Staff', value: isAppt ? item.timeSlot : (item.assignedStaffName || 'Unassigned') },
                    { label: 'Type', value: isAppt ? item.type?.replace(/_/g, ' ') : 'Home Visit' },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-white rounded-xl p-3 border border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">{label}</p>
                      <p className="text-sm font-bold text-slate-700 mt-0.5">{value || '—'}</p>
                    </div>
                  ))}
                </div>
              </div>

              {isAppt && item.type === 'CONSULTATION' && !item.orderId && !['CANCELLED', 'ORDERED', 'CONSULTED'].includes(item.status) && (
                <div className="bg-brand-50 border border-brand-200 rounded-2xl p-4 space-y-3">
                  <p className="text-[10px] font-bold text-brand-700 uppercase tracking-wider">Manual Checkout Flow</p>
                  <p className="text-xs text-brand-800">Move this consultation to Manual Checkout to generate an order on behalf of the customer.</p>
                  <button
                    onClick={() => {
                      sessionStorage.setItem('checkout_appointment_id', item.id);
                      sessionStorage.setItem('checkout_user_id', item.userId || '');
                      sessionStorage.setItem('checkout_product_name', item.productType || '');
                      if (setActiveTab) {
                        setActiveTab('checkout');
                        window.dispatchEvent(new CustomEvent('checkout-prefill'));
                      } else {
                        window.location.href = `/manual-checkout?appointmentId=${item.id}&userId=${item.userId || ''}&productName=${encodeURIComponent(item.productType)}`;
                      }
                      onClose();
                    }}
                    className="w-full py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-[#3D2E3D] text-xs font-bold shadow-sm transition-all flex items-center justify-center gap-2"
                  >
                    <ShoppingBag className="w-4 h-4" />
                    Move to Manual Checkout
                  </button>
                </div>
              )}

              {isAppt && !['CANCELLED', 'ORDERED', 'CONSULTED'].includes(item.status) && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                  <p className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">Appointment Outcome</p>
                  <p className="text-xs text-slate-500">Record whether the customer came for consultation only or placed a confirmed product order.</p>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        await api.updateAppointment(item.id, { status: 'CONSULTED' });
                        await onRefresh();
                      }}
                      className={`flex-1 py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${item.status === 'CONSULTED'
                        ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-100'
                        }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Consultation Only
                    </button>
                    <button
                      onClick={async () => {
                        await api.updateAppointment(item.id, { status: 'ORDERED' });
                        await onRefresh();
                      }}
                      className={`flex-1 py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${item.status === 'ORDERED'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-100'
                        }`}
                    >
                      <ShoppingBag className="w-3.5 h-3.5" />
                      Product Ordered
                    </button>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5" />Tailor Notes
                  </p>
                  {!editingNotes
                    ? <button onClick={() => setEditingNotes(true)} className="text-[11px] font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1"><Edit3 className="w-3 h-3" />Edit</button>
                    : <div className="flex gap-3">
                      <button onClick={saveApptNotes} disabled={saving} className="text-[11px] font-bold text-emerald-600 flex items-center gap-1 disabled:opacity-60">
                        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}Save
                      </button>
                      <button onClick={() => setEditingNotes(false)} className="text-[11px] text-slate-400"><X className="w-3 h-3" /></button>
                    </div>
                  }
                </div>
                {editingNotes
                  ? <textarea value={apptNotes} onChange={e => setApptNotes(e.target.value)} rows={4}
                    className="w-full text-xs border border-slate-200 rounded-xl p-3 focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-100 resize-none bg-white"
                    placeholder="Add measurement notes, fabric preferences, special instructions..." />
                  : <div className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-xl p-3 min-h-[60px] leading-relaxed">
                    {renderParsedNotes(apptNotes)}
                  </div>
                }
              </div>

              {/* Home visit: staff assignment */}
              {!isAppt && item.status === 'PENDING' && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1"><UserCheck className="w-3.5 h-3.5" />Assign Staff</p>
                  <div className="flex gap-2">
                    <select className="flex-1 text-xs border border-slate-200 rounded-xl py-2.5 px-3 bg-white focus:outline-none focus:border-brand-400"
                      id="drawer-staff-select">
                      {staffList.map(s => <option key={s.id} value={s.id}>{s.fullName} ({s.role})</option>)}
                    </select>
                    <button onClick={async () => {
                      const sel = document.getElementById('drawer-staff-select');
                      if (!sel) return;
                      try { await api.assignStaffToVisit(item.id, sel.value); await onRefresh(); } catch (e) { alert(e.message); }
                    }} className="px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold shadow-sm transition-all">
                      Assign
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── SIZING Panel ────────────────────────────────────── */}
          {activePanel === 'sizing' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-brand-100 flex items-center justify-center">
                    <Ruler className="w-4 h-4 text-brand-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-800">Customer Sizing Profiles</h3>
                    <p className="text-[10px] text-slate-400">{measurements.length} profile{measurements.length !== 1 ? 's' : ''} on file</p>
                  </div>
                </div>
                <button onClick={() => {
                  setShowNewProfile(previous => {
                    const opening = !previous;
                    if (opening) {
                      setNewProfileName('');
                      setMeasEdit(EMPTY_MEAS());
                      setCustomMeasEdit([]);
                    }
                    return opening;
                  });
                }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-brand-300 text-brand-600 text-xs font-bold hover:bg-brand-50 transition-all">
                  <Plus className="w-3.5 h-3.5" />{showNewProfile ? 'Cancel' : 'New Profile'}
                </button>
              </div>

              {/* New profile form */}
              {showNewProfile && (
                <div className="bg-brand-50 border border-brand-200 rounded-2xl p-4 space-y-3">
                  <p className="text-[10px] font-bold text-brand-600 uppercase tracking-wider">Create New Measurement Profile</p>
                  <input value={newProfileName} onChange={e => setNewProfileName(e.target.value)}
                    placeholder="Profile name e.g. Wedding Lehenga"
                    className="w-full text-xs border border-brand-200 rounded-xl py-2.5 px-3 bg-white focus:outline-none focus:border-brand-400" />
                  <MeasurementGrid meas={measEdit} editing={true} onChange={(k, v) => setMeasEdit(p => ({ ...p, [k]: v }))} />
                  <CustomMeasurementsEditor rows={customMeasEdit} editing onChange={setCustomMeasEdit} />
                  <button onClick={createNewProfile} disabled={creatingProfile || !newProfileName.trim()}
                    className="w-full py-2.5 rounded-xl bg-brand-500 text-[#3D2E3D] text-xs font-bold shadow-sm transition-all hover:bg-brand-600 disabled:opacity-60 flex items-center justify-center gap-2">
                    {creatingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save New Profile
                  </button>
                </div>
              )}

              {measurements.length === 0 && !showNewProfile && (
                <div className="text-center py-12">
                  <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                    <Ruler className="w-6 h-6 text-slate-300" />
                  </div>
                  <p className="font-bold text-slate-600">No Sizing Profiles</p>
                  <p className="text-xs text-slate-400 mt-1">Add a profile to save this customer's measurements</p>
                </div>
              )}

              {selectedOrder && (selectedOrder.items || []).length > 0 && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 space-y-3">
                  <div>
                    <p className="text-xs font-extrabold text-indigo-900">Measurements for this order</p>
                    <p className="text-[11px] text-indigo-700 mt-1">Assign one saved profile to each dress. Every product needs a profile before it can move to stitching.</p>
                  </div>
                  {(selectedOrder.items || []).map(orderItem => (
                    <div key={orderItem.id} className="flex flex-col sm:flex-row sm:items-center gap-2 bg-white rounded-xl border border-indigo-100 p-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-700 truncate">{orderItem.productName || 'Dress'}</p>
                        <p className="text-[10px] text-slate-400">Qty {orderItem.quantity}</p>
                      </div>
                      <select value={orderAssignments[orderItem.id] || ''}
                        onChange={e => setOrderAssignments(previous => ({ ...previous, [orderItem.id]: e.target.value }))}
                        className="sm:w-56 text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white">
                        <option value="">Choose measurement profile</option>
                        {measurements.map(profile => <option key={profile.id} value={profile.id}>{profile.profileName}</option>)}
                      </select>
                    </div>
                  ))}
                  <button onClick={saveOrderMeasurements} disabled={measSaving}
                    className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold disabled:opacity-60 flex items-center justify-center gap-2">
                    {measSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}Save order assignments
                  </button>
                </div>
              )}

              {measurements.length > 0 && (
                <>
                  {/* Profile switcher */}
                  {measurements.length > 1 && (
                    <div className="flex flex-wrap gap-2">
                      {measurements.map(m => (
                        <button key={m.id} onClick={() => switchMeasProfile(m.id)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${activeMeasId === m.id ? 'bg-brand-500 text-[#3D2E3D] border-brand-400 shadow-sm' : 'border-slate-200 text-slate-500 hover:border-brand-300 hover:bg-brand-50'
                            }`}>{m.profileName}</button>
                      ))}
                    </div>
                  )}

                  {/* Active profile header */}
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-700">
                      {measurements.find(m => m.id === activeMeasId)?.profileName || 'Measurements'}
                    </p>
                    <div className="flex gap-2">
                      {measEditing ? (
                        <>
                          <button onClick={saveMeasurements} disabled={measSaving}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold disabled:opacity-60">
                            {measSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}Save
                          </button>
                          <button onClick={() => { setMeasEditing(false); const p = measurements.find(m => m.id === activeMeasId); if (p) { setMeasEdit(Object.fromEntries(MEAS_FIELDS.map(f => [f.key, p[f.key] || '']))); setCustomMeasEdit(Array.isArray(p.customMeasurements) ? p.customMeasurements : []); } }}
                            className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-400 text-xs font-bold hover:bg-slate-50">Cancel</button>
                        </>
                      ) : (
                        <button onClick={() => setMeasEditing(true)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:border-brand-300 hover:text-brand-700 hover:bg-brand-50">
                          <Edit3 className="w-3 h-3" />Edit
                        </button>
                      )}
                    </div>
                  </div>

                  <MeasurementGrid meas={measEdit} editing={measEditing} onChange={(k, v) => setMeasEdit(p => ({ ...p, [k]: v }))} />
                  <CustomMeasurementsEditor rows={customMeasEdit} editing={measEditing} onChange={setCustomMeasEdit} />

                  {/* Tailor notes from measurement */}
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider mb-1">Tailor Notes on Profile</p>
                    <p className="text-xs text-amber-800 leading-relaxed">
                      {measurements.find(m => m.id === activeMeasId)?.tailorNotes || 'No notes on this profile.'}
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── ORDERS Panel ─────────────────────────────────────── */}
          {activePanel === 'orders' && (
            <div className="space-y-4">
              {linkedOrders.length === 0 ? (
                <div className="text-center py-10">
                  <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                    <ShoppingBag className="w-6 h-6 text-slate-300" />
                  </div>
                  <p className="font-bold text-slate-600 text-sm">No Linked Order</p>
                  <p className="text-xs text-slate-400 mt-1 mb-4">This consultation has no order associated yet</p>

                  {customerHistoryOrders.length > 0 && (
                    <div className="max-w-md mx-auto p-4 bg-slate-50 border border-slate-100 rounded-2xl text-left">
                      <p className="text-xs font-bold text-slate-700 mb-2">Link an existing customer order:</p>
                      <select
                        className="w-full text-xs p-2.5 border border-slate-200 rounded-xl bg-white focus:outline-none"
                        value={selectedOrder?.id || ''}
                        onChange={(e) => {
                          const o = customerHistoryOrders.find(x => x.id === e.target.value);
                          if (o) {
                            setSelectedOrder(o);
                            setOrderAssignments(Object.fromEntries((o.items || []).map(orderItem => [orderItem.id, orderItem.measurementProfileId || o.measurementProfileId || ''])));
                            setOrderStatus(o.status || '');
                            setPayStatus(o.paymentStatus || '');
                            setFabricType(o.fabricType || '');
                            setCustomizations(o.customizations || '');
                            setTailorNotes(o.tailorNotes || '');
                          }
                        }}
                      >
                        <option value="">-- Choose Order --</option>
                        {customerHistoryOrders.map(o => (
                          <option key={o.id} value={o.id}>{formatOrderId(o.invoiceNumber)} (₹{o.payableAmount})</option>
                        ))}
                      </select>
                      {selectedOrder && (
                        <button
                          onClick={() => linkOrder(selectedOrder.id)}
                          className="w-full mt-3 bg-brand-600 hover:bg-brand-700 text-white font-bold py-2 px-4 rounded-xl text-xs transition-colors"
                        >
                          Link Selected Order
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* Linked Order Badges */}
                  {linkedOrders.length > 1 && (
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                      <span className="text-xs font-bold text-slate-400 py-1">Linked Orders:</span>
                      {linkedOrders.map(o => (
                        <button key={o.id} onClick={() => {
                          setSelectedOrder(o);
                          setOrderAssignments(Object.fromEntries((o.items || []).map(orderItem => [orderItem.id, orderItem.measurementProfileId || o.measurementProfileId || ''])));
                          setOrderStatus(o.status || '');
                          setPayStatus(o.paymentStatus || '');
                          setFabricType(o.fabricType || '');
                          setCustomizations(o.customizations || '');
                          setTailorNotes(o.tailorNotes || '');
                        }} className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${selectedOrder?.id === o.id ? 'bg-slate-800 text-white border-slate-800 shadow-sm' : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50'
                          }`}>{formatOrderId(o.invoiceNumber) || o.id.slice(0, 8).toUpperCase()}</button>
                      ))}
                    </div>
                  )}

                  {!item.orderId && selectedOrder && (
                    <div className="bg-brand-50 border border-brand-200 rounded-xl p-3 flex flex-col sm:flex-row items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold text-brand-700">Link Order to {isAppt ? 'Appointment' : 'Visit'}</p>
                        <p className="text-[10px] text-brand-600/80">Currently viewing {formatOrderId(selectedOrder.invoiceNumber)}. Link this order to exclusively show it here.</p>
                      </div>
                      <button onClick={() => linkOrder(selectedOrder.id)} disabled={statusUpdating}
                        className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-[#3D2E3D] text-[11px] font-extrabold shadow-sm transition-all whitespace-nowrap disabled:opacity-60 flex items-center gap-1.5">
                        {statusUpdating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShoppingBag className="w-3.5 h-3.5" />}Link This Order
                      </button>
                    </div>
                  )}

                  {selectedOrder && (
                    <div className="space-y-4">
                      {/* Order summary */}
                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs font-extrabold text-slate-700">{formatOrderId(selectedOrder.invoiceNumber)}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">{fmtDate(selectedOrder.createdAt)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-extrabold text-slate-800">{fmtCurrency(selectedOrder.payableAmount)}</p>
                            <p className="text-[10px] text-slate-400">{selectedOrder.paymentMethod} · {selectedOrder.paymentStatus}</p>
                          </div>
                        </div>
                        {/* Items */}
                        <div className="space-y-1.5">
                          {(selectedOrder.items || []).map((item, i) => (
                            <div key={i} className="flex items-center justify-between bg-white rounded-xl px-3 py-2 border border-slate-100">
                              <span className="text-xs font-semibold text-slate-700">{item.productName}</span>
                              <span className="text-xs text-slate-400">x{item.quantity} · {fmtCurrency(item.price)}</span>
                            </div>
                          ))}
                        </div>
                        {/* Advance paid */}
                        {selectedOrder.advancePayment > 0 && (
                          <div className="flex items-center justify-between text-xs font-semibold bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                            <span className="text-emerald-700">Advance Paid</span>
                            <span className="text-emerald-800 font-extrabold">{fmtCurrency(selectedOrder.advancePayment)}</span>
                          </div>
                        )}
                        {/* Delivery date */}
                        {selectedOrder.deliveryDate && (
                          <div className="flex items-center justify-between text-xs bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
                            <span className="text-blue-700 font-semibold flex items-center gap-1"><Truck className="w-3 h-3" />Expected Delivery</span>
                            <span className="text-blue-800 font-extrabold">{fmtDate(selectedOrder.deliveryDate)}</span>
                          </div>
                        )}
                      </div>

                      {/* Editable fields */}
                      <div className="space-y-3">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Order Customization Details</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Order Status</label>
                            <select value={orderStatus} onChange={e => setOrderStatus(e.target.value)}
                              className="w-full text-xs border border-slate-200 rounded-xl py-2.5 px-3 bg-white focus:outline-none focus:border-brand-400">
                              {['PENDING', 'PAID', 'PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'].map(s => <option key={s}>{s}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Payment Status</label>
                            <select value={payStatus} onChange={e => setPayStatus(e.target.value)}
                              className="w-full text-xs border border-slate-200 rounded-xl py-2.5 px-3 bg-white focus:outline-none focus:border-brand-400">
                              {['PENDING', 'PAID', 'PARTIALLY_PAID', 'REFUNDED', 'FAILED'].map(s => <option key={s}>{s}</option>)}
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Fabric Type</label>
                          <input value={fabricType} onChange={e => setFabricType(e.target.value)} placeholder="e.g. Silk, Cotton, Banarasi..."
                            className="w-full text-xs border border-slate-200 rounded-xl py-2.5 px-3 bg-white focus:outline-none focus:border-brand-400" />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Customizations</label>
                          <textarea value={customizations} onChange={e => setCustomizations(e.target.value)} rows={3}
                            placeholder="Embroidery style, colour preferences, special requests..."
                            className="w-full text-xs border border-slate-200 rounded-xl p-3 bg-white focus:outline-none focus:border-brand-400 resize-none" />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Tailor Notes (Internal)</label>
                          <textarea value={tailorNotes} onChange={e => setTailorNotes(e.target.value)} rows={3}
                            placeholder="Internal notes for the tailoring team..."
                            className="w-full text-xs border border-slate-200 rounded-xl p-3 bg-white focus:outline-none focus:border-brand-400 resize-none" />
                        </div>
                        <button onClick={saveOrder} disabled={saving}
                          className="w-full py-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-[#3D2E3D] text-xs font-extrabold shadow-md transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          Save Order Changes
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── PIPELINE Panel ────────────────────────────────────── */}
          {activePanel === 'pipeline' && (
            <div className="space-y-4">
              {selectedOrder ? (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-600">{formatOrderId(selectedOrder.invoiceNumber)}</p>
                    <p className="text-[10px] text-slate-400">{fmtCurrency(selectedOrder.payableAmount)}</p>
                  </div>
                  <OrderPipeline order={selectedOrder} onAdvance={advanceOrderStage} />
                  {statusUpdating && (
                    <div className="flex items-center justify-center gap-2 py-4">
                      <Loader2 className="w-4 h-4 animate-spin text-brand-500" />
                      <span className="text-xs text-slate-400">Updating status...</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-14">
                  <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                    <Truck className="w-6 h-6 text-slate-300" />
                  </div>
                  <p className="font-bold text-slate-600">No order linked</p>
                  <p className="text-xs text-slate-400 mt-1">Pipeline is shown once an order is linked</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Drawer Footer */}
        <div className="border-t border-slate-100 px-6 py-4 bg-slate-50 flex items-center justify-between shrink-0">
          <p className="text-[10px] text-slate-400">
            {isAppt ? `Booking ID: ${item.id.slice(0, 12).toUpperCase()}` : `Visit ID: ${item.id.slice(0, 12).toUpperCase()}`}
          </p>
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-bold hover:bg-white transition-all">
            Close
          </button>
        </div>
      </div>
      {showMeasurementGate && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/45" role="dialog" aria-modal="true" aria-labelledby="measurement-gate-title">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0"><Ruler className="w-5 h-5" /></div>
              <div>
                <h3 id="measurement-gate-title" className="text-sm font-extrabold text-slate-800">Measurements needed before stitching</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">Add a new measurement profile or assign an existing customer profile to every product in this order before moving it to stitching.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowMeasurementGate(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-bold hover:bg-slate-50">Cancel</button>
              <button onClick={() => { setShowMeasurementGate(false); setActivePanel('sizing'); }} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5"><Ruler className="w-3.5 h-3.5" />Go to measurements</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Compact Appointment Card ─────────────────────────────────────────────────
function ApptCard({ appt, onQuickStatus, onOpen, setActiveTab }) {
  const [updating, setUpdating] = useState(false);
  const [showMarkDoneDropdown, setShowMarkDoneDropdown] = useState(false);

  const quick = async (status) => {
    setUpdating(true);
    try { await onQuickStatus(appt.id, status); } finally { setUpdating(false); }
  };

  return (
    <div className={`rounded-2xl border transition-all duration-200 overflow-hidden bg-white hover:shadow-md group ${
      appt.status === 'CONFIRMED' ? 'border-emerald-200' :
      appt.status === 'CANCELLED' ? 'border-red-100 opacity-60' :
      appt.status === 'CONSULTED' ? 'border-teal-200' :
      appt.status === 'ORDERED'   ? 'border-indigo-300 ring-1 ring-indigo-100' :
      appt.status === 'COMPLETED' ? 'border-blue-200' :
      'border-slate-200 hover:border-brand-300'
    } shadow-sm`}>
      <div className="p-4 flex items-start gap-3">
        {/* Time tile */}
        <div className="flex flex-col items-center justify-center bg-gradient-to-b from-brand-50 to-brand-100 border border-brand-200 rounded-xl px-3 py-2.5 min-w-[60px] shrink-0">
          <Clock className="w-3.5 h-3.5 text-brand-600 mb-1" />
          <span className="text-[11px] font-extrabold text-brand-700 leading-tight text-center">{appt.timeSlot || '—'}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-extrabold text-slate-800 truncate">{appt.userName || 'Walk-In Customer'}</p>
            <Badge status={appt.status} small />
          </div>
          <div className="flex flex-wrap gap-2 mt-1.5">
            {appt.type && <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-lg">{appt.type.replace(/_/g, ' ')}</span>}
            {appt.productType && <span className="text-[10px] font-semibold text-brand-600 bg-brand-50 border border-brand-100 px-2 py-0.5 rounded-lg">{appt.productType}</span>}
          </div>
          {/* Contact */}
          <div className="flex flex-wrap gap-3 mt-2">
            {appt.user?.phoneNumber && <span className="text-[10px] text-slate-400 flex items-center gap-1"><Phone className="w-3 h-3" />{appt.user.phoneNumber}</span>}
            {appt.user?.email && <span className="text-[10px] text-slate-400 flex items-center gap-1 truncate"><Mail className="w-3 h-3" />{appt.user.email}</span>}
          </div>
        </div>
        <button onClick={() => onOpen(appt)}
          className="p-2 rounded-xl border border-slate-200 hover:border-brand-300 hover:bg-brand-50 text-slate-400 hover:text-brand-600 transition-all shrink-0 opacity-0 group-hover:opacity-100">
          <SlidersHorizontal className="w-4 h-4" />
        </button>
      </div>

      {/* Quick actions */}
      <div className="px-4 pb-4 flex gap-2 overflow-visible">
        {appt.status === 'PENDING' && <>
          <button onClick={() => quick('CONFIRMED')} disabled={updating}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold shadow-sm transition-all disabled:opacity-60">
            {updating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}Confirm
          </button>
          <button onClick={() => quick('CANCELLED')} disabled={updating}
            className="px-3 py-2 rounded-xl border border-red-200 hover:bg-red-50 text-red-400 text-xs font-bold transition-all disabled:opacity-60">
            <XCircle className="w-3.5 h-3.5" />
          </button>
        </>}
        {appt.status === 'CONFIRMED' && <>
          <button
            onClick={() => {
              sessionStorage.setItem('checkout_appointment_id', appt.id);
              sessionStorage.setItem('checkout_user_id', appt.userId || '');
              sessionStorage.setItem('checkout_product_name', appt.productType || '');
              sessionStorage.setItem('checkout_delivery_date', appt.date || '');
              if (setActiveTab) {
                setActiveTab('checkout');
                window.dispatchEvent(new CustomEvent('checkout-prefill'));
              } else {
                window.location.href = `/manual-checkout?appointmentId=${appt.id}&userId=${appt.userId || ''}&productName=${encodeURIComponent(appt.productType || '')}&deliveryDate=${encodeURIComponent(appt.date || '')}`;
              }
            }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-[#3D2E3D] text-xs font-bold shadow-sm transition-all"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            Move to Checkout
          </button>

          <div className="relative">
            <button
              onClick={() => setShowMarkDoneDropdown(!showMarkDoneDropdown)}
              disabled={updating}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold shadow-sm transition-all disabled:opacity-60 flex items-center gap-1"
            >
              {updating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BadgeCheck className="w-3.5 h-3.5" />}
              <ChevronDown className="w-3 h-3" />
            </button>

            {showMarkDoneDropdown && (
              <div className="absolute bottom-full right-0 mb-2 w-48 bg-white border border-slate-200 rounded-2xl shadow-xl z-30 py-1.5 overflow-hidden">
                <button
                  onClick={async () => {
                    setShowMarkDoneDropdown(false);
                    await quick('CONSULTED');
                  }}
                  className="w-full text-left px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2"
                >
                  <Sparkles className="w-3.5 h-3.5 text-teal-500" />
                  Consultation
                </button>
                <button
                  onClick={async () => {
                    setShowMarkDoneDropdown(false);
                    await quick('ORDERED');
                  }}
                  className="w-full text-left px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 border-t border-slate-100 transition-colors flex items-center gap-2"
                >
                  <ShoppingBag className="w-3.5 h-3.5 text-blue-500" />
                  Product Ordered
                </button>
              </div>
            )}
          </div>

          <button onClick={() => quick('CANCELLED')} disabled={updating}
            className="px-3 py-2 rounded-xl border border-red-200 hover:bg-red-50 text-red-400 transition-all disabled:opacity-60">
            <Ban className="w-3.5 h-3.5" />
          </button>
        </>}
        {/* ── Order Confirmed stage — only for ORDERED appointments (product booking placed) ── */}
        {appt.status === 'ORDERED' && (
          <div className="flex gap-2 w-full">
            <div className="flex-1 flex flex-col gap-1.5">
              {/* Context pill */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-xl">
                <ShoppingBag className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span className="text-[10px] font-bold text-indigo-700 leading-tight">
                  Product order placed — confirm to hand off to production
                </span>
              </div>
              {/* Main action */}
              <button
                onClick={() => quick('COMPLETED')}
                disabled={updating}
                className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold shadow-md shadow-indigo-500/20 transition-all disabled:opacity-60"
              >
                {updating
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <BadgeCheck className="w-4 h-4" />
                }
                Order Confirmed
              </button>
            </div>
            <button onClick={() => quick('CANCELLED')} disabled={updating}
              className="px-3 py-2 rounded-xl border border-red-200 hover:bg-red-50 text-red-400 transition-all disabled:opacity-60 self-end">
              <Ban className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {(appt.status === 'COMPLETED' || appt.status === 'CANCELLED') && (
          <button onClick={() => onOpen(appt)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500 text-xs font-bold transition-all">
            <Eye className="w-3.5 h-3.5" />View Details
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Home Visit Card ───────────────────────────────────────────────────────────
function VisitCard({ visit, staffList, onRefresh, onOpen }) {
  const [saving, setSaving] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState(staffList[0]?.id || '');
  const [showComplete, setShowComplete] = useState(false);
  const [notes, setNotes] = useState('');

  const assign = async () => {
    if (!selectedStaff) return;
    setSaving(true);
    try { await api.assignStaffToVisit(visit.id, selectedStaff); await onRefresh(); } catch (e) { alert(e.message); } finally { setSaving(false); }
  };
  const complete = async () => {
    if (!notes.trim()) return;
    setSaving(true);
    try { await api.completeStoreVisit(visit.id, notes, []); await onRefresh(); setShowComplete(false); } catch (e) { alert(e.message); } finally { setSaving(false); }
  };

  return (
    <div className={`rounded-2xl border transition-all duration-200 overflow-hidden bg-white hover:shadow-md group ${visit.status === 'COMPLETED' ? 'border-blue-200 opacity-75' :
      visit.status === 'ASSIGNED' ? 'border-indigo-200' : 'border-slate-200 hover:border-indigo-300'
      } shadow-sm`}>
      <div className="p-4 flex items-start gap-3">
        <div className="flex flex-col items-center justify-center bg-gradient-to-b from-indigo-50 to-indigo-100 border border-indigo-200 rounded-xl px-3 py-2.5 min-w-[60px] shrink-0">
          <Home className="w-4 h-4 text-indigo-500 mb-0.5" />
          <span className="text-[9px] font-extrabold text-indigo-600 uppercase">Home</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-extrabold text-slate-800">{visit.customerName || 'Customer'}</p>
            <Badge status={visit.status} small />
          </div>
          <div className="flex items-start gap-1 mt-1.5">
            <MapPin className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-slate-500 leading-tight">{visit.address || 'Address on file'}</p>
          </div>
          {visit.preferredDate && (
            <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg">
              <Calendar className="w-3 h-3" />Preferred: {fmtDate(visit.preferredDate)}
            </span>
          )}
          {visit.assignedStaffName && (
            <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-lg ml-1">
              <UserCheck className="w-3 h-3" />{visit.assignedStaffName}
            </span>
          )}
        </div>
        <button onClick={() => onOpen(visit)}
          className="p-2 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition-all shrink-0 opacity-0 group-hover:opacity-100">
          <SlidersHorizontal className="w-4 h-4" />
        </button>
      </div>

      {visit.requirements && (
        <div className="px-4 pb-2">
          <p className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-xl p-2.5 leading-relaxed">
            <span className="font-bold text-slate-700">Requirements: </span>{visit.requirements}
          </p>
        </div>
      )}

      <div className="px-4 pb-4 flex gap-2 flex-wrap">
        {visit.status === 'PENDING' && (
          <div className="flex gap-2 flex-1">
            <select value={selectedStaff} onChange={e => setSelectedStaff(e.target.value)}
              className="flex-1 text-xs border border-slate-200 rounded-xl py-2 px-2.5 bg-white focus:outline-none focus:border-indigo-400 min-w-0">
              {staffList.map(s => <option key={s.id} value={s.id}>{s.fullName}</option>)}
            </select>
            <button onClick={assign} disabled={saving}
              className="px-3 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold shadow-sm transition-all disabled:opacity-60 flex items-center gap-1 shrink-0">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}Assign
            </button>
          </div>
        )}
        {visit.status === 'ASSIGNED' && !showComplete && (
          <button onClick={() => setShowComplete(true)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold shadow-sm transition-all">
            <CheckCircle className="w-3.5 h-3.5" />File Completion Report
          </button>
        )}
        {showComplete && (
          <div className="w-full space-y-2">
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              placeholder="What was done — measurements taken, items selected..."
              className="w-full text-xs border border-slate-200 rounded-xl p-3 focus:outline-none focus:border-blue-400 resize-none bg-white" />
            <div className="flex gap-2">
              <button onClick={complete} disabled={saving || !notes.trim()}
                className="flex-1 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold shadow-sm transition-all disabled:opacity-60 flex items-center justify-center gap-1.5">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}Submit
              </button>
              <button onClick={() => setShowComplete(false)} className="px-3 py-2 rounded-xl border border-slate-200 text-slate-400 text-xs"><X className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        )}
        <button onClick={() => onOpen(visit)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500 text-xs font-bold transition-all">
          <Eye className="w-3.5 h-3.5" />View Details
        </button>
      </div>
    </div>
  );
}

function StatsBar({ items, type }) {
  const c = {};
  items.forEach(i => { c[i.status] = (c[i.status] || 0) + 1; });
  const total = items.length;

  const getStatsConfig = () => {
    if (type === 'fittings') {
      return [
        { l: 'Pending', v: c.PENDING || 0, cl: 'text-amber-700 bg-amber-50 border-amber-200' },
        { l: 'Confirmed', v: c.CONFIRMED || 0, cl: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
        { l: 'Consulted', v: c.CONSULTED || 0, cl: 'text-teal-700 bg-teal-50 border-teal-200' },
        { l: 'Ordered', v: c.ORDERED || 0, cl: 'text-blue-700 bg-blue-50 border-blue-200' },
        { l: 'Completed', v: c.COMPLETED || 0, cl: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
        { l: 'Cancelled', v: c.CANCELLED || 0, cl: 'text-red-600 bg-red-50 border-red-200' },
      ];
    } else {
      return [
        { l: 'Pending', v: c.PENDING || 0, cl: 'text-amber-700 bg-amber-50 border-amber-200' },
        { l: 'Assigned', v: c.ASSIGNED || 0, cl: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
        { l: 'Completed', v: c.COMPLETED || 0, cl: 'text-blue-700 bg-blue-50 border-blue-200' },
        { l: 'Cancelled', v: c.CANCELLED || 0, cl: 'text-red-600 bg-red-50 border-red-200' },
      ];
    }
  };

  const stats = getStatsConfig();

  return (
    <div className="flex flex-col sm:flex-row bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden w-full">
      {/* Total Section */}
      <div className="bg-slate-50 px-6 py-4 flex flex-col justify-center items-center sm:items-start border-b sm:border-b-0 sm:border-r border-slate-200 min-w-[140px]">
        <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1">Total {type === 'fittings' ? 'Fittings' : 'Visits'}</span>
        <span className="text-3xl font-black text-slate-800 leading-none">{total}</span>
      </div>

      {/* Breakdown Section */}
      <div className="flex-1 p-3 flex flex-wrap gap-2 items-center">
        {stats.map(s => (
          <div key={s.l} className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold ${s.cl} flex-1 min-w-[100px] justify-between transition-all hover:scale-[1.02]`}>
            <span className="text-[10px] uppercase tracking-wide opacity-80">{s.l}</span>
            <span className="text-lg leading-none font-extrabold">{s.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Pagination Component ──────────────────────────────────────────────────
function PaginationControls({ currentPage, totalItems, itemsPerPage = 10, onPageChange }) {
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  if (totalPages <= 1) return null;

  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  const maxVisiblePages = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
  let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
  if (endPage - startPage + 1 < maxVisiblePages) {
    startPage = Math.max(1, endPage - maxVisiblePages + 1);
  }

  const pages = [];
  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100 text-xs font-semibold text-slate-500">
      <p className="text-[11px] text-slate-400">
        Showing <span className="font-bold text-slate-700">{startItem}–{endItem}</span> of <span className="font-bold text-slate-700">{totalItems}</span> items
      </p>

      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all font-bold flex items-center gap-1 shadow-xs"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Previous
        </button>

        <div className="flex items-center gap-1">
          {startPage > 1 && (
            <>
              <button
                onClick={() => onPageChange(1)}
                className="w-8 h-8 rounded-xl font-bold transition-all text-xs bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                1
              </button>
              {startPage > 2 && <span className="px-1 text-slate-400 font-bold">…</span>}
            </>
          )}

          {pages.map(p => (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`w-8 h-8 rounded-xl font-bold transition-all text-xs ${
                p === currentPage
                  ? 'bg-slate-800 text-white shadow-sm scale-105'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
              }`}
            >
              {p}
            </button>
          ))}

          {endPage < totalPages && (
            <>
              {endPage < totalPages - 1 && <span className="px-1 text-slate-400 font-bold">…</span>}
              <button
                onClick={() => onPageChange(totalPages)}
                className="w-8 h-8 rounded-xl font-bold transition-all text-xs bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                {totalPages}
              </button>
            </>
          )}
        </div>

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all font-bold flex items-center gap-1 shadow-xs"
        >
          Next <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function BookingsAppointments({ setActiveTab, isActive }) {
  const [section, setSection] = useState(() => {
    const savedFilter = sessionStorage.getItem('admin_order_date_filter') || sessionStorage.getItem('admin_order_status_filter');
    if (savedFilter) return 'orders';
    return 'fittings';
  });
  const [selDate, setSelDate] = useState(() => {
    const savedDateStr = sessionStorage.getItem('admin_order_date_filter');
    if (savedDateStr) {
      const d = new Date(savedDateStr + 'T00:00:00');
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  });
  const [appointments, setAppts] = useState([]);
  const [visits, setVisits] = useState([]);
  const [orders, setOrders] = useState([]);
  const [staffList, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefresh] = useState(false);
  const [filterStatus, setFilter] = useState('ALL');
  const [drawerItem, setDrawer] = useState(null); // { type: 'appt'|'visit', data }
  const [errorToast, setErrorToast] = useState(null);
  const [filterOrderId, setFilterOrderId] = useState(() => sessionStorage.getItem('filterBookingByOrderId'));
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [section, selDate, filterStatus]);

  // ── Create Booking Modal State ────────────────────────────────
  const [createModal, setCreateModal] = useState(false);
  const [createType, setCreateType] = useState('slot'); // 'slot' | 'fitting' | 'home'
  const [createDate, setCreateDate] = useState('');
  const [createTime, setCreateTime] = useState('');
  const [createProductType, setCreateProductType] = useState('');
  const [createApptType, setCreateApptType] = useState('CONSULTATION');
  const [createNotes, setCreateNotes] = useState('');
  const [createAddress, setCreateAddress] = useState('');
  const [createRequirements, setCreateRequirements] = useState('');
  const [createCustomerSearch, setCreateCustomerSearch] = useState('');
  const [createCustomerResults, setCreateCustomerResults] = useState([]);
  const [createCustomer, setCreateCustomer] = useState(null); // { id, fullName, phoneNumber, address }
  const [createSearching, setCreateSearching] = useState(false);
  const [createProductSearch, setCreateProductSearch] = useState('');
  const [createProductResults, setCreateProductResults] = useState([]);
  const [createProductSearching, setCreateProductSearching] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState('');

  const [availableSlots, setAvailableSlots] = useState([]);
  const [fetchingSlots, setFetchingSlots] = useState(false);

  useEffect(() => {
    if (!createDate) {
      setAvailableSlots([]);
      return;
    }
    const fetchSlots = async () => {
      setFetchingSlots(true);
      try {
        const dateObj = new Date(createDate);
        const y = dateObj.getFullYear();
        const m = String(dateObj.getMonth() + 1).padStart(2, '0');
        const d = String(dateObj.getDate()).padStart(2, '0');
        const isoDate = `${y}-${m}-${d}T12:00:00.000Z`;

        const res = await api.getAvailability(isoDate);
        console.log('API Availability Response:', res);
        setAvailableSlots(res?.availableSlots || []);
      } catch (e) {
        setAvailableSlots([]);
      } finally {
        setFetchingSlots(false);
      }
    };
    fetchSlots();
  }, [createDate]);

  const resetCreateModal = () => {
    setCreateType('slot');
    setCreateDate('');
    setCreateTime('');
    setCreateProductType('');
    setCreateProductSearch('');
    setCreateProductResults([]);
    setCreateApptType('CONSULTATION');
    setCreateNotes('');
    setCreateAddress('');
    setCreateRequirements('');
    setCreateCustomerSearch('');
    setCreateCustomerResults([]);
    setCreateCustomer(null);
    setCreateError('');
  };

  const searchCustomers = useCallback(async (q) => {
    if (!q || q.length < 2) { setCreateCustomerResults([]); return; }
    setCreateSearching(true);
    try {
      const results = await api.searchCustomers(q);
      setCreateCustomerResults(results || []);
    } catch (e) {
      setCreateCustomerResults([]);
    } finally {
      setCreateSearching(false);
    }
  }, []);

  const searchProducts = useCallback(async (q) => {
    setCreateProductSearching(true);
    try {
      const res = await api.getProductsPaginated({ search: q, limit: 5 });
      setCreateProductResults(res.data || []);
    } catch (e) {
      setCreateProductResults([]);
    } finally {
      setCreateProductSearching(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => searchCustomers(createCustomerSearch), 300);
    return () => clearTimeout(timer);
  }, [createCustomerSearch, searchCustomers]);

  useEffect(() => {
    if (createType === 'fitting') {
      const timer = setTimeout(() => searchProducts(createProductSearch), 300);
      return () => clearTimeout(timer);
    }
  }, [createProductSearch, searchProducts, createType]);

  const submitCreateBooking = async () => {
    setCreateError('');
    if (!createCustomer) { setCreateError('Please select a customer.'); return; }
    if (!createDate) { setCreateError('Please select a date.'); return; }

    if (createType !== 'home') {
      if (!createTime) { setCreateError('Please select a time slot.'); return; }
    }
    if (createType === 'fitting') {
      if (!createProductType.trim()) { setCreateError('Please enter the product / service details.'); return; }
    }
    if (createType === 'home') {
      if (!createAddress.trim()) { setCreateError('Please enter the address.'); return; }
      if (!createRequirements.trim()) { setCreateError('Please enter the requirements.'); return; }
    }

    setCreateSubmitting(true);
    try {
      const dateObj = new Date(createDate);
      const y = dateObj.getFullYear();
      const m = String(dateObj.getMonth() + 1).padStart(2, '0');
      const d = String(dateObj.getDate()).padStart(2, '0');
      const isoDate = `${y}-${m}-${d}T12:00:00.000Z`;

      if (createType === 'home') {
        await api.createStoreVisit({
          customerId: createCustomer.id,
          preferredDate: isoDate,
          address: createAddress,
          requirements: createRequirements,
          adminOverride: true,
        });
      } else {
        await api.createAppointment({
          userId: createCustomer.id,
          date: isoDate,
          timeSlot: createTime,
          productType: createType === 'slot' ? 'SLOT_BOOKING' : createProductType,
          type: createType === 'slot' ? 'CONSULTATION' : createApptType,
          notes: createNotes.trim() || undefined,
          adminOverride: true,
        });
      }

      setCreateModal(false);
      resetCreateModal();
      await load(true);
    } catch (e) {
      setCreateError(e.message || 'Failed to create booking.');
    } finally {
      setCreateSubmitting(false);
    }
  };

  useEffect(() => {
    if (sessionStorage.getItem('filterBookingByOrderId')) {
      sessionStorage.removeItem('filterBookingByOrderId');
    }
  }, []);

  const showError = (msg) => {
    setErrorToast(msg);
    setTimeout(() => setErrorToast(null), 4000);
  };

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true); else setRefresh(true);
    try {
      const [appts, vs, ords, staff] = await Promise.all([
        api.getAppointments(),
        api.getStoreVisits(),
        api.getOrders(),
        api.getStaffList().catch(() => []),
      ]);
      setAppts(appts || []);
      setVisits(vs || []);
      setOrders(ords || []);
      setStaff(staff || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefresh(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (isActive) {
      load(true);
    }
  }, [isActive, load]);

  const filteredOrder = filterOrderId ? orders.find(o => o.id === filterOrderId) : null;

  const isSel = d => filterOrderId ? true : isSameDay(d, selDate);
  const todayAppts = filterOrderId
    ? appointments.filter(a => a.orderId === filterOrderId && a.productType !== 'SLOT_BOOKING')
    : appointments.filter(a => isSel(a.date) && a.productType !== 'SLOT_BOOKING');
  const todayVisits = filterOrderId ? visits.filter(v => v.orderId === filterOrderId) : visits.filter(v => isSel(v.preferredDate || v.createdAt));
  const todaySlots = filterOrderId
    ? appointments.filter(a => a.orderId === filterOrderId && a.productType === 'SLOT_BOOKING')
    : appointments.filter(a => isSel(a.date) && a.productType === 'SLOT_BOOKING');
  const filtAppts = filterStatus === 'ALL' ? todayAppts : todayAppts.filter(a => a.status === filterStatus);
  const filtVisits = filterStatus === 'ALL' ? todayVisits : todayVisits.filter(v => v.status === filterStatus);
  const filtSlots = filterStatus === 'ALL' ? todaySlots : todaySlots.filter(a => a.status === filterStatus);

  const todayQuickOrders = filterOrderId
    ? orders.filter(o => o.id === filterOrderId && o.isQuickOrder)
    : orders.filter(o => isSel(o.createdAt) && o.isQuickOrder);
  const filtQuickOrders = filterStatus === 'ALL' ? todayQuickOrders : todayQuickOrders.filter(o => o.status === filterStatus || o.quickOrderStatus === filterStatus);

  const todayOrders = filterOrderId
    ? orders.filter(o => o.id === filterOrderId)
    : orders.filter(o => isSel(o.createdAt));
  const filtOrders = filterStatus === 'ALL' ? todayOrders : todayOrders.filter(o => o.status === filterStatus);

  const sortedAppts = [...filtAppts].sort((a, b) => (a.timeSlot || '').localeCompare(b.timeSlot || ''));
  const sortedSlots = [...filtSlots].sort((a, b) => (a.timeSlot || '').localeCompare(b.timeSlot || ''));

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const overdueAppts = appointments.filter(a => {
    if (a.status !== 'CONFIRMED') return false;
    const d = new Date(a.date);
    d.setHours(0, 0, 0, 0);
    return d < todayStart;
  });

  const overdueVisits = visits.filter(v => {
    if (v.status !== 'ASSIGNED') return false;
    const d = new Date(v.preferredDate || v.createdAt);
    d.setHours(0, 0, 0, 0);
    return d < todayStart;
  });

  const upcomingPendingAppts = appointments.filter(a => a.status === 'PENDING');
  const upcomingPendingVisits = visits.filter(v => v.status === 'PENDING');

  const upcomingPendingList = [
    ...upcomingPendingAppts.map(a => ({
      ...a,
      sectionType: a.productType === 'SLOT_BOOKING' ? 'slots' : 'fittings',
      bookingTypeLabel: a.productType === 'SLOT_BOOKING' ? 'Slot Booking' : 'Studio Fitting',
      bookingDate: new Date(a.date),
      time: a.timeSlot,
      customer: a.userName || 'Customer',
    })),
    ...upcomingPendingVisits.map(v => ({
      ...v,
      sectionType: 'home',
      bookingTypeLabel: 'Home Visit',
      bookingDate: new Date(v.preferredDate || v.createdAt),
      time: 'Home Visit',
      customer: v.customerName || 'Customer',
    }))
  ].sort((a, b) => a.bookingDate - b.bookingDate);

  const isToday = isSameDay(selDate, new Date());
  const totalSlots = section === 'fittings' ? todayAppts.length : section === 'slots' ? todaySlots.length : section === 'quick_orders' ? todayQuickOrders.length : section === 'orders' ? todayOrders.length : todayVisits.length;

  // Auto-switch tabs if the filtered order is a visit instead of an appointment
  useEffect(() => {
    if (filterOrderId) {
      if (todayAppts.length === 0 && todayVisits.length > 0 && section !== 'visits') {
        setSection('visits');
      } else if (todayAppts.length > 0 && todayVisits.length === 0 && section !== 'fittings') {
        setSection('fittings');
      }
    }
  }, [filterOrderId, todayAppts.length, todayVisits.length, section]);

  return (
    <div className="space-y-3">
      {/* Toast Notification */}
      {errorToast && (
        <div className="fixed bottom-6 right-6 bg-red-500 text-white px-5 py-3.5 rounded-2xl shadow-xl font-bold text-sm z-50 flex items-center gap-2.5 animate-in slide-in-from-bottom-5">
          <AlertCircle className="w-5 h-5 opacity-90" />
          {errorToast}
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2.5">
            <span className="w-10 h-10 rounded-2xl bg-brand-500 flex items-center justify-center shadow-md">
              <Calendar className="w-5 h-5 text-[#3D2E3D]" />
            </span>
            Bookings &amp; Appointments
          </h1>
          {filterOrderId && (
            <button onClick={() => setFilterOrderId(null)} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 rounded-xl text-xs font-bold hover:bg-red-100 transition-colors shadow-sm">
              <X className="w-3.5 h-3.5" /> Clear Order Filter
            </button>
          )}
        </div>
        <p className="text-sm text-slate-400 font-medium mt-1 ml-12.5 sm:hidden">
          {filterOrderId ? 'Filtered by Order' : (isToday ? '📅 Today' : fmtDate(selDate, { weekday: 'long' }))} · {totalSlots} {section === 'fittings' ? 'fittings' : section === 'orders' ? 'orders' : 'home visits'}
        </p>
        <div className="flex items-center gap-2 self-start">
          <button
            onClick={() => { resetCreateModal(); setCreateModal(true); }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-[#3D2E3D] text-xs font-bold transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />Create Booking
          </button>
          <button onClick={() => load(true)} disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 text-xs font-bold transition-all">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />Refresh
          </button>
        </div>
      </div>

      {/* ── Filtered Order Context ── */}
      {filteredOrder && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4 shadow-sm animate-in fade-in zoom-in-95 duration-300">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 shadow-inner">
              <ShoppingCart className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mb-0.5">Linked Order Context</p>
              <h2 className="text-xl font-black text-indigo-900 leading-tight">{formatOrderId(filteredOrder.invoiceNumber)}</h2>
            </div>
          </div>
          <div className="flex flex-wrap gap-8">
            <div>
              <p className="text-[10px] text-indigo-500 font-extrabold uppercase tracking-wide mb-1">Customer</p>
              <p className="font-bold text-indigo-950 text-sm">{filteredOrder.user?.fullName || 'Guest'}</p>
            </div>
            <div>
              <p className="text-[10px] text-indigo-500 font-extrabold uppercase tracking-wide mb-1">Order Status</p>
              <p className="font-bold text-indigo-950 text-sm">{filteredOrder.status}</p>
            </div>
            <div>
              <p className="text-[10px] text-indigo-500 font-extrabold uppercase tracking-wide mb-1">Order Total</p>
              <p className="font-black text-indigo-950 text-sm">₹{Number(filteredOrder.payableAmount || 0).toLocaleString('en-IN')}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Toggle ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center bg-white border border-slate-200 rounded-2xl p-1.5 w-fit shadow-sm gap-1 flex-wrap">
          <button onClick={() => { setSection('fittings'); setFilter('ALL'); }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${section === 'fittings' ? 'bg-brand-500 text-[#3D2E3D] shadow-md' : 'text-slate-400 hover:text-slate-600'
              }`}>
            <Scissors className="w-4 h-4" />Studio Fittings
            {todayAppts.length > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${section === 'fittings' ? 'bg-[#3D2E3D]/15 text-[#3D2E3D]' : 'bg-brand-100 text-brand-700'}`}>
                {todayAppts.length}
              </span>
            )}
          </button>

          <button onClick={() => { setSection('home'); setFilter('ALL'); }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${section === 'home' ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'
              }`}>
            <Home className="w-4 h-4" />Home Bookings
            {todayVisits.length > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${section === 'home' ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-700'}`}>
                {todayVisits.length}
              </span>
            )}
          </button>

          <button onClick={() => { setSection('quick_orders'); setFilter('ALL'); }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${section === 'quick_orders' ? 'bg-orange-500 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'
              }`}>
            <ShoppingCart className="w-4 h-4" />Quick Delivery
            {todayQuickOrders.length > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${section === 'quick_orders' ? 'bg-white/20 text-white' : 'bg-orange-100 text-orange-700'}`}>
                {todayQuickOrders.length}
              </span>
            )}
          </button>

          <button onClick={() => { setSection('slots'); setFilter('ALL'); }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 ${section === 'slots' ? 'bg-violet-500 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'
              }`}>
            <Clock className="w-4 h-4" />Slot Bookings
            {todaySlots.length > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${section === 'slots' ? 'bg-white/20 text-white' : 'bg-violet-100 text-violet-700'}`}>
                {todaySlots.length}
              </span>
            )}
          </button>
        </div>
      </div>



      {/* Helper Banner when viewing Fittings but Product Orders exist */}
      {section === 'fittings' && todayAppts.length === 0 && todayOrders.length > 0 && (
        <div className="bg-[#D8BFD8]/30 border border-[#C5A3C5] rounded-2xl p-4 flex items-center justify-between gap-3 text-xs shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2.5 text-[#2B1B2B] font-bold">
            <ShoppingBag className="w-5 h-5 text-purple-700 shrink-0" />
            <span>Notice: {todayOrders.length} Product Order(s) found for {fmtDate(selDate)}! (Studio fitting appointments are 0).</span>
          </div>
          <button onClick={() => setSection('orders')} className="px-4 py-2 bg-[#3D2E3D] text-white font-extrabold rounded-xl hover:bg-black transition-colors shadow-xs shrink-0">
            Switch to Product Orders ({todayOrders.length}) →
          </button>
        </div>
      )}

      {/* ── Action Required Notification Banner for Pending Upcoming Bookings ── */}
      {upcomingPendingList.length > 0 && (
        <div className="bg-gradient-to-r from-emerald-50 via-teal-50/60 to-emerald-50 border border-emerald-200/80 rounded-2xl p-3.5 shadow-sm space-y-2.5 animate-in fade-in">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-emerald-900">New Booking Action Required</span>
                  <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-500 text-white uppercase tracking-wider">
                    {upcomingPendingList.length} Pending
                  </span>
                </div>
                <p className="text-[11px] text-emerald-800 font-medium leading-tight">
                  New customer bookings received for upcoming dates. Click a date to jump to it & confirm:
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pt-0.5">
            {upcomingPendingList.map((item, idx) => {
              const isCurrentSel = isSameDay(item.bookingDate, selDate) && section === item.sectionType;
              const dateStr = fmtDate(item.bookingDate, { weekday: 'short', day: 'numeric', month: 'short' });

              return (
                <button
                  key={item.id || idx}
                  onClick={() => {
                    setSection(item.sectionType);
                    setSelDate(new Date(item.bookingDate));
                    setFilter('PENDING');
                  }}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all shrink-0 ${
                    isCurrentSel
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm scale-[1.02]'
                      : 'bg-white text-emerald-950 border-emerald-200 hover:border-emerald-400 hover:bg-emerald-100/50'
                  }`}
                >
                  <span className="text-[10px] font-extrabold uppercase opacity-80">{item.bookingTypeLabel}</span>
                  <span className="w-1 h-1 rounded-full bg-emerald-400 shrink-0" />
                  <span>{dateStr}</span>
                  {item.time && item.time !== 'Home Visit' && (
                    <span className="text-[10px] opacity-75 font-semibold">({item.time.split(' - ')[0]})</span>
                  )}
                  <ArrowRight className="w-3.5 h-3.5 opacity-60" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Day Navigator ────────────────────────────────────────── */}
      {(section === 'fittings' && overdueAppts.length > 0) || (section === 'home' && overdueVisits.length > 0) ? (
        <div className="flex items-center gap-2 bg-amber-50 text-amber-700 border border-amber-200 px-4 py-2.5 rounded-xl shadow-sm text-xs font-bold w-fit animate-in fade-in">
          <AlertCircle className="w-4 h-4" />
          <span>
            {section === 'fittings' ? overdueAppts.length : overdueVisits.length} {section === 'fittings' ? 'Fittings' : 'Visits'} confirmed from past dates need checkout
          </span>
        </div>
      ) : null}
      <div className="flex flex-col xl:flex-row gap-2 xl:items-center">
        <div className="shrink-0 max-w-full overflow-x-auto w-full">
          <DayNavigator value={selDate} onChange={setSelDate} appointments={appointments} visits={visits} orders={orders} section={section} />
        </div>

        {!loading && (
          <div className="flex-1 w-full xl:w-auto">
            <StatsBar items={section === 'fittings' ? todayAppts : section === 'orders' ? todayOrders : todayVisits} type={section} />
          </div>
        )}
      </div>

      {/* ── Status Filters ───────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {(section === 'fittings'
          ? ['ALL', 'PENDING', 'CONFIRMED', 'CONSULTED', 'ORDERED', 'COMPLETED', 'CANCELLED']
          : section === 'slots'
            ? ['ALL', 'PENDING', 'CONFIRMED', 'CONSULTED', 'ORDERED', 'CANCELLED']
            : ['ALL', 'PENDING', 'ASSIGNED', 'COMPLETED', 'CANCELLED']
        ).map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${filterStatus === s ? 'bg-slate-800 text-white border-slate-800 shadow-sm' : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50'
              }`}>{s === 'ALL' ? 'All Slots' : s.replace(/_/g, ' ')}</button>
        ))}
      </div>

      {/* ── Content ─────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center">
            <Loader2 className="w-7 h-7 text-brand-500 animate-spin" />
          </div>
          <p className="text-sm text-slate-400 font-semibold">Loading schedule...</p>
        </div>
      ) : (
        <>
          {section === 'orders' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-8 h-8 rounded-xl bg-purple-100 flex items-center justify-center">
                  <ShoppingBag className="w-4 h-4 text-purple-600" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-slate-800">Product Orders</h2>
                  <p className="text-xs text-slate-400">{isToday ? "Today's product orders" : fmtDate(selDate)} · {filtOrders.length} orders</p>
                </div>
              </div>
              {filtOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4"><ShoppingBag className="w-7 h-7 text-slate-300" /></div>
                  <p className="font-bold text-slate-700">No Product Orders</p>
                  <p className="text-sm text-slate-400 mt-1">{isToday ? 'No orders received today' : `No orders on ${fmtDate(selDate)}`}</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filtOrders.slice((currentPage - 1) * 10, currentPage * 10).map(o => (
                      <div key={o.id} className="rounded-2xl border border-purple-200 bg-white p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-3 group">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-xs font-black text-[#3D2E3D] group-hover:text-purple-700 transition-colors">{formatOrderId(o.invoiceNumber)}</p>
                            <p className="text-xs font-bold text-slate-700 mt-0.5">{o.user?.fullName || o.customerName || 'Customer'}</p>
                          </div>
                          <Badge status={o.status} small />
                        </div>

                        <div className="text-xs text-slate-500 bg-purple-50/50 border border-purple-100 p-2.5 rounded-xl space-y-1">
                          <p className="truncate">📍 {o.shippingAddress?.city || o.shippingAddress?.addressLine1 || 'Standard Delivery'}</p>
                          {(o.user?.phoneNumber || o.shippingAddress?.phone) && (
                            <p className="font-semibold text-slate-600">📞 {o.user?.phoneNumber || o.shippingAddress?.phone}</p>
                          )}
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                          <span className="text-xs font-black text-[#3D2E3D]">₹{Number(o.payableAmount || 0).toLocaleString('en-IN')}</span>
                          <button 
                            onClick={() => {
                              if (setActiveTab) setActiveTab('orders');
                              else window.location.href = '/admin/orders';
                            }}
                            className="text-xs font-bold text-purple-700 hover:underline flex items-center gap-1"
                          >
                            View Details →
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <PaginationControls
                    currentPage={currentPage}
                    totalItems={filtOrders.length}
                    itemsPerPage={10}
                    onPageChange={setCurrentPage}
                  />
                </>
              )}
            </div>
          )}

          {section === 'quick_orders' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-8 h-8 rounded-xl bg-orange-100 flex items-center justify-center">
                  <ShoppingCart className="w-4 h-4 text-orange-600" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-slate-800">Quick Delivery</h2>
                  <p className="text-xs text-slate-400">{isToday ? "Today's quick deliveries" : fmtDate(selDate)} · {filtQuickOrders.length} deliveries</p>
                </div>
              </div>
              {filtQuickOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4"><ShoppingCart className="w-7 h-7 text-slate-300" /></div>
                  <p className="font-bold text-slate-700">No Quick Deliveries</p>
                  <p className="text-sm text-slate-400 mt-1">{isToday ? 'No quick deliveries found for today' : `Nothing on ${fmtDate(selDate)}`}</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {filtQuickOrders.slice((currentPage - 1) * 10, currentPage * 10).map(o => (
                      <div key={o.id} className="rounded-2xl border bg-white shadow-sm hover:shadow-md transition-all overflow-hidden group border-orange-200">
                        <div className="p-4 flex items-start gap-3">
                          <div className="flex flex-col items-center justify-center bg-gradient-to-b from-orange-50 to-orange-100 border border-orange-200 rounded-xl px-3 py-2.5 min-w-[60px] shrink-0">
                            <ShoppingCart className="w-3.5 h-3.5 text-orange-600 mb-1" />
                            <span className="text-[11px] font-extrabold text-orange-700 leading-tight text-center">Quick</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-extrabold text-slate-800 truncate">{o.customerName || 'Customer'}</p>
                              <Badge status={o.status} small />
                            </div>
                            <div className="flex items-center gap-1 mt-1 text-xs text-slate-500 font-bold">
                              Order ID: <span className="text-slate-700">{formatOrderId(o.invoiceNumber) || 'N/A'}</span>
                            </div>
                            {o.quickOrderReason && (
                              <p className="text-xs text-slate-500 mt-1.5 bg-slate-50 border border-slate-100 rounded-lg px-2 py-1.5 leading-relaxed" style={{ maxHeight: 48, overflow: 'hidden' }}>
                                <span className="font-bold text-slate-600">Reason:</span> {o.quickOrderReason}
                              </p>
                            )}
                          </div>
                          <button onClick={() => {
                            if (setActiveTab) setActiveTab('orders');
                            else window.location.href = '/admin/orders';
                          }}
                            className="p-2 rounded-xl border border-slate-200 hover:border-orange-300 hover:bg-orange-50 text-slate-400 hover:text-orange-600 transition-all shrink-0 opacity-0 group-hover:opacity-100">
                            <ArrowRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <PaginationControls
                    currentPage={currentPage}
                    totalItems={filtQuickOrders.length}
                    itemsPerPage={10}
                    onPageChange={setCurrentPage}
                  />
                </>
              )}
            </div>
          )}

          {section === 'slots' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-violet-600" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-slate-800">Slot Bookings</h2>
                  <p className="text-xs text-slate-400">{isToday ? "Today's slots" : fmtDate(selDate)} · {sortedSlots.length} slots</p>
                </div>
              </div>
              {sortedSlots.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4"><Clock className="w-7 h-7 text-slate-300" /></div>
                  <p className="font-bold text-slate-700">No Slot Bookings</p>
                  <p className="text-sm text-slate-400 mt-1">{isToday ? 'No slots booked for today' : `Nothing on ${fmtDate(selDate)}`}</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {sortedSlots.slice((currentPage - 1) * 10, currentPage * 10).map(a => (
                      <div key={a.id} className={`rounded-2xl border bg-white shadow-sm hover:shadow-md transition-all overflow-hidden group ${a.status === 'CONFIRMED' ? 'border-emerald-200' :
                          a.status === 'CANCELLED' ? 'border-red-100 opacity-60' :
                            a.status === 'CONSULTED' ? 'border-teal-200' :
                              a.status === 'ORDERED' ? 'border-blue-200' : 'border-violet-200 hover:border-violet-300'
                        }`}>
                        <div className="p-4 flex items-start gap-3">
                          {/* Time tile */}
                          <div className="flex flex-col items-center justify-center bg-gradient-to-b from-violet-50 to-violet-100 border border-violet-200 rounded-xl px-3 py-2.5 min-w-[60px] shrink-0">
                            <Clock className="w-3.5 h-3.5 text-violet-600 mb-1" />
                            <span className="text-[11px] font-extrabold text-violet-700 leading-tight text-center">{a.timeSlot || '—'}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-extrabold text-slate-800 truncate">{a.userName || 'Walk-In Customer'}</p>
                              <Badge status={a.status} small />
                            </div>
                            {a.user?.phoneNumber && <span className="text-[10px] text-slate-400 flex items-center gap-1 mt-1"><Phone className="w-3 h-3" />{a.user.phoneNumber}</span>}
                            {a.notes && (
                              <p className="text-xs text-slate-500 mt-1.5 bg-slate-50 border border-slate-100 rounded-lg px-2 py-1.5 leading-relaxed" style={{ maxHeight: 48, overflow: 'hidden' }}>
                                {a.notes}
                              </p>
                            )}
                          </div>
                          <button onClick={() => setDrawer({ type: 'appt', data: a })}
                            className="p-2 rounded-xl border border-slate-200 hover:border-violet-300 hover:bg-violet-50 text-slate-400 hover:text-violet-600 transition-all shrink-0 opacity-0 group-hover:opacity-100">
                            <SlidersHorizontal className="w-4 h-4" />
                          </button>
                        </div>
                        {/* Quick actions */}
                        {!['CANCELLED', 'CONSULTED', 'ORDERED'].includes(a.status) && (
                          <div className="px-4 pb-4 flex gap-2">
                            {a.status === 'PENDING' && (
                              <button
                                onClick={async () => { try { await api.updateAppointmentStatus(a.id, 'CONFIRMED'); await load(true); } catch (e) { showError(e.message); } }}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold shadow-sm transition-all"
                              >
                                <CheckCircle className="w-3.5 h-3.5" />Confirm
                              </button>
                            )}
                            {a.status === 'CONFIRMED' && (
                              <>
                                <button
                                  onClick={async () => { try { await api.updateAppointmentStatus(a.id, 'CONSULTED'); await load(true); } catch (e) { showError(e.message); } }}
                                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-teal-500 hover:bg-teal-600 text-white text-xs font-bold shadow-sm transition-all"
                                >
                                  <Sparkles className="w-3.5 h-3.5" />Consulted
                                </button>
                                <button
                                  onClick={async () => { try { await api.updateAppointmentStatus(a.id, 'ORDERED'); await load(true); } catch (e) { showError(e.message); } }}
                                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold shadow-sm transition-all"
                                >
                                  <ShoppingBag className="w-3.5 h-3.5" />Ordered
                                </button>
                              </>
                            )}
                            <button
                              onClick={async () => { try { await api.updateAppointmentStatus(a.id, 'CANCELLED'); await load(true); } catch (e) { showError(e.message); } }}
                              className="px-3 py-2 rounded-xl border border-red-200 hover:bg-red-50 text-red-400 text-xs font-bold transition-all"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                        {['CONSULTED', 'ORDERED', 'CANCELLED'].includes(a.status) && (
                          <div className="px-4 pb-4">
                            <button onClick={() => setDrawer({ type: 'appt', data: a })}
                              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500 text-xs font-bold transition-all">
                              <Eye className="w-3.5 h-3.5" />View Details
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <PaginationControls
                    currentPage={currentPage}
                    totalItems={sortedSlots.length}
                    itemsPerPage={10}
                    onPageChange={setCurrentPage}
                  />
                </>
              )}

              {/* All slot bookings table */}
              {appointments.filter(a => a.productType === 'SLOT_BOOKING').length > 0 && (
                <div className="mt-8 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-violet-500" />
                    <h3 className="text-sm font-extrabold text-slate-700">All Slot Bookings</h3>
                    <span className="ml-auto text-[10px] text-slate-400 font-medium">Upcoming & active</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 border-b border-slate-100">
                        <tr>{['Customer', 'Date', 'Time', 'Description', 'Status', 'Action'].map(h =>
                          <th key={h} className="text-left py-3 px-4 font-bold text-slate-400 uppercase tracking-wider text-[10px]">{h}</th>
                        )}</tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {appointments
                          .filter(a => a.productType === 'SLOT_BOOKING' && !['CANCELLED'].includes(a.status))
                          .sort((a, b) => new Date(a.date) - new Date(b.date))
                          .slice(0, 25)
                          .map(a => (
                            <tr key={a.id} className="hover:bg-slate-50/70 transition-colors">
                              <td className="py-3 px-4 font-bold text-slate-700">{a.userName || 'Walk-In'}</td>
                              <td className="py-3 px-4 text-slate-600">{fmtDate(a.date)}</td>
                              <td className="py-3 px-4 text-slate-500">{a.timeSlot}</td>
                              <td className="py-3 px-4 text-slate-500 max-w-[160px] truncate">{a.notes || '—'}</td>
                              <td className="py-3 px-4"><Badge status={a.status} small /></td>
                              <td className="py-3 px-4">
                                <button onClick={() => setDrawer({ type: 'appt', data: a })}
                                  className="px-2.5 py-1 rounded-lg border border-violet-300 text-violet-600 text-[10px] font-bold hover:bg-violet-50 transition-all flex items-center gap-1">
                                  Open <ArrowRight className="w-3 h-3" />
                                </button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {section === 'fittings' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-8 h-8 rounded-xl bg-brand-100 flex items-center justify-center">
                  <Scissors className="w-4 h-4 text-brand-600" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-slate-800">Studio Fitting Appointments</h2>
                  <p className="text-xs text-slate-400">{isToday ? "Today's schedule" : fmtDate(selDate)} · {sortedAppts.length} slots</p>
                </div>
              </div>
              {sortedAppts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4"><Scissors className="w-7 h-7 text-slate-300" /></div>
                  <p className="font-bold text-slate-700">No Studio Fittings</p>
                  <p className="text-sm text-slate-400 mt-1">{isToday ? 'Nothing scheduled for today' : `Nothing on ${fmtDate(selDate)}`}</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {sortedAppts.slice((currentPage - 1) * 10, currentPage * 10).map(a => (
                      <ApptCard key={a.id} appt={a}
                        onQuickStatus={async (id, st) => {
                          try {
                            await api.updateAppointmentStatus(id, st);
                            await load(true);
                          } catch (e) {
                            showError(e.message || "Failed to update");
                          }
                        }}
                        onOpen={a => setDrawer({ type: 'appt', data: a })}
                        setActiveTab={setActiveTab}
                      />
                    ))}
                  </div>

                  <PaginationControls
                    currentPage={currentPage}
                    totalItems={sortedAppts.length}
                    itemsPerPage={10}
                    onPageChange={setCurrentPage}
                  />
                </>
              )}
            </div>
          )}

          {section === 'home' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center">
                  <Home className="w-4 h-4 text-indigo-600" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-slate-800">Home Visit Bookings</h2>
                  <p className="text-xs text-slate-400">{isToday ? "Today's home visits" : fmtDate(selDate)} · {filtVisits.length} visits</p>
                </div>
              </div>
              {filtVisits.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4"><Home className="w-7 h-7 text-slate-300" /></div>
                  <p className="font-bold text-slate-700">No Home Visits</p>
                  <p className="text-sm text-slate-400 mt-1">{isToday ? 'Nothing scheduled for today' : `Nothing on ${fmtDate(selDate)}`}</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {filtVisits.slice((currentPage - 1) * 10, currentPage * 10).map(v => (
                      <VisitCard key={v.id} visit={v} staffList={staffList}
                        onRefresh={() => load(true)}
                        onOpen={v => setDrawer({ type: 'visit', data: v })}
                        setActiveTab={setActiveTab}
                      />
                    ))}
                  </div>

                  <PaginationControls
                    currentPage={currentPage}
                    totalItems={filtVisits.length}
                    itemsPerPage={10}
                    onPageChange={setCurrentPage}
                  />
                </>
              )}
            </div>
          )}

          {/* ── Upcoming overview table ───────────────────────────── */}
          {section === 'fittings' && appointments.length > 0 && (
            <div className="mt-8 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-brand-500" />
                <h3 className="text-sm font-extrabold text-slate-700">All Upcoming Fittings</h3>
                <span className="ml-auto text-[10px] text-slate-400 font-medium">Next 30 days · pending &amp; confirmed</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>{['Customer', 'Date', 'Time', 'Product', 'Status', 'Action'].map(h =>
                      <th key={h} className="text-left py-3 px-4 font-bold text-slate-400 uppercase tracking-wider text-[10px]">{h}</th>
                    )}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {appointments
                      .filter(a => new Date(a.date) >= new Date() && !['CANCELLED'].includes(a.status))
                      .sort((a, b) => new Date(a.date) - new Date(b.date))
                      .slice(0, 25)
                      .map(a => (
                        <tr key={a.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-4 font-bold text-slate-700">{a.userName || 'Walk-In'}</td>
                          <td className="py-3 px-4 text-slate-600">{fmtDate(a.date)}</td>
                          <td className="py-3 px-4 text-slate-500">{a.timeSlot}</td>
                          <td className="py-3 px-4 text-slate-500">{a.productType || '—'}</td>
                          <td className="py-3 px-4"><Badge status={a.status} small /></td>
                          <td className="py-3 px-4">
                            <div className="flex gap-2">
                              {a.status === 'PENDING' && (
                                <button onClick={async () => { await api.updateAppointmentStatus(a.id, 'CONFIRMED'); load(true); }}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-bold transition-all">Confirm</button>
                              )}
                              <button onClick={() => setDrawer({ type: 'appt', data: a })}
                                className="px-2.5 py-1 rounded-lg border border-brand-300 text-brand-600 text-[10px] font-bold hover:bg-brand-50 transition-all flex items-center gap-1">
                                Open <ArrowRight className="w-3 h-3" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {section === 'home' && visits.length > 0 && (
            <div className="mt-8 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
                <Home className="w-4 h-4 text-indigo-500" />
                <h3 className="text-sm font-extrabold text-slate-700">All Home Visit Requests</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>{['Customer', 'Address', 'Preferred Date', 'Staff', 'Status', 'Action'].map(h =>
                      <th key={h} className="text-left py-3 px-4 font-bold text-slate-400 uppercase tracking-wider text-[10px]">{h}</th>
                    )}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {visits
                      .filter(v => v.status !== 'CANCELLED')
                      .sort((a, b) => new Date(a.preferredDate || a.createdAt) - new Date(b.preferredDate || b.createdAt))
                      .slice(0, 25)
                      .map(v => (
                        <tr key={v.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-4 font-bold text-slate-700">{v.customerName}</td>
                          <td className="py-3 px-4 text-slate-500 max-w-[140px] truncate">{v.address || '—'}</td>
                          <td className="py-3 px-4 text-slate-600">{v.preferredDate ? fmtDate(v.preferredDate) : '—'}</td>
                          <td className="py-3 px-4"><span className={`font-semibold ${v.assignedStaffName ? 'text-indigo-600' : 'text-slate-300'}`}>{v.assignedStaffName || 'Unassigned'}</span></td>
                          <td className="py-3 px-4"><Badge status={v.status} small /></td>
                          <td className="py-3 px-4">
                            <button onClick={() => setDrawer({ type: 'visit', data: v })}
                              className="px-2.5 py-1 rounded-lg border border-indigo-300 text-indigo-600 text-[10px] font-bold hover:bg-indigo-50 transition-all flex items-center gap-1">
                              Open <ArrowRight className="w-3 h-3" />
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Full Detail Drawer ───────────────────────────────────── */}
      {drawerItem && (
        <DetailDrawer
          appt={drawerItem.type === 'appt' ? drawerItem.data : null}
          visit={drawerItem.type === 'visit' ? drawerItem.data : null}
          orders={orders}
          staffList={staffList}
          onClose={() => setDrawer(null)}
          onRefresh={() => load(true)}
          setActiveTab={setActiveTab}
        />
      )}

      {/* ── Create Booking Drawer ─────────────────────────────────── */}
      {createModal && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/60 backdrop-blur-sm transition-opacity">
          <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0 bg-slate-50/80">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-brand-100 to-brand-200 flex items-center justify-center shadow-sm border border-brand-200/50">
                  <Plus className="w-5 h-5 text-brand-700" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-800 tracking-tight">Create Booking</h2>
                  <p className="text-xs text-slate-400 font-medium">Schedule appointments, studio fittings, or home visits</p>
                </div>
              </div>
              <button onClick={() => setCreateModal(false)} className="p-2 rounded-xl hover:bg-slate-200/60 border border-transparent hover:border-slate-200 text-slate-400 hover:text-slate-600 transition-all shadow-sm">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-6 space-y-6">

              {/* ── Booking Type ── */}
              <div>
                <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider mb-3">Select Booking Type</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { key: 'slot', label: 'Slot Booking', desc: 'Simple time slot with notes', icon: Clock, activeStyle: 'border-violet-500 bg-violet-50/50 text-violet-950 ring-2 ring-violet-500/20' },
                    { key: 'fitting', label: 'Studio Fitting', desc: 'In-store product appointment', icon: Scissors, activeStyle: 'border-brand-500 bg-brand-50/50 text-brand-950 ring-2 ring-brand-500/20' },
                    { key: 'home', label: 'Home Visit', desc: 'At-home measurement & fitting', icon: Home, activeStyle: 'border-indigo-500 bg-indigo-50/50 text-indigo-950 ring-2 ring-indigo-500/20' },
                  ].map(t => {
                    const active = createType === t.key;
                    const Icon = t.icon;
                    return (
                      <button key={t.key} type="button" onClick={() => { setCreateType(t.key); setCreateError(''); }}
                        className={`relative flex flex-col p-4 rounded-2xl border text-left transition-all duration-200 ${active ? t.activeStyle : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80 shadow-sm'
                          }`}>
                        <div className="flex items-center justify-between mb-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${active ? 'bg-slate-900 text-white shadow-md' : 'bg-slate-100 text-slate-500'}`}>
                            <Icon className="w-5 h-5" />
                          </div>
                          {active && (
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-100 animate-pulse" />
                          )}
                        </div>
                        <p className="text-sm font-extrabold text-slate-800">{t.label}</p>
                        <p className="text-[11px] text-slate-400 font-medium leading-snug mt-1">{t.desc}</p>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* ── Customer Search ── */}
              <div>
                <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider mb-2.5">Customer Details</p>
                {createCustomer ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between bg-emerald-50/70 border border-emerald-200/80 rounded-2xl px-4 py-3 shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center border border-emerald-200 shrink-0">
                          <User className="w-5 h-5 text-emerald-700" />
                        </div>
                        <div>
                          <p className="text-sm font-extrabold text-emerald-900">{createCustomer.fullName}</p>
                          <p className="text-xs text-emerald-600 font-medium">{createCustomer.phoneNumber || createCustomer.email}</p>
                        </div>
                      </div>
                      <button type="button" onClick={() => { setCreateCustomer(null); setCreateCustomerSearch(''); }}
                        className="text-emerald-600 hover:bg-emerald-100/80 p-2 rounded-xl transition-colors"><X className="w-4 h-4" /></button>
                    </div>
                    {/* Address Hint for Home Visit */}
                    {createType === 'home' && createCustomer.address && (
                      <div className="bg-blue-50/70 border border-blue-200/80 rounded-2xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
                        <div className="text-xs text-blue-900">
                          <span className="font-extrabold uppercase text-[10px] text-blue-600 block">Saved Customer Address</span>
                          <span className="font-semibold">{
                            (() => {
                              let addr = createCustomer.address;
                              if (typeof addr === 'object' && addr !== null) {
                                return Object.values(addr).filter(Boolean).join(', ');
                              }
                              try {
                                const parsed = JSON.parse(addr);
                                return typeof parsed === 'object' && parsed !== null ? Object.values(parsed).filter(Boolean).join(', ') : addr;
                              } catch (e) { return String(addr); }
                            })()
                          }</span>
                        </div>
                        <button type="button" onClick={() => {
                          let addr = createCustomer.address;
                          if (typeof addr === 'object' && addr !== null) {
                            addr = Object.values(addr).filter(Boolean).join(', ');
                          } else {
                            try {
                              const parsed = JSON.parse(addr);
                              if (typeof parsed === 'object' && parsed !== null) addr = Object.values(parsed).filter(Boolean).join(', ');
                            } catch (e) { }
                          }
                          setCreateAddress(String(addr));
                        }} className="shrink-0 text-[11px] font-extrabold uppercase tracking-wider bg-blue-600 text-white px-3.5 py-2 rounded-xl hover:bg-blue-700 transition-colors shadow-sm">
                          Auto-fill Address
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="relative">
                    <div className="flex items-center gap-2.5 border border-slate-200 rounded-2xl px-4 py-3 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20 bg-white transition-all shadow-sm">
                      <User className="w-4.5 h-4.5 text-slate-400 shrink-0" />
                      <input
                        type="text"
                        value={createCustomerSearch}
                        onChange={e => setCreateCustomerSearch(e.target.value)}
                        placeholder="Search customer by name or phone number..."
                        className="flex-1 text-sm bg-transparent focus:outline-none text-slate-800 placeholder-slate-400 font-medium"
                      />
                      {createSearching && <Loader2 className="w-4 h-4 text-brand-500 animate-spin shrink-0" />}
                    </div>
                    {createCustomerResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl z-20 overflow-hidden max-h-60 overflow-y-auto">
                        {createCustomerResults.map(c => (
                          <button key={c.id} type="button" onClick={async () => {
                            try {
                              const full = await api.getCustomerDetails(c.id);
                              setCreateCustomer(full.user);
                            } catch (e) {
                              setCreateCustomer(c);
                            }
                            setCreateCustomerSearch('');
                            setCreateCustomerResults([]);
                          }}
                            className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0 flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center text-xs font-black shrink-0">{c.fullName?.charAt(0).toUpperCase()}</div>
                            <div>
                              <p className="text-sm font-extrabold text-slate-800">{c.fullName}</p>
                              <p className="text-xs text-slate-400 font-medium">{c.phoneNumber || c.email}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {createCustomerSearch.length >= 2 && !createSearching && createCustomerResults.length === 0 && (
                      <p className="text-xs text-slate-400 mt-2 pl-2 flex items-center gap-1.5 font-medium"><AlertCircle className="w-3.5 h-3.5 text-slate-400" /> No matching customers found</p>
                    )}
                  </div>
                )}
              </div>

              {/* ── Date Selection ── */}
              <div>
                <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider mb-2.5">Target Date</p>
                <div className="relative">
                  <Calendar className="w-4.5 h-4.5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    type="date"
                    value={createDate}
                    onChange={e => setCreateDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full text-sm font-semibold border border-slate-200 rounded-2xl py-3 pl-11 pr-4 bg-white focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 text-slate-800 transition-all shadow-sm"
                  />
                </div>
              </div>

              {/* ── Time Slot Selection (not for Home Visit) ── */}
              {createType !== 'home' && (
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">Time Slot</p>
                    {createTime && (
                      <span className="text-xs font-extrabold text-brand-600 bg-brand-50 px-2.5 py-0.5 rounded-full border border-brand-200/60">
                        Selected: {createTime}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                    {fetchingSlots ? (
                      <div className="col-span-full text-center py-6 text-xs font-semibold text-slate-400 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-brand-500" /> Fetching available time slots...
                      </div>
                    ) : availableSlots.length > 0 ? (
                      availableSlots.map(s => {
                        const isSelected = createTime === s;
                        return (
                          <button key={s} type="button" onClick={() => setCreateTime(s)}
                            className={`py-3 px-2 rounded-xl text-xs font-extrabold border transition-all duration-200 shadow-sm ${isSelected
                                ? 'bg-slate-900 text-white border-slate-900 ring-2 ring-slate-900/20 shadow-md scale-[1.02]'
                                : 'border-slate-200 text-slate-700 hover:border-brand-300 hover:bg-brand-50/50 bg-white'
                              }`}>
                            {s}
                          </button>
                        );
                      })
                    ) : (
                      <div className="col-span-full text-center py-6 text-xs font-semibold text-slate-400 bg-slate-50 rounded-2xl border border-slate-100">
                        {createDate ? 'No available slots for this date.' : 'Please select a date first to view time slots.'}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Studio Fitting fields ── */}
              {createType === 'fitting' && (
                <div className="space-y-5 pt-3 border-t border-slate-100">
                  <div>
                    <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider mb-2.5">Appointment Category</p>
                    <div className="flex gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200/60">
                      {['MEASUREMENT', 'CONSULTATION', 'PRODUCT_SELECTION'].map(t => (
                        <button key={t} type="button" onClick={() => setCreateApptType(t)}
                          className={`flex-1 py-2.5 rounded-xl text-xs font-extrabold transition-all ${createApptType === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                            }`}>
                          {t.replace(/_/g, ' ')}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider mb-2.5 flex items-center gap-1">Product / Service Details <span className="text-red-500">*</span></p>
                    <div className="relative">
                      <div className="flex items-center gap-2.5 border border-slate-200 rounded-2xl px-4 py-3 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20 bg-white transition-all shadow-sm">
                        <ShoppingBag className="w-4.5 h-4.5 text-slate-400 shrink-0" />
                        <input
                          type="text"
                          value={createProductType}
                          onChange={e => {
                            setCreateProductType(e.target.value);
                            setCreateProductSearch(e.target.value);
                          }}
                          placeholder="Search catalog or enter custom outfit name..."
                          className="flex-1 text-sm bg-transparent focus:outline-none text-slate-800 placeholder-slate-400 font-medium"
                        />
                        {createProductSearching && <Loader2 className="w-4 h-4 text-brand-500 animate-spin shrink-0" />}
                      </div>

                      {/* Product Suggestions Dropdown */}
                      {createProductResults.length > 0 && createProductType.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl z-20 overflow-hidden max-h-60 overflow-y-auto">
                          <p className="text-[10px] font-extrabold text-slate-400 uppercase px-4 py-2 bg-slate-50 border-b border-slate-100 tracking-wider">Catalog Suggestions</p>
                          {createProductResults.map(p => (
                            <button key={p.id} type="button" onClick={() => { setCreateProductType(p.name); setCreateProductSearch(''); setCreateProductResults([]); }}
                              className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0 flex items-center gap-3">
                              {p.images && p.images[0] ? (
                                <img src={p.images[0]} alt="" className="w-9 h-9 rounded-xl object-cover shrink-0 border border-slate-100" />
                              ) : (
                                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0"><Tag className="w-4 h-4 text-slate-400" /></div>
                              )}
                              <div>
                                <p className="text-sm font-extrabold text-slate-800 line-clamp-1">{p.name}</p>
                                <p className="text-xs text-slate-500 font-semibold">{p.category?.name}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Slot Booking Description ── */}
              {createType === 'slot' && (
                <div className="pt-2 border-t border-slate-100">
                  <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider mb-2.5">Description <span className="text-slate-400 font-normal normal-case">(optional)</span></p>
                  <textarea
                    value={createNotes}
                    onChange={e => setCreateNotes(e.target.value)}
                    rows={3}
                    placeholder="Purpose of slot — e.g. discuss embroidery details, fabric selection, fitting adjustments..."
                    className="w-full text-sm font-medium border border-slate-200 rounded-2xl p-3.5 bg-white focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 resize-none text-slate-800 transition-all shadow-sm"
                  />
                </div>
              )}

              {/* ── Studio Fitting Notes ── */}
              {createType === 'fitting' && (
                <div>
                  <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider mb-2.5">Additional Notes <span className="text-slate-400 font-normal normal-case">(optional)</span></p>
                  <textarea
                    value={createNotes}
                    onChange={e => setCreateNotes(e.target.value)}
                    rows={3}
                    placeholder="Special instructions, studio preferences, fabric details..."
                    className="w-full text-sm font-medium border border-slate-200 rounded-2xl p-3.5 bg-white focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 resize-none text-slate-800 transition-all shadow-sm"
                  />
                </div>
              )}

              {/* ── Home Visit fields ── */}
              {createType === 'home' && (
                <div className="space-y-5 pt-3 border-t border-slate-100">
                  <div>
                    <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider mb-2.5">Full Visit Address <span className="text-red-500">*</span></p>
                    <textarea
                      value={createAddress}
                      onChange={e => setCreateAddress(e.target.value)}
                      rows={3}
                      placeholder="House/Apartment No., Building, Street, Landmark, City, Pincode..."
                      className="w-full text-sm font-medium border border-slate-200 rounded-2xl p-3.5 bg-white focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 resize-none text-slate-800 transition-all shadow-sm"
                    />
                  </div>
                  <div>
                    <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider mb-2.5">Requirements / Visit Purpose <span className="text-red-500">*</span></p>
                    <textarea
                      value={createRequirements}
                      onChange={e => setCreateRequirements(e.target.value)}
                      rows={3}
                      placeholder="Specify requirements — e.g. bridal measurement, fabric trial, suit fitting..."
                      className="w-full text-sm font-medium border border-slate-200 rounded-2xl p-3.5 bg-white focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 resize-none text-slate-800 transition-all shadow-sm"
                    />
                  </div>
                </div>
              )}

              {/* ── Error Display ── */}
              {createError && (
                <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 text-red-700 text-xs font-bold px-4 py-3.5 rounded-2xl animate-in fade-in shadow-sm">
                  <AlertCircle className="w-4.5 h-4.5 shrink-0 text-red-500" />{createError}
                </div>
              )}

            </div>

            {/* Drawer Footer */}
            <div className="border-t border-slate-100 px-6 py-4 bg-slate-50/80 flex items-center justify-between shrink-0">
              <button type="button" onClick={() => setCreateModal(false)} className="px-5 py-2.5 rounded-xl text-slate-600 text-sm font-extrabold hover:bg-slate-200/60 transition-all">
                Cancel
              </button>
              <button
                type="button"
                onClick={submitCreateBooking}
                disabled={createSubmitting}
                className={`flex items-center gap-2 px-7 py-3 rounded-2xl text-sm font-extrabold shadow-lg transition-all active:scale-[0.98] disabled:opacity-60 ${createType === 'home' ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/25' :
                    createType === 'fitting' ? 'bg-brand-500 hover:bg-brand-600 text-[#3D2E3D] shadow-brand-500/25' :
                      'bg-violet-600 hover:bg-violet-700 text-white shadow-violet-600/25'
                  }`}
              >
                {createSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
                {createSubmitting ? 'Creating...' : `Create ${createType === 'slot' ? 'Slot' :
                    createType === 'fitting' ? 'Fitting' : 'Visit'
                  }`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
