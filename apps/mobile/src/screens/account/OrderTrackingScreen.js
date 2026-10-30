import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Image,
  Animated,
  Linking,
  Modal,
  TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useTheme } from '../../styles/ThemeContext';
import api from '../../utils/api';
import { getSocket } from '../../utils/socket';
import {
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Circle,
  Package,
  Truck,
  ShoppingBag,
  XCircle,
  FileText,
  Headphones,
  AlertTriangle,
  RotateCcw,
  Clock,
  MapPin,
  Calendar,
  Scissors,
  Phone,
  X,
  Download,
  ShieldCheck,
} from 'lucide-react-native';

// ─── Stepper config ──────────────────────────────────────────────────────────
const STEPS = [
  { key: 'PENDING',          label: 'Product\nBooked',      icon: ShoppingBag,  offsetDays: 0 },
  { key: 'PAID',             label: 'Measurement',          icon: Scissors,     offsetDays: 1 },
  { key: 'PROCESSING',       label: 'Order\nStitching',     icon: Package,      offsetDays: 3 },
  { key: 'SHIPPED',          label: 'Product\nCompleted',   icon: CheckCircle2, offsetDays: 5 },
  { key: 'OUT_FOR_DELIVERY', label: 'Ready to\nDeliver',    icon: Truck,        offsetDays: 7 },
  { key: 'DELIVERED',        label: 'Delivered',            icon: CheckCircle2, offsetDays: 7 },
];

const STATUS_ORDER = ['PENDING', 'PAID', 'PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'];

const formatCustomizationDetails = (groups = []) => (Array.isArray(groups) ? groups : []).flatMap(group =>
  (group.options || []).map(option => `${group.name}: ${option.name}${Number(option.price) > 0 ? ` (+₹${Number(option.price).toLocaleString('en-IN')} each)` : ''}`)
);

function getStepIndex(status) {
  const idx = STATUS_ORDER.indexOf(status);
  return idx === -1 ? 0 : idx;
}

function getStatusBadgeConfig(status) {
  switch (status) {
    case 'DELIVERED': return { bg: '#ecfdf5', border: '#a7f3d0', text: '#059669', dot: '#10b981' };
    case 'OUT_FOR_DELIVERY': return { bg: '#ecfeff', border: '#a5f3fc', text: '#0891b2', dot: '#06b6d4' };
    case 'SHIPPED': return { bg: '#f5f3ff', border: '#ddd6fe', text: '#7c3aed', dot: '#8b5cf6' };
    case 'PROCESSING': return { bg: '#eff6ff', border: '#bfdbfe', text: '#2563eb', dot: '#3b82f6' };
    case 'PAID': return { bg: '#faf5ff', border: '#f3e8ff', text: '#9333ea', dot: '#a855f7' };
    case 'CANCELLED': return { bg: '#fef2f2', border: '#fecaca', text: '#dc2626', dot: '#ef4444' };
    default: return { bg: '#fffbeb', border: '#fef3c7', text: '#d97706', dot: '#f59e0b' };
  }
}

function getStatusLabelText(status) {
  switch (status) {
    case 'PENDING': return 'Product Booked';
    case 'PAID': return 'Measurement';
    case 'PROCESSING': return 'Order Stitching';
    case 'SHIPPED': return 'Product Completed';
    case 'OUT_FOR_DELIVERY': return 'Ready to Deliver';
    case 'DELIVERED': return 'Delivered';
    default: return status;
  }
}

function getPaymentStatusLabel(order) {
  if (order.status === 'CANCELLED') return null;
  if (order.paymentStatus === 'COMPLETED') return null;
  
  const history = Array.isArray(order.paymentHistory) ? order.paymentHistory : [];
  const hasAdvance = Number(order.advancePayment) > 0 || history.length > 0;
  if (hasAdvance) return 'Advance Paid';
  
  return 'Unpaid';
}

function getOrderStatusLabel(status) {
  switch (status) {
    case 'CANCELLED': return 'Cancelled';
    case 'PENDING': return 'Order Placed';
    case 'PAID': return 'Measurement';
    case 'PROCESSING': return 'In Stitching';
    case 'SHIPPED': return 'Product Completed';
    case 'OUT_FOR_DELIVERY': return 'Ready for Delivery';
    case 'DELIVERED': return 'Delivered';
    default: return status;
  }
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// ─── Skeleton ────────────────────────────────────────────────────────────────
function SkeletonBox({ width, height, style }) {
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return (
    <Animated.View
      style={[{ width, height, borderRadius: 10, backgroundColor: '#e2e8f0', opacity }, style]}
    />
  );
}

function OrderTrackingSkeleton({ theme }) {
  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 50 }} showsVerticalScrollIndicator={false}>
      <SkeletonBox width={160} height={14} style={{ marginBottom: 6 }} />
      <SkeletonBox width={100} height={10} style={{ marginBottom: 28 }} />
      {/* Stepper skeleton */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 32 }}>
        {[0, 1, 2, 3, 4].map(i => (
          <View key={i} style={{ alignItems: 'center', gap: 6 }}>
            <SkeletonBox width={36} height={36} style={{ borderRadius: 18 }} />
            <SkeletonBox width={44} height={8} />
          </View>
        ))}
      </View>
      {/* Items skeleton */}
      {[1, 2].map(k => (
        <View key={k} style={{ flexDirection: 'row', gap: 14, marginBottom: 16 }}>
          <SkeletonBox width={64} height={64} style={{ borderRadius: 14 }} />
          <View style={{ gap: 8, justifyContent: 'center', flex: 1 }}>
            <SkeletonBox width="75%" height={12} />
            <SkeletonBox width="45%" height={10} />
            <SkeletonBox width="30%" height={14} />
          </View>
        </View>
      ))}
      <SkeletonBox width="100%" height={100} style={{ borderRadius: 16, marginTop: 8 }} />
    </ScrollView>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function OrderTrackingScreen({ route, navigation }) {
  const { orderId } = route.params;
  const { theme, fonts, shadows } = useTheme();

  const [order, setOrder] = useState(null);
  const [expandedAddons, setExpandedAddons] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [respondingQuick, setRespondingQuick] = useState(false);
  const [isRejectingQuickOrder, setIsRejectingQuickOrder] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [liveUpdateAlert, setLiveUpdateAlert] = useState(null);

  // Rescheduling states
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [newDate, setNewDate] = useState(null);
  const [newTimeSlot, setNewTimeSlot] = useState(null);
  const [newNotes, setNewNotes] = useState('');
  const [rescheduling, setRescheduling] = useState(false);
  const [systemSettings, setSystemSettings] = useState(null);
  const [timeSlots, setTimeSlots] = useState([]);

  // Animation values
  const progressAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Animated pulse for current step dot
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
    
    // Fetch settings for dynamic slots
    api.get('/system/settings/public').then(res => {
      if (res && res.success && res.data) {
        setSystemSettings(res.data);
        const s = res.data;
        const slots = [];
        const [startH, startM] = (s.businessHoursStart || '09:00').split(':').map(Number);
        const [endH, endM] = (s.businessHoursEnd || '18:00').split(':').map(Number);
        const duration = s.bookingSlotDurationMinutes || 60;
        
        let currentMins = startH * 60 + startM;
        const endMins = endH * 60 + endM;
        
        while (currentMins + duration <= endMins) {
          const sh = Math.floor(currentMins / 60);
          const sm = currentMins % 60;
          const eh = Math.floor((currentMins + duration) / 60);
          const em = (currentMins + duration) % 60;
          
          const formatTime = (h, m) => {
            const period = h >= 12 ? 'PM' : 'AM';
            const h12 = h % 12 || 12;
            const mStr = m.toString().padStart(2, '0');
            return `${h12}:${mStr} ${period}`;
          };
          
          slots.push(`${formatTime(sh, sm)} - ${formatTime(eh, em)}`);
          currentMins += duration;
        }
        setTimeSlots(slots);
      } else {
        setTimeSlots(['10:00 AM - 11:30 AM', '11:30 AM - 01:00 PM', '02:00 PM - 03:30 PM', '04:00 PM - 05:30 PM']);
      }
    }).catch(() => {
        setTimeSlots(['10:00 AM - 11:30 AM', '11:30 AM - 01:00 PM', '02:00 PM - 03:30 PM', '04:00 PM - 05:30 PM']);
    });

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.35, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // ── Effect 1: re-fetch on every screen focus (source of truth) ────────────
  const loadOrder = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/orders/${orderId}`);
      if (res.success) setOrder(res.data);
      else setError('Could not load order details.');
    } catch (err) {
      setError(err.message || 'Failed to load order. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useFocusEffect(
    useCallback(() => {
      loadOrder();
    }, [loadOrder])
  );

  // ── Effect 2: socket listener — mount once, unmount once ──────────────────
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handler = ({ orderId: id, newStatus }) => {
      if (id === orderId) {
        if (newStatus) {
          setOrder(prev => prev ? { ...prev, status: newStatus } : prev);
          setLiveUpdateAlert({
            status: newStatus,
            message: `Order status updated to: ${getOrderStatusLabel(newStatus)}`,
          });
          setTimeout(() => setLiveUpdateAlert(null), 7000);
        }
        loadOrder();
      }
    };
    socket.on('order:status_changed', handler);
    return () => socket.off('order:status_changed', handler);
  }, [orderId, loadOrder]);

  // ── Cancel handler ────────────────────────────────────────────────────────
  const handleCancel = () => {
    Alert.alert(
      'Cancel Order',
      'Are you sure you want to cancel this order? This action cannot be undone.',
      [
        { text: 'Keep Order', style: 'cancel' },
        {
          text: 'Cancel Order',
          style: 'destructive',
          onPress: async () => {
            setCancelling(true);
            try {
              const res = await api.post(`/orders/${orderId}/cancel`);
              if (res.success) {
                Alert.alert('Order Cancelled', res.message || 'Your order has been cancelled.', [
                  { text: 'OK', onPress: () => navigation.goBack() },
                ]);
              }
            } catch (err) {
              Alert.alert('Error', err.message || 'Failed to cancel order. Please try again.');
            } finally {
              setCancelling(false);
            }
          },
        },
      ]
    );
  };

  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  useEffect(() => {
    if (route?.params?.autoOpenInvoice) {
      setShowInvoiceModal(true);
      navigation.setParams({ autoOpenInvoice: undefined });
    }
  }, [route?.params]);

  // ── Invoice handler ───────────────────────────────────────────────────────
  // Always open the in-app Tax Invoice modal — never redirect to Drive/external URL
  const handleInvoice = () => {
    setShowInvoiceModal(true);
  };

  // ─── Header (always rendered) ─────────────────────────────────────────────
  const renderHeader = () => (
    <View style={[styles.headerBar, { backgroundColor: theme.bg.main }]}>
      <TouchableOpacity
        style={[styles.headerBtn, shadows.premium, { backgroundColor: theme.bg.card }]}
        onPress={() => navigation.goBack()}
        activeOpacity={0.7}
      >
        <ChevronLeft size={20} color={theme.text.primary} />
      </TouchableOpacity>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text style={[styles.headerTitle, { fontFamily: fonts.bold, color: theme.text.primary }]}>
          Order Tracking
        </Text>
        {order && (
          <Text style={[styles.headerSub, { fontFamily: fonts.regular, color: theme.text.muted }]}>
            #{order.invoiceNumber?.split('-').pop() || orderId.slice(-6)}
          </Text>
        )}
      </View>
      <View style={{ width: 40 }} />
    </View>
  );

  // ─── Error state ──────────────────────────────────────────────────────────
  if (!loading && error) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg.main }]}>
        <StatusBar barStyle="dark-content" />
        {renderHeader()}
        <View style={styles.errorWrap}>
          <View style={[styles.errorIconCircle, { backgroundColor: '#fef2f2' }]}>
            <AlertTriangle size={36} color="#ef4444" />
          </View>
          <Text style={[styles.errorTitle, { fontFamily: fonts.bold, color: theme.text.primary }]}>
            Couldn't Load Order
          </Text>
          <Text style={[styles.errorMsg, { fontFamily: fonts.regular, color: theme.text.secondary }]}>
            {error}
          </Text>
          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: theme.brand[500] }]}
            onPress={loadOrder}
            activeOpacity={0.85}
          >
            <RotateCcw size={15} color="#fff" />
            <Text style={[styles.retryBtnText, { fontFamily: fonts.bold }]}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Skeleton state ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg.main }]}>
        <StatusBar barStyle="dark-content" />
        {renderHeader()}
        <OrderTrackingSkeleton theme={theme} />
      </View>
    );
  }

  if (!order) return null;

  const isCancelled = order.status === 'CANCELLED' || (order.isQuickOrder && order.quickOrderStatus === 'REJECTED');
  const currentStepIdx = getStepIndex(order.status);
  const canCancel = ['PENDING', 'PAID'].includes(order.status) && !(order.isQuickOrder && order.quickOrderStatus === 'REJECTED');

  const handleRespondToQuickOrder = async (action) => {
    if (action === 'REJECT' && !rejectNote.trim()) {
      Alert.alert('Required', 'Please explain why you are rejecting the date.');
      return;
    }
    setRespondingQuick(true);
    try {
      const res = await api.post(`/orders/${orderId}/quick-respond`, { 
        action, 
        userRejectionNote: action === 'REJECT' ? rejectNote.trim() : undefined 
      });
      if (res.success) {
        Alert.alert(
          action === 'ACCEPT' ? 'Proposal Accepted' : 'Proposal Rejected',
          action === 'ACCEPT' 
            ? 'You have accepted the new delivery date. Awaiting final Admin confirmation.'
            : 'You have rejected the date proposal with your reason.'
        );
        setIsRejectingQuickOrder(false);
        setRejectNote('');
        loadOrder();
      } else {
        Alert.alert('Error', res.message || 'Failed to respond to proposal.');
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'An error occurred. Please try again.');
    } finally {
      setRespondingQuick(false);
    }
  };

  // ─── Quick Order Banner ───────────────────────────────────────────────────
  const renderQuickOrderCard = () => {
    if (!order.isQuickOrder) return null;

    const reqDate = order.quickOrderExpectedDate 
      ? new Date(order.quickOrderExpectedDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      : 'N/A';
      
    const propDate = order.quickOrderProposedDate
      ? new Date(order.quickOrderProposedDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      : 'N/A';

    return (
      <View style={[styles.quickOrderCard, shadows.premium, { backgroundColor: theme.bg.card, borderColor: theme.border }]}>
        <View style={styles.quickOrderHeader}>
          <Clock size={16} color={theme.brand[500]} />
          <Text style={[styles.quickOrderTitle, { fontFamily: fonts.bold, color: theme.text.primary }]}>
            Quick Order Request
          </Text>
        </View>

        <View style={styles.quickOrderBody}>
          {order.quickOrderStatus === 'PENDING' && (
            <View style={[styles.quickAlert, { backgroundColor: '#fffbeb', borderColor: '#fef3c7' }]}>
              <Text style={[styles.quickAlertTitle, { fontFamily: fonts.bold, color: '#d97706' }]}>
                Awaiting Admin Approval
              </Text>
              <Text style={[styles.quickAlertMsg, { fontFamily: fonts.regular, color: '#b45309' }]}>
                Requested Date: {reqDate}
              </Text>
            </View>
          )}

          {order.quickOrderStatus === 'DATE_CHANGE_PROPOSED' && (
            <View style={[styles.quickAlert, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }]}>
              <Text style={[styles.quickAlertTitle, { fontFamily: fonts.bold, color: '#2563eb' }]}>
                Admin Proposed Delivery Date Change
              </Text>
              <Text style={[styles.quickAlertMsg, { fontFamily: fonts.regular, color: '#1d4ed8', marginTop: 4 }]}>
                The administrator proposed to deliver your order on <Text style={{ fontFamily: fonts.bold }}>{propDate}</Text> instead of your requested date ({reqDate}).
              </Text>
              {order.adminProposalNote && (
                <View style={{ marginTop: 8, padding: 8, backgroundColor: 'rgba(29, 78, 216, 0.05)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(29, 78, 216, 0.1)' }}>
                  <Text style={{ fontFamily: fonts.bold, fontSize: 11, color: '#1d4ed8', marginBottom: 2 }}>Admin's Note:</Text>
                  <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: '#1d4ed8' }}>{order.adminProposalNote}</Text>
                </View>
              )}

              {isRejectingQuickOrder ? (
                <View style={{ marginTop: 12 }}>
                  <TextInput
                    style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 8, padding: 10, fontFamily: fonts.regular, fontSize: 13, color: '#1e293b', textAlignVertical: 'top' }}
                    placeholder="Why are you rejecting this date?"
                    multiline
                    numberOfLines={3}
                    value={rejectNote}
                    onChangeText={setRejectNote}
                  />
                  <View style={[styles.quickActionsContainer, { marginTop: 8 }]}>
                    <TouchableOpacity
                      style={[styles.quickRejectBtn, { borderColor: '#94a3b8', flex: 0.5 }]}
                      onPress={() => setIsRejectingQuickOrder(false)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.quickRejectBtnText, { fontFamily: fonts.bold, color: '#64748b' }]}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.quickAcceptBtn, { backgroundColor: '#ef4444', flex: 1 }]}
                      onPress={() => handleRespondToQuickOrder('REJECT')}
                      disabled={respondingQuick}
                      activeOpacity={0.8}
                    >
                      {respondingQuick ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[styles.quickAcceptBtnText, { fontFamily: fonts.bold, color: '#fff' }]}>Submit Rejection</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.quickActionsContainer}>
                  <TouchableOpacity
                    style={[styles.quickRejectBtn, { borderColor: '#ef4444' }]}
                    onPress={() => setIsRejectingQuickOrder(true)}
                    disabled={respondingQuick}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.quickRejectBtnText, { fontFamily: fonts.bold, color: '#ef4444' }]}>
                      Reject Proposal
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.quickAcceptBtn, { backgroundColor: theme.brand[500] }]}
                    onPress={() => handleRespondToQuickOrder('ACCEPT')}
                    disabled={respondingQuick}
                    activeOpacity={0.8}
                  >
                    {respondingQuick ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={[styles.quickAcceptBtnText, { fontFamily: fonts.bold, color: '#fff' }]}>
                        Accept Date
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {order.quickOrderStatus === 'USER_REJECTED_PROPOSAL' && (
            <View style={[styles.quickAlert, { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]}>
              <Text style={[styles.quickAlertTitle, { fontFamily: fonts.bold, color: '#dc2626' }]}>
                You Rejected the Proposed Date
              </Text>
              <Text style={[styles.quickAlertMsg, { fontFamily: fonts.regular, color: '#b91c1c', marginTop: 4 }]}>
                Awaiting Admin response to your rejection.
              </Text>
              {order.userRejectionNote && (
                <View style={{ marginTop: 8, padding: 8, backgroundColor: 'rgba(220, 38, 38, 0.05)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(220, 38, 38, 0.1)' }}>
                  <Text style={{ fontFamily: fonts.bold, fontSize: 11, color: '#b91c1c', marginBottom: 2 }}>Your Reason:</Text>
                  <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: '#b91c1c' }}>{order.userRejectionNote}</Text>
                </View>
              )}
            </View>
          )}

          {order.quickOrderStatus === 'ADMIN_FINAL_APPROVAL_PENDING' && (
            <View style={[styles.quickAlert, { backgroundColor: '#faf5ff', borderColor: '#e9d5ff' }]}>
              <Text style={[styles.quickAlertTitle, { fontFamily: fonts.bold, color: '#9333ea' }]}>
                Awaiting Final Confirmation
              </Text>
              <Text style={[styles.quickAlertMsg, { fontFamily: fonts.regular, color: '#7e22ce', marginTop: 4 }]}>
                You have accepted the date. Waiting for the Admin to finalize your Quick Order.
              </Text>
            </View>
          )}

          {order.quickOrderStatus === 'APPROVED' && (
            <View style={[styles.quickAlert, { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' }]}>
              <Text style={[styles.quickAlertTitle, { fontFamily: fonts.bold, color: '#059669' }]}>
                Quick Order Approved
              </Text>
              <Text style={[styles.quickAlertMsg, { fontFamily: fonts.regular, color: '#047857' }]}>
                Expected Delivery: {reqDate}
              </Text>
            </View>
          )}

          {order.quickOrderStatus === 'REJECTED' && (
            <View style={[styles.quickAlert, { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]}>
              <Text style={[styles.quickAlertTitle, { fontFamily: fonts.bold, color: '#dc2626' }]}>
                Quick Order Rejected
              </Text>
              <Text style={[styles.quickAlertMsg, { fontFamily: fonts.regular, color: '#b91c1c' }]}>
                This quick order request has been rejected.
              </Text>
            </View>
          )}

          {order.quickOrderReason && (
            <View style={[styles.quickReasonContainer, { backgroundColor: theme.bg.input }]}>
              <Text style={[styles.quickReasonLabel, { fontFamily: fonts.bold, color: theme.text.secondary }]}>
                Reason:
              </Text>
              <Text style={[styles.quickReasonText, { fontFamily: fonts.regular, color: theme.text.primary }]}>
                {order.quickOrderReason}
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  // ─── Cancelled banner ─────────────────────────────────────────────────────
  const renderCancelledBanner = () => (
    <View style={[styles.cancelledBanner, { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]}>
      <XCircle size={24} color="#ef4444" />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={[styles.cancelledTitle, { fontFamily: fonts.bold, color: '#dc2626' }]}>
          Order Cancelled
        </Text>
        <Text style={[styles.cancelledMsg, { fontFamily: fonts.regular, color: '#ef4444' }]}>
          {order.paymentStatus === 'REFUNDED'
            ? 'A refund will be processed within 5–7 business days.'
            : 'This order has been cancelled.'}
        </Text>
      </View>
    </View>
  );

  // ─── Progress stepper ─────────────────────────────────────────────────────
  const renderStepper = () => (
    <View style={[styles.stepperCard, shadows.premium, { backgroundColor: theme.bg.card, borderWidth: 1, borderColor: theme.border }]}>
      <Text style={[styles.stepperTitle, { fontFamily: fonts.bold, color: theme.text.primary }]}>
        Order Progress
      </Text>
      <View style={styles.stepperRow}>
        {STEPS.map((step, idx) => {
          const StepIcon = step.icon;
          const isDone = idx < currentStepIdx;
          const isCurrent = idx === currentStepIdx;
          const isFuture = idx > currentStepIdx;
          const textColor = isFuture ? theme.text.muted : theme.text.primary;
          const estDate = addDays(order.createdAt, step.offsetDays);

          return (
            <React.Fragment key={step.key}>
              <View style={styles.stepItem}>
                {/* Step circle */}
                {isCurrent ? (
                  <Animated.View
                    style={[
                      styles.stepCircle,
                      { backgroundColor: theme.brand[500], transform: [{ scale: pulseAnim }] },
                    ]}
                  >
                    <StepIcon size={14} color="#fff" />
                  </Animated.View>
                ) : isDone ? (
                  <View style={[styles.stepCircle, { backgroundColor: theme.brand[500] }]}>
                    <CheckCircle2 size={14} color="#fff" />
                  </View>
                ) : (
                  <View style={[styles.stepCircle, { backgroundColor: theme.bg.input, borderWidth: 1.5, borderColor: theme.border }]}>
                    <Circle size={10} color={theme.text.muted} />
                  </View>
                )}
                <Text
                  style={[styles.stepLabel, { fontFamily: isCurrent ? fonts.bold : fonts.regular, color: textColor }]}
                  numberOfLines={2}
                >
                  {step.label}
                </Text>
                <Text style={[styles.stepDate, { fontFamily: fonts.regular, color: theme.text.muted }]}>
                  {isDone || isCurrent ? estDate : '—'}
                </Text>
              </View>
              {/* Connector line */}
              {idx < STEPS.length - 1 && (
                <View style={[styles.connector, { backgroundColor: idx < currentStepIdx ? theme.brand[500] : theme.border }]} />
              )}
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );

  // ─── Order items ──────────────────────────────────────────────────────────
  const renderItems = () => (
    <View style={[styles.sectionCard, shadows.premium, { backgroundColor: theme.bg.card }]}>
      <Text style={[styles.sectionTitle, { fontFamily: fonts.bold, color: theme.text.primary }]}>
        Items Ordered
      </Text>
      {order.orderItems?.map((item, idx) => (
        <View
          key={item.id}
          style={[styles.itemRow, idx < order.orderItems.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}
        >
          <View style={[styles.itemImgBox, { backgroundColor: theme.bg.input }]}>
            {item.product?.images?.[0] ? (
              <Image source={{ uri: item.product.images[0] }} style={styles.itemImg} />
            ) : (
              <Package size={22} color={theme.text.muted} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.itemName, { fontFamily: fonts.bold, color: theme.text.primary }]} numberOfLines={2}>
              {item.product?.name || 'Bespoke Item'}
            </Text>
            <Text style={[styles.itemQty, { fontFamily: fonts.regular, color: theme.text.secondary }]}>
              Qty: {item.quantity}
            </Text>
            {(() => {
              const addonOptions = (Array.isArray(item.selectedCustomizations) ? item.selectedCustomizations : []).flatMap(group =>
                (group.options || []).map(option => ({ group: group.name, ...option }))
              );
              const addonTotal = addonOptions.reduce((sum, option) => sum + (Number(option.price) || 0) * Number(item.quantity || 1), 0);
              const lineTotal = Number(item.price) * Number(item.quantity || 1);
              const expanded = !!expandedAddons[item.id];
              return (
                <>
                  <Text style={{ fontSize: 11, lineHeight: 16, marginTop: 5, fontFamily: fonts.regular, color: theme.text.secondary }}>
                    Product price: â‚¹{Math.max(0, lineTotal - addonTotal).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </Text>
                  {addonOptions.length > 0 && (
                    <>
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={`${expanded ? 'Hide' : 'Show'} add-ons`}
                        onPress={() => setExpandedAddons(previous => ({ ...previous, [item.id]: !previous[item.id] }))}
                        style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 }}
                      >
                        <Text style={{ fontSize: 11, fontFamily: fonts.medium, color: theme.text.secondary }}>
                          Add-ons: â‚¹{addonTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </Text>
                        {expanded ? <ChevronUp size={13} color={theme.text.secondary} /> : <ChevronDown size={13} color={theme.text.secondary} />}
                      </TouchableOpacity>
                      {expanded && addonOptions.map((option, optionIndex) => (
                        <View key={`${item.id}-addon-${optionIndex}`} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
                          <Text style={{ flex: 1, fontSize: 10.5, lineHeight: 15, fontFamily: fonts.regular, color: theme.text.secondary }}>
                            {option.group}: {option.name}
                          </Text>
                          <Text style={{ fontSize: 10.5, fontFamily: fonts.medium, color: theme.text.secondary }}>
                            â‚¹{((Number(option.price) || 0) * Number(item.quantity || 1)).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </Text>
                        </View>
                      ))}
                    </>
                  )}
                </>
              );
            })()}
          </View>
          <Text style={[styles.itemPrice, { fontFamily: fonts.bold, color: theme.text.primary }]}>
            ₹{(Number(item.price) * item.quantity).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </Text>
        </View>
      ))}
    </View>
  );

  // ─── Price breakdown ──────────────────────────────────────────────────────
  const renderPriceBreakdown = () => {
    const hasAdvance = Number(order.advancePayment) > 0;
    const history = Array.isArray(order.paymentHistory) ? order.paymentHistory : [];

    return (
      <View style={[styles.sectionCard, shadows.premium, { backgroundColor: theme.bg.card }]}>
        <Text style={[styles.sectionTitle, { fontFamily: fonts.bold, color: theme.text.primary }]}>
          Payment Summary
        </Text>
        {[
          { label: 'Subtotal', value: `₹${Number(order.totalAmount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` },
          { label: 'Discount', value: `-₹${Number(order.discountAmount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`, color: '#10b981' },
          { label: `GST (${order.gstPercentage !== undefined && order.gstPercentage !== null ? order.gstPercentage : 18}%)`, value: `₹${Number(order.taxAmount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` },
        ].map(row => (
          <View key={row.label} style={styles.priceRow}>
            <Text style={[styles.priceLabel, { fontFamily: fonts.regular, color: theme.text.secondary }]}>{row.label}</Text>
            <Text style={[styles.priceValue, { fontFamily: fonts.semiBold, color: row.color || theme.text.primary }]}>{row.value}</Text>
          </View>
        ))}
        <View style={[styles.priceDivider, { backgroundColor: theme.border }]} />
        <View style={styles.priceRow}>
          <Text style={[styles.priceLabel, { fontFamily: fonts.bold, color: theme.text.primary, fontSize: 14 }]}>Expected Amount</Text>
          <Text style={[styles.priceValue, { fontFamily: fonts.bold, color: theme.brand[500], fontSize: 16 }]}>
            ₹{Number(order.payableAmount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </Text>
        </View>

        {hasAdvance && (
          <View style={[styles.priceRow, { marginTop: 8 }]}>
            <Text style={[styles.priceLabel, { fontFamily: fonts.regular, color: '#047857' }]}>Advance Paid</Text>
            <Text style={[styles.priceValue, { fontFamily: fonts.semiBold, color: '#047857' }]}>
              -₹{Number(order.advancePayment).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </Text>
          </View>
        )}

        {history.length > 0 && (
          <View style={{ marginTop: 8, padding: 12, backgroundColor: theme.bg.input, borderRadius: 12 }}>
            <Text style={{ fontFamily: fonts.semiBold, fontSize: 12, color: theme.text.primary, marginBottom: 8 }}>Additional Payments</Text>
            {history.map((pay, idx) => (
              <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <View>
                  <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: theme.text.secondary }}>
                    Paid via {pay.method}
                  </Text>
                  {pay.date && (
                    <Text style={{ fontFamily: fonts.regular, fontSize: 10, color: theme.text.muted }}>
                      {new Date(pay.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </Text>
                  )}
                </View>
                <Text style={{ fontFamily: fonts.semiBold, fontSize: 13, color: '#047857' }}>
                  -₹{Number(pay.amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </Text>
              </View>
            ))}
          </View>
        )}

        {(hasAdvance || history.length > 0) && (
          <>
            <View style={[styles.priceDivider, { backgroundColor: theme.border, marginVertical: 12 }]} />
            <View style={styles.priceRow}>
              <Text style={[styles.priceLabel, { fontFamily: fonts.bold, color: '#dc2626' }]}>Balance Due</Text>
              <Text style={[styles.priceValue, { fontFamily: fonts.bold, color: '#dc2626' }]}>
                ₹{Number(order.balanceAmount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </Text>
            </View>
          </>
        )}
        
        <View style={[styles.payMethodBadge, { backgroundColor: order.paymentStatus === 'COMPLETED' ? '#dcfce7' : theme.bg.input }]}>
          <Text style={[styles.payMethodText, { fontFamily: fonts.medium, color: order.paymentStatus === 'COMPLETED' ? '#166534' : theme.text.secondary }]}>
            {order.paymentStatus === 'COMPLETED' 
              ? `Payment Collected` 
              : `Payment to be collected by Admin`}
            {order.paymentStatus === 'REFUNDED' ? ' · Refund Initiated' : ''}
          </Text>
        </View>
      </View>
    );
  };

  // ─── Action buttons ───────────────────────────────────────────────────────
  const renderActions = () => (
    <View style={styles.actionsRow}>
      <TouchableOpacity
        style={[styles.actionBtn, shadows.premium, { backgroundColor: theme.bg.card, borderWidth: 1, borderColor: theme.border }]}
        onPress={() => navigation.navigate('Support', { orderId: order.id })}
        activeOpacity={0.8}
      >
        <Headphones size={18} color={theme.text.primary} />
        <Text style={[styles.actionBtnText, { fontFamily: fonts.bold, color: theme.text.primary }]}>Need Support / Help</Text>
      </TouchableOpacity>

      {/* Cancel button: only rendered for PENDING or PAID — not shown for other statuses */}
      {canCancel && (
        <TouchableOpacity
          style={[styles.actionBtn, shadows.premium, { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', flex: 0.6 }]}
          onPress={handleCancel}
          disabled={cancelling}
          activeOpacity={0.8}
        >
          {cancelling ? (
            <ActivityIndicator size="small" color="#ef4444" />
          ) : (
            <XCircle size={18} color="#ef4444" />
          )}
          <Text style={[styles.actionBtnText, { fontFamily: fonts.bold, color: '#ef4444' }]}>Cancel Order</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderBookingDetails = () => {
    const booking = order.booking;
    const isStudio = booking.type === 'STUDIO';
    const statusColor = booking.status === 'CONFIRMED' || booking.status === 'COMPLETED' ? '#16a34a' : '#f59e0b';
    const statusBg = booking.status === 'CONFIRMED' || booking.status === 'COMPLETED' ? '#f0fdf4' : '#fffbeb';
    
    // Parse Date
    const bDate = new Date(booking.date);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    
    const dayName = weekdays[bDate.getUTCDay()];
    const dayNum = bDate.getUTCDate();
    const monthYear = `${months[bDate.getUTCMonth()]} ${bDate.getUTCFullYear()}`;

    const handleReschedule = () => {
      const bDate = new Date(booking.date);
      const localDate = new Date(bDate.getUTCFullYear(), bDate.getUTCMonth(), bDate.getUTCDate());
      setNewDate(localDate);
      setNewTimeSlot(booking.timeSlot || '10:00 AM - 11:30 AM');
      setNewNotes(booking.notes || booking.requirements || '');
      setShowRescheduleModal(true);
    };

    return (
      <View style={[styles.premiumBookingCard, shadows.premium, { backgroundColor: theme.bg.card }]}>
        {/* Header with status */}
        <View style={styles.bookingHeader}>
          <View style={styles.bookingTitleContainer}>
            <View style={[styles.scissorsIconContainer, { backgroundColor: theme.brand[50] }]}>
              <Scissors size={16} color={theme.brand[500]} />
            </View>
            <View>
              <Text style={[styles.bookingTitleText, { fontFamily: fonts.bold, color: theme.text.primary }]}>
                Bespoke Fitting Session
              </Text>
              <Text style={[styles.bookingSubtitleText, { fontFamily: fonts.regular, color: theme.text.muted }]}>
                Step 2 of your tailoring journey
              </Text>
            </View>
          </View>
          <View style={[styles.bookingStatusBadge, { backgroundColor: statusBg }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.bookingStatusText, { fontFamily: fonts.bold, color: statusColor }]}>
              {booking.status}
            </Text>
          </View>
        </View>

        {/* Date, Time & Session type block */}
        <View style={[styles.bookingDetailsContainer, { borderColor: theme.border }]}>
          {/* Appointment Type */}
          <View style={styles.bookingInfoRow}>
            <View style={[styles.infoIconBox, { backgroundColor: isStudio ? '#eff6ff' : '#fef2f2' }]}>
              {isStudio ? (
                <ShoppingBag size={14} color="#3b82f6" />
              ) : (
                <MapPin size={14} color="#ef4444" />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.infoLabelText, { fontFamily: fonts.regular, color: theme.text.secondary }]}>
                Session Mode
              </Text>
              <Text style={[styles.infoValueText, { fontFamily: fonts.semiBold, color: theme.text.primary }]}>
                {isStudio ? 'Bespoke Studio Visit' : 'Tailor Home Visit'}
              </Text>
            </View>
          </View>

          {/* Date & Time Row */}
          <View style={styles.dateTimeGridRow}>
            {/* Calendar slot */}
            <View style={[styles.gridSlotBox, { backgroundColor: theme.bg.input }]}>
              <Calendar size={14} color={theme.brand[500]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.gridSlotLabel, { fontFamily: fonts.regular, color: theme.text.secondary }]}>
                  Fitting Date
                </Text>
                <Text style={[styles.gridSlotValue, { fontFamily: fonts.bold, color: theme.text.primary }]}>
                  {dayName}, {dayNum} {monthYear}
                </Text>
              </View>
            </View>

            {/* Time slot */}
            <View style={[styles.gridSlotBox, { backgroundColor: theme.bg.input }]}>
              <Clock size={14} color={theme.brand[500]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.gridSlotLabel, { fontFamily: fonts.regular, color: theme.text.secondary }]}>
                  Time Window
                </Text>
                <Text style={[styles.gridSlotValue, { fontFamily: fonts.bold, color: theme.text.primary }]}>
                  {booking.timeSlot}
                </Text>
              </View>
            </View>
          </View>

          {/* Notes / Special Instructions */}
          {((booking.notes && isStudio) || (booking.requirements && !isStudio)) && (
            <View style={[styles.instructionsBox, { backgroundColor: theme.bg.input }]}>
              <Text style={[styles.instructionsLabel, { fontFamily: fonts.semiBold, color: theme.text.secondary }]}>
                Instructions & Preferences:
              </Text>
              <Text style={[styles.instructionsText, { fontFamily: fonts.regular, color: theme.text.primary }]}>
                {isStudio ? booking.notes : booking.requirements}
              </Text>
            </View>
          )}

          {/* Interactive Guidelines Help Text */}
          <View style={styles.guidelinesBox}>
            <Text style={[styles.guidelinesText, { fontFamily: fonts.medium, color: theme.text.muted }]}>
              {isStudio
                ? "📍 Please arrive at our Couture Studio 10 minutes prior to your slot. Bring any design inspirations you have."
                : "🚗 Our master tailor will bring fabrics, swatches, and measurement tools to your doorstep. Please ensure availability."}
            </Text>
          </View>
        </View>

        {/* Action Buttons Row */}
        <View style={styles.bookingActionsRow}>
          <TouchableOpacity 
            style={[styles.bookingSecondaryBtn, { borderColor: theme.border }]} 
            onPress={handleReschedule}
            activeOpacity={0.7}
          >
            <Calendar size={13} color={theme.text.primary} />
            <Text style={[styles.bookingSecondaryBtnText, { fontFamily: fonts.semiBold, color: theme.text.primary }]}>
              Reschedule
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.bookingPrimaryBtn, { backgroundColor: theme.brand[500] }]} 
            onPress={() => navigation.navigate('Support', { orderId: order.id })}
            activeOpacity={0.8}
          >
            <Phone size={13} color="#fff" />
            <Text style={[styles.bookingPrimaryBtnText, { fontFamily: fonts.bold, color: '#fff' }]}>
              Contact Tailor
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderRescheduleModal = () => {
    if (!order.booking) return null;
    const isStudio = order.booking.type === 'STUDIO';
    const nextDays = getNext7Days();

    const handleConfirmReschedule = async () => {
      if (!newDate) {
        Alert.alert('Selection Error', 'Please select a date.');
        return;
      }
      setRescheduling(true);
      try {
        const yearVal = newDate.getFullYear();
        const monthVal = String(newDate.getMonth() + 1).padStart(2, '0');
        const dayVal = String(newDate.getDate()).padStart(2, '0');
        // Pin to noon UTC so the stored date stays on the same calendar day
        // regardless of the user's local timezone (e.g. IST = UTC+5:30)
        const isoDateString = `${yearVal}-${monthVal}-${dayVal}T12:00:00.000Z`;

        const payload = isStudio
          ? {
              date: isoDateString,
              timeSlot: newTimeSlot,
              notes: newNotes,
            }
          : {
              preferredDate: isoDateString,
              requirements: newNotes,
            };

        const endpoint = isStudio
          ? `/appointments/${order.booking.id}`
          : `/visits/${order.booking.id}`;

        const res = await api.put(endpoint, payload);
        if (res.success) {
          Alert.alert('Fitting Rescheduled', 'Your fitting session has been updated successfully!');
          setShowRescheduleModal(false);
          loadOrder(); // Reload screen data
        } else {
          Alert.alert('Reschedule Failed', res.message || 'Could not reschedule session.');
        }
      } catch (err) {
        Alert.alert('Reschedule Error', err.message || 'An error occurred while rescheduling.');
      } finally {
        setRescheduling(false);
      }
    };

    return (
      <Modal
        visible={showRescheduleModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowRescheduleModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity 
            style={styles.modalOverlayDismiss} 
            activeOpacity={1} 
            onPress={() => !rescheduling && setShowRescheduleModal(false)} 
          />
          <KeyboardAvoidingView style={{ width: '100%' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.rescheduleModalContent, { backgroundColor: theme.bg.card }]}>
            {/* Header */}
            <View style={[styles.modalHeaderRow, { borderBottomColor: theme.border }]}>
              <Text style={[styles.modalHeaderTitle, { fontFamily: fonts.bold, color: theme.text.primary }]}>
                Reschedule Fitting
              </Text>
              <TouchableOpacity 
                style={[styles.modalCloseBtn, { backgroundColor: theme.bg.input }]}
                onPress={() => setShowRescheduleModal(false)}
                disabled={rescheduling}
              >
                <Text style={{ fontSize: 13, fontFamily: fonts.bold, color: theme.text.primary }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScrollBody} showsVerticalScrollIndicator={false}>
              {/* Date Selection */}
              <View style={styles.modalSection}>
                <Text style={[styles.modalSectionLabel, { fontFamily: fonts.bold, color: theme.text.primary }]}>
                  Select Date
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.daysScrollContainer}>
                  {nextDays.map((dateObj, idx) => {
                    const isSelected = newDate && newDate.toDateString() === dateObj.toDateString();
                    const dayLabel = dateObj.toLocaleDateString('en-IN', { weekday: 'short' });
                    const dateLabel = dateObj.toLocaleDateString('en-IN', { day: 'numeric' });
                    const monthLabel = dateObj.toLocaleDateString('en-IN', { month: 'short' });

                    return (
                      <TouchableOpacity
                        key={idx}
                        style={[
                          styles.daySelectCard,
                          { backgroundColor: theme.bg.input },
                          isSelected && { backgroundColor: theme.brand[500] }
                        ]}
                        onPress={() => setNewDate(dateObj)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.daySelectName, { fontFamily: fonts.medium, color: theme.text.secondary }, isSelected && { color: '#fff' }]}>
                          {dayLabel}
                        </Text>
                        <Text style={[styles.daySelectNum, { fontFamily: fonts.bold, color: theme.text.primary }, isSelected && { color: '#fff' }]}>
                          {dateLabel}
                        </Text>
                        <Text style={[styles.daySelectMonth, { fontFamily: fonts.regular, color: theme.text.muted }, isSelected && { color: '#fff' }]}>
                          {monthLabel}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Time Slot Selection (Studio Only) */}
              {isStudio && (
                <View style={styles.modalSection}>
                  <Text style={[styles.modalSectionLabel, { fontFamily: fonts.bold, color: theme.text.primary }]}>
                    Select Time Window
                  </Text>
                  <View style={styles.slotsGridContainer}>
                    {timeSlots.map((slot, idx) => {
                      const isSelected = newTimeSlot === slot;
                      return (
                        <TouchableOpacity
                          key={idx}
                          style={[
                            styles.slotPillCard,
                            { backgroundColor: theme.bg.input },
                            isSelected && { backgroundColor: theme.brand[500] }
                          ]}
                          onPress={() => setNewTimeSlot(slot)}
                          activeOpacity={0.7}
                        >
                          <Clock size={12} color={isSelected ? '#fff' : theme.text.secondary} />
                          <Text style={[styles.slotPillText, { fontFamily: fonts.medium, color: theme.text.secondary }, isSelected && { color: '#fff' }]}>
                            {slot}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Notes Input */}
              <View style={styles.modalSection}>
                <Text style={[styles.modalSectionLabel, { fontFamily: fonts.bold, color: theme.text.primary }]}>
                  Special Instructions / Preferences
                </Text>
                <TextInput
                  style={[styles.modalNotesInput, { backgroundColor: theme.bg.input, color: theme.text.primary, borderColor: theme.border }]}
                  placeholder={isStudio ? "E.g., Require standard sizing guides, or landmark details..." : "E.g., Landmark directions, gate codes..."}
                  placeholderTextColor={theme.text.muted}
                  multiline
                  numberOfLines={3}
                  value={newNotes}
                  onChangeText={setNewNotes}
                />
              </View>
            </ScrollView>

            {/* Footer Actions */}
            <View style={[styles.modalFooterRow, { borderTopColor: theme.border }]}>
              <TouchableOpacity 
                style={[styles.modalCancelBtn, { borderColor: theme.border }]} 
                onPress={() => setShowRescheduleModal(false)}
                disabled={rescheduling}
              >
                <Text style={[styles.modalCancelBtnText, { fontFamily: fonts.semiBold, color: theme.text.secondary }]}>
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.modalSubmitBtn, { backgroundColor: theme.brand[500] }]} 
                onPress={handleConfirmReschedule}
                disabled={rescheduling}
              >
                {rescheduling ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={[styles.modalSubmitBtnText, { fontFamily: fonts.bold, color: '#fff' }]}>
                    Save Slot
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    );
  };

  // ─── Root render ──────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: theme.bg.main }]}>
      <StatusBar barStyle="dark-content" />
      {renderHeader()}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Live Real-time Status Update Banner */}
        {liveUpdateAlert && (
          <View style={{
            backgroundColor: '#059669',
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderRadius: 16,
            marginBottom: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            shadowColor: '#059669',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 6
          }}>
            <CheckCircle2 size={20} color="#fff" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 10, fontFamily: fonts.bold, color: '#d1fae5', textTransform: 'uppercase', letterSpacing: 0.5 }}>⚡ Live Update From Admin</Text>
              <Text style={{ fontSize: 13, fontFamily: fonts.bold, color: '#fff', marginTop: 1 }}>{liveUpdateAlert.message}</Text>
            </View>
            <TouchableOpacity onPress={() => setLiveUpdateAlert(null)}>
              <X size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        )}

        {/* Prominent Delivered Banner when order is DELIVERED */}
        {order.status === 'DELIVERED' && (
          <View style={{
            backgroundColor: '#ecfdf5',
            borderColor: '#a7f3d0',
            borderWidth: 1.5,
            borderRadius: 20,
            padding: 16,
            marginBottom: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14
          }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#10b981', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle2 size={24} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontFamily: fonts.bold, color: '#065f46' }}>Order Delivered!</Text>
              <Text style={{ fontSize: 12, fontFamily: fonts.regular, color: '#047857', marginTop: 2 }}>
                Your package has been successfully delivered. We hope you love your bespoke apparel!
              </Text>
            </View>
          </View>
        )}

        {/* 1. Order Status & Prominent Delivery Date Box */}
        <View style={[styles.metaCard, shadows.premium, { backgroundColor: theme.bg.card, borderWidth: 1, borderColor: theme.border, gap: 14, flexDirection: 'column', alignItems: 'stretch' }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 9.5, fontFamily: fonts.bold, color: theme.text.muted, textTransform: 'uppercase', letterSpacing: 1 }}>
                CURRENT ORDER STATUS
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: 18, fontFamily: fonts.bold, color: theme.text.primary }}>
                  {getOrderStatusLabel(order.status)}
                </Text>
                {(() => {
                  const cfg = getStatusBadgeConfig(order.status);
                  return (
                    <View style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 10,
                      backgroundColor: cfg.bg,
                      borderWidth: 1,
                      borderColor: cfg.border
                    }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: cfg.dot }} />
                      <Text style={{ fontSize: 10, fontFamily: fonts.bold, color: cfg.text }}>
                        {order.status}
                      </Text>
                    </View>
                  );
                })()}
              </View>
              <Text style={{ fontSize: 12, fontFamily: fonts.regular, color: theme.text.muted, marginTop: 3 }}>
                Placed on {new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </Text>
            </View>

            {getPaymentStatusLabel(order) ? (
              <View style={{
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 12,
                backgroundColor: theme.bg.input,
                borderWidth: 1,
                borderColor: theme.border
              }}>
                <Text style={{ fontSize: 10, fontFamily: fonts.bold, color: theme.text.secondary }}>
                  {getPaymentStatusLabel(order)}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Prominent Expected Delivery Highlight Banner */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            padding: 14,
            borderRadius: 16,
            backgroundColor: theme.bg.input,
            borderWidth: 1,
            borderColor: theme.border
          }}>
            <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: theme.bg.card, alignItems: 'center', justifyContent: 'center' }}>
              <Calendar size={20} color={theme.brand[500]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 9.5, fontFamily: fonts.bold, color: theme.text.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                EXPECTED DELIVERY DATE
              </Text>
              <Text style={{ fontSize: 14, fontFamily: fonts.bold, color: theme.text.primary, marginTop: 2 }}>
                {order.deliveryDate
                  ? new Date(order.deliveryDate).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
                  : addDays(order.createdAt, 7) + ' (Estimated)'}
              </Text>
            </View>
          </View>
        </View>

        {/* 2. Separate Invoice Box (View Invoice button cleanly positioned BELOW Invoice Number) */}
        <View style={[styles.metaCard, shadows.premium, { backgroundColor: theme.bg.card, borderWidth: 1, borderColor: theme.border, gap: 14, flexDirection: 'column', alignItems: 'stretch' }]}>
          <View>
            <Text style={{ fontSize: 9.5, fontFamily: fonts.bold, color: theme.text.muted, textTransform: 'uppercase', letterSpacing: 1 }}>
              INVOICE NUMBER
            </Text>
            <Text style={[styles.metaInvoice, { fontFamily: fonts.bold, color: theme.text.primary, marginTop: 4, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }]} numberOfLines={2}>
              {order.invoiceNumber || `INV-${order.id.slice(-8).toUpperCase()}`}
            </Text>
          </View>

          <TouchableOpacity
            style={{
              paddingVertical: 12,
              paddingHorizontal: 16,
              borderRadius: 12,
              backgroundColor: theme.bg.input,
              borderWidth: 1,
              borderColor: theme.border,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8
            }}
            onPress={handleInvoice}
            activeOpacity={0.75}
          >
            <FileText size={16} color={theme.text.primary} />
            <Text style={{ fontSize: 12.5, fontFamily: fonts.bold, color: theme.text.primary, letterSpacing: 0.3 }}>
              View Official Tax Invoice
            </Text>
          </TouchableOpacity>
        </View>

        {/* CANCELLED banner, quick order card, and stepper */}
        {isCancelled ? renderCancelledBanner() : (
          <>
            {order.isQuickOrder ? renderQuickOrderCard() : null}
            {renderStepper()}
          </>
        )}

        {/* Booking slot info */}
        {order.booking && renderBookingDetails()}

        {renderItems()}
        {renderPriceBreakdown()}
        {renderActions()}
      </ScrollView>
      {renderRescheduleModal()}
      {renderInvoiceModal()}
    </View>
  );

  function formatUserAddress(rawAddr) {
    if (!rawAddr) return '';
    try {
      let parsed = typeof rawAddr === 'string' ? JSON.parse(rawAddr) : rawAddr;
      if (Array.isArray(parsed)) {
        parsed = parsed.find(a => a.selected) || parsed[0];
      }
      if (parsed && typeof parsed === 'object') {
        const parts = [
          parsed.address,
          parsed.area,
          parsed.landmark ? `(Near ${parsed.landmark})` : '',
          parsed.city,
          parsed.pincode ? `- ${parsed.pincode}` : ''
        ].filter(Boolean);
        return parts.join(', ');
      }
    } catch (e) {
      // Fallback if not JSON
    }
    return String(rawAddr);
  }

  function renderInvoiceModal() {
    if (!order) return null;

    const rawItems = (order.orderItems && order.orderItems.length > 0)
      ? order.orderItems
      : (order.items && order.items.length > 0)
        ? order.items
        : (order.product ? [{ product: order.product, quantity: 1, price: order.payableAmount }] : []);

    const itemsList = rawItems.length > 0 ? rawItems : [{
      product: { name: order.productName || 'Custom Apparel Item' },
      quantity: 1,
      price: order.payableAmount
    }];


    const handleDownloadPdf = async () => {
      setDownloadingPdf(true);
      try {
        const token = await AsyncStorage.getItem('accessToken');
        // Always use backend API — never Drive/external URLs
        const downloadUrl = `${api.defaults.baseURL}/orders/${order.id}/invoice-pdf`;
        const filename = `MARCOS_Invoice_${(order.invoiceNumber || order.id).replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;

        // Step 1: Download to temp cache
        const tempUri = `${FileSystem.cacheDirectory}${filename}`;
        const downloadResult = await FileSystem.downloadAsync(
          downloadUrl,
          tempUri,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} }
        );

        if (downloadResult.status !== 200) {
          Alert.alert('Download Failed', 'Could not fetch the invoice. Please try again.');
          return;
        }

        if (Platform.OS === 'android') {
          // Step 2 (Android): Use StorageAccessFramework to save directly to Downloads folder
          // Ask user to confirm the Downloads directory (only needed once per session)
          const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(
            'content://com.android.externalstorage.documents/tree/primary%3ADownload'
          );

          if (!permissions.granted) {
            // User cancelled — fall back to share sheet
            await Sharing.shareAsync(downloadResult.uri, {
              mimeType: 'application/pdf',
              dialogTitle: `Save MARCOS Invoice`,
            });
            return;
          }

          // Step 3 (Android): Create the file inside the chosen directory
          const savedUri = await FileSystem.StorageAccessFramework.createFileAsync(
            permissions.directoryUri,
            filename,
            'application/pdf'
          );

          // Step 4 (Android): Read temp file as base64 and write to Downloads
          const base64Content = await FileSystem.readAsStringAsync(downloadResult.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          await FileSystem.writeAsStringAsync(savedUri, base64Content, {
            encoding: FileSystem.EncodingType.Base64,
          });

          Alert.alert(
            '✅ Saved to Downloads!',
            `Invoice saved to your Downloads folder:\n${filename}\n\nOpen the Files app → Downloads to find it.`,
            [{ text: 'OK' }]
          );

        } else {
          // iOS: No "Downloads" folder concept — use share sheet (AirDrop, Files app, etc.)
          await Sharing.shareAsync(downloadResult.uri, {
            mimeType: 'application/pdf',
            dialogTitle: `MARCOS Invoice — ${order.invoiceNumber || order.id}`,
            UTI: 'com.adobe.pdf',
          });
        }

      } catch (err) {
        console.warn('PDF Download Error:', err);
        Alert.alert('Download Error', 'Unable to save the invoice. Please try again.');
      } finally {
        setDownloadingPdf(false);
      }
    };

    const formattedAddress = formatUserAddress(order.user?.address || order.address);

    return (
      <Modal visible={showInvoiceModal} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setShowInvoiceModal(false)}>
        <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
          <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
          
          {/* Minimalist Top Header Bar */}
          <View style={{
            paddingTop: Platform.OS === 'ios' ? 54 : (StatusBar.currentHeight || 20) + 10,
            paddingBottom: 16,
            paddingHorizontal: 20,
            backgroundColor: '#ffffff',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottomWidth: 1,
            borderBottomColor: '#f1f5f9'
          }}>
            <TouchableOpacity
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: '#f8fafc',
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: '#e2e8f0'
              }}
              onPress={() => setShowInvoiceModal(false)}
              activeOpacity={0.7}
            >
              <X size={20} color="#0f172a" />
            </TouchableOpacity>

            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 13, fontFamily: fonts.bold, color: '#0f172a', letterSpacing: 1.5, textTransform: 'uppercase' }}>
                Tax Invoice
              </Text>
              <Text style={{ fontSize: 11, fontFamily: fonts.regular, color: '#64748b', marginTop: 1 }}>
                {order.invoiceNumber || `INV-${order.id.slice(-8).toUpperCase()}`}
              </Text>
            </View>

            <TouchableOpacity
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: '#0f172a',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onPress={handleDownloadPdf}
              disabled={downloadingPdf}
              activeOpacity={0.7}
            >
              {downloadingPdf ? <ActivityIndicator size="small" color="#ffffff" /> : <Download size={18} color="#ffffff" />}
            </TouchableOpacity>
          </View>

          {/* Clean Scrollable Content */}
          <ScrollView
            contentContainerStyle={{ padding: 24, paddingBottom: 60, gap: 24 }}
            showsVerticalScrollIndicator={false}
            style={{ backgroundColor: '#ffffff' }}
          >
            {/* Minimal Brand Header */}
            <View style={{ gap: 4 }}>
              <Text style={{ fontSize: 24, fontFamily: fonts.bold, color: '#0f172a', letterSpacing: 3 }}>
                MARCOS
              </Text>
              <Text style={{ fontSize: 10, fontFamily: fonts.medium, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1.5 }}>
                Couture & Tailoring Studio
              </Text>
            </View>

            {/* Key Meta Grid */}
            <View style={{
              gap: 12,
              paddingVertical: 14,
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderColor: '#f1f5f9'
            }}>
              {/* Full width row for long Invoice Number */}
              <View>
                <Text style={{ fontSize: 9.5, fontFamily: fonts.bold, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>Invoice Number</Text>
                <Text style={{ fontSize: 13, fontFamily: fonts.bold, color: '#0f172a', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', marginTop: 3 }} numberOfLines={2}>
                  {order.invoiceNumber || `INV-${order.id.slice(-8).toUpperCase()}`}
                </Text>
              </View>

              {/* Side-by-side row for Date & Payment Mode */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 9.5, fontFamily: fonts.bold, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>Issue Date</Text>
                  <Text style={{ fontSize: 12.5, fontFamily: fonts.semiBold, color: '#0f172a', marginTop: 3 }}>
                    {new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </Text>
                </View>

                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 9.5, fontFamily: fonts.bold, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>Payment Mode</Text>
                  <Text style={{ fontSize: 12.5, fontFamily: fonts.semiBold, color: '#0f172a', marginTop: 3 }}>
                    {order.paymentMethod || 'ONLINE'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Billed To & Merchant Info */}
            <View style={{ gap: 16 }}>
              <View>
                <Text style={{ fontSize: 10, fontFamily: fonts.bold, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Billed / Shipped To</Text>
                <Text style={{ fontSize: 14, fontFamily: fonts.bold, color: '#0f172a' }}>
                  {order.user?.fullName || order.customerName || 'Bespoke Customer'}
                </Text>
                {order.user?.phoneNumber && <Text style={{ fontSize: 12, fontFamily: fonts.regular, color: '#475569', marginTop: 2 }}>Phone: {order.user.phoneNumber}</Text>}
                {order.user?.email && <Text style={{ fontSize: 12, fontFamily: fonts.regular, color: '#475569', marginTop: 1 }}>Email: {order.user.email}</Text>}
                {formattedAddress ? <Text style={{ fontSize: 12, fontFamily: fonts.regular, color: '#475569', marginTop: 2, lineHeight: 18 }}>Address: {formattedAddress}</Text> : null}
              </View>

              <View>
                <Text style={{ fontSize: 10, fontFamily: fonts.bold, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>Issued By</Text>
                <Text style={{ fontSize: 12.5, fontFamily: fonts.bold, color: '#1e293b' }}>MARCOS Studio</Text>
                <Text style={{ fontSize: 11, fontFamily: fonts.regular, color: '#64748b', marginTop: 1 }}>GSTIN: 33ABCDE1234F1Z5 · Aruppukottai, Tamil Nadu</Text>
              </View>
            </View>

            {/* Clean Minimal Table */}
            <View style={{ borderTopWidth: 1, borderColor: '#0f172a' }}>
              <View style={{ flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }}>
                <Text style={{ flex: 2, fontSize: 10, fontFamily: fonts.bold, color: '#0f172a', textTransform: 'uppercase', letterSpacing: 0.5 }}>Item</Text>
                <Text style={{ width: 35, fontSize: 10, fontFamily: fonts.bold, color: '#0f172a', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5 }}>Qty</Text>
                <Text style={{ width: 70, fontSize: 10, fontFamily: fonts.bold, color: '#0f172a', textAlign: 'right', textTransform: 'uppercase', letterSpacing: 0.5 }}>Price</Text>
                <Text style={{ width: 75, fontSize: 10, fontFamily: fonts.bold, color: '#0f172a', textAlign: 'right', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total</Text>
              </View>

              {itemsList.map((item, idx) => {
                const name = item.productName || item.product?.name || item.name || order.productName || 'Bespoke Garment';
                const qty = Number(item.quantity || 1);
                const price = Number(item.price || (order.payableAmount / qty));
                const lineTotal = price * qty;
                const fabricInfo = item.fabricType || item.product?.materialInfo || order.fabricType;
                const addonDetails = formatCustomizationDetails(item.selectedCustomizations);

                return (
                  <View key={idx} style={{ flexDirection: 'row', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', alignItems: 'flex-start' }}>
                    <View style={{ flex: 2, minWidth: 0, paddingRight: 8 }}>
                      <Text style={{ fontSize: 13, fontFamily: fonts.semiBold, color: '#0f172a' }}>{name}</Text>
                      {fabricInfo && (
                        <Text style={{ fontSize: 11, fontFamily: fonts.regular, color: '#64748b', marginTop: 1 }}>
                          Fabric: {fabricInfo}
                        </Text>
                      )}
                      {addonDetails.map((detail, optionIndex) => (
                        <Text key={`${idx}-invoice-addon-${optionIndex}`} style={{ fontSize: 10.5, lineHeight: 15, fontFamily: fonts.medium, color: '#475569', marginTop: 3 }}>
                          Add-on: {detail}
                        </Text>
                      ))}
                    </View>
                    <Text style={{ width: 35, fontSize: 12, fontFamily: fonts.regular, color: '#334155', textAlign: 'center' }}>{qty}</Text>
                    <Text style={{ width: 70, fontSize: 12, fontFamily: fonts.regular, color: '#475569', textAlign: 'right' }}>₹{price.toLocaleString('en-IN')}</Text>
                    <Text style={{ width: 75, fontSize: 12.5, fontFamily: fonts.bold, color: '#0f172a', textAlign: 'right' }}>₹{lineTotal.toLocaleString('en-IN')}</Text>
                  </View>
                );
              })}
            </View>

            {/* Calculations Breakdown */}
            <View style={{ gap: 8, paddingTop: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 12.5, fontFamily: fonts.regular, color: '#64748b' }}>Subtotal</Text>
                <Text style={{ fontSize: 12.5, fontFamily: fonts.medium, color: '#0f172a' }}>₹{Number(order.totalAmount).toLocaleString('en-IN')}</Text>
              </View>
              {Number(order.discountAmount) > 0 && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 12.5, fontFamily: fonts.regular, color: '#475569' }}>Discount</Text>
                  <Text style={{ fontSize: 12.5, fontFamily: fonts.medium, color: '#0f172a' }}>-₹{Number(order.discountAmount).toLocaleString('en-IN')}</Text>
                </View>
              )}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 12.5, fontFamily: fonts.regular, color: '#64748b' }}>GST ({order.gstPercentage !== undefined && order.gstPercentage !== null ? order.gstPercentage : 18}%)</Text>
                <Text style={{ fontSize: 12.5, fontFamily: fonts.medium, color: '#0f172a' }}>₹{Number(order.taxAmount).toLocaleString('en-IN')}</Text>
              </View>

              <View style={{ height: 1, backgroundColor: '#0f172a', marginVertical: 6 }} />

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 14, fontFamily: fonts.bold, color: '#0f172a' }}>Grand Total</Text>
                <Text style={{ fontSize: 18, fontFamily: fonts.bold, color: '#0f172a' }}>
                  ₹{Number(order.payableAmount).toLocaleString('en-IN')}
                </Text>
              </View>

              {Number(order.advancePayment) > 0 && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
                  <Text style={{ fontSize: 12, fontFamily: fonts.regular, color: '#64748b' }}>Advance Paid</Text>
                  <Text style={{ fontSize: 12, fontFamily: fonts.medium, color: '#0f172a' }}>-₹{Number(order.advancePayment).toLocaleString('en-IN')}</Text>
                </View>
              )}

              {Number(order.balanceAmount) > 0 && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                  <Text style={{ fontSize: 12.5, fontFamily: fonts.bold, color: '#0f172a' }}>Balance Due</Text>
                  <Text style={{ fontSize: 12.5, fontFamily: fonts.bold, color: '#0f172a' }}>₹{Number(order.balanceAmount).toLocaleString('en-IN')}</Text>
                </View>
              )}
            </View>

            {/* Minimal Monochrome Download PDF Button */}
            <TouchableOpacity
              style={{
                backgroundColor: '#0f172a',
                height: 52,
                borderRadius: 12,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                marginTop: 12,
              }}
              onPress={handleDownloadPdf}
              disabled={downloadingPdf}
              activeOpacity={0.85}
            >
              {downloadingPdf ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Download size={18} color="#ffffff" />
                  <Text style={{ fontFamily: fonts.bold, color: '#ffffff', fontSize: 13, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                    Download PDF Invoice
                  </Text>
                </>
              )}
            </TouchableOpacity>

          </ScrollView>
        </View>
      </Modal>
    );
  }
}


function getNext7Days() {
  const days = [];
  for (let i = 1; i <= 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  /* Header */
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 12,
  },
  headerBtn: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, letterSpacing: 0.2 },
  headerSub: { fontSize: 11, marginTop: 1 },

  /* Scroll */
  scrollContent: { paddingHorizontal: 20, paddingBottom: 60, gap: 14 },

  /* Meta card */
  metaCard: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, borderRadius: 20,
  },
  metaInvoice: { fontSize: 14, letterSpacing: 0.1 },
  metaDate: { fontSize: 11, marginTop: 2 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  statusBadgeText: { fontSize: 10, letterSpacing: 0.5 },

  /* Cancelled banner */
  cancelledBanner: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, borderRadius: 20, borderWidth: 1,
  },
  cancelledTitle: { fontSize: 15, marginBottom: 2 },
  cancelledMsg: { fontSize: 12, lineHeight: 18 },

  /* Stepper */
  stepperCard: { padding: 20, borderRadius: 20 },
  stepperTitle: { fontSize: 14, marginBottom: 20 },
  stepperRow: { flexDirection: 'row', alignItems: 'flex-start' },
  stepItem: { alignItems: 'center', flex: 1 },
  stepCircle: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
  },
  stepLabel: { fontSize: 10, textAlign: 'center', lineHeight: 14 },
  stepDate: { fontSize: 9, marginTop: 3, textAlign: 'center' },
  connector: {
    height: 2, flex: 0.55, marginTop: 17,
    alignSelf: 'flex-start',
  },

  /* Section cards */
  sectionCard: { padding: 20, borderRadius: 20, borderWidth: 1, borderColor: '#f1f5f9' },
  sectionTitle: { fontSize: 14, marginBottom: 16 },

  /* Items */
  itemRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 14, paddingVertical: 12,
  },
  itemImgBox: {
    width: 64, height: 64, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  itemImg: { width: '100%', height: '100%' },
  itemName: { fontSize: 13.5, marginBottom: 3, lineHeight: 19 },
  itemQty: { fontSize: 11.5 },
  itemPrice: { fontSize: 14 },

  /* Price */
  priceRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 10,
  },
  priceLabel: { fontSize: 13 },
  priceValue: { fontSize: 13 },
  priceDivider: { height: 1, marginVertical: 10 },
  payMethodBadge: {
    alignSelf: 'flex-start', marginTop: 10,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  payMethodText: { fontSize: 11.5 },

  /* Actions */
  actionsRow: { flexDirection: 'row', gap: 12 },
  actionBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: 7, paddingVertical: 16, borderRadius: 18,
  },
  actionBtnText: { fontSize: 12 },

  /* Error state */
  errorWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 40, gap: 14,
  },
  errorIconCircle: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  errorTitle: { fontSize: 19, textAlign: 'center' },
  errorMsg: { fontSize: 13.5, textAlign: 'center', lineHeight: 21, marginTop: -4, color: '#64748b' },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 28, paddingVertical: 14, borderRadius: 16, marginTop: 6,
  },
  retryBtnText: { color: '#fff', fontSize: 13, letterSpacing: 0.5 },

  /* Premium Booking Card styles */
  premiumBookingCard: {
    padding: 20,
    borderRadius: 24,
    marginBottom: 6,
  },
  bookingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 16,
  },
  bookingTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  scissorsIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookingTitleText: {
    fontSize: 14.5,
    letterSpacing: 0.1,
    flexShrink: 1,
  },
  bookingSubtitleText: {
    fontSize: 10.5,
    marginTop: 1,
  },
  bookingStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexShrink: 0,
    marginTop: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  bookingStatusText: {
    fontSize: 9.5,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  bookingDetailsContainer: {
    borderTopWidth: 1,
    paddingTop: 16,
    gap: 14,
  },
  bookingInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  infoIconBox: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoLabelText: {
    fontSize: 10,
    letterSpacing: 0.2,
  },
  infoValueText: {
    fontSize: 13,
    marginTop: 1,
  },
  dateTimeGridRow: {
    flexDirection: 'column',
    gap: 12,
  },
  gridSlotBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    gap: 10,
  },
  gridSlotLabel: {
    fontSize: 9.5,
  },
  gridSlotValue: {
    fontSize: 12,
    marginTop: 2,
  },
  instructionsBox: {
    padding: 12,
    borderRadius: 16,
    gap: 4,
  },
  instructionsLabel: {
    fontSize: 10.5,
  },
  instructionsText: {
    fontSize: 12.5,
    lineHeight: 18,
  },
  guidelinesBox: {
    paddingHorizontal: 4,
  },
  guidelinesText: {
    fontSize: 11.5,
    lineHeight: 17,
  },
  bookingActionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  bookingSecondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  bookingSecondaryBtnText: {
    fontSize: 12.5,
  },
  bookingPrimaryBtn: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 16,
  },
  bookingPrimaryBtnText: {
    fontSize: 12.5,
  },

  /* Modal Overlay */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  modalOverlayDismiss: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  rescheduleModalContent: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '85%',
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 20,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderBottomWidth: 1,
  },
  modalHeaderTitle: {
    fontSize: 16.5,
  },
  modalCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalScrollBody: {
    padding: 24,
    gap: 20,
  },
  modalSection: {
    gap: 10,
  },
  modalSectionLabel: {
    fontSize: 12.5,
    letterSpacing: 0.2,
  },
  daysScrollContainer: {
    gap: 10,
    paddingRight: 10,
  },
  daySelectCard: {
    width: 65,
    height: 85,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  daySelectName: {
    fontSize: 10.5,
    textTransform: 'uppercase',
  },
  daySelectNum: {
    fontSize: 16,
  },
  daySelectMonth: {
    fontSize: 9.5,
  },
  slotsGridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  slotPillCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  slotPillText: {
    fontSize: 11.5,
  },
  modalNotesInput: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    height: 80,
    textAlignVertical: 'top',
    fontSize: 13,
  },
  modalFooterRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    gap: 12,
  },
  modalCancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  modalCancelBtnText: {
    fontSize: 13,
  },
  modalSubmitBtn: {
    flex: 1.3,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 16,
  },
  modalSubmitBtnText: {
    fontSize: 13,
  },

  /* Quick Order Styles */
  quickOrderCard: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  quickOrderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 10,
    marginBottom: 12,
  },
  quickOrderTitle: {
    fontSize: 14,
    letterSpacing: 0.1,
  },
  quickOrderBody: {
    gap: 12,
  },
  quickAlert: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  quickAlertTitle: {
    fontSize: 12,
    letterSpacing: 0.1,
  },
  quickAlertMsg: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 16,
  },
  quickActionsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  quickRejectBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
  },
  quickRejectBtnText: {
    fontSize: 11,
  },
  quickAcceptBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  quickAcceptBtnText: {
    fontSize: 11,
  },
  quickReasonContainer: {
    padding: 12,
    borderRadius: 12,
  },
  quickReasonLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
  },
  quickReasonText: {
    fontSize: 11,
    marginTop: 2,
  },
});
