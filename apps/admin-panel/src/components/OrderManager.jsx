import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  Eye,
  Printer,
  Mail,
  ShoppingBag,
  ChevronDown,
  X,
  CheckCircle2,
  Circle,
  Package,
  Truck,
  MapPin,
  Navigation,
  XCircle,
  Clock,
  Calendar,
  Briefcase,
  Clipboard,
  CheckCircle,
  User,
  Phone,
  Ruler,
  Plus,
  Trash2,
  Filter,
  ArrowRight,
} from 'lucide-react';
import api from '../utils/api';

const formatOrderId = (inv) => inv ? String(inv).replace(/^INV-/i, 'ORD-') : (inv || '');

const formatBookingDateUTC = (dateString, options = {}) => {
  if (!dateString) return '';
  const dateObj = new Date(dateString);
  if (isNaN(dateObj.getTime())) return dateString;
  
  const day = dateObj.getUTCDate();
  const year = dateObj.getUTCFullYear();
  const monthNamesShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthNamesLong = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  
  const month = options.month === 'long' ? monthNamesLong[dateObj.getUTCMonth()] : monthNamesShort[dateObj.getUTCMonth()];
  
  if (options.weekday === 'long') {
    const weekday = daysOfWeek[dateObj.getUTCDay()];
    return `${weekday}, ${day} ${month} ${year}`;
  }
  
  if (options.weekday === 'short') {
    const weekday = daysOfWeek[dateObj.getUTCDay()].substring(0, 3);
    return `${weekday}, ${month} ${day}`;
  }
  
  return `${day} ${month} ${year}`;
};

// ─── Delivery stage definitions (admin-visible labels + DB keys) ──────────────
const DELIVERY_STAGES = [
  {
    key: 'PENDING',
    label: 'Order Placed',
    sublabel: 'Awaiting confirmation/booking',
    icon: ShoppingBag,
    color: '#f59e0b',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
    dot: 'bg-amber-400',
  },
  {
    key: 'PAID',
    label: 'Measurement Session',
    sublabel: 'Fitting appointment scheduled',
    icon: Clock,
    color: '#8b5cf6',
    bg: 'bg-violet-50',
    border: 'border-violet-200',
    text: 'text-violet-700',
    dot: 'bg-violet-400',
  },
  {
    key: 'PROCESSING',
    label: 'Order Stitching',
    sublabel: 'Artisans are stitching items',
    icon: Package,
    color: '#3b82f6',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-700',
    dot: 'bg-blue-400',
  },
  {
    key: 'SHIPPED',
    label: 'Product Completed',
    sublabel: 'Custom stitching finished',
    icon: MapPin,
    color: '#0891b2',
    bg: 'bg-cyan-50',
    border: 'border-cyan-200',
    text: 'text-cyan-700',
    dot: 'bg-cyan-400',
  },
  {
    key: 'OUT_FOR_DELIVERY',
    label: 'Product Out for Delivery',
    sublabel: 'Delivery executive is on the way',
    icon: Navigation,
    color: '#059669',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-700',
    dot: 'bg-emerald-400',
  },
  {
    key: 'DELIVERED',
    label: 'Delivered',
    sublabel: 'Package received by customer',
    icon: CheckCircle2,
    color: '#16a34a',
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-700',
    dot: 'bg-green-500',
  },
];

const HAPPY_PATH = ['PENDING', 'PAID', 'PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'];

function getStageIndex(status) {
  return HAPPY_PATH.indexOf(status);
}

function getStageConfig(status) {
  return DELIVERY_STAGES.find(s => s.key === status) || {
    key: status,
    label: status,
    sublabel: '',
    icon: Circle,
    color: '#64748b',
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    text: 'text-slate-600',
    dot: 'bg-slate-400',
  };
}

// ─── Delivery Pipeline Component (shown inside the order detail modal) ────────
function DeliveryPipeline({ order, onStage }) {
  const currentIdx = getStageIndex(order.status);
  const isCancelled = order.status === 'CANCELLED';

  if (isCancelled) {
    return (
      <div className="rounded-2xl bg-red-50 border border-red-100 p-4 flex items-start gap-3">
        <XCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-extrabold text-red-700">Order Cancelled</p>
          <p className="text-xs text-red-500 font-medium mt-0.5">
            {order.paymentStatus === 'REFUNDED' ? 'Refund has been initiated.' : 'This order has been cancelled.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
        Delivery Stage — click to advance
      </p>
      {DELIVERY_STAGES.map((stage, idx) => {
        const StageIcon = stage.icon;
        const isDone = idx < currentIdx;
        const isCurrent = idx === currentIdx;
        const isFuture = idx > currentIdx;
        const isNext = idx === currentIdx + 1;

        return (
          <button
            key={stage.key}
            onClick={() => !isCurrent && !isDone && onStage(order, stage.key)}
            disabled={isDone || isCurrent}
            className={`
              w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left
              ${isCurrent
                ? `${stage.bg} ${stage.border} ring-2 ring-offset-1`
                : isDone
                ? 'bg-slate-50 border-slate-100 opacity-60 cursor-default'
                : isNext
                ? `${stage.bg} ${stage.border} hover:shadow-md cursor-pointer hover:scale-[1.01] active:scale-[0.99]`
                : 'bg-white border-slate-100 opacity-40 cursor-not-allowed'
              }
            `}
            style={isCurrent ? { ringColor: stage.color } : {}}
            title={isCurrent ? 'Current status' : isDone ? 'Completed' : isNext ? `Set to: ${stage.label}` : 'Not yet reachable'}
          >
            {/* Status indicator */}
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                isDone ? 'bg-slate-200' : isCurrent ? '' : 'bg-white border-2 border-slate-200'
              }`}
              style={isCurrent ? { backgroundColor: stage.color } : {}}
            >
              {isDone ? (
                <CheckCircle2 className="w-4 h-4 text-slate-500" />
              ) : (
                <StageIcon className="w-4 h-4" color={isCurrent ? '#fff' : isFuture ? '#cbd5e1' : stage.color} />
              )}
            </div>

            {/* Label */}
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-bold truncate ${isDone ? 'text-slate-400' : isCurrent ? stage.text : isFuture && !isNext ? 'text-slate-300' : 'text-slate-600'}`}>
                {stage.label}
              </p>
              <p className={`text-[10px] font-medium truncate ${isDone ? 'text-slate-300' : isCurrent ? stage.text + ' opacity-80' : 'text-slate-400'}`}>
                {stage.sublabel}
              </p>
            </div>

            {/* State badge */}
            <div className="flex-shrink-0">
              {isDone && (
                <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Done</span>
              )}
              {isCurrent && (
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ color: stage.color, backgroundColor: `${stage.color}18` }}>
                  Current
                </span>
              )}
              {isNext && !isCurrent && !isDone && (
                <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-full border border-slate-200">
                  Set →
                </span>
              )}
            </div>
          </button>
        );
      })}

      {/* Cancel option — always available for non-delivered, non-cancelled */}
      {order.status !== 'DELIVERED' && (
        <button
          onClick={() => onStage(order, 'CANCELLED')}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-red-100 bg-white hover:bg-red-50 transition-all text-left group"
        >
          <div className="w-8 h-8 rounded-full flex items-center justify-center bg-red-50 flex-shrink-0">
            <XCircle className="w-4 h-4 text-red-400" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-bold text-red-500">Cancel Order</p>
            <p className="text-[10px] text-red-400 font-medium">Restores inventory, triggers refund if paid</p>
          </div>
          <span className="text-[9px] font-bold text-red-400 bg-red-50 px-2 py-0.5 rounded-full border border-red-100">
            Irreversible
          </span>
        </button>
      )}
    </div>
  );
}

// ─── Helper: parse user address JSON to a usable object ─────────────────────
function parseUserAddress(user) {
  if (!user || !user.address) return null;
  try {
    const parsed = JSON.parse(user.address);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.find(a => a.selected) || parsed[0];
    } else if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (e) {
    // plain text fallback
    return { address: user.address, name: user.fullName };
  }
  return null;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function OrderManager({ initialTab = 'bookings', isActive }) {
  const [orders, setOrders] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [visits, setVisits] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [allMeasurements, setAllMeasurements] = useState([]);
  const [activeSubTab, setActiveSubTab] = useState(initialTab);
  const [isUniversalPrintOpen, setIsUniversalPrintOpen] = useState(false);

  const [printDateRange, setPrintDateRange] = useState('ALL');
  const [printDate, setPrintDate] = useState('');
  const [printDateFrom, setPrintDateFrom] = useState('');
  const [printDateTo, setPrintDateTo] = useState('');
  const [printIncludeFittings, setPrintIncludeFittings] = useState(true);
  const [printIncludeVisits, setPrintIncludeVisits] = useState(true);
  const [printFields, setPrintFields] = useState({
    custName: true,
    custPhone: true,
    custEmail: false,
    custAddress: true,
    custGender: false,
    apptTime: true,
    apptType: true,
    apptStaff: true,
    apptStatus: false,
    apptNotes: true,
    orderInvoice: true,
    orderStatus: false,
    orderItems: true,
    orderFabric: true,
    orderCustoms: true,
    orderTailorNotes: true,
    measLength: true,
    measShoulder: true,
    measChest: true,
    measBust: true,
    measWaist: true,
    measHip: true,
    measArm: true,
    measSleeve: true,
    measNeck: true,
    measSeat: false,
    measSkirt: false,
    measPant: false,
  });

  useEffect(() => {
    setActiveSubTab(initialTab);
  }, [initialTab]);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [deliveryStageQuickFilter, setDeliveryStageQuickFilter] = useState('ALL'); // 'ALL' | 'ORDERS_RECEIVED' | 'TO_BE_DELIVERED' | 'DELIVERED'
  const [apptStatusFilter, setApptStatusFilter] = useState('ALL');
  const [visitStatusFilter, setVisitStatusFilter] = useState('ALL');
  
  // Advanced filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dateFilterType, setDateFilterType] = useState('ORDER_DATE');
  const [paymentFilter, setPaymentFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const [selectedOrder, setSelectedOrder] = useState(null);
  const [pendingStatusChange, setPendingStatusChange] = useState(null); // { orderId, invoiceNumber, from, to }
  const [proposeDateOrderId, setProposeDateOrderId] = useState(null);
  const [proposedDateVal, setProposedDateVal] = useState('');
  const [adminProposalNoteVal, setAdminProposalNoteVal] = useState('');

  const [packingSlip, setPackingSlip] = useState(null);
  const [isSlipOpen, setIsSlipOpen] = useState(false);

  // Pagination & Alerts
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  const [dismissedAlerts, setDismissedAlerts] = useState(() => {
    try {
      const saved = localStorage.getItem('marcos_dismissed_cancelled_alerts');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const dismissAlert = (id) => {
    setDismissedAlerts(prev => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      try {
        localStorage.setItem('marcos_dismissed_cancelled_alerts', JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  // Selected Order Edit States
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editCustomerPhone, setEditCustomerPhone] = useState('');
  const [editCustomerEmail, setEditCustomerEmail] = useState('');
  const [editCustomerAddress, setEditCustomerAddress] = useState('');
  const [editOrderStatus, setEditOrderStatus] = useState('');
  const [editPaymentStatus, setEditPaymentStatus] = useState('');
  const [editAdvancePayment, setEditAdvancePayment] = useState('');
  const [newPaymentAmount, setNewPaymentAmount] = useState('');
  const [newPaymentMethod, setNewPaymentMethod] = useState('Online');
  const [newPaymentNote, setNewPaymentNote] = useState('');
  const [editDeliveryDate, setEditDeliveryDate] = useState('');
  const [editFabricType, setEditFabricType] = useState('');
  const [editCustomizations, setEditCustomizations] = useState('');
  const [editTailorNotes, setEditTailorNotes] = useState('');
  const [editMeasurements, setEditMeasurements] = useState({
    fullLength: '',
    shoulderWidth: '',
    upperChest: '',
    bust: '',
    waist: '',
    hip: '',
    armLength: '',
    sleeveLength: '',
    neck: '',
    skirtLength: '',
    pantLength: ''
  });

  // Slide-over rescheduling states
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTimeSlot, setRescheduleTimeSlot] = useState('10:00 AM - 11:30 AM');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [isRescheduling, setIsRescheduling] = useState(false);

  const [customerProfiles, setCustomerProfiles] = useState([]);
  const [selectedProfileId, setSelectedProfileId] = useState('none');
  const [newProfileName, setNewProfileName] = useState('');
  const [isCreatingNewProfile, setIsCreatingNewProfile] = useState(false);

  useEffect(() => {
    if (selectedOrder) {
      setEditCustomerName(selectedOrder.customerName || '');
      
      const addrObj = parseUserAddress(selectedOrder.user);
      const phone = addrObj?.phone || selectedOrder.user?.phoneNumber || '';
      const email = selectedOrder.user?.email || '';
      const addrText = addrObj 
        ? [addrObj.address, addrObj.landmark ? `Near ${addrObj.landmark}` : null, addrObj.area, addrObj.city, addrObj.pincode].filter(Boolean).join(', ')
        : selectedOrder.user?.address || '';
      
      setEditCustomerPhone(phone);
      setEditCustomerEmail(email);
      setEditCustomerAddress(addrText);
      setEditOrderStatus(selectedOrder.status || 'PENDING');
      setEditPaymentStatus(selectedOrder.paymentStatus || 'PENDING');
      setEditAdvancePayment(selectedOrder.advancePayment || 0);
      setNewPaymentAmount('');
      setNewPaymentMethod('Online');
      setNewPaymentNote('');
      setEditDeliveryDate(selectedOrder.deliveryDate ? selectedOrder.deliveryDate.split('T')[0] : '');
      
      const firstItem = selectedOrder.items?.[0];
      setEditFabricType(selectedOrder.fabricType || firstItem?.fabricType || selectedOrder.product?.materialInfo || '');
      setEditCustomizations(selectedOrder.customizations || '');
      setEditTailorNotes(selectedOrder.tailorNotes || '');
      
      // Fetch customer measurement profiles on order selection
      if (selectedOrder.userId) {
        api.getMeasurements(selectedOrder.userId)
          .then(profiles => {
            setCustomerProfiles(profiles || []);
            
            // If the order already has a linked measurement profile, select and load it
            if (selectedOrder.measurementProfileId || selectedOrder.measurementProfile) {
              const profileId = selectedOrder.measurementProfileId || selectedOrder.measurementProfile?.id;
              const matched = (profiles || []).find(p => p.id === profileId) || selectedOrder.measurementProfile;
              if (matched) {
                setSelectedProfileId(matched.id);
                setEditMeasurements({
                  fullLength: matched.fullLength || '',
                  shoulderWidth: matched.shoulderWidth || '',
                  upperChest: matched.upperChest || '',
                  bust: matched.bust || '',
                  waist: matched.waist || '',
                  hip: matched.hip || '',
                  armLength: matched.armLength || '',
                  sleeveLength: matched.sleeveLength || '',
                  neck: matched.neck || '',
                  skirtLength: matched.skirtLength || '',
                  pantLength: matched.pantLength || '',
                });
                return;
              }
            }

            // Otherwise, if order has no linked profile but the user has profiles, select the first profile
            if (profiles && profiles.length > 0) {
              const mainProfile = profiles[0];
              setSelectedProfileId(mainProfile.id);
              setEditMeasurements({
                fullLength: mainProfile.fullLength || '',
                shoulderWidth: mainProfile.shoulderWidth || '',
                upperChest: mainProfile.upperChest || '',
                bust: mainProfile.bust || '',
                waist: mainProfile.waist || '',
                hip: mainProfile.hip || '',
                armLength: mainProfile.armLength || '',
                sleeveLength: mainProfile.sleeveLength || '',
                neck: mainProfile.neck || '',
                skirtLength: mainProfile.skirtLength || '',
                pantLength: mainProfile.pantLength || '',
              });
            } else {
              setSelectedProfileId('none');
              setEditMeasurements({
                fullLength: '', shoulderWidth: '', upperChest: '', bust: '',
                waist: '', hip: '', armLength: '', sleeveLength: '',
                neck: '', skirtLength: '', pantLength: ''
              });
            }
          })
          .catch(err => console.error('Error fetching measurements:', err));
      } else {
        setCustomerProfiles([]);
        setSelectedProfileId('none');
        setEditMeasurements({
          fullLength: '', shoulderWidth: '', upperChest: '', bust: '',
          waist: '', hip: '', armLength: '', sleeveLength: '',
          neck: '', skirtLength: '', pantLength: ''
        });
      }
      setIsCreatingNewProfile(false);
      setNewProfileName('');

      if (selectedOrder.booking) {
        const dateObj = new Date(selectedOrder.booking.date || selectedOrder.booking.preferredDate);
        const yyyy = dateObj.getUTCFullYear();
        const mm = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(dateObj.getUTCDate()).padStart(2, '0');
        setRescheduleDate(`${yyyy}-${mm}-${dd}`);
        setRescheduleTimeSlot(selectedOrder.booking.timeSlot || '10:00 AM - 11:30 AM');
      } else {
        const defaultDateObj = new Date(Date.now() + 86400000 * 2);
        const yyyy = defaultDateObj.getUTCFullYear();
        const mm = String(defaultDateObj.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(defaultDateObj.getUTCDate()).padStart(2, '0');
        setRescheduleDate(`${yyyy}-${mm}-${dd}`);
        setRescheduleTimeSlot('10:00 AM - 11:30 AM');
      }
      setRescheduleReason('');
    }
  }, [selectedOrder]);

  // Admin Rescheduling states
  const [adminRescheduleBooking, setAdminRescheduleBooking] = useState(null);
  const [adminNewDate, setAdminNewDate] = useState('');
  const [adminNewTimeSlot, setAdminNewTimeSlot] = useState('10:00 AM - 11:30 AM');

  // Visit allocation and completion report states
  const [activeVisitId, setActiveVisitId] = useState(null);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [reportVisitId, setReportVisitId] = useState(null);
  const [completionNotes, setCompletionNotes] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');

  const handleTabChange = (tab) => {
    setActiveSubTab(tab);
    setSearchTerm('');
  };

  const handleViewPackingSlip = async (orderId) => {
    try {
      const slip = await api.getPackingSlip(orderId);
      setPackingSlip({ ...slip, orderId });
      setIsSlipOpen(true);
    } catch (err) {
      alert(err.message || 'Failed to fetch packing slip.');
    }
  };

  const handleDispatchOrder = async () => {
    if (!packingSlip || !packingSlip.orderId) return;
    try {
      await handleUpdateStatus(packingSlip.orderId, 'PROCESSING');
      setIsSlipOpen(false);
      alert('Order verified and marked as Stitching!');
    } catch (err) {
      alert(err.message || 'Failed to update order status.');
    }
  };

  const handleOpenAdminReschedule = (booking) => {
    setAdminRescheduleBooking(booking);
    const dateObj = new Date(booking.date || booking.preferredDate);
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');
    setAdminNewDate(`${yyyy}-${mm}-${dd}`);
    setAdminNewTimeSlot(booking.timeSlot || '10:00 AM - 11:30 AM');
  };

  const handleConfirmAdminReschedule = async () => {
    if (!adminNewDate) {
      alert('Please select a valid date.');
      return;
    }
    try {
      const isStudio = adminRescheduleBooking.type === 'STUDIO';
      const formattedDate = new Date(adminNewDate).toISOString();
      
      if (isStudio) {
        await api.updateAppointment(adminRescheduleBooking.id, {
          date: formattedDate,
          timeSlot: adminNewTimeSlot,
        });
      } else {
        await api.updateStoreVisit(adminRescheduleBooking.id, {
          preferredDate: formattedDate,
          confirmedDate: formattedDate,
        });
      }

      alert('Fitting session rescheduled successfully!');
      
      if (selectedOrder) {
        const updatedBooking = {
          ...selectedOrder.booking,
          date: formattedDate,
          ...(isStudio && { timeSlot: adminNewTimeSlot }),
        };
        setSelectedOrder(prev => ({
          ...prev,
          booking: updatedBooking,
        }));
      }
      
      setAdminRescheduleBooking(null);
      loadOrders();
    } catch (err) {
      alert(err.message || 'Failed to reschedule.');
    }
  };

  const handlePrintShippingLabel = (order) => {
    // Use the shared helper to parse the address JSON
    let addressObj = parseUserAddress(order.user);

    if (!addressObj) {
      addressObj = {
        name: order.customerName || (order.user && order.user.fullName) || 'Customer',
        address: order.user?.address || 'No Delivery Address Provided',
        city: '',
        area: '',
        pincode: '',
        phone: order.user?.phoneNumber || '',
        phone2: '',
      };
    }

    // Ensure phone/phone2 are populated from user-level fields when not in address JSON
    if (!addressObj.phone && order.user?.phoneNumber) {
      addressObj.phone = order.user.phoneNumber;
    }
    if (!addressObj.name) {
      addressObj.name = order.customerName || order.user?.fullName || 'Customer';
    }

    const printWindow = window.open('', '_blank', 'width=600,height=800');
    if (!printWindow) {
      alert('Pop-up blocked! Please allow pop-ups to print shipping labels.');
      return;
    }

    const isCod = order.paymentMethod === 'CASH' || order.paymentMethod === 'Cash';
    const amountVal = Number(order.payableAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 });

    const labelHTML = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; border: 3px solid #000; width: 380px; margin: 10px auto; background-color: #fff; box-sizing: border-box; color: #000; font-size: 11px; line-height: 1.4;">
        
        <!-- Header Section -->
        <div style="display: flex; border-bottom: 3px solid #000; min-height: 65px;">
          <div style="flex: 1.3; padding: 12px; display: flex; flex-direction: column; justify-content: center; border-right: 3px solid #000; background-color: #000; color: #fff;">
            <span style="font-size: 26px; font-weight: 900; letter-spacing: 2px; line-height: 1;">MARCOS</span>
            <span style="font-size: 8px; font-weight: 700; letter-spacing: 1.5px; margin-top: 4px; text-transform: uppercase; opacity: 0.8;">Luxury Couture</span>
          </div>
          <div style="flex: 1; padding: 8px; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center;">
            <span style="font-size: 8px; font-weight: 800; color: #555; letter-spacing: 0.5px; text-transform: uppercase;">Payment Mode</span>
            <span style="font-size: 16px; font-weight: 900; margin-top: 4px; color: #000; padding: 3px 10px; border: 2px solid #000; background-color: ${isCod ? '#fff7ed' : '#f0fdf4'}; border-color: ${isCod ? '#ea580c' : '#16a34a'}; color: ${isCod ? '#ea580c' : '#16a34a'}; border-radius: 4px; font-family: monospace;">${isCod ? 'C.O.D.' : 'PREPAID'}</span>
          </div>
        </div>

        <!-- Barcode Section -->
        <div style="border-bottom: 3px solid #000; padding: 14px 12px; text-align: center; background-color: #fff;">
          <!-- Barcode simulation -->
          <div style="display: flex; justify-content: center; align-items: flex-end; height: 45px; margin: 0 auto 6px auto; width: 280px; gap: 1.5px;">
            <div style="width: 3px; height: 100%; background: #000;"></div>
            <div style="width: 1px; height: 100%; background: #000;"></div>
            <div style="width: 2px; height: 100%; background: #000;"></div>
            <div style="width: 4px; height: 100%; background: #000;"></div>
            <div style="width: 1px; height: 100%; background: #000;"></div>
            <div style="width: 3px; height: 100%; background: #000;"></div>
            <div style="width: 1px; height: 100%; background: #000;"></div>
            <div style="width: 2px; height: 100%; background: #000;"></div>
            <div style="width: 4px; height: 100%; background: #000;"></div>
            <div style="width: 1px; height: 100%; background: #000;"></div>
            <div style="width: 3px; height: 100%; background: #000;"></div>
            <div style="width: 2px; height: 100%; background: #000;"></div>
            <div style="width: 1px; height: 100%; background: #000;"></div>
            <div style="width: 4px; height: 100%; background: #000;"></div>
            <div style="width: 2px; height: 100%; background: #000;"></div>
            <div style="width: 1px; height: 100%; background: #000;"></div>
            <div style="width: 3px; height: 100%; background: #000;"></div>
            <div style="width: 2px; height: 100%; background: #000;"></div>
            <div style="width: 1px; height: 100%; background: #000;"></div>
            <div style="width: 4px; height: 100%; background: #000;"></div>
            <div style="width: 3px; height: 100%; background: #000;"></div>
            <div style="width: 1px; height: 100%; background: #000;"></div>
            <div style="width: 2px; height: 100%; background: #000;"></div>
            <div style="width: 4px; height: 100%; background: #000;"></div>
            <div style="width: 1px; height: 100%; background: #000;"></div>
            <div style="width: 3px; height: 100%; background: #000;"></div>
            <div style="width: 2px; height: 100%; background: #000;"></div>
            <div style="width: 1px; height: 100%; background: #000;"></div>
            <div style="width: 4px; height: 100%; background: #000;"></div>
            <div style="width: 1px; height: 100%; background: #000;"></div>
            <div style="width: 3px; height: 100%; background: #000;"></div>
            <div style="width: 2px; height: 100%; background: #000;"></div>
            <div style="width: 1px; height: 100%; background: #000;"></div>
            <div style="width: 4px; height: 100%; background: #000;"></div>
          </div>
          <div style="font-size: 10px; font-weight: 700; letter-spacing: 2px; color: #333; font-family: monospace;">
            ${order.invoiceNumber}
          </div>
        </div>

        <!-- Ship To Section -->
        <div style="border-bottom: 3px solid #000; padding: 12px 14px;">
          <span style="font-size: 8px; font-weight: 800; color: #555; letter-spacing: 1px; text-transform: uppercase; display: block; margin-bottom: 4px;">Delivery Address</span>
          <div style="font-size: 16px; font-weight: 900; color: #000;">
            ${addressObj.name.toUpperCase()}
          </div>
          <div style="font-size: 11px; font-weight: 600; margin-top: 6px; line-height: 1.4; color: #222; min-height: 38px;">
            ${addressObj.address}${addressObj.landmark ? `, Near ${addressObj.landmark}` : ''}${addressObj.area ? `, ${addressObj.area}` : ''}
          </div>
          
          ${(addressObj.city || addressObj.pincode) ? `
          <!-- Large City & Pin Banner -->
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; background-color: #000; color: #fff; padding: 6px 12px; font-size: 13px; font-weight: 900;">
            <span style="letter-spacing: 0.5px;">CITY: ${(addressObj.city || '').toUpperCase()}</span>
            <span style="font-size: 14px; font-weight: 950; letter-spacing: 1px;">PIN: ${addressObj.pincode || ''}</span>
          </div>
          ` : ''}

          ${(addressObj.phone || addressObj.phone2) ? `
          <div style="font-size: 11px; font-weight: 800; margin-top: 10px; display: flex; align-items: center; gap: 4px;">
            <span style="color: #555;">CONTACT:</span>
            <span style="font-size: 12px; font-weight: 900; color: #000;">
              ${[addressObj.phone, addressObj.phone2].filter(Boolean).join(' / ')}
            </span>
          </div>
          ` : ''}
        </div>

        <!-- Payment & Order Info Block -->
        <div style="border-bottom: 3px solid #000; display: flex; align-items: stretch; min-height: 85px;">
          <!-- Left: Amount box -->
          <div style="flex: 1; border-right: 3px solid #000; padding: 10px; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; background-color: #fcfcfc;">
            <span style="font-size: 8px; font-weight: 800; color: #555; letter-spacing: 0.5px; text-transform: uppercase;">Collectable Cash</span>
            <span style="font-size: 24px; font-weight: 900; margin-top: 4px; color: #000; font-family: system-ui;">₹${isCod ? amountVal : '0.00'}</span>
            <span style="font-size: 7px; font-weight: 800; color: #666; margin-top: 2px; text-transform: uppercase;">${isCod ? 'Collect Cash on Delivery' : 'Already Paid Online'}</span>
          </div>
          <!-- Right: Order Details -->
          <div style="flex: 1; padding: 10px 12px; display: flex; flex-direction: column; justify-content: center; font-size: 9px; line-height: 1.4; color: #333;">
            <div style="margin-bottom: 3px;"><strong>Order ID:</strong> <span style="font-family: monospace; font-size: 9.5px; font-weight: 700;">${order.id.substring(0, 12).toUpperCase()}</span></div>
            <div style="margin-bottom: 3px;"><strong>Date:</strong> ${new Date(order.createdAt).toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: 'numeric'})}</div>
            <div style="margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px;"><strong>Item:</strong> ${order.orderItems?.[0]?.product?.name || order.orderItems?.[0]?.productName || order.product?.name || order.productName || 'Apparel Item'}</div>
            <div><strong>Qty:</strong> ${order.orderItems?.reduce((sum, item) => sum + item.quantity, 0) || 1} item(s)</div>
          </div>
        </div>

        <!-- Return Address Footer -->
        <div style="padding: 10px 14px; background-color: #fff; font-size: 8px; line-height: 1.4; border-top: 1px dashed #ccc;">
          <strong style="font-size: 8.5px; text-transform: uppercase; color: #000; display: block; margin-bottom: 2px; letter-spacing: 0.5px;">Return / Sender Address:</strong>
          <span style="font-weight: 600; color: #444; text-transform: uppercase;">
            MARCOS Luxury Couture, Aruppukottai, Tamil Nadu
          </span>
        </div>

      </div>
    `;

    printWindow.document.write(`
      <html>
        <head>
          <title>Shipping Label - ${order.invoiceNumber}</title>
          <style>
            body { margin: 0; padding: 20px; background-color: #f5f5f5; font-family: sans-serif; }
            .no-print-btn { text-align: center; margin-bottom: 16px; }
            .no-print-btn button { background: #000; color: #fff; border: none; padding: 10px 28px; font-size: 14px; font-weight: bold; border-radius: 6px; cursor: pointer; letter-spacing: 1px; }
            .no-print-btn button:hover { background: #333; }
            @media print {
              .no-print-btn { display: none; }
              body { margin: 0; padding: 0; background: #fff; }
              @page { size: auto; margin: 0mm; }
            }
          </style>
        </head>
        <body>
          <div class="no-print-btn">
            <button onclick="window.print()">🖨️ Print Shipping Label</button>
          </div>
          ${labelHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handlePrintInvoice = (order) => {
    const printWindow = window.open('', '_blank', 'width=900,height=800');
    if (!printWindow) {
      alert('Pop-up blocked! Please allow pop-ups to print invoices.');
      return;
    }

    const rawItems = (order.orderItems && order.orderItems.length > 0)
      ? order.orderItems
      : (order.items && order.items.length > 0)
        ? order.items
        : (order.product ? [{ product: order.product, quantity: 1, price: order.payableAmount }] : []);

    const itemsList = rawItems.length > 0 ? rawItems : [{
      productName: order.productName || 'Custom Apparel Item',
      quantity: 1,
      price: order.payableAmount
    }];

    const itemsHTML = itemsList.map((item, idx) => {
      const name = item.productName || item.product?.name || item.name || order.product?.name || 'Custom Garment';
      const qty = Number(item.quantity || 1);
      const unitPrice = Number(item.price || (order.payableAmount / qty));
      const totalAmount = unitPrice * qty;
      const fabricInfo = item.fabricType || item.product?.materialInfo || order.fabricType;
      const customizationText = (item.selectedCustomizations || [])
        .map(group => `${group.name}: ${(group.options || []).map(option => option.name).join(', ')}`)
        .join(' · ');
      const detailsStr = `${fabricInfo ? `<div style="font-size: 10px; color: #666; font-weight: normal; margin-top: 2px;">Fabric / Material: ${fabricInfo}</div>` : ''}${customizationText ? `<div style="font-size: 10px; color: #555; font-weight: normal; margin-top: 2px;">Customer choices: ${customizationText}</div>` : ''}`;

      return `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #eee; vertical-align: top;">${idx + 1}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold; vertical-align: top;">
            <div>${name}</div>
            ${detailsStr}
          </td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center; vertical-align: top;">${qty}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right; vertical-align: top;">₹${unitPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold; vertical-align: top;">₹${totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        </tr>
      `;
    }).join('');

    let addressObj = parseUserAddress(order.user);
    if (!addressObj) {
      addressObj = {
        name: order.customerName || (order.user && order.user.fullName) || 'Customer',
        address: order.user?.address || 'No Delivery Address Provided',
        city: '',
        area: '',
        pincode: '',
        phone: order.user?.phoneNumber || '',
        phone2: '',
      };
    }

    const invoiceHTML = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 800px; margin: 20px auto; padding: 30px; border: 1px solid #eee; box-shadow: 0 0 10px rgba(0, 0, 0, 0.05); color: #333; line-height: 1.5;">
        
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 20px; margin-bottom: 30px;">
          <div>
            <h1 style="margin: 0; font-size: 32px; font-weight: 900; letter-spacing: 3px;">MARCOS</h1>
            <p style="margin: 4px 0 0 0; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #666; letter-spacing: 2px;">Luxury Couture Studio</p>
          </div>
          <div style="text-align: right;">
            <h2 style="margin: 0; font-size: 20px; font-weight: 900; color: #111;">RETAIL INVOICE</h2>
            <p style="margin: 5px 0 0 0; font-size: 11px; font-weight: 600; color: #555;">Invoice No: <strong>${order.invoiceNumber}</strong></p>
            <p style="margin: 3px 0 0 0; font-size: 11px; color: #777;">Date: ${new Date(order.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
          </div>
        </div>

        <!-- Customer & Billing Details -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 40px;">
          <div>
            <h3 style="margin: 0 0 10px 0; font-size: 12px; font-weight: 800; color: #000; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #eee; padding-bottom: 5px;">Billing/Shipping Details</h3>
            <p style="margin: 0; font-size: 13px; font-weight: 700; color: #111;">${addressObj.name.toUpperCase()}</p>
            <p style="margin: 5px 0 0 0; font-size: 11px; color: #555; leading-height: 1.4;">${addressObj.address}${addressObj.landmark ? `, Near ${addressObj.landmark}` : ''}${addressObj.area ? `, ${addressObj.area}` : ''}</p>
            <p style="margin: 3px 0 0 0; font-size: 11px; color: #555;">${addressObj.city} ${addressObj.pincode ? `- ${addressObj.pincode}` : ''}</p>
            <p style="margin: 5px 0 0 0; font-size: 11px; font-weight: 700; color: #111;">Phone: ${addressObj.phone || 'N/A'}</p>
          </div>
          <div>
            <h3 style="margin: 0 0 10px 0; font-size: 12px; font-weight: 800; color: #000; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #eee; padding-bottom: 5px;">Order & Payment Info</h3>
            <p style="margin: 0; font-size: 11px; color: #555;">Order ID: <strong style="font-family: monospace;">${order.id}</strong></p>
            <p style="margin: 5px 0 0 0; font-size: 11px; color: #555;">Payment Mode: <strong style="text-transform: uppercase;">${order.paymentMethod}</strong></p>
            <p style="margin: 3px 0 0 0; font-size: 11px; color: #555;">Payment Status: <strong style="text-transform: uppercase; color: ${order.paymentStatus === 'PAID' || order.paymentStatus === 'COMPLETED' ? '#16a34a' : '#ea580c'}">${order.paymentStatus || 'PENDING'}</strong></p>
            <p style="margin: 5px 0 0 0; font-size: 11px; color: #555;">Delivery Stage: <strong style="text-transform: uppercase;">${order.status}</strong></p>
          </div>
        </div>

        <!-- Table -->
        <table style="width: 100%; border-collapse: collapse; text-align: left; margin-bottom: 40px; font-size: 12px;">
          <thead>
            <tr style="background-color: #f9f9f9; border-bottom: 2px solid #ddd;">
              <th style="padding: 10px; font-weight: 800; color: #111; width: 40px;">S.No</th>
              <th style="padding: 10px; font-weight: 800; color: #111;">Description</th>
              <th style="padding: 10px; font-weight: 800; color: #111; text-align: center; width: 60px;">Qty</th>
              <th style="padding: 10px; font-weight: 800; color: #111; text-align: right; width: 100px;">Unit Price</th>
              <th style="padding: 10px; font-weight: 800; color: #111; text-align: right; width: 120px;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHTML}
          </tbody>
        </table>

        <!-- Summary & Custom Sizing/Fabric Details -->
        <div style="display: grid; grid-template-columns: 1.2fr 1fr; gap: 40px; border-top: 1px solid #eee; padding-top: 25px;">
          <div>
            ${order.fabricType || order.customizations || order.tailorNotes ? `
              <h3 style="margin: 0 0 10px 0; font-size: 11px; font-weight: 800; color: #000; text-transform: uppercase; letter-spacing: 0.5px;">Custom Tailoring Specifications</h3>
              ${order.fabricType ? `<p style="margin: 0 0 5px 0; font-size: 11px;"><strong>Fabric Selected:</strong> ${order.fabricType}</p>` : ''}
              ${order.customizations ? `<p style="margin: 0 0 5px 0; font-size: 11px;"><strong>Customizations:</strong> ${order.customizations}</p>` : ''}
              ${order.tailorNotes ? `<p style="margin: 0; font-size: 11px; color: #666; font-style: italic;"><strong>Tailor Instructions:</strong> ${order.tailorNotes}</p>` : ''}
            ` : ''}
          </div>
          <div style="text-align: right; font-size: 13px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="color: #666;">Subtotal:</span>
              <span style="font-weight: 600;">₹${Number(order.totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            ${Number(order.discountAmount) > 0 ? `
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px; color: #ea580c;">
              <span>Discount:</span>
              <span style="font-weight: 600;">-₹${Number(order.discountAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            ` : ''}
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="color: #666;">GST (${order.gstPercentage !== undefined && order.gstPercentage !== null ? order.gstPercentage : 18}%):</span>
              <span style="font-weight: 600;">₹${Number(order.taxAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
              <span style="color: #666;">Shipping & Custom Sizing Charge:</span>
              <span style="font-weight: 600; color: #16a34a;">FREE</span>
            </div>
            <div style="display: flex; justify-content: space-between; border-top: 2px solid #000; padding-top: 12px; font-size: 18px; font-weight: 900; color: #111;">
              <span>Total Payable:</span>
              <span>₹${Number(order.payableAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            ${Number(order.advancePayment) > 0 ? `
            <div style="display: flex; justify-content: space-between; margin-top: 8px; padding-top: 8px; border-top: 1px solid #eee;">
              <span style="color: #16a34a; font-weight: 600;">Advance Paid:</span>
              <span style="color: #16a34a; font-weight: 600;">₹${Number(order.advancePayment).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-top: 8px; font-size: 16px; font-weight: 800; color: #3b82f6;">
              <span>Balance Due:</span>
              <span>₹${Number(order.balanceAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            ` : ''}
          </div>
        </div>

        <!-- Footer -->
        <div style="border-top: 1px dashed #ccc; margin-top: 50px; padding-top: 20px; text-align: center; font-size: 10px; color: #777;">
          <p style="margin: 0; font-weight: 700; color: #444; text-transform: uppercase; letter-spacing: 1px;">Thank you for shopping with MARCOS Luxury Couture</p>
          <p style="margin: 5px 0 0 0;">For returns, tailoring adjustments or custom requests, please contact support@marcoscouture.com</p>
        </div>

      </div>
    `;

    printWindow.document.write(`
      <html>
        <head>
          <title>Retail Invoice - ${order.invoiceNumber}</title>
          <style>
            body { margin: 0; padding: 20px; background-color: #f5f5f5; font-family: sans-serif; }
            .no-print-btn { text-align: center; margin-bottom: 16px; }
            .no-print-btn button { background: #000; color: #fff; border: none; padding: 10px 28px; font-size: 14px; font-weight: bold; border-radius: 6px; cursor: pointer; letter-spacing: 1px; text-transform: uppercase; }
            .no-print-btn button:hover { background: #333; }
            @media print {
              .no-print-btn { display: none; }
              body { margin: 0; padding: 0; background: #fff; }
            }
          </style>
        </head>
        <body>
          <div class="no-print-btn">
            <button onclick="window.print()">🖨️ Print Invoice</button>
          </div>
          ${invoiceHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  useEffect(() => {
    if (isActive) {
      loadOrders(true);
      
      const statusFilterNav = sessionStorage.getItem('admin_order_status_filter');
      if (statusFilterNav) {
        setStatusFilter(statusFilterNav);
        if (statusFilterNav === 'DELIVERED') {
          setDeliveryStageQuickFilter('DELIVERED');
        }
        sessionStorage.removeItem('admin_order_status_filter');
      }

      const apptStatusFilterNav = sessionStorage.getItem('admin_appt_status_filter');
      if (apptStatusFilterNav) {
        setApptStatusFilter(apptStatusFilterNav);
        sessionStorage.removeItem('admin_appt_status_filter');
      }

      const delivPromisedDate = sessionStorage.getItem('admin_order_delivery_promised_date');
      if (delivPromisedDate) {
        setDateFrom(delivPromisedDate);
        setDateTo(delivPromisedDate);
        setDateFilterType('DELIVERY_DATE');
        setDeliveryStageQuickFilter('TO_BE_DELIVERED');
        setShowAdvancedFilters(true);
        sessionStorage.removeItem('admin_order_delivery_promised_date');
      }

      const orderDateNav = sessionStorage.getItem('admin_order_date_filter');
      if (orderDateNav) {
        setDateFrom(orderDateNav);
        setDateTo(orderDateNav);
        setDateFilterType('ORDER_DATE');
        setDeliveryStageQuickFilter('ORDERS_RECEIVED');
        setShowAdvancedFilters(true);
        sessionStorage.removeItem('admin_order_date_filter');
      }
    }
  }, [isActive]);

  useEffect(() => {
    const selectedOrderId = sessionStorage.getItem('admin_selected_order_id');
    if (selectedOrderId && orders.length > 0) {
      const matched = orders.find(o => o.id === selectedOrderId || o.invoiceNumber === selectedOrderId);
      if (matched) {
        setSelectedOrder(matched);
      }
      sessionStorage.removeItem('admin_selected_order_id');
    }
  }, [orders, isActive]);

  const loadOrders = async (quiet = false) => {
    try {
      const [list, appList, visitList, staff] = await Promise.all([
        api.getOrders().catch(() => []),
        api.getAppointments().catch(() => []),
        api.getStoreVisits().catch(() => []),
        api.getStaffList().catch(() => []),
      ]);

      const enrichedOrders = list.map(order => {
        if (order.booking) return order;

        const appt = appList.find(a => (a.notes || '').includes(order.invoiceNumber));
        const visit = visitList.find(v => (v.requirements || '').includes(order.invoiceNumber));

        let booking = null;
        if (appt) {
          booking = {
            id: appt.id,
            type: 'STUDIO',
            date: appt.date,
            timeSlot: appt.timeSlot,
            status: appt.status,
            notes: appt.notes,
          };
        } else if (visit) {
          booking = {
            id: visit.id,
            type: 'HOME_VISIT',
            date: visit.confirmedDate || visit.preferredDate,
            timeSlot: 'Home Visit Fitting',
            status: visit.status,
            requirements: visit.requirements,
          };
        }

        return { ...order, booking };
      });

      setOrders(enrichedOrders);
      if (selectedOrder) {
        const matched = enrichedOrders.find(o => o.id === selectedOrder.id);
        if (matched) {
          setSelectedOrder(matched);
        }
      }
      setAppointments(appList);
      setVisits(visitList);
      setStaffList(staff);
      if (staff.length > 0 && !selectedStaffId) {
        setSelectedStaffId(staff[0].id);
      }
      window.dispatchEvent(new Event('sidebar_badge_refresh'));
    } catch (err) {
      console.error(err);
    }
  };

  const MEASUREMENT_LABELS = {
    measLength: { key: 'fullLength', label: 'Length' },
    measShoulder: { key: 'shoulderWidth', label: 'Shoulder' },
    measChest: { key: 'upperChest', label: 'Chest' },
    measBust: { key: 'bust', label: 'Bust' },
    measWaist: { key: 'waist', label: 'Waist' },
    measHip: { key: 'hip', label: 'Hip' },
    measArm: { key: 'armLength', label: 'Arm Length' },
    measSleeve: { key: 'sleeveLength', label: 'Sleeve' },
    measNeck: { key: 'neck', label: 'Neck' },
    measSeat: { key: 'seat', label: 'Seat' },
    measSkirt: { key: 'skirtLength', label: 'Skirt' },
    measPant: { key: 'pantLength', label: 'Pant Length' },
  };

  const togglePrintField = (field) => {
    setPrintFields(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const handleSelectAllPrintFields = () => {
    const updated = {};
    Object.keys(printFields).forEach(k => { updated[k] = true; });
    setPrintFields(updated);
  };

  const handleClearAllPrintFields = () => {
    const updated = {};
    Object.keys(printFields).forEach(k => { updated[k] = false; });
    setPrintFields(updated);
  };

  const handleDefaultTailorPrintFields = () => {
    setPrintFields({
      custName: true,
      custPhone: true,
      custEmail: false,
      custAddress: true,
      custGender: false,
      apptTime: true,
      apptType: true,
      apptStaff: true,
      apptStatus: false,
      apptNotes: true,
      orderInvoice: true,
      orderStatus: false,
      orderItems: true,
      orderFabric: true,
      orderCustoms: true,
      orderTailorNotes: true,
      measLength: true,
      measShoulder: true,
      measChest: true,
      measBust: true,
      measWaist: true,
      measHip: true,
      measArm: true,
      measSleeve: true,
      measNeck: true,
      measSeat: false,
      measSkirt: false,
      measPant: false,
    });
  };

  const hasAnyMeasurementFieldChecked = () => {
    return Object.keys(MEASUREMENT_LABELS).some(k => printFields[k]);
  };

  const getCombinedPrintItems = () => {
    const combinedItems = [];
    const today = new Date();
    today.setHours(0,0,0,0);

    const isDateInRange = (dateStr) => {
      if (printDateRange === 'ALL') return true;
      if (!dateStr) return false;
      const d = new Date(dateStr);
      d.setHours(0,0,0,0);
      
      if (printDateRange === 'DAY') {
        return printDate ? dateStr === printDate : true;
      }
      
      if (printDateRange === 'WEEK') {
        const currentDay = today.getDay();
        const firstDayOfWeek = new Date(today);
        firstDayOfWeek.setDate(today.getDate() - currentDay);
        const lastDayOfWeek = new Date(firstDayOfWeek);
        lastDayOfWeek.setDate(firstDayOfWeek.getDate() + 6);
        return d >= firstDayOfWeek && d <= lastDayOfWeek;
      }
      
      if (printDateRange === 'MONTH') {
        return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
      }

      if (printDateRange === 'CUSTOM') {
        let matchesFrom = true;
        let matchesTo = true;
        if (printDateFrom) {
          matchesFrom = d.getTime() >= new Date(printDateFrom).setHours(0,0,0,0);
        }
        if (printDateTo) {
          matchesTo = d.getTime() <= new Date(printDateTo).setHours(23,59,59,999);
        }
        return matchesFrom && matchesTo;
      }
      
      return true;
    };

    if (printIncludeFittings) {
      appointments.forEach(appt => {
        if (!appt.date) return;
        const apptDateStr = new Date(appt.date).toISOString().slice(0, 10);
        if (isDateInRange(apptDateStr)) {
          // Find matching order
          let matchedOrder = orders.find(o => appt.notes && appt.notes.includes(o.invoiceNumber));
          if (!matchedOrder && appt.userId) {
            matchedOrder = orders.find(o => o.userId === appt.userId);
          }
          if (!matchedOrder && appt.userName) {
            matchedOrder = orders.find(o => o.customerName && o.customerName.toLowerCase() === appt.userName.toLowerCase());
          }

          // Find measurement profile
          let matchedMeas = null;
          if (matchedOrder && matchedOrder.measurementProfileId) {
            matchedMeas = allMeasurements.find(m => m.id === matchedOrder.measurementProfileId);
          }
          if (!matchedMeas && appt.userId) {
            matchedMeas = allMeasurements.find(m => m.userId === appt.userId);
          }

          combinedItems.push({
            id: appt.id,
            type: 'STUDIO_FITTING',
            userName: appt.userName || (matchedOrder && matchedOrder.customerName) || 'Customer',
            phone: (matchedOrder && matchedOrder.user?.phoneNumber) || appt.user?.phoneNumber || '',
            email: (matchedOrder && matchedOrder.user?.email) || appt.user?.email || '',
            address: (matchedOrder && parseUserAddress(matchedOrder.user)?.address) || appt.user?.address || '',
            gender: (matchedOrder && matchedOrder.user?.gender) || appt.user?.gender || '',
            timeSlot: appt.timeSlot,
            apptType: appt.type || 'FITTING',
            status: appt.status,
            notes: appt.notes,
            assignedStaffName: appt.assignedStaff?.fullName || (appt.assignedStaffId && staffList.find(s => s.id === appt.assignedStaffId)?.fullName) || 'Unassigned',
            order: matchedOrder,
            measurements: matchedMeas
          });
        }
      });
    }

    if (printIncludeVisits) {
      visits.forEach(visit => {
        const visitDate = visit.confirmedDate || visit.preferredDate;
        if (!visitDate) return;
        const visitDateStr = new Date(visitDate).toISOString().slice(0, 10);
        if (isDateInRange(visitDateStr)) {
          // Find matching order
          let matchedOrder = orders.find(o => visit.requirements && visit.requirements.includes(o.invoiceNumber));
          if (!matchedOrder && visit.customerId) {
            matchedOrder = orders.find(o => o.userId === visit.customerId);
          }
          if (!matchedOrder && visit.customerName) {
            matchedOrder = orders.find(o => o.customerName && o.customerName.toLowerCase() === visit.customerName.toLowerCase());
          }

          // Find measurement profile
          let matchedMeas = null;
          if (matchedOrder && matchedOrder.measurementProfileId) {
            matchedMeas = allMeasurements.find(m => m.id === matchedOrder.measurementProfileId);
          }
          if (!matchedMeas && visit.customerId) {
            matchedMeas = allMeasurements.find(m => m.userId === visit.customerId);
          }

          combinedItems.push({
            id: visit.id,
            type: 'HOME_VISIT',
            userName: visit.customerName || (matchedOrder && matchedOrder.customerName) || 'Customer',
            phone: (matchedOrder && matchedOrder.user?.phoneNumber) || visit.customer?.phoneNumber || '',
            email: (matchedOrder && matchedOrder.user?.email) || visit.customer?.email || '',
            address: visit.address || (matchedOrder && parseUserAddress(matchedOrder.user)?.address) || '',
            gender: (matchedOrder && matchedOrder.user?.gender) || visit.customer?.gender || '',
            timeSlot: 'Home Visit Fitting',
            apptType: 'HOME_VISIT',
            status: visit.status,
            notes: visit.requirements,
            assignedStaffName: visit.assignedStaffName || 'Unassigned',
            order: matchedOrder,
            measurements: matchedMeas
          });
        }
      });
    }

    return combinedItems;
  };

  const handlePrintWorksheets = (items) => {
    const printWindow = window.open('', '_blank', 'width=900,height=800');
    if (!printWindow) {
      alert('Pop-up blocked! Please allow pop-ups to print tailoring sheets.');
      return;
    }

    let sheetsHTML = '';
    items.forEach((item, index) => {
      let clientInfo = '';
      if (printFields.custName) clientInfo += `<div><strong>Client Name:</strong> ${item.userName}</div>`;
      if (printFields.custPhone) clientInfo += `<div><strong>Phone:</strong> ${item.phone || 'N/A'}</div>`;
      if (printFields.custEmail) clientInfo += `<div><strong>Email:</strong> ${item.email || 'N/A'}</div>`;
      if (printFields.custAddress) clientInfo += `<div><strong>Address:</strong> ${item.address || 'N/A'}</div>`;
      if (printFields.custGender) clientInfo += `<div><strong>Gender:</strong> ${item.gender || 'N/A'}</div>`;

      let apptInfo = '';
      if (printFields.apptType) apptInfo += `<div><strong>Appointment Type:</strong> ${item.apptType}</div>`;
      if (printFields.apptStaff) apptInfo += `<div><strong>Assigned Tailor:</strong> ${item.assignedStaffName}</div>`;
      if (printFields.apptStatus) apptInfo += `<div><strong>Status:</strong> ${item.status}</div>`;
      if (printFields.apptNotes) apptInfo += `<div style="margin-top: 5px;"><strong>Requirements/Notes:</strong> ${item.notes || 'N/A'}</div>`;

      let orderInfo = '';
      if (item.order) {
        if (printFields.orderInvoice) orderInfo += `<div><strong>Invoice No:</strong> ${item.order.invoiceNumber}</div>`;
        if (printFields.orderStatus) orderInfo += `<div><strong>Order Stage:</strong> ${item.order.status}</div>`;
        if (printFields.orderFabric) orderInfo += `<div><strong>Fabric Selected:</strong> ${item.order.fabricType || 'As specified'}</div>`;
        if (printFields.orderCustoms) orderInfo += `<div style="margin-top: 4px;"><strong>Customizations:</strong> ${item.order.customizations || 'None'}</div>`;
        if (printFields.orderTailorNotes) orderInfo += `<div style="margin-top: 4px;"><strong>Order Tailor Notes:</strong> ${item.order.tailorNotes || 'None'}</div>`;
        if (printFields.orderItems) {
          orderInfo += `<div style="margin-top: 6px;"><strong>Ordered Apparel:</strong></div>`;
          orderInfo += `<ul style="margin: 3px 0; padding-left: 15px; font-weight: bold;">`;
          item.order.orderItems?.forEach(p => {
            orderInfo += `<li>${p.product?.name} (x${p.quantity})</li>`;
          });
          orderInfo += `</ul>`;
        }
      } else {
        orderInfo = '<div style="color: #666; font-style: italic;">No direct retail order linked.</div>';
      }

      let measInfo = '';
      if (hasAnyMeasurementFieldChecked() && item.measurements) {
        measInfo += `<div class="meas-grid">`;
        Object.entries(MEASUREMENT_LABELS).forEach(([fieldKey, cfg]) => {
          if (printFields[fieldKey]) {
            const val = item.measurements[cfg.key];
            measInfo += `
              <div class="meas-item">
                <span class="meas-label">${cfg.label}</span>
                <span class="meas-value">${val ? val + '"' : '-'}</span>
              </div>
            `;
          }
        });
        measInfo += `</div>`;
      } else if (hasAnyMeasurementFieldChecked()) {
        measInfo = '<div style="color: #666; font-style: italic;">No size profile registered. Sizing measurements must be taken.</div>';
      }

      sheetsHTML += `
        <div class="worksheet">
          <div class="worksheet-header">
            <span>WORKSHEET #${index + 1} (${item.type === 'STUDIO_FITTING' ? 'STUDIO FITTING' : 'HOME VISIT'})</span>
            <span>TIME SLOT: ${item.timeSlot}</span>
          </div>
          <div class="grid">
            <div>
              <div class="section-title">Customer Info</div>
              ${clientInfo || '<div style="color: #666; font-style: italic;">No columns selected.</div>'}
            </div>
            <div>
              <div class="section-title">Booking Details</div>
              ${apptInfo || '<div style="color: #666; font-style: italic;">No columns selected.</div>'}
            </div>
          </div>
          
          ${(printFields.orderInvoice || printFields.orderStatus || printFields.orderItems || printFields.orderFabric || printFields.orderCustoms || printFields.orderTailorNotes) ? `
            <div style="margin-top: 15px;">
              <div class="section-title">Associated Order & Customizations</div>
              ${orderInfo}
            </div>
          ` : ''}

          ${hasAnyMeasurementFieldChecked() ? `
            <div style="margin-top: 15px;">
              <div class="section-title">Sizing Measurements (${item.measurements?.profileName || 'Default Size'})</div>
              ${measInfo}
            </div>
          ` : ''}
        </div>
      `;
    });

    const docHTML = `
      <html>
        <head>
          <title>MARCOS Custom Tailoring Worksheet - ${printDate}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 20px; color: #000; background: #fff; font-size: 11px; line-height: 1.4; }
            h1 { text-align: center; border-bottom: 3px double #000; padding-bottom: 8px; margin: 0 0 5px 0; font-size: 18px; text-transform: uppercase; letter-spacing: 1px; }
            .meta { display: flex; justify-content: space-between; margin-bottom: 20px; font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 6px; font-size: 10px; text-transform: uppercase; color: #333; }
            .worksheet { border: 2px solid #000; padding: 15px; margin-bottom: 25px; page-break-inside: avoid; border-radius: 6px; background-color: #fff; }
            .worksheet-header { display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 12px; font-size: 12px; font-weight: bold; font-family: monospace; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
            .section-title { font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 2px; margin-bottom: 6px; text-transform: uppercase; font-size: 9px; color: #000; letter-spacing: 0.5px; }
            .meas-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; margin-top: 5px; }
            .meas-item { border: 1px solid #000; padding: 4px; background: #fff; text-align: center; }
            .meas-label { font-size: 8px; color: #000; display: block; text-transform: uppercase; font-weight: bold; }
            .meas-value { font-weight: bold; font-size: 12px; font-family: monospace; }
            .no-print-btn { text-align: center; margin-bottom: 20px; }
            .no-print-btn button { background: #000; color: #fff; border: none; padding: 10px 28px; font-size: 13px; font-weight: bold; border-radius: 6px; cursor: pointer; letter-spacing: 1px; text-transform: uppercase; }
            .no-print-btn button:hover { background: #333; }
            ul { margin: 0; padding-left: 15px; }
            li { margin-bottom: 2px; }
            @media print {
              .no-print-btn { display: none; }
              body { padding: 0; }
              .worksheet { margin-bottom: 20px; }
            }
          </style>
        </head>
        <body>
          <div class="no-print-btn">
            <button onclick="window.print()">🖨️ Print Tailoring Sheets</button>
          </div>
          <h1>MARCOS Tailoring Production Worksheet</h1>
          <div class="meta">
            <span>Date Scope: ${printDateRange === 'DAY' ? (printDate ? new Date(printDate).toLocaleDateString(undefined, { dateStyle: 'long' }) : 'All Dates') : printDateRange === 'WEEK' ? 'This Week' : printDateRange === 'MONTH' ? 'This Month' : printDateRange === 'CUSTOM' ? ((printDateFrom || 'Start') + ' to ' + (printDateTo || 'End')) : 'All Time'}</span>
            <span>Total Worksheets: ${items.length}</span>
            <span>Confidential - For Tailoring Workshop Use Only</span>
          </div>
          ${sheetsHTML}
        </body>
      </html>
    `;

    printWindow.document.write(docHTML);
    printWindow.document.close();
  };

  const handleUpdateAppStatus = async (id, status) => {
    try {
      await api.updateAppointmentStatus(id, status);
      loadOrders();
      if (selectedOrder && selectedOrder.booking?.id === id) {
        setSelectedOrder(prev => ({
          ...prev,
          booking: {
            ...prev.booking,
            status,
          }
        }));
      }
    } catch (err) {
      alert(err.message || 'Status update failed.');
    }
  };

  const handleAssignStaff = async (e) => {
    e.preventDefault();
    const staffIdToAssign = selectedStaffId || (staffList.length > 0 ? staffList[0].id : null);
    if (!activeVisitId || !staffIdToAssign) return;

    try {
      await api.assignStaffToVisit(activeVisitId, staffIdToAssign);
      setActiveVisitId(null);
      loadOrders();
    } catch (err) {
      alert(err.message || 'Staff allocation failed.');
    }
  };

  const handleCompleteVisit = async (e) => {
    e.preventDefault();
    if (!reportVisitId || !completionNotes.trim()) return;

    const urls = mediaUrl.trim() ? [mediaUrl.trim()] : ['https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=500'];

    try {
      await api.completeStoreVisit(reportVisitId, completionNotes.trim(), urls);
      setReportVisitId(null);
      setCompletionNotes('');
      setMediaUrl('');
      loadOrders();
    } catch (err) {
      alert(err.message || 'Filing completion report failed.');
    }
  };

  const getApptStatusStyle = (status) => {
    switch (status) {
      case 'CONFIRMED':
      case 'COMPLETED':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'ASSIGNED':
      case 'IN_PROGRESS':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'PENDING':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      default:
        return 'bg-red-50 text-red-700 border-red-200';
    }
  };

  const handleUpdateStatus = async (id, status, e) => {
    if (e) e.stopPropagation();
    try {
      // Optimistic update to immediately reflect in UI
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
      if (selectedOrder && selectedOrder.id === id) {
        setSelectedOrder(prev => ({ ...prev, status }));
      }
      await api.updateOrderStatus(id, status);
      await loadOrders(true);
    } catch (err) {
      console.error('Failed to update status:', err);
      alert(err.message || 'Status update failed.');
      loadOrders(true);
    }
  };

  const handleUpdateQuickStatus = async (id, status) => {
    try {
      await api.updateQuickOrderStatus(id, status);
      loadOrders();
      if (selectedOrder && selectedOrder.id === id) {
        setSelectedOrder(prev => ({ ...prev, quickOrderStatus: status, quickOrderProposedDate: null }));
      }
      alert(`Quick order status updated to ${status}`);
    } catch (err) {
      alert(err.message || 'Quick order status update failed.');
    }
  };

  const handleProposeQuickOrderDate = async (id, proposedDate, adminNote) => {
    if (!proposedDate) {
      alert('Please select a date.');
      return;
    }
    if (!adminNote) {
      alert('Please provide an explanation for proposing this date.');
      return;
    }
    try {
      await api.updateQuickOrderStatus(id, 'DATE_CHANGE_PROPOSED', proposedDate, adminNote);
      loadOrders();
      if (selectedOrder && selectedOrder.id === id) {
        setSelectedOrder(prev => ({ 
          ...prev, 
          quickOrderStatus: 'DATE_CHANGE_PROPOSED',
          quickOrderProposedDate: proposedDate,
          adminProposalNote: adminNote
        }));
      }
      setProposeDateOrderId(null);
      setProposedDateVal('');
      setAdminProposalNoteVal('');
      alert(`Date change proposed successfully to ${new Date(proposedDate).toLocaleDateString('en-IN')}`);
    } catch (err) {
      alert(err.message || 'Failed to propose date change.');
    }
  };

  // Stage a status change — opens the two-step confirmation dialog
  const stageStatusChange = (order, newStatus) => {
    if (order.status === newStatus) return;
    const fromCfg = getStageConfig(order.status);
    const toCfg = getStageConfig(newStatus);
    setPendingStatusChange({
      orderId: order.id,
      invoiceNumber: order.invoiceNumber,
      from: order.status,
      fromLabel: fromCfg.label,
      to: newStatus,
      toLabel: toCfg.label,
      toCfg,
    });
  };

  const confirmStatusChange = async () => {
    if (!pendingStatusChange) return;
    await handleUpdateStatus(pendingStatusChange.orderId, pendingStatusChange.to);
    setPendingStatusChange(null);
  };

  const getLocalDayBounds = (date) => {
    if (!date) return null;
    const start = new Date(`${date}T00:00:00`).getTime();
    return { start, end: start + 86400000 };
  };
  const createdDayBounds = getLocalDayBounds(dateFrom);
  const deliveryDayBounds = getLocalDayBounds(dateFrom);
  const isInDay = (value, bounds) => {
    if (!value || !bounds) return false;
    const time = new Date(value).getTime();
    return time >= bounds.start && time < bounds.end;
  };
  const matchesDateWindow = (value) => {
    if (!value && (dateFrom || dateTo)) return false;
    const time = value ? new Date(value).getTime() : 0;
    const start = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : -Infinity;
    const end = dateTo ? new Date(`${dateTo}T00:00:00`).getTime() + 86400000 : Infinity;
    return time >= start && time < end;
  };

  const sameDayCounts = useMemo(() => {
    const productOrders = orders.filter(o => !o.isQuickOrder);
    const inSelectedRange = (order, basis) => {
      const value = basis === 'delivery' ? (order.deliveryDate || (order.status === 'DELIVERED' ? order.updatedAt || order.createdAt : null)) : order.createdAt;
      return matchesDateWindow(value);
    };
    return {
      ordersReceived: productOrders.filter(o => o.status !== 'CANCELLED' && inSelectedRange(o, 'created')).length,
      toBeDelivered: productOrders.filter(o => ['PENDING', 'PAID', 'PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY'].includes(o.status) && inSelectedRange(o, 'delivery')).length,
      delivered: productOrders.filter(o => o.status === 'DELIVERED' && inSelectedRange(o, 'delivery')).length,
      total: productOrders.length,
    };
  }, [orders, dateFrom, dateTo, createdDayBounds, deliveryDayBounds]);

  const filteredOrders = orders.filter(order => {
    const matchesSearch =
      (order.customerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (order.invoiceNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      formatOrderId(order.invoiceNumber).toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || order.status === statusFilter || 
      (statusFilter === 'PROCEEDED' && ['PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(order.status));
    
    // Same-day detailed stage quick filter
    if (deliveryStageQuickFilter === 'ORDERS_RECEIVED') {
      const inDay = matchesDateWindow(order.createdAt);
      if (!inDay || order.status === 'CANCELLED') return false;
    } else if (deliveryStageQuickFilter === 'TO_BE_DELIVERED') {
      const inDay = matchesDateWindow(order.deliveryDate);
      const isPendingDelivery = ['PENDING', 'PAID', 'PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY'].includes(order.status);
      if (!inDay || !isPendingDelivery) return false;
    } else if (deliveryStageQuickFilter === 'DELIVERED') {
      if (order.status !== 'DELIVERED') return false;
      if (!matchesDateWindow(order.deliveryDate || order.updatedAt || order.createdAt)) return false;
    }

    let matchesDateFrom = true;
    let matchesDateTo = true;
    if (dateFrom && deliveryStageQuickFilter === 'ALL') {
      const d = dateFilterType === 'DELIVERY_DATE' && order.deliveryDate ? new Date(order.deliveryDate).getTime() : new Date(order.createdAt).getTime();
      matchesDateFrom = d >= new Date(dateFrom).getTime();
    }
    if (dateTo && deliveryStageQuickFilter === 'ALL') {
      const d = dateFilterType === 'DELIVERY_DATE' && order.deliveryDate ? new Date(order.deliveryDate).getTime() : new Date(order.createdAt).getTime();
      matchesDateTo = d <= new Date(dateTo).setHours(23, 59, 59, 999);
    }
    const matchesPayment = paymentFilter === 'ALL' || order.paymentMethod === paymentFilter || (paymentFilter === 'PAID' && order.paymentStatus === 'PAID');
    const matchesType = typeFilter === 'ALL' || 
      (typeFilter === 'OFFLINE' && order.isOfflineSales) || 
      (typeFilter === 'ONLINE' && !order.isOfflineSales);

    return !order.isQuickOrder && matchesSearch && matchesStatus && matchesDateFrom && matchesDateTo && matchesPayment && matchesType;
  });

  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
  const paginatedOrders = filteredOrders.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  
  const cancelledAlerts = orders
    .filter(o => o.status === 'CANCELLED' && !dismissedAlerts.includes(o.id))
    .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
    .slice(0, 3);

  const filteredQuickOrders = orders.filter(order => {
    if (!order.isQuickOrder) return false;
    const matchesSearch =
      (order.customerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (order.invoiceNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      formatOrderId(order.invoiceNumber).toLowerCase().includes(searchTerm.toLowerCase());
    
    let matchesDateFrom = true;
    let matchesDateTo = true;
    if (dateFrom) {
      const d = dateFilterType === 'DELIVERY_DATE' && order.deliveryDate ? new Date(order.deliveryDate).getTime() : new Date(order.createdAt).getTime();
      matchesDateFrom = d >= new Date(dateFrom).getTime();
    }
    if (dateTo) {
      const d = dateFilterType === 'DELIVERY_DATE' && order.deliveryDate ? new Date(order.deliveryDate).getTime() : new Date(order.createdAt).getTime();
      matchesDateTo = d <= new Date(dateTo).setHours(23, 59, 59, 999);
    }
    const matchesPayment = paymentFilter === 'ALL' || order.paymentMethod === paymentFilter || (paymentFilter === 'PAID' && order.paymentStatus === 'PAID');
    const matchesType = typeFilter === 'ALL' || 
      (typeFilter === 'OFFLINE' && order.isOfflineSales) || 
      (typeFilter === 'ONLINE' && !order.isOfflineSales);

    return matchesSearch && matchesDateFrom && matchesDateTo && matchesPayment && matchesType;
  });

  const filteredAppointments = appointments.filter(appt => {
    const matchesSearch =
      (appt.userName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (appt.productType || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = apptStatusFilter === 'ALL' || appt.status === apptStatusFilter;
    
    let matchesDateFrom = true;
    let matchesDateTo = true;
    if (dateFrom) {
      const d = new Date(appt.date).getTime();
      matchesDateFrom = d >= new Date(dateFrom).getTime();
    }
    if (dateTo) {
      const d = new Date(appt.date).getTime();
      matchesDateTo = d <= new Date(dateTo).setHours(23, 59, 59, 999);
    }

    return matchesSearch && matchesStatus && matchesDateFrom && matchesDateTo;
  });

  const filteredVisits = visits.filter(visit => {
    const matchesSearch =
      (visit.customerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (visit.address || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = visitStatusFilter === 'ALL' || visit.status === visitStatusFilter;
    
    let matchesDateFrom = true;
    let matchesDateTo = true;
    const visitDateStr = visit.confirmedDate || visit.preferredDate;
    if (dateFrom && visitDateStr) {
      const d = new Date(visitDateStr).getTime();
      matchesDateFrom = d >= new Date(dateFrom).getTime();
    }
    if (dateTo && visitDateStr) {
      const d = new Date(visitDateStr).getTime();
      matchesDateTo = d <= new Date(dateTo).setHours(23, 59, 59, 999);
    }

    return matchesSearch && matchesStatus && matchesDateFrom && matchesDateTo;
  });

  const getStatusStyle = (status) => {
    const cfg = getStageConfig(status);
    if (status === 'CANCELLED') return 'bg-red-50 text-red-700 border-red-100';
    return `${cfg.bg} ${cfg.text} ${cfg.border}`;
  };

  const getStatusLabel = (status) => {
    if (status === 'CANCELLED') return 'Cancelled';
    return getStageConfig(status).label;
  };

  const getTimelines = (order) => {
    const orderDate = new Date(order.createdAt);
    const orderDateStr = orderDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    
    let deliveryDateStr = 'Not Set';
    let daysRemainingText = '';
    let daysColor = 'text-slate-500';

    if (order.deliveryDate) {
      const deliveryDate = new Date(order.deliveryDate);
      deliveryDateStr = deliveryDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const targetDate = new Date(deliveryDate);
      targetDate.setHours(0, 0, 0, 0);
      
      const diffTime = targetDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (order.status === 'DELIVERED') {
        daysRemainingText = 'Delivered';
        daysColor = 'text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded';
      } else if (order.status === 'CANCELLED') {
        daysRemainingText = 'Cancelled';
        daysColor = 'text-slate-500 bg-slate-100 px-2 py-0.5 rounded';
      } else if (diffDays < 0) {
        daysRemainingText = `${Math.abs(diffDays)} Days Overdue`;
        daysColor = 'text-red-600 bg-red-50 px-2 py-0.5 rounded font-bold';
      } else if (diffDays === 0) {
        daysRemainingText = 'Due Today';
        daysColor = 'text-amber-600 bg-amber-50 px-2 py-0.5 rounded font-bold';
      } else {
        daysRemainingText = `${diffDays} Days Left`;
        daysColor = 'text-blue-600 bg-blue-50 px-2 py-0.5 rounded font-bold';
      }
    }

    return { orderDateStr, deliveryDateStr, daysRemainingText, daysColor };
  };

  const getCombinedStatusLabel = (order) => {
    if (order.status === 'CANCELLED') return 'Cancelled';
    
    const advance = Number(order.advancePayment) || 0;
    const sumSubsequent = (order.paymentHistory && Array.isArray(order.paymentHistory)) ? order.paymentHistory.reduce((s, p) => s + Number(p.amount), 0) : 0;
    const totalPaid = advance + sumSubsequent;
    const total = Number(order.payableAmount) || Number(order.totalAmount) || 0;
    
    let paymentLabel = 'Non-Paid';
    if (order.paymentStatus === 'PENDING' && totalPaid === 0) {
      paymentLabel = 'Non-Paid';
    } else if (totalPaid >= total && total > 0) {
      paymentLabel = 'Fully Paid';
    } else if (order.paymentStatus === 'COMPLETED') {
      paymentLabel = 'Fully Paid'; 
    } else if (totalPaid > 0 || order.paymentStatus === 'PARTIAL') {
      paymentLabel = sumSubsequent > 0 ? 'Partially Paid' : 'Advance Paid';
    }

    let orderLabel = getStageConfig(order.status).label;
    if (order.status === 'PENDING') orderLabel = 'Ordered';
    if (order.status === 'PAID') orderLabel = 'Measurement';
    if (order.status === 'PROCESSING') orderLabel = 'Stitching';
    if (order.status === 'SHIPPED') orderLabel = 'Completed';
    if (order.status === 'OUT_FOR_DELIVERY') orderLabel = 'Out for Delivery';
    if (order.status === 'DELIVERED') orderLabel = 'Delivered';

    return `${paymentLabel} - ${orderLabel}`;
  };

  const getCombinedStatusStyle = (order) => {
    if (order.status === 'CANCELLED') return 'bg-red-50 text-red-700 border-red-100';
    
    const advance = Number(order.advancePayment) || 0;
    const sumSubsequent = (order.paymentHistory && Array.isArray(order.paymentHistory)) ? order.paymentHistory.reduce((s, p) => s + Number(p.amount), 0) : 0;
    const totalPaid = advance + sumSubsequent;
    const total = Number(order.payableAmount) || Number(order.totalAmount) || 0;
    
    if (totalPaid >= total && total > 0) {
      return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    } else if (order.paymentStatus === 'COMPLETED' && (!order.isOfflineSales || total === 0)) {
      return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    } else if (totalPaid > 0) {
      return 'bg-amber-50 text-amber-700 border-amber-100';
    }
    return 'bg-slate-50 text-slate-700 border-slate-100';
  };

  const handleProcessRefund = async (orderToRefund, e) => {
    if (e) e.stopPropagation();
    const amountStr = Number(orderToRefund.payableAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
    if (!window.confirm(`Are you sure you want to process a refund of ₹${amountStr} for Order #${orderToRefund.invoiceNumber}? This action will update the database.`)) {
      return;
    }

    try {
      await api.updateOrderDetails(orderToRefund.id, {
        status: orderToRefund.status,
        paymentStatus: 'REFUNDED'
      });
      alert(`Order #${orderToRefund.invoiceNumber} has been successfully marked as REFUNDED in the database.`);
      
      if (selectedOrder && selectedOrder.id === orderToRefund.id) {
        setEditPaymentStatus('REFUNDED');
        setSelectedOrder(prev => ({ ...prev, paymentStatus: 'REFUNDED' }));
      }
      dismissAlert(orderToRefund.id);
      loadOrders(true);
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to process refund.');
    }
  };

  const handleSaveOrderChanges = async () => {
    try {
      let finalProfileId = selectedProfileId;
      
      if (isCreatingNewProfile) {
        if (!newProfileName.trim()) {
          alert('Please enter a name for the new profile.');
          return;
        }
        // Create new profile
        const newProfile = await api.createMeasurementProfile({
          userId: selectedOrder.userId || selectedOrder.user?.id,
          profileName: newProfileName.trim(),
          fullLength: Number(editMeasurements.fullLength) || 0,
          shoulderWidth: Number(editMeasurements.shoulderWidth) || 0,
          upperChest: Number(editMeasurements.upperChest) || 0,
          bust: Number(editMeasurements.bust) || 0,
          waist: Number(editMeasurements.waist) || 0,
          hip: Number(editMeasurements.hip) || 0,
          armLength: Number(editMeasurements.armLength) || 0,
          sleeveLength: Number(editMeasurements.sleeveLength) || 0,
          neck: Number(editMeasurements.neck) || 0,
          skirtLength: Number(editMeasurements.skirtLength) || 0,
          pantLength: Number(editMeasurements.pantLength) || 0,
          tailorNotes: editTailorNotes
        });
        finalProfileId = newProfile.id;
      } else if (selectedProfileId && selectedProfileId !== 'none') {
        // Update existing profile
        await api.updateMeasurements(selectedProfileId, {
          fullLength: Number(editMeasurements.fullLength),
          shoulderWidth: Number(editMeasurements.shoulderWidth),
          upperChest: Number(editMeasurements.upperChest),
          bust: Number(editMeasurements.bust),
          waist: Number(editMeasurements.waist),
          hip: Number(editMeasurements.hip),
          armLength: Number(editMeasurements.armLength),
          sleeveLength: Number(editMeasurements.sleeveLength),
          neck: Number(editMeasurements.neck),
          skirtLength: Number(editMeasurements.skirtLength),
          pantLength: Number(editMeasurements.pantLength),
          tailorNotes: editTailorNotes
        });
      }

      const updates = {
        customerName: editCustomerName,
        status: editOrderStatus,
        paymentStatus: editPaymentStatus,
        advancePayment: Number(editAdvancePayment) || 0,
        deliveryDate: editDeliveryDate || null,
        fabricType: editFabricType,
        customizations: editCustomizations,
        tailorNotes: editTailorNotes,
        measurementProfileId: finalProfileId === 'none' ? null : finalProfileId,
        user: {
          ...selectedOrder.user,
          fullName: editCustomerName,
          phoneNumber: editCustomerPhone,
          email: editCustomerEmail,
          address: JSON.stringify({
            selected: true,
            fullName: editCustomerName,
            address: editCustomerAddress,
            phone: editCustomerPhone,
          }),
        }
      };
      
      const updatedOrder = await api.updateOrderDetails(selectedOrder.id, updates);
      
      alert('Order and customer details updated successfully!');
      setIsCreatingNewProfile(false);
      setNewProfileName('');
      setSelectedOrder(prev => ({
        ...prev,
        ...updatedOrder,
        customerName: prev?.customerName || updatedOrder.user?.fullName,
        items: prev?.items || (updatedOrder.orderItems || []).map(c => ({
          id: c.id,
          productName: c.product?.name || 'Unknown Item',
          quantity: c.quantity,
          price: Number(c.price)
        })),
        booking: prev?.booking || null
      }));
      loadOrders();
    } catch (err) {
      alert(err.message || 'Failed to save order changes.');
    }
  };

  const handleRecordNewPayment = async () => {
    if (!newPaymentAmount || isNaN(newPaymentAmount) || Number(newPaymentAmount) <= 0) {
      alert('Please enter a valid payment amount.');
      return;
    }
    try {
      const updates = {
        newPayment: {
          id: `pay-${Date.now()}`,
          amount: Number(newPaymentAmount),
          method: newPaymentMethod,
          date: new Date().toISOString(),
          note: newPaymentNote
        }
      };
      
      const updatedOrder = await api.updateOrderDetails(selectedOrder.id, updates);
      
      alert('Payment recorded successfully!');
      setNewPaymentAmount('');
      setNewPaymentNote('');
      setSelectedOrder(prev => ({
        ...prev,
        ...updatedOrder,
        customerName: prev?.customerName || updatedOrder.user?.fullName,
        items: prev?.items || (updatedOrder.orderItems || []).map(c => ({
          id: c.id,
          productName: c.product?.name || 'Unknown Item',
          quantity: c.quantity,
          price: Number(c.price)
        })),
        booking: prev?.booking || null
      }));
      loadOrders();
    } catch (err) {
      alert(err.message || 'Failed to record payment.');
    }
  };


  const handleUpdateBookingStatus = async (status) => {
    let booking = selectedOrder.booking;
    if (!booking) {
      alert('No booking associated with this order.');
      return;
    }
    
    try {
      if (booking.id.startsWith('appt-temp-') || booking.id.startsWith('appt-auto-')) {
        const autoBookingData = {
          type: 'MEASUREMENT',
          date: booking.date,
          timeSlot: booking.timeSlot,
          productType: selectedOrder.items?.[0]?.product?.name || 'Luxury Custom Outfit',
          notes: selectedOrder.invoiceNumber,
          userId: selectedOrder.userId || selectedOrder.user?.id || undefined,
        };
        const newAppt = await api.createAppointment(autoBookingData);
        booking = {
          id: newAppt.id,
          type: newAppt.type,
          date: newAppt.date,
          timeSlot: newAppt.timeSlot,
          status: newAppt.status,
          notes: newAppt.notes,
        };
        selectedOrder.booking = booking;
      }

      const isStudio = booking.type === 'STUDIO' || booking.type === 'MEASUREMENT';
      if (isStudio) {
        await api.updateAppointmentStatus(booking.id, status);
      } else {
        let dbStatus = 'PENDING';
        if (status === 'CONFIRMED') dbStatus = 'ASSIGNED';
        else if (status === 'COMPLETED') dbStatus = 'COMPLETED';
        else if (status === 'CANCELLED') dbStatus = 'PENDING';
        
        await api.updateStoreVisit(booking.id, { status: dbStatus });
      }
      
      setSelectedOrder(prev => ({
        ...prev,
        booking: {
          ...prev.booking,
          id: booking.id,
          status
        }
      }));
      
      alert(`Appointment marked as ${status.toLowerCase()}!`);
      loadOrders();
    } catch (err) {
      alert(err.message || 'Failed to update booking status.');
    }
  };

  const handleRescheduleAppointment = async () => {
    if (!rescheduleDate) {
      alert('Please select a valid date.');
      return;
    }
    
    let booking = selectedOrder.booking;
    try {
      const formattedDate = new Date(rescheduleDate).toISOString();

      if (!booking || booking.id.startsWith('appt-temp-') || booking.id.startsWith('appt-auto-')) {
        const autoBookingData = {
          type: 'MEASUREMENT',
          date: formattedDate,
          timeSlot: rescheduleTimeSlot,
          productType: selectedOrder.items?.[0]?.product?.name || 'Luxury Custom Outfit',
          notes: selectedOrder.invoiceNumber,
          userId: selectedOrder.userId || selectedOrder.user?.id || undefined,
        };
        const newAppt = await api.createAppointment(autoBookingData);
        booking = {
          id: newAppt.id,
          type: newAppt.type,
          date: newAppt.date,
          timeSlot: newAppt.timeSlot,
          status: newAppt.status,
          notes: newAppt.notes,
        };
        selectedOrder.booking = booking;
      }

      const isStudio = booking.type === 'STUDIO' || booking.type === 'MEASUREMENT';
      
      if (isStudio) {
        await api.updateAppointment(booking.id, {
          date: formattedDate,
          timeSlot: rescheduleTimeSlot,
          status: 'CONFIRMED',
        });
      } else {
        await api.updateStoreVisit(booking.id, {
          preferredDate: formattedDate,
          confirmedDate: formattedDate,
          status: booking.status === 'COMPLETED' ? 'COMPLETED' : 'ASSIGNED',
        });
      }
      
      const historyEvent = {
        date: formattedDate,
        timeSlot: isStudio ? rescheduleTimeSlot : 'Home Visit',
        reason: rescheduleReason || 'Administrative update',
        timestamp: new Date().toISOString(),
      };
      
      const updatedHistory = [...(selectedOrder.rescheduleHistory || []), historyEvent];
      
      await api.updateOrderDetails(selectedOrder.id, {
        rescheduleHistory: updatedHistory,
      });
      
      alert('Fitting session rescheduled successfully!');
      
      setSelectedOrder(prev => ({
        ...prev,
        booking: {
          ...prev.booking,
          id: booking.id,
          date: formattedDate,
          timeSlot: isStudio ? rescheduleTimeSlot : 'Home Visit',
          status: isStudio ? 'CONFIRMED' : (booking.status === 'COMPLETED' ? 'COMPLETED' : 'ASSIGNED')
        },
        rescheduleHistory: updatedHistory
      }));
      
      setIsRescheduling(false);
      setRescheduleReason('');
      loadOrders();
    } catch (err) {
      alert(err.message || 'Failed to reschedule.');
    }
  };

  const handleCreateMockBooking = () => {
    const newBooking = {
      id: `appt-auto-${Date.now()}`,
      type: 'STUDIO',
      date: new Date(Date.now() + 86400000 * 2).toISOString(),
      timeSlot: '10:00 AM - 11:30 AM',
      status: 'PENDING',
      notes: selectedOrder.invoiceNumber,
    };
    
    setSelectedOrder(prev => ({
      ...prev,
      booking: newBooking
    }));
  };

  const getActivityTimeline = () => {
    const timeline = [];
    if (!selectedOrder) return timeline;
    
    if (selectedOrder.booking) {
      timeline.push({
        title: 'Appointment Booking Created',
        description: `Appointment initialized automatically for invoice ${selectedOrder.invoiceNumber}.`,
        date: new Date(selectedOrder.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
        icon: 'plus',
        status: 'completed',
      });
    } else {
      timeline.push({
        title: 'Order Placed',
        description: `Order successfully placed. Awaiting custom sizing fitting session schedule.`,
        date: new Date(selectedOrder.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
        icon: 'plus',
        status: 'completed',
      });
    }

    if (selectedOrder.booking) {
      const b = selectedOrder.booking;
      
      if (b.status === 'CONFIRMED' || b.status === 'COMPLETED') {
        timeline.push({
          title: 'Customer Confirmed Slot',
          description: `Appointment confirmed for slot ${formatBookingDateUTC(b.date)} at ${b.timeSlot}.`,
          date: new Date(b.updatedAt || selectedOrder.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
          icon: 'check',
          status: 'completed',
        });
      }
      
      if (b.status === 'COMPLETED') {
        timeline.push({
          title: 'Fitting Session Completed',
          description: `Measurements verified and filed by tailoring staff.`,
          date: new Date(b.updatedAt || Date.now()).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
          icon: 'award',
          status: 'completed',
        });
      }
      
      if (b.status === 'CANCELLED') {
        timeline.push({
          title: 'Appointment Rejected',
          description: `Booking declined by admin or cancelled by client.`,
          date: new Date(b.updatedAt || Date.now()).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
          icon: 'x',
          status: 'cancelled',
        });
      }
    }
    
    if (selectedOrder.rescheduleHistory) {
      selectedOrder.rescheduleHistory.forEach((item) => {
        timeline.push({
          title: 'Appointment Rescheduled',
          description: `Rescheduled to ${formatBookingDateUTC(item.date)} at ${item.timeSlot}. Reason: ${item.reason}`,
          date: new Date(item.timestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
          icon: 'clock',
          status: 'warning',
        });
      });
    }

    return timeline;
  };

  const renderAdvancedFilters = () => {
    if (!showAdvancedFilters) return null;
    const todayStr = new Date().toISOString().substring(0, 10);
    const tomorrowStr = new Date(Date.now() + 86400000).toISOString().substring(0, 10);
    const yesterdayStr = new Date(Date.now() - 86400000).toISOString().substring(0, 10);
    const last7Str = new Date(Date.now() - 7 * 86400000).toISOString().substring(0, 10);
    const next7Str = new Date(Date.now() + 7 * 86400000).toISOString().substring(0, 10);

    return (
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 animate-slide-in mt-4 w-full">
        {/* Quick Date Presets */}
        <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-slate-200/60">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Quick Presets:</span>
          <button
            type="button"
            onClick={() => { setDateFrom(todayStr); setDateTo(todayStr); }}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${dateFrom === todayStr && dateTo === todayStr ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'}`}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => { setDateFrom(tomorrowStr); setDateTo(tomorrowStr); setDateFilterType('DELIVERY_DATE'); }}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${dateFrom === tomorrowStr && dateTo === tomorrowStr ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'}`}
          >
            Tomorrow
          </button>
          <button
            type="button"
            onClick={() => { setDateFrom(yesterdayStr); setDateTo(yesterdayStr); }}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${dateFrom === yesterdayStr && dateTo === yesterdayStr ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'}`}
          >
            Yesterday
          </button>
          <button
            type="button"
            onClick={() => { setDateFrom(todayStr); setDateTo(next7Str); setDateFilterType('DELIVERY_DATE'); }}
            className="px-2.5 py-1 rounded-lg text-[11px] font-bold border bg-white border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Next 7 Days Deliveries
          </button>
          <button
            type="button"
            onClick={() => { setDateFrom(last7Str); setDateTo(todayStr); }}
            className="px-2.5 py-1 rounded-lg text-[11px] font-bold border bg-white border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Past 7 Days
          </button>
        </div>

        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Date Basis</label>
            <select 
              value={dateFilterType} 
              onChange={e => setDateFilterType(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl bg-white border border-slate-200 focus:outline-none focus:border-brand-500 transition-colors"
            >
              <option value="ORDER_DATE">Order Placed Date</option>
              <option value="DELIVERY_DATE">Promised Delivery Date</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Day Stage Mode</label>
            <select 
              value={deliveryStageQuickFilter} 
              onChange={e => setDeliveryStageQuickFilter(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl bg-white border border-slate-200 focus:outline-none focus:border-brand-500 transition-colors font-bold text-slate-700"
            >
              <option value="ALL">All Orders on Date</option>
              <option value="ORDERS_RECEIVED">Orders Received (Created on Date)</option>
              <option value="TO_BE_DELIVERED">To Be Delivered (Delivery on Date)</option>
              <option value="DELIVERED">Delivered (Completed)</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">From Date</label>
            <input 
              type="date" 
              value={dateFrom} 
              onChange={e => setDateFrom(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl bg-white border border-slate-200 focus:outline-none focus:border-brand-500 transition-colors"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">To Date</label>
            <input 
              type="date" 
              value={dateTo} 
              onChange={e => setDateTo(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl bg-white border border-slate-200 focus:outline-none focus:border-brand-500 transition-colors"
            />
          </div>
          {(activeSubTab === 'bookings' || activeSubTab === 'quick_orders') && (
            <>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Payment Method</label>
                <select 
                  value={paymentFilter} 
                  onChange={e => setPaymentFilter(e.target.value)}
                  className="px-3 py-2 text-xs rounded-xl bg-white border border-slate-200 focus:outline-none focus:border-brand-500 transition-colors"
                >
                  <option value="ALL">All Methods</option>
                  <option value="CARD">Card / Online</option>
                  <option value="UPI">UPI</option>
                  <option value="CASH">Cash</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Order Source</label>
                <select 
                  value={typeFilter} 
                  onChange={e => setTypeFilter(e.target.value)}
                  className="px-3 py-2 text-xs rounded-xl bg-white border border-slate-200 focus:outline-none focus:border-brand-500 transition-colors"
                >
                  <option value="ALL">All Sources</option>
                  <option value="ONLINE">Online App</option>
                  <option value="OFFLINE">Offline Store</option>
                </select>
              </div>
            </>
          )}
          <div className="flex items-end">
            <button 
              onClick={() => { setDateFrom(''); setDateTo(''); setDateFilterType('ORDER_DATE'); setPaymentFilter('ALL'); setTypeFilter('ALL'); setDeliveryStageQuickFilter('ALL'); setStatusFilter('ALL'); }}
              className="px-4 py-2 text-xs font-bold text-red-500 hover:bg-red-50 rounded-xl transition-colors"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* ── Cancelled Order Alerts ── */}
      {cancelledAlerts.length > 0 && (
        <div className="flex flex-col gap-3">
          {cancelledAlerts.map(alert => (
            <div key={alert.id} className="bg-red-50 border border-red-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm animate-fadeIn cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedOrder(alert)}>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-xl">
                  <XCircle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h4 className="font-extrabold text-red-800 text-sm">Order Cancelled: {formatOrderId(alert.invoiceNumber)}</h4>
                  <p className="text-xs font-medium text-red-600/80">Customer: {alert.customerName} • Amount: ₹{Number(alert.payableAmount || 0).toLocaleString('en-IN')}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end" onClick={e => e.stopPropagation()}>
                {alert.paymentStatus === 'REFUNDED' ? (
                  <span className="px-3.5 py-1.5 bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-black rounded-xl flex items-center gap-1 shadow-sm">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Refunded
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => handleProcessRefund(alert, e)}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-black rounded-xl shadow-md shadow-red-500/20 transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
                  >
                    💳 Process Refund
                  </button>
                )}
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    dismissAlert(alert.id);
                  }} 
                  className="p-1.5 hover:bg-red-100 rounded-lg text-red-400 hover:text-red-600 transition-colors ml-1"
                  title="Dismiss"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          /* Hide all page content */
          body * {
            visibility: hidden !important;
          }
          
          /* Show only the invoice card and its descendants */
          .printable-invoice-card,
          .printable-invoice-card * {
            visibility: visible !important;
          }

          /* Show only the schedule printout if active */
          .print-schedule-printout,
          .print-schedule-printout * {
            visibility: visible !important;
          }
          .print-schedule-printout {
            display: block !important;
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            background: #fff !important;
            color: #000 !important;
          }
          
          /* Reset root layout styles during print to allow natural page height and flow */
          html, body, #root, .fixed, .fixed > div {
            background: none !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            position: relative !important;
          }

          /* Force modal wrapper to align to top left of page */
          .fixed {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            display: block !important;
          }

          .fixed > div {
            display: block !important;
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
          }
          
          /* Style and position the printable invoice card on the page */
          .printable-invoice-card {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            padding: 30px !important;
            margin: 0 !important;
            background: #fff !important;
            border: none !important;
            box-shadow: none !important;
          }
          
          /* Completely remove elements marked with no-print */
          .no-print,
          .no-print * {
            display: none !important;
          }
          
          /* Show elements marked with print-only */
          .print-only {
            display: block !important;
            visibility: visible !important;
          }
          
          /* Text colors and legibility for printing */
          .printable-invoice-card text,
          .printable-invoice-card span,
          .printable-invoice-card p,
          .printable-invoice-card div,
          .printable-invoice-card td,
          .printable-invoice-card th {
            color: #000 !important;
          }
          
          /* Table print styling */
          .printable-invoice-card table {
            border-collapse: collapse !important;
            width: 100% !important;
            margin-top: 15px !important;
            margin-bottom: 15px !important;
          }
          
          .printable-invoice-card th,
          .printable-invoice-card td {
            border: 1px solid #e2e8f0 !important;
            padding: 8px 12px !important;
          }
          
          .printable-invoice-card th {
            background-color: #f8fafc !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
        
        .print-only {
          display: none;
        }
        
        @keyframes slideIn {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        .animate-slide-in {
          animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}} />
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 tracking-tight">Bookings &amp; Fittings Console</h2>
          <p className="text-xs text-slate-500 font-medium">Track customer bookings, manage delivery stages, tailors schedules, and home visits</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setIsUniversalPrintOpen(true)}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
          >
            <Printer className="w-4 h-4" />
            <span>Universal Print</span>
          </button>
          <button
            onClick={loadOrders}
            className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl text-xs font-bold transition-all shadow-sm bg-white"
          >
            Refresh Data
          </button>
        </div>
      </div>

      {/* Sub-tab selector removed as these are now subpages in the sidebar */}

      {/* ── Tab Contents ── */}
      {activeSubTab === 'bookings' && (
        <>
          {/* ── Filter bar ── */}
          <div className="flex flex-col mb-4">
            {/* Quick Same-Day / Delivery Stage Filter Chips */}
            <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1 scrollbar-none">
              <button
                type="button"
                onClick={() => {
                  setDeliveryStageQuickFilter('ALL');
                  setStatusFilter('ALL');
                }}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                  deliveryStageQuickFilter === 'ALL' && statusFilter === 'ALL'
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span>All Orders</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 font-extrabold">{orders.filter(o => !o.isQuickOrder).length}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setDeliveryStageQuickFilter('ORDERS_RECEIVED');
                  setStatusFilter('ALL');
                }}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                  deliveryStageQuickFilter === 'ORDERS_RECEIVED'
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-brand-50 hover:text-brand-700 hover:border-brand-200'
                }`}
              >
                <span>📥 Orders Received</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-extrabold ${deliveryStageQuickFilter === 'ORDERS_RECEIVED' ? 'bg-white/25 text-white' : 'bg-brand-50 text-brand-700'}`}>
                  {sameDayCounts.ordersReceived}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setDeliveryStageQuickFilter('TO_BE_DELIVERED');
                  setStatusFilter('ALL');
                }}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                  deliveryStageQuickFilter === 'TO_BE_DELIVERED'
                    ? 'bg-amber-500 text-white shadow-sm'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200'
                }`}
              >
                <span>🚚 To Be Delivered</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-extrabold ${deliveryStageQuickFilter === 'TO_BE_DELIVERED' ? 'bg-white/25 text-white' : 'bg-amber-50 text-amber-800'}`}>
                  {sameDayCounts.toBeDelivered}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setDeliveryStageQuickFilter('DELIVERED');
                  setStatusFilter('ALL');
                }}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                  deliveryStageQuickFilter === 'DELIVERED'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200'
                }`}
              >
                <span>✅ Delivered</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-extrabold ${deliveryStageQuickFilter === 'DELIVERED' ? 'bg-white/25 text-white' : 'bg-emerald-50 text-emerald-700'}`}>
                  {sameDayCounts.delivered}
                </span>
              </button>

              {dateFrom && (
                <div className="ml-auto flex items-center gap-1.5 text-xs text-slate-600 bg-slate-100 px-3 py-1 rounded-xl shrink-0 font-medium">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>Date: <strong className="text-slate-800">{new Date(dateFrom + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</strong></span>
                  <button
                    onClick={() => { setDateFrom(''); setDateTo(''); setDeliveryStageQuickFilter('ALL'); }}
                    className="ml-1 text-slate-400 hover:text-red-500 font-bold"
                    title="Clear date filter"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-4 justify-between sm:items-center w-full">
              <div className="relative flex-1 max-w-md w-full">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search invoice number, client name..."
                  className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-white border border-slate-200 focus:outline-none focus:border-brand-500 transition-colors"
                />
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              </div>

              <div className="flex gap-2 w-full sm:w-auto">
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="flex-1 sm:flex-none text-xs font-bold border border-slate-200 rounded-xl py-2 px-3 bg-white text-slate-650 focus:outline-none focus:border-brand-500 transition-colors"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="PENDING">Order Placed</option>
                  <option value="PAID">Measurement Session</option>
                  <option value="PROCESSING">Order Stitching</option>
                  <option value="SHIPPED">Product Completed</option>
                  <option value="OUT_FOR_DELIVERY">Product Out for Delivery</option>
                  <option value="DELIVERED">Delivered</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
                <button 
                  onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                  className={`flex items-center justify-center gap-2 px-4 py-2 border rounded-xl text-xs font-bold transition-colors ${showAdvancedFilters || dateFrom || dateTo || paymentFilter !== 'ALL' || typeFilter !== 'ALL' ? 'border-brand-500 text-brand-600 bg-brand-50' : 'border-slate-200 text-slate-600 bg-white hover:bg-slate-50'}`}
                >
                  <Filter className="w-4 h-4" />
                  <span className="hidden sm:inline">Advanced</span>
                </button>
              </div>
            </div>
            {renderAdvancedFilters()}
          </div>

          {/* ── Desktop Table ── */}
          <div className="bg-white border border-slate-200/60 rounded-3xl overflow-hidden shadow-premium hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-6">Order ID</th>
                    <th className="py-3 px-6">Customer Name</th>
                    <th className="py-3 px-6">Timelines</th>
                    <th className="py-3 px-6">Sale Type</th>
                    <th className="py-3 px-6">Payment</th>
                    <th className="py-3 px-6">Payable</th>
                    <th className="py-3 px-6">Delivery Stage</th>
                    <th className="py-3 px-6 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {paginatedOrders.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="py-12 text-center text-slate-400 font-bold">No orders found.</td>
                    </tr>
                  ) : (
                    paginatedOrders.map((order) => (
                      <tr key={order.id} className={`transition-colors ${order.status === 'CANCELLED' ? 'bg-red-50/70 hover:bg-red-50/90 border-l-2 border-l-red-500' : 'hover:bg-slate-50/20'}`}>
                        <td className={`py-4 px-6 font-extrabold ${order.status === 'CANCELLED' ? 'text-slate-400 line-through decoration-red-300' : 'text-slate-800'}`}>
                          {formatOrderId(order.invoiceNumber)}
                          {order.status === 'CANCELLED' && order.paymentStatus !== 'REFUNDED' && (
                            <span className="ml-2 flex items-center gap-1.5 inline-flex">
                              <button
                                type="button"
                                onClick={(e) => handleProcessRefund(order, e)}
                                className="px-2 py-0.5 rounded text-[9px] bg-red-600 hover:bg-red-700 text-white font-extrabold shadow-sm transition-all active:scale-95 cursor-pointer uppercase tracking-tight"
                              >
                                Refund ₹{Number(order.payableAmount || 0).toLocaleString('en-IN')}
                              </button>
                            </span>
                          )}
                        </td>
                        <td className={`py-4 px-6 font-medium ${order.status === 'CANCELLED' ? 'text-slate-400' : 'text-slate-600'}`}>{order.customerName}</td>
                        <td className={`py-4 px-6 text-xs space-y-1 ${order.status === 'CANCELLED' ? 'opacity-50' : ''}`}>
                          {(() => {
                            const tl = getTimelines(order);
                            return (
                              <>
                                <div className="text-[10px] text-slate-500">Ordered: <span className="font-bold text-slate-800">{tl.orderDateStr}</span></div>
                                <div className="text-[10px] text-slate-500">Delivery: <span className="font-bold text-slate-800">{tl.deliveryDateStr}</span></div>
                                {tl.daysRemainingText && order.status !== 'CANCELLED' && (
                                  <div className={`inline-block mt-1 text-[10px] ${tl.daysColor}`}>{tl.daysRemainingText}</div>
                                )}
                              </>
                            );
                          })()}
                        </td>
                        <td className="py-4 px-6">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${order.status === 'CANCELLED' ? 'bg-slate-100 text-slate-400' : order.isOfflineSales ? 'bg-amber-50 text-amber-800' : 'bg-blue-50 text-blue-800'}`}>
                            {order.isOfflineSales ? 'Offline' : 'Online App'}
                          </span>
                        </td>
                        <td className={`py-4 px-6 font-semibold ${order.status === 'CANCELLED' ? 'text-slate-400' : 'text-slate-500'}`}>{order.paymentMethod}</td>
                        <td className={`py-4 px-6 ${order.status === 'CANCELLED' ? 'opacity-60' : ''}`}>
                          <span className={`font-extrabold block ${order.status === 'CANCELLED' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                            ₹{Number(order.payableAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                          {Number(order.advancePayment) >= 0 && (
                            <div className="text-[10px] mt-1 space-y-0.5">
                              <div className={`${order.status === 'CANCELLED' ? 'text-slate-400 line-through' : 'text-emerald-600'} font-bold`}>Advance: ₹{Number(order.advancePayment).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                              <div className={`${order.status === 'CANCELLED' ? 'text-slate-400 line-through' : 'text-brand-600'} font-bold`}>Balance: ₹{Number(order.balanceAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                            </div>
                          )}
                        </td>
                        <td className="py-4 px-6">
                          <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold border ${getCombinedStatusStyle(order)}`}>
                            {getCombinedStatusLabel(order)}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => setSelectedOrder(order)}
                              className="p-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-500 transition-colors"
                              title="View order &amp; manage delivery stage"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {order.status === 'CANCELLED' && order.paymentStatus !== 'REFUNDED' && (
                              <button
                                type="button"
                                onClick={(e) => handleProcessRefund(order, e)}
                                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-black rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-1 cursor-pointer"
                                title="Process refund and save to database"
                              >
                                💳 Refund ₹{Number(order.payableAmount || 0).toLocaleString('en-IN')}
                              </button>
                            )}
                            {(() => {
                              const currentIdx = HAPPY_PATH.indexOf(order.status);
                              if (currentIdx !== -1 && currentIdx < HAPPY_PATH.length - 1) {
                                const nextStatus = HAPPY_PATH[currentIdx + 1];
                                return (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      stageStatusChange(order, nextStatus);
                                    }}
                                    className="px-2.5 py-1.5 border border-brand-200 bg-brand-50/70 hover:bg-brand-600 hover:text-white hover:border-brand-600 rounded-xl text-[10px] font-extrabold text-brand-700 transition-all shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95 shrink-0"
                                    title={`Click to advance order stage to ${getStatusLabel(nextStatus)} (opens confirmation)`}
                                  >
                                    <span>→</span>
                                    <span>{getStatusLabel(nextStatus)}</span>
                                  </button>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Mobile Cards ── */}
          <div className="md:hidden space-y-3">
            {paginatedOrders.length === 0 ? (
              <div className="py-12 text-center text-slate-400 font-bold bg-white border border-slate-200/60 rounded-3xl shadow-premium">
                No orders found.
              </div>
            ) : (
              paginatedOrders.map((order) => (
                <div key={order.id} className={`bg-white border rounded-3xl p-4 space-y-3 shadow-sm hover:shadow transition-all relative overflow-hidden ${order.status === 'CANCELLED' ? 'border-red-200 bg-red-50/30' : 'border-slate-200/60'}`}>
                  {order.status === 'CANCELLED' && (
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-12 pointer-events-none opacity-[0.04]">
                      <span className="text-5xl font-black text-red-900 tracking-widest uppercase">CANCELLED</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center relative z-10">
                    <div className="flex items-center gap-2">
                      <span className={`font-extrabold text-sm ${order.status === 'CANCELLED' ? 'text-slate-400 line-through decoration-red-300' : 'text-slate-800'}`}>{formatOrderId(order.invoiceNumber)}</span>
                      {order.status === 'CANCELLED' && order.paymentStatus !== 'REFUNDED' && (
                        <div className="flex gap-1.5 items-center">
                          <button
                            type="button"
                            onClick={(e) => handleProcessRefund(order, e)}
                            className="px-2 py-0.5 rounded text-[9px] bg-red-600 hover:bg-red-700 text-white font-extrabold shadow-sm transition-all active:scale-95 cursor-pointer uppercase tracking-tight"
                          >
                            Refund ₹{Number(order.payableAmount || 0).toLocaleString('en-IN')}
                          </button>
                        </div>
                      )}
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${order.status === 'CANCELLED' ? 'bg-slate-100 text-slate-400' : order.isOfflineSales ? 'bg-amber-50 text-amber-800' : 'bg-blue-50 text-blue-800'}`}>
                      {order.isOfflineSales ? 'Offline' : 'Online'}
                    </span>
                  </div>
                  <div className="text-xs space-y-1 text-slate-600 relative z-10">
                    <p className={`font-bold ${order.status === 'CANCELLED' ? 'text-slate-500' : 'text-slate-800'}`}>{order.customerName}</p>
                    <p className={`font-medium ${order.status === 'CANCELLED' ? 'text-slate-400' : 'text-slate-400'}`}>{order.paymentMethod}</p>
                  </div>

                  {(() => {
                    const tl = getTimelines(order);
                    return (
                      <div className={`bg-slate-50 rounded-xl p-2.5 flex justify-between items-center text-[10px] relative z-10 ${order.status === 'CANCELLED' ? 'opacity-60' : ''}`}>
                        <div>
                          <p className="text-slate-500">Order: <span className="font-bold text-slate-800">{tl.orderDateStr}</span></p>
                          <p className="text-slate-500">Delivery: <span className="font-bold text-slate-800">{tl.deliveryDateStr}</span></p>
                        </div>
                        {tl.daysRemainingText && order.status !== 'CANCELLED' && (
                          <div className={tl.daysColor}>{tl.daysRemainingText}</div>
                        )}
                      </div>
                    );
                  })()}

                  <div className="flex justify-between items-center border-t border-slate-50 pt-3 relative z-10">
                    <div className="space-y-1">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-bold border ${getCombinedStatusStyle(order)}`}>
                        {getCombinedStatusLabel(order)}
                      </span>
                      <div className="flex flex-col gap-0.5">
                        <p className={`font-extrabold text-sm ${order.status === 'CANCELLED' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                          ₹{Number(order.payableAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </p>
                        {Number(order.advancePayment) >= 0 && (
                          <div className="text-[10px] flex items-center gap-1.5 mt-0.5">
                            <span className={`${order.status === 'CANCELLED' ? 'text-slate-400 line-through' : 'text-emerald-600'} font-bold`}>Advance: ₹{Number(order.advancePayment).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            <span className="text-slate-300">|</span>
                            <span className={`${order.status === 'CANCELLED' ? 'text-slate-400 line-through' : 'text-brand-600'} font-bold`}>Balance: ₹{Number(order.balanceAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setSelectedOrder(order)}
                        className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-500 transition-colors"
                        title="View order"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {(() => {
                        const currentIdx = HAPPY_PATH.indexOf(order.status);
                        if (currentIdx !== -1 && currentIdx < HAPPY_PATH.length - 1) {
                          const nextStatus = HAPPY_PATH[currentIdx + 1];
                          return (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                stageStatusChange(order, nextStatus);
                              }}
                              className="px-2.5 py-1.5 border border-brand-200 bg-brand-50/70 hover:bg-brand-600 hover:text-white hover:border-brand-600 rounded-xl text-[10px] font-extrabold text-brand-700 transition-all shadow-xs flex items-center gap-1 cursor-pointer active:scale-95 shrink-0"
                              title={`Click to advance order stage to ${getStatusLabel(nextStatus)} (opens confirmation)`}
                            >
                              <span>→</span>
                              <span>{getStatusLabel(nextStatus)}</span>
                            </button>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* ── Pagination Controls ── */}
          {totalPages > 1 && (
            <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-200 mt-4 shadow-sm">
              <span className="text-xs font-bold text-slate-500 hidden sm:block">
                Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredOrders.length)} of {filteredOrders.length} orders
              </span>
              <div className="flex gap-2 w-full sm:w-auto justify-between sm:justify-start">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 text-xs font-bold border border-slate-200 rounded-lg disabled:opacity-50 hover:bg-slate-50 transition-colors"
                >
                  Previous
                </button>
                <div className="flex items-center gap-1 overflow-x-auto hidden sm:flex">
                  {Array.from({ length: totalPages }).map((_, i) => {
                    if (totalPages > 5 && Math.abs(currentPage - (i + 1)) > 2 && i !== 0 && i !== totalPages - 1) {
                      if (i === 1 || i === totalPages - 2) return <span key={i} className="text-slate-400 px-1">...</span>;
                      return null;
                    }
                    return (
                      <button
                        key={i}
                        onClick={() => setCurrentPage(i + 1)}
                        className={`w-7 h-7 flex items-center justify-center rounded-lg text-xs font-bold transition-colors ${currentPage === i + 1 ? 'bg-brand-500 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                      >
                        {i + 1}
                      </button>
                    )
                  })}
                </div>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 text-xs font-bold border border-slate-200 rounded-lg disabled:opacity-50 hover:bg-slate-50 transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {activeSubTab === 'fittings' && (
        <>
          {/* ── Fittings Filter Bar ── */}
          <div className="flex flex-col mb-4">
            <div className="flex flex-col sm:flex-row gap-4 justify-between sm:items-center w-full">
              <div className="relative flex-1 max-w-md w-full">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search customer name, product type..."
                  className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-white border border-slate-200 focus:outline-none focus:border-brand-500 transition-colors"
                />
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              </div>

              <div className="flex gap-2 w-full sm:w-auto">
                <select
                  value={apptStatusFilter}
                  onChange={e => setApptStatusFilter(e.target.value)}
                  className="flex-1 sm:flex-none text-xs font-bold border border-slate-200 rounded-xl py-2 px-3 bg-white text-slate-650 focus:outline-none focus:border-brand-500 transition-colors"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="PENDING">Pending</option>
                  <option value="CONFIRMED">Confirmed</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
                <button 
                  onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                  className={`flex items-center justify-center gap-2 px-4 py-2 border rounded-xl text-xs font-bold transition-colors ${showAdvancedFilters || dateFrom || dateTo ? 'border-brand-500 text-brand-600 bg-brand-50' : 'border-slate-200 text-slate-600 bg-white hover:bg-slate-50'}`}
                >
                  <Filter className="w-4 h-4" />
                  <span className="hidden sm:inline">Advanced</span>
                </button>
              </div>
            </div>
            {renderAdvancedFilters()}
          </div>

          {/* ── Studio Fittings Split Layout ── */}
          {(() => {
            const renderAppt = (app) => (
              <div 
                key={app.id} 
                className="p-5 rounded-3xl border border-slate-200/60 bg-white hover:bg-slate-50/20 hover:border-slate-300 transition-all shadow-sm hover:shadow-premium flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <span className="text-base font-extrabold text-slate-800 block leading-tight">{app.userName}</span>
                      <p className="text-xs text-slate-400 mt-1 font-semibold">Product Type: <span className="text-slate-600">{app.productType}</span></p>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border shrink-0 ${getApptStatusStyle(app.status)}`}>
                      {app.status}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 font-semibold pt-1">
                    <span className="flex items-center gap-1.5 bg-slate-100/80 px-2.5 py-1 rounded-lg">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {formatBookingDateUTC(app.date, { weekday: 'short' })} at {app.timeSlot}
                    </span>
                    <span className="bg-brand-50 text-brand-700 py-1 px-2.5 rounded-lg uppercase text-[10px] tracking-wide border border-brand-100">
                      {app.type?.replace(/_/g, ' ') || 'Studio Fitting'}
                    </span>
                  </div>

                  {app.notes && (
                    <div className="text-xs text-slate-600 bg-slate-50/50 border border-slate-100 rounded-xl p-3 leading-relaxed">
                      <strong className="text-slate-700 block mb-1">Tailor Notes:</strong>
                      {app.notes}
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-center gap-2 pt-2 border-t border-slate-100/60">
                  <button
                    onClick={() => handleOpenAdminReschedule({ ...app, type: 'STUDIO' })}
                    className="py-2 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-brand-600 text-xs font-bold transition-all shadow-sm"
                  >
                    Reschedule
                  </button>
                  {app.status === 'PENDING' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleUpdateAppStatus(app.id, 'CONFIRMED')}
                        className="py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-all"
                      >
                        Confirm Slot
                      </button>
                      <button
                        onClick={() => handleUpdateAppStatus(app.id, 'CANCELLED')}
                        className="py-2 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-400 text-xs font-bold transition-all"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );

            // Sort appointments: newest / most recently booked on top
            const sortedApps = [...filteredAppointments].reverse();

            const today = new Date();
            const todayApps = sortedApps.filter(app => {
              const d = new Date(app.date);
              return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
            });
            const otherApps = sortedApps.filter(app => {
              const d = new Date(app.date);
              return !(d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear());
            });

            return (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <h3 className="font-extrabold text-slate-800 text-lg flex items-center gap-2">
                    New Appointments
                    <span className="bg-slate-100 text-slate-700 py-0.5 px-2 rounded-full text-xs">{otherApps.length}</span>
                  </h3>
                  <div className="flex flex-col gap-4">
                    {otherApps.length === 0 ? (
                      <div className="text-center text-slate-400 py-12 font-semibold bg-white border border-slate-200/60 rounded-3xl shadow-premium">
                        No new appointments found.
                      </div>
                    ) : (
                      otherApps.map(renderAppt)
                    )}
                  </div>
                </div>
                
                <div className="space-y-4">
                  <h3 className="font-extrabold text-slate-800 text-lg flex items-center gap-2">
                    Today's Appointments
                    <span className="bg-brand-100 text-brand-700 py-0.5 px-2 rounded-full text-xs">{todayApps.length}</span>
                  </h3>
                  <div className="flex flex-col gap-4">
                    {todayApps.length === 0 ? (
                      <div className="text-center text-slate-400 py-12 font-semibold bg-white border border-slate-200/60 rounded-3xl shadow-premium">
                        No fittings scheduled for today.
                      </div>
                    ) : (
                      todayApps.map(renderAppt)
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </>
      )}

      {activeSubTab === 'visits' && (
        <>
          {/* ── Visits Filter Bar ── */}
          <div className="flex flex-col mb-4">
            <div className="flex flex-col sm:flex-row gap-4 justify-between sm:items-center w-full">
              <div className="relative flex-1 max-w-md w-full">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search customer name, address..."
                  className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-white border border-slate-200 focus:outline-none focus:border-brand-500 transition-colors"
                />
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              </div>

              <div className="flex gap-2 w-full sm:w-auto">
                <select
                  value={visitStatusFilter}
                  onChange={e => setVisitStatusFilter(e.target.value)}
                  className="flex-1 sm:flex-none text-xs font-bold border border-slate-200 rounded-xl py-2 px-3 bg-white text-slate-650 focus:outline-none focus:border-brand-500 transition-colors"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="PENDING">Pending</option>
                  <option value="ASSIGNED">Assigned</option>
                  <option value="COMPLETED">Completed</option>
                </select>
                <button 
                  onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                  className={`flex items-center justify-center gap-2 px-4 py-2 border rounded-xl text-xs font-bold transition-colors ${showAdvancedFilters || dateFrom || dateTo ? 'border-brand-500 text-brand-600 bg-brand-50' : 'border-slate-200 text-slate-600 bg-white hover:bg-slate-50'}`}
                >
                  <Filter className="w-4 h-4" />
                  <span className="hidden sm:inline">Advanced</span>
                </button>
              </div>
            </div>
            {renderAdvancedFilters()}
          </div>

          {/* ── Home Visits List Grid ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredVisits.length === 0 ? (
              <div className="md:col-span-2 text-center text-slate-400 py-16 font-semibold bg-white border border-slate-200/60 rounded-3xl shadow-premium">
                No home visit requests found.
              </div>
            ) : (
              filteredVisits.map((visit) => (
                <div 
                  key={visit.id} 
                  className="p-5 rounded-3xl border border-slate-200/60 bg-white hover:bg-slate-50/20 hover:border-slate-300 transition-all shadow-sm hover:shadow-premium flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <span className="text-base font-extrabold text-slate-800 block leading-tight">{visit.customerName}</span>
                        <div className="text-xs text-slate-505 mt-1.5 flex items-start gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                          <span className="leading-tight">{visit.address}</span>
                        </div>
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border shrink-0 ${getApptStatusStyle(visit.status)}`}>
                        {visit.status}
                      </span>
                    </div>

                    <div className="text-xs text-slate-605 bg-slate-50/50 border border-slate-100 rounded-xl p-3 leading-relaxed">
                      <strong className="text-slate-700 block mb-1">Tailoring Requirements:</strong>
                      {visit.requirements}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 font-bold pt-1 border-t border-slate-100/60">
                      <span className="bg-slate-100 px-2.5 py-1 rounded-lg text-slate-600 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        Preferred: {formatBookingDateUTC(visit.preferredDate)}
                      </span>
                      <span className="text-slate-500">
                        Assigned Tailor: <span className="text-brand-600 font-extrabold">{visit.assignedStaffName || 'Unassigned'}</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center gap-2 pt-2 border-t border-slate-100/60">
                    <button
                      onClick={() => handleOpenAdminReschedule({ ...visit, type: 'VISIT' })}
                      className="py-2 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-brand-600 text-xs font-bold transition-all shadow-sm"
                    >
                      Reschedule
                    </button>
                    
                    <div className="flex gap-2">
                      {visit.status === 'PENDING' && (
                        <button
                          onClick={() => {
                            setActiveVisitId(visit.id);
                            setReportVisitId(null);
                          }}
                          className="py-2 px-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold shadow-sm transition-all"
                        >
                          Assign Tailor
                        </button>
                      )}

                      {visit.status === 'ASSIGNED' && (
                        <button
                          onClick={() => {
                            setReportVisitId(visit.id);
                            setActiveVisitId(null);
                          }}
                          className="py-2 px-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold shadow-sm transition-all"
                        >
                          File Report
                        </button>
                      )}
                    </div>
                  </div>

                  {visit.status === 'COMPLETED' && visit.completionNotes && (
                    <div className="p-3 bg-emerald-50/20 border border-emerald-100 rounded-2xl text-xs text-slate-600 space-y-1.5 mt-2">
                      <p className="font-extrabold text-slate-700 flex items-center gap-1.5">
                        <CheckCircle className="w-4 h-4 text-emerald-600" />
                        <span>Completion Report Summary:</span>
                      </p>
                      <p className="italic leading-relaxed font-medium">"{visit.completionNotes}"</p>
                      {visit.mediaUrls && visit.mediaUrls.length > 0 && (
                        <div className="pt-2 flex gap-1.5">
                          {visit.mediaUrls.map((url, idx) => (
                            <img key={idx} src={url} alt="fitting media" className="w-12 h-12 rounded-lg object-cover border border-slate-200" />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}

      {activeSubTab === 'quick_orders' && (
        <>
          <div className="flex flex-col mb-4">
            <div className="flex flex-col sm:flex-row gap-4 justify-between sm:items-center w-full">
              <div className="relative flex-1 max-w-md w-full">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search invoice number, client name..."
                  className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-white border border-slate-200 focus:outline-none focus:border-brand-500 transition-colors"
                />
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <button 
                  onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                  className={`flex items-center justify-center gap-2 px-4 py-2 border rounded-xl text-xs font-bold transition-colors ${showAdvancedFilters || dateFrom || dateTo || paymentFilter !== 'ALL' || typeFilter !== 'ALL' ? 'border-brand-500 text-brand-600 bg-brand-50' : 'border-slate-200 text-slate-600 bg-white hover:bg-slate-50'}`}
                >
                  <Filter className="w-4 h-4" />
                  <span className="hidden sm:inline">Advanced</span>
                </button>
              </div>
            </div>
            {renderAdvancedFilters()}
          </div>
          <div className="bg-white border border-slate-200/60 rounded-3xl overflow-hidden shadow-premium">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-6">Order ID</th>
                    <th className="py-3 px-6">Customer Name</th>
                    <th className="py-3 px-6">Expected Date</th>
                    <th className="py-3 px-6">Reason</th>
                    <th className="py-3 px-6">Status</th>
                    <th className="py-3 px-6 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredQuickOrders.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="py-12 text-center text-slate-400 font-bold">No quick orders found.</td>
                    </tr>
                  ) : (
                    filteredQuickOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-slate-50/20 transition-colors">
                        <td className="py-4 px-6 font-extrabold text-slate-800">{formatOrderId(order.invoiceNumber)}</td>
                        <td className="py-4 px-6 text-slate-600 font-medium">{order.customerName}</td>
                        <td className="py-4 px-6 text-slate-600 font-medium whitespace-nowrap">
                          {order.quickOrderExpectedDate ? new Date(order.quickOrderExpectedDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}
                        </td>
                        <td className="py-4 px-6">
                          <div className="text-slate-600 font-medium max-w-xs truncate" title={order.quickOrderReason}>
                            {order.quickOrderReason}
                          </div>
                          {order.quickOrderStatus === 'USER_REJECTED_PROPOSAL' && order.userRejectionNote && (
                            <div className="mt-1.5 p-1.5 bg-red-50 border border-red-100 rounded text-[10px] text-red-700 font-medium leading-snug" title={order.userRejectionNote}>
                              <span className="font-extrabold text-red-800 uppercase tracking-wide text-[9px] block mb-0.5">Rejected Reason:</span>
                              {order.userRejectionNote}
                            </div>
                          )}
                        </td>
                        <td className="py-4 px-6">
                          <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold border ${
                            order.quickOrderStatus === 'APPROVED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
                            order.quickOrderStatus === 'REJECTED' ? 'bg-red-50 text-red-700 border-red-200' : 
                            order.quickOrderStatus === 'DATE_CHANGE_PROPOSED' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                            order.quickOrderStatus === 'USER_REJECTED_PROPOSAL' ? 'bg-red-50 text-red-700 border-red-200' :
                            order.quickOrderStatus === 'ADMIN_FINAL_APPROVAL_PENDING' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                            'bg-amber-50 text-amber-700 border-amber-200'
                          }`}>
                            {order.quickOrderStatus === 'DATE_CHANGE_PROPOSED' ? 'DATE PROPOSED' : 
                             order.quickOrderStatus === 'USER_REJECTED_PROPOSAL' ? 'USER REJECTED' :
                             order.quickOrderStatus === 'ADMIN_FINAL_APPROVAL_PENDING' ? 'FINAL APPROVAL PENDING' :
                             (order.quickOrderStatus || 'PENDING')}
                          </span>
                          {order.quickOrderStatus === 'DATE_CHANGE_PROPOSED' && order.quickOrderProposedDate && (
                            <div className="text-[10px] text-blue-600 font-extrabold mt-1">
                              Proposed: {new Date(order.quickOrderProposedDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                            </div>
                          )}
                          {order.quickOrderStatus === 'DATE_CHANGE_PROPOSED' && order.adminProposalNote && (
                            <div className="mt-1 p-1.5 bg-blue-50 border border-blue-100 rounded text-[10px] text-blue-700 font-medium leading-snug" title={order.adminProposalNote}>
                              <span className="font-extrabold text-blue-800 uppercase tracking-wide text-[9px] block mb-0.5">Admin Note:</span>
                              {order.adminProposalNote}
                            </div>
                          )}
                          {order.quickOrderStatus === 'ADMIN_FINAL_APPROVAL_PENDING' && order.quickOrderExpectedDate && (
                            <div className="text-[10px] text-purple-600 font-extrabold mt-1">
                              Accepted Date: {new Date(order.quickOrderExpectedDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                            </div>
                          )}
                        </td>
                        <td className="py-4 px-6 text-center">
                          <div className="flex gap-2 justify-center">
                            {order.isQuickOrder && (!order.quickOrderStatus || ['PENDING', 'DATE_CHANGE_PROPOSED', 'USER_REJECTED_PROPOSAL', 'ADMIN_FINAL_APPROVAL_PENDING'].includes(order.quickOrderStatus)) && (
                              <>
                                <button
                                  onClick={() => handleUpdateQuickStatus(order.id, 'APPROVED')}
                                  className="p-1.5 border border-emerald-200 bg-emerald-50 rounded-lg hover:bg-emerald-100 text-emerald-600 transition-colors"
                                  title="Approve Quick Order"
                                >
                                  <CheckCircle className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleUpdateQuickStatus(order.id, 'REJECTED')}
                                  className="p-1.5 border border-red-200 bg-red-50 rounded-lg hover:bg-red-100 text-red-600 transition-colors"
                                  title="Reject Quick Order"
                                >
                                  <XCircle className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => {
                                    setProposeDateOrderId(order.id);
                                    setProposedDateVal(order.quickOrderProposedDate ? order.quickOrderProposedDate.substring(0, 10) : '');
                                  }}
                                  className="p-1.5 border border-blue-200 bg-blue-50 rounded-lg hover:bg-blue-100 text-blue-600 transition-colors"
                                  title="Propose Date Change"
                                >
                                  <Calendar className="w-4 h-4" />
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => setSelectedOrder(order)}
                              className="p-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-500 transition-colors"
                              title="View order"
                            >
                              <Eye className="w-4 h-4" />
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
        </>
      )}

      {activeSubTab === 'print_schedule' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200/60 rounded-3xl p-6 md:p-8 shadow-premium space-y-6">
            
            {/* Header Control Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-5">
              <div>
                <h3 className="font-extrabold text-slate-800 text-base flex items-center gap-2">
                  <Printer className="w-5 h-5 text-brand-500" />
                  <span>Production Worksheet Print Center</span>
                </h3>
                <p className="text-xs text-slate-400 font-medium mt-1">
                  Combine today's schedule fittings and home visits with sizing measurements to print worksheets for tailoring artisans.
                </p>
              </div>
              <button
                onClick={() => handlePrintWorksheets(getCombinedPrintItems())}
                disabled={getCombinedPrintItems().length === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 shrink-0"
              >
                <Printer className="w-4 h-4" />
                <span>Print Worksheets ({getCombinedPrintItems().length})</span>
              </button>
            </div>

            {/* Layout grid for configurations vs preview */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Configuration panel */}
              <div className="lg:col-span-1 space-y-6 border-b lg:border-b-0 lg:border-r border-slate-150/60 pb-6 lg:pb-0 lg:pr-6">
                
                {/* 1. Date Scope */}
                <div className="space-y-3">
                  <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">1. Select Target Date</h4>
                  
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wide">Date Filter Range</label>
                    <select
                      value={printDateRange}
                      onChange={e => setPrintDateRange(e.target.value)}
                      className="w-full text-xs border border-slate-200 rounded-xl py-2.5 px-3 bg-white font-semibold focus:outline-none focus:border-brand-500"
                    >
                      <option value="ALL">All Time</option>
                      <option value="DAY">Specific Day</option>
                      <option value="WEEK">This Week</option>
                      <option value="MONTH">This Month</option>
                    </select>

                    {printDateRange === 'DAY' && (
                      <input
                        type="date"
                        value={printDate}
                        onChange={e => setPrintDate(e.target.value)}
                        className="w-full text-xs border border-slate-200 rounded-xl py-2.5 px-3 mt-1 bg-white font-semibold focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                      />
                    )}
                  </div>

                  <div className="space-y-2 pt-1">
                    <span className="text-[10px] font-bold text-slate-450 uppercase tracking-wide block mb-1">Include Booking Type</span>
                    <label className="flex items-center gap-2.5 text-xs text-slate-600 font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={printIncludeFittings}
                        onChange={e => setPrintIncludeFittings(e.target.checked)}
                        className="rounded border-slate-350 text-brand-500 focus:ring-brand-550 w-4 h-4"
                      />
                      <span>Studio Fitting Appointments</span>
                    </label>
                    <label className="flex items-center gap-2.5 text-xs text-slate-600 font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={printIncludeVisits}
                        onChange={e => setPrintIncludeVisits(e.target.checked)}
                        className="rounded border-slate-350 text-brand-500 focus:ring-brand-550 w-4 h-4"
                      />
                      <span>Home Visit Fittings</span>
                    </label>
                  </div>
                </div>

                {/* 2. Sizing / Column checklist */}
                <div className="space-y-4 pt-4 border-t border-slate-100">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">2. Configure Fields</h4>
                    <div className="flex gap-2 text-[10px] font-extrabold text-brand-500">
                      <button onClick={handleSelectAllPrintFields} className="hover:underline">All</button>
                      <span className="text-slate-300">•</span>
                      <button onClick={handleClearAllPrintFields} className="hover:underline text-slate-400">Clear</button>
                      <span className="text-slate-300">•</span>
                      <button onClick={handleDefaultTailorPrintFields} className="hover:underline">Default</button>
                    </div>
                  </div>

                  {/* Customer Block */}
                  <div className="space-y-2">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Customer Info</span>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex items-center gap-2 text-xs text-slate-600 font-medium cursor-pointer">
                        <input type="checkbox" checked={printFields.custName} onChange={() => togglePrintField('custName')} className="rounded border-slate-300 text-brand-500 w-3.5 h-3.5" />
                        <span>Client Name</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs text-slate-600 font-medium cursor-pointer">
                        <input type="checkbox" checked={printFields.custPhone} onChange={() => togglePrintField('custPhone')} className="rounded border-slate-300 text-brand-500 w-3.5 h-3.5" />
                        <span>Phone No</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs text-slate-600 font-medium cursor-pointer">
                        <input type="checkbox" checked={printFields.custEmail} onChange={() => togglePrintField('custEmail')} className="rounded border-slate-300 text-brand-500 w-3.5 h-3.5" />
                        <span>Email</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs text-slate-600 font-medium cursor-pointer">
                        <input type="checkbox" checked={printFields.custAddress} onChange={() => togglePrintField('custAddress')} className="rounded border-slate-300 text-brand-500 w-3.5 h-3.5" />
                        <span>Address</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs text-slate-600 font-medium cursor-pointer">
                        <input type="checkbox" checked={printFields.custGender} onChange={() => togglePrintField('custGender')} className="rounded border-slate-300 text-brand-500 w-3.5 h-3.5" />
                        <span>Gender</span>
                      </label>
                    </div>
                  </div>

                  {/* Booking Info Block */}
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Booking Details</span>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex items-center gap-2 text-xs text-slate-600 font-medium cursor-pointer">
                        <input type="checkbox" checked={printFields.apptTime} onChange={() => togglePrintField('apptTime')} className="rounded border-slate-300 text-brand-500 w-3.5 h-3.5" />
                        <span>Time Slot</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs text-slate-600 font-medium cursor-pointer">
                        <input type="checkbox" checked={printFields.apptType} onChange={() => togglePrintField('apptType')} className="rounded border-slate-300 text-brand-500 w-3.5 h-3.5" />
                        <span>Session Type</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs text-slate-600 font-medium cursor-pointer">
                        <input type="checkbox" checked={printFields.apptStaff} onChange={() => togglePrintField('apptStaff')} className="rounded border-slate-300 text-brand-500 w-3.5 h-3.5" />
                        <span>Assigned Staff</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs text-slate-600 font-medium cursor-pointer">
                        <input type="checkbox" checked={printFields.apptStatus} onChange={() => togglePrintField('apptStatus')} className="rounded border-slate-300 text-brand-500 w-3.5 h-3.5" />
                        <span>Status</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs text-slate-600 font-medium cursor-pointer col-span-2">
                        <input type="checkbox" checked={printFields.apptNotes} onChange={() => togglePrintField('apptNotes')} className="rounded border-slate-300 text-brand-500 w-3.5 h-3.5" />
                        <span>Requirements/Notes</span>
                      </label>
                    </div>
                  </div>

                  {/* Orders & Products Block */}
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Retail Order Details</span>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex items-center gap-2 text-xs text-slate-600 font-medium cursor-pointer">
                        <input type="checkbox" checked={printFields.orderInvoice} onChange={() => togglePrintField('orderInvoice')} className="rounded border-slate-300 text-brand-500 w-3.5 h-3.5" />
                        <span>Invoice Number</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs text-slate-600 font-medium cursor-pointer">
                        <input type="checkbox" checked={printFields.orderStatus} onChange={() => togglePrintField('orderStatus')} className="rounded border-slate-300 text-brand-500 w-3.5 h-3.5" />
                        <span>Order Status</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs text-slate-600 font-medium cursor-pointer col-span-2">
                        <input type="checkbox" checked={printFields.orderItems} onChange={() => togglePrintField('orderItems')} className="rounded border-slate-300 text-brand-500 w-3.5 h-3.5" />
                        <span>Ordered Items List</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs text-slate-600 font-medium cursor-pointer">
                        <input type="checkbox" checked={printFields.orderFabric} onChange={() => togglePrintField('orderFabric')} className="rounded border-slate-300 text-brand-500 w-3.5 h-3.5" />
                        <span>Fabric Type</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs text-slate-600 font-medium cursor-pointer">
                        <input type="checkbox" checked={printFields.orderCustoms} onChange={() => togglePrintField('orderCustoms')} className="rounded border-slate-300 text-brand-500 w-3.5 h-3.5" />
                        <span>Customizations</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs text-slate-600 font-medium cursor-pointer col-span-2">
                        <input type="checkbox" checked={printFields.orderTailorNotes} onChange={() => togglePrintField('orderTailorNotes')} className="rounded border-slate-300 text-brand-500 w-3.5 h-3.5" />
                        <span>Stitching Tailor Notes</span>
                      </label>
                    </div>
                  </div>

                  {/* Measurements Sizing Block */}
                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Tailor Sizing Parameters</span>
                    <div className="grid grid-cols-3 gap-2">
                      <label className="flex items-center gap-1.5 text-[10px] text-slate-600 font-semibold cursor-pointer">
                        <input type="checkbox" checked={printFields.measLength} onChange={() => togglePrintField('measLength')} className="rounded border-slate-300 text-brand-500 w-3 h-3" />
                        <span>Length</span>
                      </label>
                      <label className="flex items-center gap-1.5 text-[10px] text-slate-600 font-semibold cursor-pointer">
                        <input type="checkbox" checked={printFields.measShoulder} onChange={() => togglePrintField('measShoulder')} className="rounded border-slate-300 text-brand-500 w-3 h-3" />
                        <span>Shoulder</span>
                      </label>
                      <label className="flex items-center gap-1.5 text-[10px] text-slate-600 font-semibold cursor-pointer">
                        <input type="checkbox" checked={printFields.measChest} onChange={() => togglePrintField('measChest')} className="rounded border-slate-300 text-brand-500 w-3 h-3" />
                        <span>Chest</span>
                      </label>
                      <label className="flex items-center gap-1.5 text-[10px] text-slate-600 font-semibold cursor-pointer">
                        <input type="checkbox" checked={printFields.measBust} onChange={() => togglePrintField('measBust')} className="rounded border-slate-300 text-brand-500 w-3 h-3" />
                        <span>Bust</span>
                      </label>
                      <label className="flex items-center gap-1.5 text-[10px] text-slate-600 font-semibold cursor-pointer">
                        <input type="checkbox" checked={printFields.measWaist} onChange={() => togglePrintField('measWaist')} className="rounded border-slate-300 text-brand-500 w-3 h-3" />
                        <span>Waist</span>
                      </label>
                      <label className="flex items-center gap-1.5 text-[10px] text-slate-600 font-semibold cursor-pointer">
                        <input type="checkbox" checked={printFields.measHip} onChange={() => togglePrintField('measHip')} className="rounded border-slate-300 text-brand-500 w-3 h-3" />
                        <span>Hip</span>
                      </label>
                      <label className="flex items-center gap-1.5 text-[10px] text-slate-600 font-semibold cursor-pointer">
                        <input type="checkbox" checked={printFields.measArm} onChange={() => togglePrintField('measArm')} className="rounded border-slate-300 text-brand-500 w-3 h-3" />
                        <span>Arm</span>
                      </label>
                      <label className="flex items-center gap-1.5 text-[10px] text-slate-600 font-semibold cursor-pointer">
                        <input type="checkbox" checked={printFields.measSleeve} onChange={() => togglePrintField('measSleeve')} className="rounded border-slate-300 text-brand-500 w-3 h-3" />
                        <span>Sleeve</span>
                      </label>
                      <label className="flex items-center gap-1.5 text-[10px] text-slate-600 font-semibold cursor-pointer">
                        <input type="checkbox" checked={printFields.measNeck} onChange={() => togglePrintField('measNeck')} className="rounded border-slate-300 text-brand-500 w-3 h-3" />
                        <span>Neck</span>
                      </label>
                      <label className="flex items-center gap-1.5 text-[10px] text-slate-600 font-semibold cursor-pointer">
                        <input type="checkbox" checked={printFields.measSeat} onChange={() => togglePrintField('measSeat')} className="rounded border-slate-300 text-brand-500 w-3 h-3" />
                        <span>Seat</span>
                      </label>
                      <label className="flex items-center gap-1.5 text-[10px] text-slate-600 font-semibold cursor-pointer">
                        <input type="checkbox" checked={printFields.measSkirt} onChange={() => togglePrintField('measSkirt')} className="rounded border-slate-300 text-brand-500 w-3 h-3" />
                        <span>Skirt</span>
                      </label>
                      <label className="flex items-center gap-1.5 text-[10px] text-slate-600 font-semibold cursor-pointer">
                        <input type="checkbox" checked={printFields.measPant} onChange={() => togglePrintField('measPant')} className="rounded border-slate-300 text-brand-500 w-3 h-3" />
                        <span>Pant</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* Preview Container */}
              <div className="lg:col-span-2 space-y-4">
                <div className="flex justify-between items-center bg-slate-50 border border-slate-200/60 p-4 rounded-2xl shadow-sm">
                  <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Live Production Sheet Preview</span>
                  <span className="text-[10px] bg-slate-200 text-slate-600 font-bold px-2 py-0.5 rounded uppercase">Tailoring Output</span>
                </div>

                <div className="bg-slate-100 border border-slate-200 rounded-3xl p-5 md:p-6 shadow-inner max-h-[700px] overflow-y-auto space-y-6">
                  {getCombinedPrintItems().length === 0 ? (
                    <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 font-bold">
                      No customer appointments or visit fittings match {new Date(printDate).toLocaleDateString(undefined, { dateStyle: 'medium' })}.
                    </div>
                  ) : (
                    getCombinedPrintItems().map((item, idx) => (
                      <div
                        key={item.id}
                        className="bg-white border-2 border-slate-900 p-5 rounded-2xl shadow-premium space-y-4 text-slate-900 leading-relaxed"
                        style={{ fontFamily: 'monospace' }}
                      >
                        {/* Header border */}
                        <div className="flex justify-between items-center border-b-2 border-slate-900 pb-2 font-bold text-xs">
                          <span className="bg-slate-900 text-white px-2 py-0.5 rounded text-[10px]">SHEET #{idx + 1} - {item.type.replace(/_/g, ' ')}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-slate-850">TIME: {item.timeSlot}</span>
                            <button 
                              onClick={() => handlePrintWorksheets([item])}
                              className="bg-brand-100 hover:bg-brand-200 text-brand-700 px-2.5 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider transition-colors border border-brand-200"
                            >
                              Print This Only
                            </button>
                          </div>
                        </div>

                        {/* Customer & Appt Details */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                          {/* Client Section */}
                          <div className="space-y-1">
                            <span className="block border-b border-slate-200 font-bold text-[9px] uppercase text-slate-450 tracking-wider mb-1">Customer Profile</span>
                            {printFields.custName && <div><strong>Client Name :</strong> {item.userName}</div>}
                            {printFields.custPhone && <div><strong>Phone Number:</strong> {item.phone || 'N/A'}</div>}
                            {printFields.custEmail && <div><strong>Email Addr  :</strong> {item.email || 'N/A'}</div>}
                            {printFields.custAddress && <div className="leading-tight"><strong>Home Address:</strong> {item.address || 'N/A'}</div>}
                            {printFields.custGender && <div><strong>Gender      :</strong> {item.gender || 'N/A'}</div>}
                          </div>

                          {/* Appt Section */}
                          <div className="space-y-1">
                            <span className="block border-b border-slate-200 font-bold text-[9px] uppercase text-slate-450 tracking-wider mb-1">Booking Info</span>
                            {printFields.apptType && <div><strong>Appt Type   :</strong> {item.apptType}</div>}
                            {printFields.apptStaff && <div><strong>Assigned to :</strong> {item.assignedStaffName}</div>}
                            {printFields.apptStatus && <div><strong>Status      :</strong> {item.status}</div>}
                            {printFields.apptNotes && <div className="leading-tight text-slate-700"><strong>Appt Notes  :</strong> {item.notes || 'None'}</div>}
                          </div>
                        </div>

                        {/* Associated Order details */}
                        {(printFields.orderInvoice || printFields.orderStatus || printFields.orderItems || printFields.orderFabric || printFields.orderCustoms || printFields.orderTailorNotes) && (
                          <div className="space-y-2 border-t border-slate-200 pt-3 text-xs">
                            <span className="block font-bold text-[9px] uppercase text-slate-450 tracking-wider">Product Order Specifications</span>
                            {item.order ? (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                  {printFields.orderInvoice && <div><strong>Invoice No  :</strong> {item.order.invoiceNumber}</div>}
                                  {printFields.orderStatus && <div><strong>Order Stage :</strong> {item.order.status}</div>}
                                  {printFields.orderFabric && <div><strong>Fabric Type :</strong> {item.order.fabricType || 'As specified'}</div>}
                                  {printFields.orderCustoms && <div className="leading-tight"><strong>Customs     :</strong> {item.order.customizations || 'None'}</div>}
                                </div>
                                <div className="space-y-1">
                                  {printFields.orderTailorNotes && <div className="leading-tight text-slate-700"><strong>Tailor Notes:</strong> {item.order.tailorNotes || 'None'}</div>}
                                  {printFields.orderItems && (
                                    <div>
                                      <strong>Ordered Items List:</strong>
                                      <ul className="list-disc list-inside mt-0.5 font-bold text-slate-800">
                                        {item.order.orderItems?.map((p, i) => (
                                          <li key={i}>{p.product?.name} (Qty: {p.quantity})</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="text-slate-400 italic">No direct retail order found linked for this appointment slot.</div>
                            )}
                          </div>
                        )}

                        {/* Size parameters */}
                        {hasAnyMeasurementFieldChecked() && (
                          <div className="space-y-2 border-t border-slate-200 pt-3 text-xs">
                            <span className="block font-bold text-[9px] uppercase text-slate-455 tracking-wider">Custom Sizing Parameters ({item.measurements?.profileName || 'Default Size'})</span>
                            {item.measurements ? (
                              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                                {Object.entries(MEASUREMENT_LABELS).map(([fieldKey, cfg]) => {
                                  if (!printFields[fieldKey]) return null;
                                  const val = item.measurements[cfg.key];
                                  return (
                                    <div key={fieldKey} className="border border-slate-300 p-2 text-center bg-slate-50 rounded-xl">
                                      <span className="text-[8px] text-slate-450 uppercase block font-bold">{cfg.label}</span>
                                      <span className="font-extrabold text-sm text-slate-800">{val ? `${val}"` : '-'}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="text-slate-400 italic">No measurement profile loaded for this customer. Sizing needs to be taken.</div>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Redesigned Unified Order + Appointment Management Slide-Over Panel ── */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/60 backdrop-blur-sm transition-opacity duration-300 animate-fadeIn">
          {/* Backdrop Overlay */}
          <div className="absolute inset-0 cursor-pointer" onClick={() => setSelectedOrder(null)} />

          {/* Slide-over panel container */}
          <div className="relative w-full md:w-[80%] max-w-7xl bg-slate-50 border-l border-slate-200 shadow-2xl flex flex-col h-full z-10 animate-slide-in">
            
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 bg-white border-b border-slate-100 flex-shrink-0">
              <div>
                <span className="text-[10px] font-bold text-brand-605 bg-brand-50 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Order Management Console
                </span>
                <h3 className="font-black text-slate-800 text-lg tracking-tight mt-1 flex items-center gap-2">
                  <span>Manage Order {formatOrderId(selectedOrder.invoiceNumber)}</span>
                  <span className={`text-xs px-2.5 py-0.5 rounded-full border ${getCombinedStatusStyle(selectedOrder)}`}>
                    {getCombinedStatusLabel(selectedOrder)}
                  </span>
                </h3>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-colors focus:outline-none"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Scrollable Columns Container */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                
                {/* ── LEFT COLUMN: Order Details ── */}
                <div className="lg:col-span-7 space-y-6">
                  
                  {/* Status Banner */}
                  <div className={`p-5 rounded-3xl border flex gap-4 items-center shadow-sm ${selectedOrder.status === 'CANCELLED' ? 'bg-red-50 border-red-200' : 'bg-brand-50/50 border-brand-200'}`}>
                    <div className={`p-2 rounded-2xl ${selectedOrder.status === 'CANCELLED' ? 'bg-red-100/50' : 'bg-brand-100/50'}`}>
                      {selectedOrder.status === 'CANCELLED' ? <XCircle className="w-8 h-8 text-red-600" /> : <Package className="w-8 h-8 text-brand-600" />}
                    </div>
                    <div className="flex-1">
                      <h4 className={`text-base font-black uppercase tracking-tight ${selectedOrder.status === 'CANCELLED' ? 'text-red-700' : 'text-brand-800'}`}>
                        {selectedOrder.status === 'CANCELLED' ? 'Order Cancelled' : 'Order Active'}
                      </h4>
                      <p className={`text-xs font-bold mt-0.5 ${selectedOrder.status === 'CANCELLED' ? 'text-red-600/80' : 'text-brand-600/80'}`}>
                        Current Delivery Stage: <span className="font-extrabold">{getCombinedStatusLabel(selectedOrder)}</span>
                      </p>
                    </div>
                    {/* Quick Refund Action */}
                    {selectedOrder.status === 'CANCELLED' && (
                      <div className="shrink-0 ml-auto flex flex-col items-end">
                        {editPaymentStatus === 'REFUNDED' ? (
                          <span className="px-3.5 py-2 bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-black rounded-xl shadow-sm flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            Refunded (Saved to DB)
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={async () => {
                              await handleProcessRefund(selectedOrder);
                            }}
                            className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs uppercase tracking-wider font-black rounded-xl shadow-lg shadow-red-500/20 transition-all active:scale-95 flex items-center gap-2 cursor-pointer"
                          >
                            💳 Process Refund
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {/* Customer Information Card */}
                  <div className="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm hover:shadow-premium transition-shadow space-y-4">
                    <h4 className="font-extrabold text-slate-800 text-sm border-b border-slate-50 pb-2">
                      Customer Information
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Customer Name</label>
                        <input
                          type="text"
                          value={editCustomerName}
                          onChange={e => setEditCustomerName(e.target.value)}
                          className="w-full text-xs font-semibold border border-slate-200 rounded-xl py-2 px-3 focus:outline-none focus:border-brand-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Phone Number</label>
                        <input
                          type="text"
                          value={editCustomerPhone}
                          onChange={e => setEditCustomerPhone(e.target.value)}
                          className="w-full text-xs font-semibold border border-slate-200 rounded-xl py-2 px-3 focus:outline-none focus:border-brand-500"
                        />
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Email Address</label>
                        <input
                          type="email"
                          value={editCustomerEmail}
                          onChange={e => setEditCustomerEmail(e.target.value)}
                          className="w-full text-xs font-semibold border border-slate-200 rounded-xl py-2 px-3 focus:outline-none focus:border-brand-500"
                        />
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Delivery Address</label>
                        <textarea
                          value={editCustomerAddress}
                          onChange={e => setEditCustomerAddress(e.target.value)}
                          rows="2"
                          className="w-full text-xs font-semibold border border-slate-200 rounded-xl py-2 px-3 focus:outline-none focus:border-brand-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Order Details Card */}
                  <div className="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm hover:shadow-premium transition-shadow space-y-4">
                    <h4 className="font-extrabold text-slate-800 text-sm border-b border-slate-50 pb-2">
                      Order Metadata
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Order ID</span>
                        <span className="text-xs font-bold text-slate-800 truncate block mt-1" title={formatOrderId(selectedOrder.invoiceNumber)}>
                          {formatOrderId(selectedOrder.invoiceNumber)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Invoice Number</span>
                        <span className="text-xs font-bold text-slate-800 block mt-1">
                          {selectedOrder.invoiceNumber}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Order Date</span>
                        <span className="text-xs font-semibold text-slate-800 block mt-1">
                          {new Date(selectedOrder.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Delivery Date</span>
                        <input
                          type="date"
                          value={editDeliveryDate}
                          onChange={e => setEditDeliveryDate(e.target.value)}
                          className="w-full text-xs font-bold border border-slate-200/60 rounded-xl py-0.5 px-1.5 bg-white text-brand-600 focus:outline-none focus:border-brand-500 font-sans"
                        />
                      </div>
                      <div className="space-y-1 col-span-2 md:col-span-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Order Status</label>
                        <select
                          value={editOrderStatus}
                          onChange={e => setEditOrderStatus(e.target.value)}
                          className="w-full text-xs font-bold border border-slate-200 rounded-xl py-1.5 px-2.5 bg-white text-slate-700 focus:outline-none focus:border-brand-500"
                        >
                          <option value="PENDING">Order Placed</option>
                          <option value="PAID">Measurement Session</option>
                          <option value="PROCESSING">Order Stitching</option>
                          <option value="SHIPPED">Product Completed</option>
                          <option value="OUT_FOR_DELIVERY">Product Out for Delivery</option>
                          <option value="DELIVERED">Delivered</option>
                          <option value="CANCELLED">Cancelled</option>
                        </select>
                      </div>
                      <div className="space-y-1 col-span-2 md:col-span-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Payment Status</label>
                        <select
                          value={editPaymentStatus}
                          onChange={e => {
                            const newStatus = e.target.value;
                            setEditPaymentStatus(newStatus);
                            const total = Number(selectedOrder.payableAmount || selectedOrder.totalAmount || 0);
                            if (newStatus === 'COMPLETED' && total > 0) {
                              setEditAdvancePayment(total);
                            } else if (newStatus === 'PENDING') {
                              setEditAdvancePayment(0);
                            }
                          }}
                          className="w-full text-xs font-bold border border-slate-200 rounded-xl py-1.5 px-2.5 bg-white text-slate-700 focus:outline-none focus:border-brand-500"
                        >
                          <option value="PENDING">Pending (Non-Paid)</option>
                          <option value="PARTIAL">Advance Paid / Partial</option>
                          <option value="COMPLETED">Completed (Fully Paid)</option>
                          <option value="FAILED">Failed</option>
                          <option value="REFUNDED">Refunded</option>
                        </select>
                      </div>

                      <div className="space-y-1 col-span-2 md:col-span-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Advance Paid (₹)</label>
                        <div className="relative">
                          <span className="absolute left-2.5 top-1.5 text-slate-400 text-xs font-bold">₹</span>
                          <input
                            type="number"
                            min="0"
                            max={Number(selectedOrder.payableAmount || selectedOrder.totalAmount || 0)}
                            value={editAdvancePayment}
                            onChange={e => {
                              const val = e.target.value;
                              setEditAdvancePayment(val);
                              const num = Number(val) || 0;
                              const total = Number(selectedOrder.payableAmount || selectedOrder.totalAmount || 0);
                              if (num >= total && total > 0) {
                                setEditPaymentStatus('COMPLETED');
                              } else if (num > 0) {
                                setEditPaymentStatus('PARTIAL');
                              } else {
                                setEditPaymentStatus('PENDING');
                              }
                            }}
                            className="w-full pl-6 pr-2 py-1.5 text-xs font-bold border border-slate-200 rounded-xl bg-white text-slate-800 focus:outline-none focus:border-brand-500"
                            placeholder="0.00"
                          />
                        </div>
                      </div>

                      <div className="space-y-1 col-span-2 md:col-span-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Balance Due</span>
                        <span className="text-xs font-black text-brand-600 block mt-1">
                          ₹{Math.max(0, (Number(selectedOrder.payableAmount || selectedOrder.totalAmount || 0) - (Number(editAdvancePayment) || 0))).toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Product Details & Tailoring Customizations */}
                  <div className="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm hover:shadow-premium transition-shadow space-y-4">
                    <h4 className="font-extrabold text-slate-800 text-sm border-b border-slate-50 pb-2">
                      Product Details &amp; Custom Sizing
                    </h4>

                    {selectedOrder.items?.map((item) => (
                      <div key={item.id} className="flex gap-4 p-3.5 bg-slate-50 rounded-2xl border border-slate-100 items-start">
                        <img
                          src={selectedOrder.product?.images?.[0] || 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=120'}
                          alt={item.productName}
                          className="w-16 h-16 object-cover rounded-xl border border-slate-200 flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-[9px] bg-slate-200 text-slate-650 px-2 py-0.5 rounded-full font-bold uppercase">
                            Qty: {item.quantity}
                          </span>
                          <h5 className="font-extrabold text-slate-800 text-sm truncate mt-1">
                            {item.productName}
                          </h5>
                          <p className="text-[10px] text-slate-405 font-medium mt-0.5">
                            Category: {selectedOrder.product?.category?.name || 'Luxury Custom Outfit'}
                          </p>
                        </div>
                      </div>
                    ))}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Fabric Type</label>
                        <input
                          type="text"
                          value={editFabricType}
                          onChange={e => setEditFabricType(e.target.value)}
                          placeholder="e.g. Raw Banarasi Silk"
                          className="w-full text-xs font-semibold border border-slate-200 rounded-xl py-2 px-3 focus:outline-none focus:border-brand-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Customizations</label>
                        <input
                          type="text"
                          value={editCustomizations}
                          onChange={e => setEditCustomizations(e.target.value)}
                          placeholder="e.g. Velvet Lapel, Golden Buttons"
                          className="w-full text-xs font-semibold border border-slate-200 rounded-xl py-2 px-3 focus:outline-none focus:border-brand-500"
                        />
                      </div>
                    </div>

                    {/* Sizing Dimensions Sheet */}
                    <div className="space-y-3 pt-3 border-t border-slate-100">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <label className="text-[10px] font-bold text-slate-450 uppercase flex items-center gap-1">
                          <Ruler className="w-3.5 h-3.5 text-brand-500" />
                          <span>Custom Sizing Profile Dimensions (Inches)</span>
                        </label>
                        
                        {selectedOrder.userId && (
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-bold text-slate-400 uppercase">Profile:</span>
                            <select
                              value={isCreatingNewProfile ? 'new' : (selectedProfileId || 'none')}
                              onChange={e => {
                                const val = e.target.value;
                                if (val === 'new') {
                                  setIsCreatingNewProfile(true);
                                  setNewProfileName('');
                                } else {
                                  setIsCreatingNewProfile(false);
                                  setSelectedProfileId(val);
                                  if (val === 'none') {
                                    setEditMeasurements({
                                      fullLength: '', shoulderWidth: '', upperChest: '', bust: '',
                                      waist: '', hip: '', armLength: '', sleeveLength: '',
                                      neck: '', skirtLength: '', pantLength: ''
                                    });
                                  } else {
                                    const matched = customerProfiles.find(p => p.id === val);
                                    if (matched) {
                                      setEditMeasurements({
                                        fullLength: matched.fullLength || '',
                                        shoulderWidth: matched.shoulderWidth || '',
                                        upperChest: matched.upperChest || '',
                                        bust: matched.bust || '',
                                        waist: matched.waist || '',
                                        hip: matched.hip || '',
                                        armLength: matched.armLength || '',
                                        sleeveLength: matched.sleeveLength || '',
                                        neck: matched.neck || '',
                                        skirtLength: matched.skirtLength || '',
                                        pantLength: matched.pantLength || '',
                                      });
                                    }
                                  }
                                }
                              }}
                              className="text-[10px] font-bold border border-slate-200 rounded-lg py-1 px-2 bg-white text-slate-650 focus:outline-none focus:border-brand-500"
                            >
                              <option value="none">None (No profile)</option>
                              {customerProfiles.map(p => (
                                <option key={p.id} value={p.id}>{p.profileName}</option>
                              ))}
                              <option value="new">+ Create New Profile...</option>
                            </select>
                          </div>
                        )}
                      </div>

                      {isCreatingNewProfile && (
                        <div className="bg-brand-50/50 border border-brand-100 rounded-xl p-2.5 space-y-1.5 animate-fadeIn">
                          <label className="text-[9px] font-bold text-brand-700 uppercase block">New Profile Name</label>
                          <input
                            type="text"
                            value={newProfileName}
                            onChange={e => setNewProfileName(e.target.value)}
                            placeholder="e.g. Wedding Suit, Silk Lehenga"
                            className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-lg py-1 px-2 focus:outline-none focus:border-brand-500"
                            required
                          />
                        </div>
                      )}
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                        {[
                          { key: 'bust', label: 'Bust Size' },
                          { key: 'waist', label: 'Waist Size' },
                          { key: 'hip', label: 'Hip Size' },
                          { key: 'fullLength', label: 'Full Length' },
                          { key: 'shoulderWidth', label: 'Shoulder' },
                          { key: 'upperChest', label: 'Upper Chest' },
                          { key: 'armLength', label: 'Arm Length' },
                          { key: 'sleeveLength', label: 'Sleeve' },
                          { key: 'neck', label: 'Neck' },
                          { key: 'skirtLength', label: 'Skirt' },
                          { key: 'pantLength', label: 'Pant Length' },
                        ].map((dim) => (
                          <div key={dim.key} className="space-y-1 bg-slate-50 border border-slate-100 rounded-xl p-2 relative flex flex-col">
                            <span className="text-[8px] font-bold text-slate-400 uppercase block">{dim.label}</span>
                            <input
                              type="number"
                              step="0.1"
                              value={editMeasurements[dim.key] || ''}
                              onChange={e => setEditMeasurements({
                                ...editMeasurements,
                                [dim.key]: e.target.value
                              })}
                              className="w-full font-bold text-slate-750 bg-white border border-slate-200 rounded-lg p-1 text-xs focus:outline-none focus:border-brand-500 mt-1"
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Management Activity / Tailor Notes */}
                    <div className="space-y-3 pt-4 border-t border-slate-100">
                      <h4 className="font-extrabold text-slate-800 text-sm flex items-center gap-2">
                        <Clipboard className="w-4 h-4 text-slate-400" />
                        Management &amp; Tailor Notes
                      </h4>
                      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 shadow-inner">
                        <textarea
                          value={editTailorNotes}
                          onChange={e => setEditTailorNotes(e.target.value)}
                          placeholder="Log any styling notes, sizing overrides, customer requests, or cancellation reasons here..."
                          rows="3"
                          className="w-full text-xs font-semibold border border-slate-200 bg-white rounded-xl py-3 px-4 focus:outline-none focus:border-brand-500 transition-colors shadow-sm"
                        />
                        <div className="flex justify-between items-center mt-2">
                          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Visible to Staff Only</span>
                          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                            Last Updated: {new Date(selectedOrder.updatedAt || selectedOrder.createdAt).toLocaleDateString('en-IN')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                </div>

                {/* ── RIGHT COLUMN: Appointment Management ── */}
                <div className="lg:col-span-5 space-y-6">

                  {/* Quick Order Control Center */}
                  {selectedOrder.isQuickOrder && (
                    <div className="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm hover:shadow-premium transition-shadow space-y-4 animate-fadeIn">
                      <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                        <h4 className="font-extrabold text-slate-800 text-sm">
                          Quick Order Status
                        </h4>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border shrink-0 ${
                          selectedOrder.quickOrderStatus === 'APPROVED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          selectedOrder.quickOrderStatus === 'REJECTED' ? 'bg-red-50 text-red-700 border-red-200' :
                          selectedOrder.quickOrderStatus === 'DATE_CHANGE_PROPOSED' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          selectedOrder.quickOrderStatus === 'USER_REJECTED_PROPOSAL' ? 'bg-red-50 text-red-700 border-red-200' :
                          selectedOrder.quickOrderStatus === 'ADMIN_FINAL_APPROVAL_PENDING' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                          'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                          {selectedOrder.quickOrderStatus === 'DATE_CHANGE_PROPOSED' ? 'DATE PROPOSED' : 
                           selectedOrder.quickOrderStatus === 'USER_REJECTED_PROPOSAL' ? 'USER REJECTED' :
                           selectedOrder.quickOrderStatus === 'ADMIN_FINAL_APPROVAL_PENDING' ? 'FINAL APPROVAL PENDING' :
                           (selectedOrder.quickOrderStatus || 'PENDING')}
                        </span>
                      </div>
                      
                      <div className="space-y-3.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-400 font-bold uppercase text-[10px]">Expected Date</span>
                          <span className="font-extrabold text-slate-800">
                            {selectedOrder.quickOrderExpectedDate ? new Date(selectedOrder.quickOrderExpectedDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}
                          </span>
                        </div>
                        {selectedOrder.quickOrderStatus === 'DATE_CHANGE_PROPOSED' && selectedOrder.quickOrderProposedDate && (
                          <div className="flex flex-col gap-1 bg-blue-50/50 p-2.5 rounded-xl border border-blue-100">
                            <div className="flex justify-between">
                              <span className="text-blue-600 font-bold uppercase text-[10px]">Proposed Date</span>
                              <span className="font-extrabold text-blue-700">
                                {new Date(selectedOrder.quickOrderProposedDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </span>
                            </div>
                            {selectedOrder.adminProposalNote && (
                              <div className="mt-1 pt-1 border-t border-blue-100/50">
                                <span className="text-blue-600 font-bold uppercase text-[10px] block mb-0.5">Your Note:</span>
                                <span className="text-xs text-blue-700">{selectedOrder.adminProposalNote}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {selectedOrder.quickOrderStatus === 'USER_REJECTED_PROPOSAL' && selectedOrder.userRejectionNote && (
                          <div className="flex flex-col gap-1 bg-red-50/50 p-2.5 rounded-xl border border-red-100">
                            <span className="text-red-600 font-bold uppercase text-[10px] block mb-0.5">User's Rejection Reason:</span>
                            <span className="text-xs text-red-700">{selectedOrder.userRejectionNote}</span>
                          </div>
                        )}
                        <div className="flex flex-col gap-1">
                          <span className="text-slate-400 font-bold uppercase text-[10px]">Quick Order Reason</span>
                          <span className="font-medium text-slate-705 bg-slate-50 p-2.5 rounded-xl border border-slate-100 block">
                            {selectedOrder.quickOrderReason || 'No reason specified'}
                          </span>
                        </div>
                        
                        {selectedOrder.isQuickOrder && (!selectedOrder.quickOrderStatus || ['PENDING', 'DATE_CHANGE_PROPOSED', 'USER_REJECTED_PROPOSAL', 'ADMIN_FINAL_APPROVAL_PENDING'].includes(selectedOrder.quickOrderStatus)) && (
                          <div className="flex gap-2 pt-2">
                            <button
                              type="button"
                              onClick={() => handleUpdateQuickStatus(selectedOrder.id, 'APPROVED')}
                              className="flex-1 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-xs rounded-xl shadow-premium transition-all"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateQuickStatus(selectedOrder.id, 'REJECTED')}
                              className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white font-extrabold text-xs rounded-xl shadow-premium transition-all"
                            >
                              Reject
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setProposeDateOrderId(selectedOrder.id);
                                setProposedDateVal(selectedOrder.quickOrderProposedDate ? selectedOrder.quickOrderProposedDate.substring(0, 10) : '');
                                setAdminProposalNoteVal('');
                              }}
                              className="flex-1 py-2 bg-blue-500 hover:bg-blue-600 text-white font-extrabold text-xs rounded-xl shadow-premium transition-all"
                            >
                              Change Date
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Appointment Details & Status */}
                  <div className="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm hover:shadow-premium transition-shadow space-y-4">
                    <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                      <h4 className="font-extrabold text-slate-800 text-sm">
                        Appointment Management
                      </h4>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border shrink-0 ${selectedOrder.booking ? getApptStatusStyle(selectedOrder.booking.status) : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                        {selectedOrder.booking ? selectedOrder.booking.status : 'UNSCHEDULED'}
                      </span>
                    </div>

                    {!selectedOrder.booking ? (
                      <div className="space-y-4">
                        <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50 text-center">
                          <Calendar className="w-8 h-8 text-slate-400 mb-2" />
                          <span className="text-xs font-bold text-slate-600 block">No Fitting Session Booked</span>
                          <span className="text-[10px] text-slate-400 mt-1 block">This order does not have an active appointment yet.</span>
                          {!isRescheduling && (
                            <button
                              type="button"
                              onClick={() => setIsRescheduling(true)}
                              className="mt-4 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white font-extrabold text-xs rounded-xl shadow-premium shadow-brand-500/10 transition-all focus:outline-none"
                            >
                              Schedule Fitting Session
                            </button>
                          )}
                        </div>

                        {/* Reschedule Section (Drawer) */}
                        {isRescheduling && (
                          <div className="p-4 border border-brand-100 bg-brand-50/20 rounded-2xl space-y-3.5 animate-fadeIn">
                            <h5 className="font-bold text-slate-805 text-xs">Schedule Fitting Session</h5>
                            <div className="space-y-3">
                              <div className="space-y-1">
                                <label className="text-[9px] font-bold text-slate-400 uppercase">Select Date</label>
                                <input
                                  type="date"
                                  value={rescheduleDate}
                                  onChange={e => setRescheduleDate(e.target.value)}
                                  className="w-full px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-200 rounded-lg focus:outline-none"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] font-bold text-slate-400 uppercase">Select Time Window</label>
                                <select
                                  value={rescheduleTimeSlot}
                                  onChange={e => setRescheduleTimeSlot(e.target.value)}
                                  className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-slate-200 rounded-lg focus:outline-none"
                                >
                                  <option value="10:00 AM - 11:30 AM">10:00 AM - 11:30 AM</option>
                                  <option value="11:30 AM - 01:00 PM">11:30 AM - 01:00 PM</option>
                                  <option value="02:00 PM - 03:30 PM">02:00 PM - 03:30 PM</option>
                                  <option value="03:30 PM - 05:00 PM">03:30 PM - 05:00 PM</option>
                                  <option value="05:00 PM - 06:30 PM">05:00 PM - 06:30 PM</option>
                                </select>
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] font-bold text-slate-400 uppercase">Notes</label>
                                <input
                                  type="text"
                                  value={rescheduleReason}
                                  onChange={e => setRescheduleReason(e.target.value)}
                                  placeholder="e.g. Schedule fitting for luxury outfit"
                                  className="w-full px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-200 rounded-lg focus:outline-none"
                                />
                              </div>
                              <div className="flex gap-2 pt-1.5">
                                <button
                                  type="button"
                                  onClick={handleRescheduleAppointment}
                                  className="flex-1 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-bold text-[10px] shadow"
                                >
                                  Confirm Slot
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setIsRescheduling(false)}
                                  className="py-1.5 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 font-bold text-[10px]"
                                >
                                  Dismiss
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (() => {
                      const booking = selectedOrder.booking;

                      return (
                        <div className="space-y-4">
                          <div className="flex flex-col gap-1.5 p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                            <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                              <span>Appointment Type:</span>
                              <span className="text-brand-605 uppercase">
                                {(booking.type === 'STUDIO' || booking.type === 'MEASUREMENT') ? 'Studio Fitting' : 'Home Visit'}
                              </span>
                            </div>
                            <div className="flex justify-between items-center text-xs text-slate-605 mt-2">
                              <span>Date:</span>
                              <span className="font-bold">
                                {formatBookingDateUTC(booking.date, { weekday: 'long' })}
                              </span>
                            </div>
                            <div className="flex justify-between items-center text-xs text-slate-650 mt-1">
                              <span>Time Slot:</span>
                              <span className="font-bold">{booking.timeSlot}</span>
                            </div>
                          </div>

                          {/* Scheduling Controls */}
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase block">Scheduling Controls</label>
                            <div className="grid grid-cols-2 gap-2">
                              {booking.status === 'PENDING' && (
                                <button
                                  type="button"
                                  onClick={() => handleUpdateBookingStatus('CONFIRMED')}
                                  className="py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-sm transition-all col-span-2"
                                >
                                  Confirm Slot
                                </button>
                              )}
                              
                              {booking.status === 'CONFIRMED' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => setIsRescheduling(!isRescheduling)}
                                    className="py-2 px-3 border border-slate-200 hover:bg-slate-50 text-brand-605 font-bold rounded-xl text-xs shadow-sm transition-all"
                                  >
                                    {isRescheduling ? 'Cancel Reschedule' : 'Reschedule'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateBookingStatus('CANCELLED')}
                                    className="py-2 px-3 border border-slate-200 hover:bg-red-50 text-red-600 font-bold rounded-xl text-xs transition-all"
                                  >
                                    Reject Appointment
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateBookingStatus('COMPLETED')}
                                    className="py-2 px-3 bg-emerald-50 text-emerald-700 border border-emerald-100 hover:bg-emerald-100 font-bold rounded-xl text-xs transition-all col-span-2"
                                  >
                                    Mark Completed
                                  </button>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Reschedule Section (Drawer) */}
                          {isRescheduling && (
                            <div className="p-4 border border-brand-100 bg-brand-50/20 rounded-2xl space-y-3.5 animate-fadeIn">
                              <h5 className="font-bold text-slate-850 text-xs">Reschedule Sizing Fitting</h5>
                              <div className="space-y-3">
                                <div className="space-y-1">
                                  <label className="text-[9px] font-bold text-slate-400 uppercase">Select Date</label>
                                  <input
                                    type="date"
                                    value={rescheduleDate}
                                    onChange={e => setRescheduleDate(e.target.value)}
                                    className="w-full px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-200 rounded-lg focus:outline-none"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] font-bold text-slate-400 uppercase">Select Time Window</label>
                                  <select
                                    value={rescheduleTimeSlot}
                                    onChange={e => setRescheduleTimeSlot(e.target.value)}
                                    className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-slate-200 rounded-lg focus:outline-none"
                                  >
                                    <option value="10:00 AM - 11:30 AM">10:00 AM - 11:30 AM</option>
                                    <option value="11:30 AM - 01:00 PM">11:30 AM - 01:00 PM</option>
                                    <option value="02:00 PM - 03:30 PM">02:00 PM - 03:30 PM</option>
                                    <option value="03:30 PM - 05:00 PM">03:30 PM - 05:00 PM</option>
                                    <option value="05:00 PM - 06:30 PM">05:00 PM - 06:30 PM</option>
                                  </select>
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] font-bold text-slate-400 uppercase">Reason for Rescheduling</label>
                                  <input
                                    type="text"
                                    value={rescheduleReason}
                                    onChange={e => setRescheduleReason(e.target.value)}
                                    placeholder="e.g. Tailor unavailable / Customer request"
                                    className="w-full px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-200 rounded-lg focus:outline-none"
                                  />
                                </div>
                                <div className="flex gap-2 pt-1.5">
                                  <button
                                    type="button"
                                    onClick={handleRescheduleAppointment}
                                    className="flex-1 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-bold text-[10px] shadow"
                                  >
                                    Confirm Reschedule
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setIsRescheduling(false)}
                                    className="py-1.5 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 font-bold text-[10px]"
                                  >
                                    Dismiss
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Activity Timeline */}
                  <div className="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm hover:shadow-premium transition-shadow space-y-4">
                    <h4 className="font-extrabold text-slate-800 text-sm border-b border-slate-50 pb-2">
                      Activity Timeline
                    </h4>
                    <div className="relative border-l border-slate-200 pl-4 ml-2.5 space-y-5 py-2">
                      {getActivityTimeline().map((event, idx) => (
                        <div key={idx} className="relative">
                          {/* Indicator Dot */}
                          <span className="absolute -left-[22px] top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white ring-4 ring-white shadow-sm border border-slate-100">
                            <div className={`h-1.5 w-1.5 rounded-full ${
                              event.status === 'completed' ? 'bg-emerald-500' : event.status === 'warning' ? 'bg-amber-500' : 'bg-red-500'
                            }`} />
                          </span>
                          <div className="flex justify-between items-start text-xs gap-3">
                            <div>
                              <p className="font-extrabold text-slate-800 leading-tight">{event.title}</p>
                              <p className="text-slate-500 mt-1 text-[11px] leading-relaxed">{event.description}</p>
                            </div>
                            <span className="text-[10px] text-slate-450 font-bold shrink-0">{event.date}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Payment Summary */}
                  <div className="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm hover:shadow-premium transition-shadow space-y-4">
                    <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                      <h4 className="font-extrabold text-slate-800 text-sm">
                        Payment Summary <span className="text-xs text-slate-400 font-bold">({selectedOrder.paymentMethod})</span>
                      </h4>
                      {selectedOrder.status === 'CANCELLED' && (
                        <div>
                          {editPaymentStatus === 'REFUNDED' ? (
                            <span className="px-3 py-1.5 bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-black rounded-xl shadow-sm flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Refunded
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={async () => {
                                await handleProcessRefund(selectedOrder);
                              }}
                              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs uppercase font-black rounded-xl shadow-md shadow-red-500/20 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                            >
                              💳 Process Refund
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="space-y-2.5 text-xs">
                      <div className="flex justify-between text-slate-600">
                        <span className="font-bold uppercase text-[10px] tracking-wide">Subtotal</span>
                        <span className="font-extrabold text-slate-700">₹{Number(selectedOrder.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                      {Number(selectedOrder.discountAmount) > 0 && (
                        <div className="flex justify-between text-red-500">
                          <span className="font-bold uppercase text-[10px] tracking-wide">Discount</span>
                          <span className="font-extrabold">-₹{Number(selectedOrder.discountAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-slate-600">
                        <span className="font-bold uppercase text-[10px] tracking-wide">GST ({selectedOrder.gstPercentage !== undefined && selectedOrder.gstPercentage !== null ? selectedOrder.gstPercentage : 18}%)</span>
                        <span className="font-extrabold text-slate-700">₹{Number(selectedOrder.taxAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between pt-3 border-t border-slate-100 mt-1">
                        <span className="text-slate-800 font-extrabold text-sm uppercase">Total Payable</span>
                        <span className="text-brand-600 font-black text-lg">₹{Number(selectedOrder.payableAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                    {selectedOrder.advancePayment !== undefined && (
                      <div className="mt-4 space-y-4 text-xs pt-4 border-t border-slate-200 border-dashed bg-slate-50 -mx-6 px-6 -mb-6 pb-6 rounded-b-3xl">
                        
                        <div className="flex justify-between items-center bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                          <label className="text-emerald-700 font-bold uppercase text-[10px] tracking-wide">Advance Paid (Initial)</label>
                          <span className="text-emerald-600 font-black text-sm">₹{Number(selectedOrder.advancePayment).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        </div>

                        {selectedOrder.paymentHistory && selectedOrder.paymentHistory.length > 0 && (
                          <div className="space-y-2">
                            <h5 className="font-bold text-[10px] text-slate-500 uppercase tracking-wide">Additional Payments</h5>
                            <div className="space-y-2 max-h-32 overflow-y-auto">
                              {selectedOrder.paymentHistory.map((p, idx) => (
                                <div key={p.id || idx} className="flex justify-between items-center bg-white p-2.5 rounded-lg border border-slate-100">
                                  <div className="flex flex-col">
                                    <span className="font-bold text-slate-700">₹{Number(p.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                    <span className="text-[9px] text-slate-400">{new Date(p.date).toLocaleDateString('en-IN')} • {p.method} {p.note ? `• ${p.note}` : ''}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="pt-2">
                          <h5 className="font-bold text-[10px] text-slate-500 uppercase tracking-wide mb-2">Record New Payment</h5>
                          <div className="grid grid-cols-2 gap-2 mb-2">
                            <input
                              type="number"
                              placeholder="Amount (₹)"
                              value={newPaymentAmount}
                              onChange={e => setNewPaymentAmount(e.target.value)}
                              className="w-full text-sm font-bold border border-slate-200 rounded-lg py-1.5 px-3 focus:outline-none focus:border-brand-500 bg-white shadow-sm"
                            />
                            <select
                              value={newPaymentMethod}
                              onChange={e => setNewPaymentMethod(e.target.value)}
                              className="w-full text-xs font-semibold border border-slate-200 rounded-lg py-1.5 px-3 focus:outline-none focus:border-brand-500 bg-white shadow-sm"
                            >
                              <option value="Cash">Cash</option>
                              <option value="Online">Online</option>
                              <option value="Card">Card</option>
                            </select>
                          </div>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="Note (optional)"
                              value={newPaymentNote}
                              onChange={e => setNewPaymentNote(e.target.value)}
                              className="flex-1 text-xs border border-slate-200 rounded-lg py-1.5 px-3 focus:outline-none focus:border-brand-500 bg-white shadow-sm"
                            />
                            <button
                              type="button"
                              onClick={handleRecordNewPayment}
                              disabled={!newPaymentAmount || Number(newPaymentAmount) <= 0}
                              className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-bold px-4 py-1.5 rounded-lg text-xs transition-colors shadow-sm whitespace-nowrap"
                            >
                              Record Payment
                            </button>
                          </div>
                        </div>

                        <div className="flex justify-between items-center pt-3 border-t border-slate-200">
                          <span className="text-slate-700 font-bold uppercase text-[10px] tracking-wide">Balance Due</span>
                          <span className="text-red-600 font-black text-sm">
                            ₹{Math.max(0, Number(selectedOrder.payableAmount) - Number(selectedOrder.advancePayment || 0) - (selectedOrder.paymentHistory || []).reduce((s, p) => s + Number(p.amount), 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                </div>

              </div>
            </div>

            {/* Sticky Bottom Action Bar */}
            <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 z-20 flex-shrink-0">
              
              {/* Secondary Actions */}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handlePrintInvoice(selectedOrder)}
                  className="px-3 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-655 font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Invoice</span>
                </button>
                
                <a
                  href={`https://wa.me/${editCustomerPhone.replace(/\D/g, '')}?text=Hello%20${encodeURIComponent(editCustomerName)},%20this%20is%20MARCOS%20Luxury%20Couture.%20Regarding%20your%20order%20${selectedOrder.invoiceNumber}...`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-655 font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all"
                >
                  <Mail className="w-4 h-4" />
                  <span>WhatsApp Message</span>
                </a>

                <a
                  href={`tel:${editCustomerPhone}`}
                  className="px-3 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-655 font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all"
                >
                  <Phone className="w-4 h-4 text-slate-550" />
                  <span>Call Customer</span>
                </a>
              </div>

              {/* Primary Actions */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSaveOrderChanges}
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs rounded-xl shadow-md transition-all active:scale-[0.98]"
                >
                  Save Changes
                </button>
                
                {selectedOrder.booking && selectedOrder.booking.status === 'PENDING' && (
                  <button
                    type="button"
                    onClick={() => handleUpdateBookingStatus('CONFIRMED')}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all active:scale-[0.98]"
                  >
                    Confirm Appointment
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ── Packing Slip Modal ── */}
      {isSlipOpen && packingSlip && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-md shadow-2xl p-6 relative flex flex-col">
            <button
              onClick={() => setIsSlipOpen(false)}
              className="absolute top-4 right-4 p-1.5 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-4 pt-2">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="font-extrabold text-slate-800 text-base">Packing Checklist</h3>
                <p className="text-xs text-slate-400 font-semibold">{packingSlip.invoiceNumber}</p>
              </div>

              <div className="space-y-2.5 max-h-[300px] overflow-y-auto">
                {(packingSlip.packingItems || packingSlip.items || []).map((item, idx) => (
                  <label key={idx} className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl border border-slate-100 transition-colors cursor-pointer select-none">
                    <input type="checkbox" className="w-4 h-4 rounded text-brand-500 border-slate-300" />
                    <div className="flex-1 text-xs">
                      <p className="font-bold text-slate-800">{item.name}</p>
                      {(item.sku || item.material) && (
                        <p className="text-[10px] text-slate-400 font-medium">
                          {item.sku ? `SKU: ${item.sku}` : `Material: ${item.material}`}
                        </p>
                      )}
                    </div>
                    <span className="bg-slate-100 text-slate-700 font-bold px-2.5 py-1 rounded-lg text-[10px]">
                      Qty: {item.qty ?? item.quantity}
                    </span>
                  </label>
                ))}
              </div>

              <div className="border-t border-slate-100 pt-4">
                <button
                  onClick={handleDispatchOrder}
                  className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-md transition-all"
                >
                  ✓ Verify &amp; Mark as Shipped
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Propose Quick Order Date Change Modal ── */}
      {proposeDateOrderId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setProposeDateOrderId(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-900">Propose New Date</h3>
              <button onClick={() => setProposeDateOrderId(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-600 mb-4">Select a new date and provide an explanation to the user.</p>
              <input 
                type="date"
                className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all mb-4"
                value={proposedDateVal}
                onChange={e => setProposedDateVal(e.target.value)}
              />
              <textarea
                className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all resize-none"
                placeholder="Explain why you are proposing this date..."
                rows="3"
                value={adminProposalNoteVal}
                onChange={e => setAdminProposalNoteVal(e.target.value)}
              ></textarea>
            </div>
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <button 
                className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-xl transition-colors"
                onClick={() => {
                  setProposeDateOrderId(null);
                  setProposedDateVal('');
                  setAdminProposalNoteVal('');
                }}
              >
                Cancel
              </button>
              <button 
                className="px-4 py-2 bg-black text-white font-medium rounded-xl hover:bg-gray-800 transition-colors shadow-lg shadow-black/10"
                onClick={() => handleProposeQuickOrderDate(proposeDateOrderId, proposedDateVal, adminProposalNoteVal)}
              >
                Send Proposal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Two-step Status Confirmation Dialog ── */}
      {pendingStatusChange && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-sm shadow-2xl p-6 space-y-5 animate-fadeIn">
            <div className="space-y-1">
              <h3 className="font-black text-slate-800 text-base tracking-tight">Confirm Stage Update</h3>
              <p className="text-xs text-slate-500 font-medium">
                Order <span className="font-bold text-slate-700">{formatOrderId(pendingStatusChange.invoiceNumber)}</span>
              </p>
            </div>

            <div className="flex items-center gap-3 bg-slate-50 rounded-2xl px-4 py-3">
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${getStatusStyle(pendingStatusChange.from)}`}>
                {pendingStatusChange.fromLabel}
              </span>
              <span className="text-slate-400 text-xs font-bold flex-shrink-0">→</span>
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${pendingStatusChange.to === 'CANCELLED' ? 'bg-red-50 text-red-700 border-red-100' : getStatusStyle(pendingStatusChange.to)}`}>
                {pendingStatusChange.toLabel}
              </span>
            </div>

            <p className="text-xs text-slate-500">
              {pendingStatusChange.to === 'CANCELLED'
                ? 'This will cancel the order, restore inventory, and trigger a refund if applicable. This cannot be undone.'
                : 'The customer will be notified in real-time via the app. This action cannot be automatically undone.'}
            </p>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setPendingStatusChange(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 transition-colors"
              >
                Go Back
              </button>
              <button
                onClick={confirmStatusChange}
                className={`flex-1 py-2.5 rounded-xl text-white font-bold text-xs shadow-sm transition-all ${
                  pendingStatusChange.to === 'CANCELLED'
                    ? 'bg-red-500 hover:bg-red-600'
                    : 'bg-slate-900 hover:bg-slate-800'
                }`}
              >
                {pendingStatusChange.to === 'CANCELLED' ? 'Cancel Order' : 'Confirm →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Admin Reschedule Modal ── */}
      {adminRescheduleBooking && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-sm shadow-2xl p-6 space-y-5 animate-fadeIn">
            <div className="space-y-1">
              <h3 className="font-black text-slate-800 text-base tracking-tight">Reschedule Fitting</h3>
              <p className="text-xs text-slate-500 font-medium">
                Update date/time for {adminRescheduleBooking.type === 'STUDIO' ? 'Studio Visit' : 'Home Visit'}
              </p>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">Select Date</label>
                <input
                  type="date"
                  value={adminNewDate}
                  onChange={e => setAdminNewDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-brand-500 font-semibold"
                />
              </div>

              {adminRescheduleBooking.type === 'STUDIO' && (
                <div>
                  <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">Select Time Window</label>
                  <select
                    value={adminNewTimeSlot}
                    onChange={e => setAdminNewTimeSlot(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-brand-500 font-bold"
                  >
                    <option value="10:00 AM - 11:30 AM">10:00 AM - 11:30 AM</option>
                    <option value="11:30 AM - 01:00 PM">11:30 AM - 01:00 PM</option>
                    <option value="02:00 PM - 03:30 PM">02:00 PM - 03:30 PM</option>
                    <option value="03:30 PM - 05:00 PM">03:30 PM - 05:00 PM</option>
                    <option value="05:00 PM - 06:30 PM">05:00 PM - 06:30 PM</option>
                  </select>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setAdminRescheduleBooking(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAdminReschedule}
                className="flex-1 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-sm transition-all"
              >
                Save Updates
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Tailor Staff Overlay */}
      {activeVisitId && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-sm shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h4 className="font-extrabold text-slate-800 text-sm">Assign Tailoring Staff</h4>
              <button onClick={() => setActiveVisitId(null)} className="text-slate-400 hover:text-slate-600 text-xs font-extrabold">Close</button>
            </div>
            
            <form onSubmit={handleAssignStaff} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Select Staff Member</label>
                {staffList.length === 0 ? (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 font-medium">
                    No staff members found. Please add a tailor in <strong>Team & Tailors</strong> first.
                  </div>
                ) : (
                  <select
                    value={selectedStaffId || (staffList[0] ? staffList[0].id : '')}
                    onChange={e => setSelectedStaffId(e.target.value)}
                    className="w-full text-xs border border-slate-200 rounded-xl py-2.5 px-3 bg-white focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 font-semibold text-slate-700"
                  >
                    {staffList.map(s => (
                      <option key={s.id} value={s.id}>{s.fullName} ({s.role})</option>
                    ))}
                  </select>
                )}
              </div>

              <button
                type="submit"
                disabled={staffList.length === 0}
                className="w-full py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
              >
                Confirm Allocation
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Completion Report Overlay */}
      {reportVisitId && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h4 className="font-extrabold text-slate-800 text-sm">Submit Visit Completion Report</h4>
              <button onClick={() => setReportVisitId(null)} className="text-slate-400 hover:text-slate-605 text-xs font-extrabold">Close</button>
            </div>
            
            <form onSubmit={handleCompleteVisit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Completion Notes *</label>
                <textarea
                  value={completionNotes}
                  onChange={e => setCompletionNotes(e.target.value)}
                  placeholder="Describe physical measurements taken, items fabric selection..."
                  rows="3"
                  className="w-full text-xs border border-slate-200 rounded-xl p-2.5 focus:outline-none focus:border-brand-500"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Media Attachment URL (Optional)</label>
                <input
                  type="text"
                  value={mediaUrl}
                  onChange={e => setMediaUrl(e.target.value)}
                  placeholder="https://example.com/fitting-photo.jpg"
                  className="w-full text-xs border border-slate-200 rounded-xl py-2 px-3 focus:outline-none focus:border-brand-500"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs shadow-md transition-all"
              >
                Submit Completion File
              </button>
            </form>
          </div>
        </div>
      )}
      {/* Printable Worksheets (visible during print only) */}
      <div className="print-schedule-printout print-only text-slate-900 leading-relaxed font-mono p-5 bg-white">
        <h1 className="text-center font-bold text-lg border-b-4 border-double border-slate-900 pb-2 mb-1 uppercase tracking-wider text-black">
          MARCOS Tailoring Production Worksheet
        </h1>
        <div className="flex justify-between border-b border-slate-900 pb-2 mb-4 font-bold text-xs uppercase text-slate-800">
          <span>Date: {(() => {
            if (printDateRange === 'CUSTOM') {
              return `${printDateFrom || 'Start'} to ${printDateTo || 'End'}`;
            }
            const dateObj = new Date(printDate);
            return !isNaN(dateObj.getTime()) ? dateObj.toLocaleDateString(undefined, { dateStyle: 'long' }) : printDate;
          })()}</span>
          <span>Total Worksheets: {getCombinedPrintItems().length}</span>
          <span>Confidential - For Tailoring Workshop Use Only</span>
        </div>

        {getCombinedPrintItems().map((item, index) => (
          <div key={item.id} className="border-2 border-slate-900 p-5 mb-6 rounded-xl bg-white" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
            <div className="flex justify-between border-b-2 border-slate-900 pb-2 mb-3 font-bold text-xs">
              <span>WORKSHEET #{index + 1} ({item.type === 'STUDIO_FITTING' ? 'STUDIO FITTING' : 'HOME VISIT'})</span>
              <span>TIME SLOT: {item.timeSlot}</span>
            </div>

            <div className="grid grid-cols-2 gap-6 text-xs">
              {/* Customer Column */}
              <div>
                <span className="block border-b border-slate-200 font-bold text-[9px] uppercase text-slate-500 mb-1">Customer Info</span>
                {printFields.custName && <div><strong>Client Name:</strong> {item.userName}</div>}
                {printFields.custPhone && <div><strong>Phone:</strong> {item.phone || 'N/A'}</div>}
                {printFields.custEmail && <div><strong>Email:</strong> {item.email || 'N/A'}</div>}
                {printFields.custAddress && <div className="leading-tight"><strong>Address:</strong> {item.address || 'N/A'}</div>}
                {printFields.custGender && <div><strong>Gender:</strong> {item.gender || 'N/A'}</div>}
              </div>

              {/* Booking Column */}
              <div>
                <span className="block border-b border-slate-200 font-bold text-[9px] uppercase text-slate-500 mb-1">Booking Details</span>
                {printFields.apptType && <div><strong>Appt Type:</strong> {item.apptType}</div>}
                {printFields.apptStaff && <div><strong>Assigned Tailor:</strong> {item.assignedStaffName}</div>}
                {printFields.apptStatus && <div><strong>Status:</strong> {item.status}</div>}
                {printFields.apptNotes && <div className="leading-tight"><strong>Requirements/Notes:</strong> {item.notes || 'N/A'}</div>}
              </div>
            </div>

            {/* Order Specification */}
            {(printFields.orderInvoice || printFields.orderStatus || printFields.orderItems || printFields.orderFabric || printFields.orderCustoms || printFields.orderTailorNotes) && (
              <div className="mt-4 border-t border-slate-200 pt-3 text-xs">
                <span className="block font-bold text-[9px] uppercase text-slate-500 mb-1">Associated Order & Customizations</span>
                {item.order ? (
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-1">
                      {printFields.orderInvoice && <div><strong>Invoice No:</strong> {item.order.invoiceNumber}</div>}
                      {printFields.orderStatus && <div><strong>Order Stage:</strong> {item.order.status}</div>}
                      {printFields.orderFabric && <div><strong>Fabric Selected:</strong> {item.order.fabricType || 'As specified'}</div>}
                      {printFields.orderCustoms && <div className="leading-tight"><strong>Customizations:</strong> {item.order.customizations || 'None'}</div>}
                    </div>
                    <div className="space-y-1">
                      {printFields.orderTailorNotes && <div className="leading-tight"><strong>Order Tailor Notes:</strong> {item.order.tailorNotes || 'None'}</div>}
                      {printFields.orderItems && (
                        <div>
                          <strong>Ordered Apparel:</strong>
                          <ul className="list-disc list-inside mt-0.5 font-bold">
                            {item.order.orderItems?.map((p, i) => (
                              <li key={i}>{p.product?.name} (x{p.quantity})</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-slate-400 italic">No direct retail order linked.</div>
                )}
              </div>
            )}

            {/* Sizing Grid */}
            {hasAnyMeasurementFieldChecked() && (
              <div className="mt-4 border-t border-slate-200 pt-3 text-xs">
                <span className="block font-bold text-[9px] uppercase text-slate-500 mb-1">Sizing Measurements ({item.measurements?.profileName || 'Default Size'})</span>
                {item.measurements ? (
                  <div className="grid grid-cols-6 gap-2">
                    {Object.entries(MEASUREMENT_LABELS).map(([fieldKey, cfg]) => {
                      if (!printFields[fieldKey]) return null;
                      const val = item.measurements[cfg.key];
                      return (
                        <div key={fieldKey} className="border border-slate-300 p-1 text-center bg-slate-50 rounded">
                          <span className="text-[7px] text-slate-500 uppercase block font-bold">{cfg.label}</span>
                          <span className="font-extrabold text-[11px] text-slate-800">{val ? `${val}"` : '-'}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-slate-400 italic">No size profile registered. Sizing measurements must be taken.</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {/* ── Universal Print Modal ── */}
      {isUniversalPrintOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-lg shadow-2xl p-6 relative flex flex-col space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="font-extrabold text-slate-800 text-base flex items-center gap-2">
                <Printer className="w-5 h-5 text-brand-500" />
                <span>Universal Production Print Center</span>
              </h3>
              <button
                onClick={() => setIsUniversalPrintOpen(false)}
                className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="block text-[10px] text-slate-400 font-bold uppercase">Date Scope Filter</label>
                <select
                  value={printDateRange}
                  onChange={e => setPrintDateRange(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-brand-500 font-bold"
                >
                  <option value="ALL">All Time</option>
                  <option value="DAY">Specific Day Only</option>
                  <option value="WEEK">This Whole Week</option>
                  <option value="MONTH">This Whole Month</option>
                  <option value="CUSTOM">Specific Date Range (From - To)</option>
                </select>
              </div>

              {printDateRange === 'CUSTOM' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] text-slate-400 font-bold uppercase">From Date</label>
                    <input
                      type="date"
                      value={printDateFrom}
                      onChange={e => setPrintDateFrom(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-brand-500 font-semibold"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[10px] text-slate-400 font-bold uppercase">To Date</label>
                    <input
                      type="date"
                      value={printDateTo}
                      onChange={e => setPrintDateTo(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-brand-500 font-semibold"
                    />
                  </div>
                </div>
              )}

              {printDateRange === 'DAY' && (
                <div className="space-y-1.5">
                  <label className="block text-[10px] text-slate-400 font-bold uppercase">Select Date</label>
                  <input
                    type="date"
                    value={printDate}
                    onChange={e => setPrintDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-brand-500 font-semibold"
                  />
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-[10px] text-slate-400 font-bold uppercase">Include In Production Sheets</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-slate-700 font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={printIncludeFittings}
                      onChange={e => setPrintIncludeFittings(e.target.checked)}
                      className="rounded border-slate-350 text-brand-500 focus:ring-brand-500 w-4 h-4"
                    />
                    <span>Studio Fittings</span>
                  </label>
                  <label className="flex items-center gap-2 text-slate-700 font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={printIncludeVisits}
                      onChange={e => setPrintIncludeVisits(e.target.checked)}
                      className="rounded border-slate-350 text-brand-500 focus:ring-brand-500 w-4 h-4"
                    />
                    <span>Home Visits</span>
                  </label>
                </div>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Universal print gathers all matching fittings, visits, customer custom sizing, and fabric details for the selected scope, opening a clean page formatted specifically for standard paper printing.
                </p>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4 flex gap-3">
              <button
                type="button"
                onClick={() => setIsUniversalPrintOpen(false)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 font-bold text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  handlePrintWorksheets(getCombinedPrintItems());
                  setIsUniversalPrintOpen(false);
                }}
                disabled={getCombinedPrintItems().length === 0}
                className="flex-1 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-100 disabled:text-slate-400 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                <span>Generate &amp; Print ({getCombinedPrintItems().length})</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
