import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  Alert,
  Platform,
  Dimensions,
  StatusBar,
  Modal
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  MapPin,
  CheckCircle2,
  Lock,
  Plus,
  Compass,
  Layers,
  Phone,
  Home,
  Briefcase,
  AlertTriangle,
  Gift,
  CreditCard,
  Truck,
  Sparkles,
  ShoppingBag,
  Calendar
} from 'lucide-react-native';
import { useTheme } from '../../styles/ThemeContext';
import api from '../../utils/api';
import AddressSelector from '../../components/address/AddressSelector';

const { width } = Dimensions.get('window');

export default function CheckoutScreen({ route, navigation }) {
  const { theme, fonts, shadows } = useTheme();
  const insets = useSafeAreaInsets();
  const routeParams = route.params || {};

  // Stepper state: 0 = Summary, 1 = Booking, 2 = Success
  const [currentStep, setCurrentStep] = useState(0);

  // Data states
  const [userProfile, setUserProfile] = useState(null);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [cartItems, setCartItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [availableCoupons, setAvailableCoupons] = useState([]);

  // Checkout flow parameters
  const [addressSelectorVisible, setAddressSelectorVisible] = useState(false);
  const [deliveryInstructions, setDeliveryInstructions] = useState('');

  // Quick Order state
  const [isQuickOrder, setIsQuickOrder] = useState(false);
  const [quickOrderReason, setQuickOrderReason] = useState('');
  const [quickOrderExpectedDate, setQuickOrderExpectedDate] = useState('');
  const [showExpectedDateCalendar, setShowExpectedDateCalendar] = useState(false);

  // Coupon state
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponLoading, setCouponLoading] = useState(false);

  // Fitting Booking states
  // Default booking date to tomorrow
  const getDefaultBookingDate = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const y = tomorrow.getFullYear();
    const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const d = String(tomorrow.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };
  const [bookingDate, setBookingDate] = useState(getDefaultBookingDate());
  const [calendarViewDate, setCalendarViewDate] = useState(new Date());
  const [bookingNotes, setBookingNotes] = useState('');
  const [showCalendar, setShowCalendar] = useState(false);
  const [bookingType, setBookingType] = useState('STANDARD'); // 'STANDARD' or 'HOME_VISIT'
  const [bookingSlot, setBookingSlot] = useState('');
  const [bookedSlotsCounts, setBookedSlotsCounts] = useState({});

  // Dynamic Settings
  const [timeSlots, setTimeSlots] = useState([]);
  const [systemSettings, setSystemSettings] = useState(null);

  const [placedOrder, setPlacedOrder] = useState(null);

  const loadBookedSlots = async (dateStr) => {
    try {
      const formattedDate = new Date(`${dateStr}T10:00:00Z`).toISOString();
      const res = await api.get(`/appointments/availability?date=${formattedDate}`);
      if (res.success && res.data) {
        setBookedSlotsCounts(res.data);
      } else {
        setBookedSlotsCounts({});
      }
    } catch (err) {
      console.warn('Failed to load booked slots counts:', err.message);
      setBookedSlotsCounts({});
    }
  };

  useEffect(() => {
    if (bookingDate) {
      loadBookedSlots(bookingDate);
    }
  }, [bookingDate]);

  // Filter time slots dynamically
  const getFilteredTimeSlots = () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const todayStr = `${y}-${m}-${d}`;

    const maxSlots = systemSettings?.maxBookingsPerSlot || 5;

    // Filter out slots that have already reached maximum bookings limit
    let filtered = timeSlots.filter(s => {
      const count = bookedSlotsCounts[s] || 0;
      return count < maxSlots;
    });

    if (bookingDate !== todayStr) {
      return filtered;
    }

    return filtered.filter(s => {
      try {
        const startPart = s.split(' - ')[0].trim(); // e.g. "10:00 AM" or "10:00"
        const match = startPart.match(/^(\d+):(\d+)\s*(AM|PM)?$/i);
        if (!match) return true;

        let hour = parseInt(match[1], 10);
        const minute = parseInt(match[2], 10);
        const ampm = match[3];

        if (ampm) {
          const isPM = ampm.toUpperCase() === 'PM';
          if (isPM && hour < 12) {
            hour += 12;
          } else if (!isPM && hour === 12) {
            hour = 0;
          }
        }

        const currentHour = today.getHours();
        const currentMinute = today.getMinutes();

        if (hour < currentHour) {
          return false;
        }
        if (hour === currentHour && minute <= currentMinute) {
          return false;
        }
        return true;
      } catch (e) {
        return true;
      }
    });
  };

  useEffect(() => {
    const filtered = getFilteredTimeSlots();
    if (filtered.length > 0) {
      if (!filtered.includes(bookingSlot)) {
        setBookingSlot(filtered[0]);
      }
    } else {
      setBookingSlot('');
    }
  }, [bookingDate, timeSlots, bookedSlotsCounts]);

  const formatBookingDate = (dateStr) => {
    if (!dateStr) return 'Select Date';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const year = parts[0];
    const monthIdx = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return `${day} ${months[monthIdx]} ${year}`;
  };

  // Load initial profile & cart data
  const loadData = async () => {
    try {
      setLoading(true);
      const [profileRes, cartRes, couponsRes, settingsRes] = await Promise.all([
        api.get('/auth/profile').catch(() => null),
        api.get('/products/cart').catch(() => null),
        api.get('/auth/loyalty/coupons').catch(() => null),
        api.get('/system/settings/public').catch(() => null)
      ]);

      if (profileRes && profileRes.success) {
        setUserProfile(profileRes.data);
      }
      if (couponsRes && couponsRes.success && couponsRes.data) {
        const unused = couponsRes.data.filter(c => c.usedAt === null);
        setAvailableCoupons(unused);
      }

      if (settingsRes && settingsRes.success && settingsRes.data) {
        const s = settingsRes.data;
        setSystemSettings(s);
        
        // Generate time slots
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
        if (slots.length > 0) {
          setBookingSlot(slots[0]);
        }
      } else {
        setTimeSlots(['10:00 AM - 11:30 AM', '11:30 AM - 01:00 PM', '02:00 PM - 03:30 PM', '04:00 PM - 05:30 PM']);
      }
      if (routeParams.cartItems && routeParams.cartItems.length > 0) {
        setCartItems(routeParams.cartItems);
      } else if (cartRes && cartRes.success) {
        setCartItems(cartRes.data || []);
      }

      // Sync applied coupon if forwarded from CartScreen
      if (routeParams.appliedCoupon) {
        setAppliedCoupon(routeParams.appliedCoupon);
        setCouponCode(routeParams.appliedCoupon.code || '');
      }
    } catch (err) {
      console.error('Checkout load error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setIdempotencyKey('idem_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15));
    loadData();
  }, []);

  // Address parsing
  const getParsedAddresses = () => {
    let addressStr = userProfile?.address;
    if (!addressStr || addressStr === '[]') {
      return [];
    }

    const parseAddressItem = (item) => {
      if (typeof item === 'string') {
        try {
          const parsed = JSON.parse(item);
          if (parsed && (Array.isArray(parsed) || typeof parsed === 'object')) {
            return parseAddressItem(parsed);
          }
        } catch (e) {
          // Plain string
        }
        return [
          {
            id: 'default',
            name: userProfile?.fullName || 'My Address',
            address: item,
            city: '',
            area: '',
            pincode: '',
            phone: userProfile?.phoneNumber || '',
            phone2: '',
            selected: true,
            type: 'home'
          }
        ];
      }

      if (Array.isArray(item)) {
        let flattened = [];
        item.forEach(subItem => {
          flattened = flattened.concat(parseAddressItem(subItem));
        });
        return flattened;
      }

      if (item && typeof item === 'object') {
        if (typeof item.address === 'string' && (item.address.trim().startsWith('[') || item.address.trim().startsWith('{'))) {
          try {
            const nested = JSON.parse(item.address);
            const resolved = parseAddressItem(nested);
            if (resolved.length > 0) {
              return resolved.map(r => ({
                ...r,
                selected: r.selected || item.selected,
                type: r.type || item.type || 'home'
              }));
            }
          } catch (e) {
            // Treat as plain text
          }
        }

        return [
          {
            id: item.id || Date.now().toString() + Math.random().toString(36).substring(2, 5),
            name: item.name || userProfile?.fullName || 'My Address',
            address: item.address || item.street || '',
            landmark: item.landmark || '',
            city: item.city || '',
            area: item.area || '',
            pincode: item.pincode || '',
            phone: item.phone || userProfile?.phoneNumber || '',
            phone2: item.phone2 || '',
            selected: item.selected === true,
            type: item.type || 'home'
          }
        ];
      }

      return [];
    };

    try {
      let parsed = JSON.parse(addressStr);
      let list = parseAddressItem(parsed);
      
      const seen = new Set();
      const uniqueList = [];
      list.forEach(addr => {
        const uniqueKey = `${addr.name}_${addr.address}_${addr.pincode}`;
        if (!seen.has(uniqueKey) && addr.address) {
          seen.add(uniqueKey);
          uniqueList.push(addr);
        }
      });

      if (uniqueList.length > 0 && !uniqueList.some(a => a.selected)) {
        uniqueList[0].selected = true;
      }
      return uniqueList;
    } catch (e) {
      // Fallback
    }

    return [
      {
        id: 'default',
        name: userProfile?.fullName || 'My Address',
        address: addressStr,
        city: '',
        area: '',
        pincode: '',
        phone: userProfile?.phoneNumber || '',
        phone2: '',
        selected: true,
        type: 'home'
      }
    ];
  };

  const getSelectedAddress = () => {
    const list = getParsedAddresses();
    if (list.length > 0) {
      return list.find(a => a.selected) || list[0];
    }
    return {
      id: 'default_address',
      name: userProfile?.fullName || 'Valued Customer',
      address: 'Marcos Boutique Suite, Central Avenue, Chennai - 600001',
      city: 'Chennai',
      area: 'Central',
      pincode: '600001',
      phone: userProfile?.phoneNumber || '+919000000001',
      selected: true,
      type: 'home'
    };
  };

  // Coupon handling
  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    try {
      const res = await api.post('/products/cart/coupon', { code: couponCode.trim().toUpperCase() });
      if (res.success && res.coupon) {
        setAppliedCoupon(res.coupon);
        Alert.alert('Coupon Applied', `Coupon '${res.coupon.code}' applied successfully.`);
      }
    } catch (err) {
      setAppliedCoupon(null);
      Alert.alert('Invalid Coupon', err.message || 'Failed to apply coupon.');
    } finally {
      setCouponLoading(false);
    }
  };

  const handleSelectCoupon = async (code) => {
    setCouponCode(code);
    setCouponLoading(true);
    try {
      const res = await api.post('/products/cart/coupon', { code: code.toUpperCase() });
      if (res.success && res.coupon) {
        setAppliedCoupon(res.coupon);
        Alert.alert('Coupon Applied', `Coupon '${res.coupon.code}' applied successfully.`);
      }
    } catch (err) {
      setAppliedCoupon(null);
      Alert.alert('Invalid Coupon', err.message || 'Failed to apply coupon.');
    } finally {
      setCouponLoading(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode('');
  };

  // Mathematical pricing calculations
  const subtotal = cartItems.reduce((sum, item) => sum + (Number(item.unitPrice ?? item.product.price) * item.quantity), 0);

  let discountVal = 0;
  if (appliedCoupon) {
    if (Number(appliedCoupon.discountPercent) > 0) {
      discountVal = subtotal * (Number(appliedCoupon.discountPercent) / 100);
      if (appliedCoupon.maxDiscount && discountVal > Number(appliedCoupon.maxDiscount)) {
        discountVal = Number(appliedCoupon.maxDiscount);
      }
    } else if (Number(appliedCoupon.discountFlat) > 0) {
      discountVal = Number(appliedCoupon.discountFlat);
    }
  }

  const hasFreeShippingInCart = cartItems.some(item => item.product?.hasFreeShipping);
  const deliveryCharges = (subtotal > 30000 || hasFreeShippingInCart) ? 0 : 150; // Free delivery for luxury orders above 30k or if item has free shipping promo
  const taxRate = 0.18; // 18% GST
  const taxableAmount = Math.max(0, subtotal - discountVal);
  const taxVal = taxableAmount * taxRate;
  const grandTotal = taxableAmount + taxVal + deliveryCharges;

  // Real backend order creation with concurrent booking
  const handlePlaceOrder = async () => {
    const address = getSelectedAddress();
    if (!address) {
      Alert.alert('Error', 'Please configure your shipping address.');
      return;
    }

    if (!bookingDate) {
      Alert.alert('Validation Error', 'Please select a fitting date.');
      return;
    }

    if (!bookingSlot) {
      Alert.alert('Validation Error', 'Please select a valid time slot.');
      return;
    }

    if (isQuickOrder && !quickOrderReason.trim()) {
      Alert.alert('Validation Error', 'Please tell us why you need this order quick.');
      return;
    }
    if (isQuickOrder && !quickOrderExpectedDate) {
      Alert.alert('Validation Error', 'Please specify an expected date for the quick order.');
      return;
    }

    setCheckoutLoading(true);
    try {
      const checkoutItems = cartItems.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        price: Number(item.unitPrice ?? item.product.price),
        selectedCustomizations: (item.selectedCustomizations || []).map(group => ({
          groupId: group.groupId,
          optionIds: (group.options || []).map(option => option.optionId),
        })),
      }));

      const payload = {
        items: checkoutItems,
        discountAmount: discountVal,
        paymentMethod: 'CASH', // standard cash/pending method for backend
        couponCode: appliedCoupon?.code || undefined,
        isQuickOrder,
        quickOrderReason: isQuickOrder ? quickOrderReason : undefined,
        quickOrderExpectedDate: isQuickOrder ? quickOrderExpectedDate : undefined,
      };

      const res = await api.post('/orders/checkout', payload, {
        headers: {
          'x-idempotency-key': idempotencyKey
        }
      });

      if (res.success) {
        const orderData = res.data;
        setPlacedOrder(orderData);

        // Schedule fitting booking
        const formattedDate = new Date(`${bookingDate}T10:00:00Z`).toISOString();
        if (bookingType === 'STANDARD') {
          // POST /appointments
          await api.post('/appointments', {
            date: formattedDate,
            timeSlot: bookingSlot,
            productType: cartItems.map(item => item.product.name).join(', '),
            type: 'CONSULTATION',
            notes: `Order Invoice: ${orderData.invoiceNumber}. Notes: ${bookingNotes}`,
            orderId: orderData.id,
          }).catch(err => console.error("Failed standard booking creation:", err));
        } else {
          // POST /visits
          await api.post('/visits', {
            preferredDate: formattedDate,
            address: address.address,
            requirements: `Order Invoice: ${orderData.invoiceNumber}. Notes: ${bookingNotes}`,
          }).catch(err => console.error("Failed home visit booking creation:", err));
        }

        setCurrentStep(2); // Success Screen
      }
    } catch (err) {
      Alert.alert('Checkout Failed', err.message || 'Transaction could not be completed.');
    } finally {
      setCheckoutLoading(false);
    }
  };

  // RENDER: Stepper Header
  const renderStepper = () => {
    const steps = ['Summary', 'Booking', 'Success'];
    return (
      <View style={styles.stepperContainer}>
        {steps.map((step, idx) => {
          const isCompleted = idx < currentStep;
          const isActive = idx === currentStep;
          return (
            <React.Fragment key={step}>
              <View style={styles.stepWrapper}>
                <View style={[
                  styles.stepCircle,
                  isCompleted && { backgroundColor: theme.brand[500] },
                  isActive && { borderColor: theme.brand[500], borderWidth: 2, backgroundColor: '#ffffff' }
                ]}>
                  {isCompleted ? (
                    <CheckCircle2 size={15} color="#ffffff" />
                  ) : (
                    <Text style={[
                      styles.stepNumber,
                      { fontFamily: fonts.bold, color: isActive ? theme.brand[500] : '#64748b' }
                    ]}>
                      {idx + 1}
                    </Text>
                  )}
                </View>
                <Text style={[
                  styles.stepLabel,
                  {
                    fontFamily: isActive ? fonts.bold : fonts.medium,
                    color: isActive || isCompleted ? theme.text.primary : '#64748b'
                  }
                ]}>
                  {step}
                </Text>
              </View>
              {idx < steps.length - 1 && (
                <View style={[
                  styles.stepLine,
                  { backgroundColor: idx < currentStep ? theme.brand[500] : theme.border }
                ]} />
              )}
            </React.Fragment>
          );
        })}
      </View>
    );
  };

  // RENDER: Fitting Date Selection Calendar Modal
  const renderCalendarModal = () => {
    if (!showCalendar) return null;
    const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let year = calendarViewDate.getFullYear();
    let month = calendarViewDate.getMonth();

    const totalDays = daysInMonth(year, month);
    const startDay = firstDayOfMonth(year, month);
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const days = [];
    for (let i = 0; i < startDay; i++) days.push(null);
    for (let i = 1; i <= totalDays; i++) days.push(new Date(year, month, i));

    const handlePrevMonth = () => {
      const newDate = new Date(year, month - 1, 1);
      if (newDate.getFullYear() > today.getFullYear() || (newDate.getFullYear() === today.getFullYear() && newDate.getMonth() >= today.getMonth())) {
        setCalendarViewDate(newDate);
      }
    };
    const handleNextMonth = () => {
      setCalendarViewDate(new Date(year, month + 1, 1));
    };

    return (
      <Modal visible={showCalendar} transparent animationType="fade">
        <View style={styles.calendarOverlay}>
          <View style={[styles.calendarCard, { backgroundColor: '#ffffff' }]}>
            <View style={[styles.calendarHeader, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', paddingHorizontal: 16 }]}>
              <TouchableOpacity onPress={handlePrevMonth} style={{ padding: 8 }}>
                <Text style={{ fontSize: 20, color: (year === today.getFullYear() && month === today.getMonth()) ? '#cbd5e1' : theme.brand[500], fontFamily: fonts.bold }}>{'<'}</Text>
              </TouchableOpacity>
              <Text style={[styles.calendarMonthText, { color: '#1e293b', fontFamily: fonts.bold }]}>
                {monthNames[month]} {year}
              </Text>
              <TouchableOpacity onPress={handleNextMonth} style={{ padding: 8 }}>
                <Text style={{ fontSize: 20, color: theme.brand[500], fontFamily: fonts.bold }}>{'>'}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.daysGrid}>
              {days.map((date, i) => {
                if (!date) return <View key={i} style={styles.dayCell} />;
                const yearVal = date.getFullYear();
                const monthVal = String(date.getMonth() + 1).padStart(2, '0');
                const dayVal = String(date.getDate()).padStart(2, '0');
                const dateStr = `${yearVal}-${monthVal}-${dayVal}`;
                const isSelected = bookingDate === dateStr;
                const isPast = date < today;
                return (
                  <TouchableOpacity
                    key={i}
                    style={[styles.dayCell, isSelected && { backgroundColor: theme.brand[500], borderRadius: 12 }]}
                    disabled={isPast}
                    onPress={() => {
                      setBookingDate(dateStr);
                      setShowCalendar(false);
                    }}
                  >
                    <Text style={[styles.dayText, { color: isPast ? '#cbd5e1' : '#1e293b', fontFamily: fonts.bold }, isSelected && { color: '#ffffff' }]}>
                      {date.getDate()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity style={styles.closeCalendarBtn} onPress={() => setShowCalendar(false)}>
              <Text style={[styles.closeCalendarBtnText, { color: theme.brand[500], fontFamily: fonts.bold }]}>CLOSE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  const renderExpectedDateCalendarModal = () => {
    if (!showExpectedDateCalendar) return null;
    const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let year = calendarViewDate.getFullYear();
    let month = calendarViewDate.getMonth();

    const totalDays = daysInMonth(year, month);
    const startDay = firstDayOfMonth(year, month);
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const days = [];
    for (let i = 0; i < startDay; i++) days.push(null);
    for (let i = 1; i <= totalDays; i++) days.push(new Date(year, month, i));

    const handlePrevMonth = () => {
      const newDate = new Date(year, month - 1, 1);
      if (newDate.getFullYear() > today.getFullYear() || (newDate.getFullYear() === today.getFullYear() && newDate.getMonth() >= today.getMonth())) {
        setCalendarViewDate(newDate);
      }
    };
    const handleNextMonth = () => {
      setCalendarViewDate(new Date(year, month + 1, 1));
    };

    return (
      <Modal visible={showExpectedDateCalendar} transparent animationType="fade">
        <View style={styles.calendarOverlay}>
          <View style={[styles.calendarCard, { backgroundColor: '#ffffff' }]}>
            <View style={[styles.calendarHeader, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', paddingHorizontal: 16 }]}>
              <TouchableOpacity onPress={handlePrevMonth} style={{ padding: 8 }}>
                <Text style={{ fontSize: 20, color: (year === today.getFullYear() && month === today.getMonth()) ? '#cbd5e1' : theme.brand[500], fontFamily: fonts.bold }}>{'<'}</Text>
              </TouchableOpacity>
              <Text style={[styles.calendarMonthText, { color: '#1e293b', fontFamily: fonts.bold }]}>
                {monthNames[month]} {year}
              </Text>
              <TouchableOpacity onPress={handleNextMonth} style={{ padding: 8 }}>
                <Text style={{ fontSize: 20, color: theme.brand[500], fontFamily: fonts.bold }}>{'>'}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.daysGrid}>
              {days.map((date, i) => {
                if (!date) return <View key={i} style={styles.dayCell} />;
                const yearVal = date.getFullYear();
                const monthVal = String(date.getMonth() + 1).padStart(2, '0');
                const dayVal = String(date.getDate()).padStart(2, '0');
                const dateStr = `${yearVal}-${monthVal}-${dayVal}`;
                const isSelected = quickOrderExpectedDate === dateStr;
                const isPast = date < today;
                return (
                  <TouchableOpacity
                    key={i}
                    style={[styles.dayCell, isSelected && { backgroundColor: theme.brand[500], borderRadius: 12 }]}
                    disabled={isPast}
                    onPress={() => {
                      setQuickOrderExpectedDate(dateStr);
                      setShowExpectedDateCalendar(false);
                    }}
                  >
                    <Text style={[styles.dayText, { color: isPast ? '#cbd5e1' : '#1e293b', fontFamily: fonts.bold }, isSelected && { color: '#ffffff' }]}>
                      {date.getDate()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity style={styles.closeCalendarBtn} onPress={() => setShowExpectedDateCalendar(false)}>
              <Text style={[styles.closeCalendarBtnText, { color: theme.brand[500], fontFamily: fonts.bold }]}>CLOSE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  // RENDER: Step 2 (Fitting Booking Screen)
  const renderStepBooking = () => {
    const slots = [
      '10:00 - 12:00',
      '12:00 - 14:00',
      '14:00 - 16:00',
      '16:00 - 18:00',
      '18:00 - 20:00'
    ];

    return (
      <View style={{ flex: 1 }}>
        <ScrollView style={styles.stepScroll} showsVerticalScrollIndicator={false}>

          <Text style={[styles.sectionHeading, { fontFamily: fonts.bold, color: theme.text.primary }]}>
            Select Fitting Option
          </Text>

          {/* Standard Visit Option */}
          <TouchableOpacity
            style={[
              styles.paymentRadioCard,
              shadows.premium,
              { backgroundColor: theme.bg.card },
              bookingType === 'STANDARD' && { backgroundColor: theme.brand[50], borderColor: theme.brand[200] }
            ]}
            onPress={() => setBookingType('STANDARD')}
            activeOpacity={0.9}
          >
            <View style={styles.radioCardHeader}>
              <View style={styles.radioCardTitleRow}>
                <Briefcase size={18} color={bookingType === 'STANDARD' ? theme.brand[500] : '#64748b'} style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.radioCardTitle, { fontFamily: fonts.bold, color: theme.text.primary }]}>
                    Bespoke Studio Appointment
                  </Text>
                  <Text style={[styles.radioCardDesc, { fontFamily: fonts.medium, color: theme.text.secondary }]}>
                    Visit our studio to get measured physically by the Master Tailor.
                  </Text>
                </View>
              </View>
              <View style={[
                styles.radioOuterCircle,
                { borderColor: bookingType === 'STANDARD' ? theme.brand[500] : '#64748b' }
              ]}>
                {bookingType === 'STANDARD' && <View style={[styles.radioInnerCircle, { backgroundColor: theme.brand[500] }]} />}
              </View>
            </View>
          </TouchableOpacity>

          {/* Home Visit Option */}
          <TouchableOpacity
            style={[
              styles.paymentRadioCard,
              shadows.premium,
              { backgroundColor: theme.bg.card, marginTop: 14 },
              bookingType === 'HOME_VISIT' && { backgroundColor: theme.brand[50], borderColor: theme.brand[200] }
            ]}
            onPress={() => setBookingType('HOME_VISIT')}
            activeOpacity={0.9}
          >
            <View style={styles.radioCardHeader}>
              <View style={styles.radioCardTitleRow}>
                <Home size={18} color={bookingType === 'HOME_VISIT' ? theme.brand[500] : '#64748b'} style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.radioCardTitle, { fontFamily: fonts.bold, color: theme.text.primary }]}>
                    Tailor Home Visit
                  </Text>
                  <Text style={[styles.radioCardDesc, { fontFamily: fonts.medium, color: theme.text.secondary }]}>
                    Our representative/tailor visits your address for premium measurement profiling.
                  </Text>
                </View>
              </View>
              <View style={[
                styles.radioOuterCircle,
                { borderColor: bookingType === 'HOME_VISIT' ? theme.brand[500] : '#64748b' }
              ]}>
                {bookingType === 'HOME_VISIT' && <View style={[styles.radioInnerCircle, { backgroundColor: theme.brand[500] }]} />}
              </View>
            </View>
          </TouchableOpacity>

          <Text style={[styles.sectionHeading, { fontFamily: fonts.bold, color: theme.text.primary, marginTop: 24 }]}>
            Preferred Date & Time Slot
          </Text>

          {/* Date Selector Field */}
          <TouchableOpacity
            style={[styles.bookingInputRow, shadows.premium, { backgroundColor: theme.bg.card, borderColor: theme.border }]}
            onPress={() => setShowCalendar(true)}
            activeOpacity={0.8}
          >
            <Calendar size={18} color={theme.brand[500]} style={{ marginRight: 10 }} />
            <Text style={{ fontFamily: fonts.bold, color: theme.text.primary, flex: 1 }}>
              {bookingDate ? formatBookingDate(bookingDate) : 'Select Date'}
            </Text>
            <ChevronLeft size={16} color="#64748b" style={{ transform: [{ rotate: '-90deg' }] }} />
          </TouchableOpacity>

          {/* Time Slot Selection */}
          <View style={styles.slotsContainer}>
            {getFilteredTimeSlots().length > 0 ? (
              getFilteredTimeSlots().map(s => (
                <TouchableOpacity
                  key={s}
                  style={[
                    styles.slotOption,
                    { borderColor: theme.border, backgroundColor: theme.bg.card },
                    bookingSlot === s && { backgroundColor: theme.brand[50], borderColor: theme.brand[200] }
                  ]}
                  onPress={() => setBookingSlot(s)}
                  activeOpacity={0.8}
                >
                  <Text style={[
                    styles.slotText,
                    { fontFamily: fonts.bold, color: theme.text.secondary },
                    bookingSlot === s && { color: theme.brand[500] }
                  ]}>
                    {s}
                  </Text>
                </TouchableOpacity>
              ))
            ) : (
              <Text style={{ fontFamily: fonts.medium, color: '#ef4444', marginTop: 10, fontSize: 13, paddingHorizontal: 20 }}>
                No time slots available for today. Please select another date.
              </Text>
            )}
          </View>

          {/* Quick Order */}
          <Text style={[styles.sectionHeading, { fontFamily: fonts.bold, color: theme.text.primary, marginTop: 24 }]}>
            Quick Order Request
          </Text>
          <TouchableOpacity
            style={[styles.bookingInputRow, shadows.premium, { backgroundColor: theme.bg.card, borderColor: theme.border, marginBottom: isQuickOrder ? 10 : 24 }]}
            onPress={() => setIsQuickOrder(!isQuickOrder)}
            activeOpacity={0.8}
          >
            <View style={[styles.radioOuterCircle, { borderColor: isQuickOrder ? theme.brand[500] : '#64748b', marginRight: 10 }]}>
              {isQuickOrder && <View style={[styles.radioInnerCircle, { backgroundColor: theme.brand[500] }]} />}
            </View>
            <Text style={{ fontFamily: fonts.bold, color: theme.text.primary, flex: 1 }}>
              Mark as Quick Order
            </Text>
          </TouchableOpacity>
          {isQuickOrder && (
            <View style={[styles.instructionsBox, shadows.premium, { backgroundColor: theme.bg.card, marginBottom: 24 }]}>
              
              <Text style={{ fontFamily: fonts.bold, color: theme.brand[500], fontSize: 12, marginBottom: 5 }}>Expected Date *</Text>
              <TouchableOpacity
                style={[styles.bookingInputRow, { backgroundColor: theme.bg.card, borderColor: theme.border, marginBottom: 15, paddingHorizontal: 0, borderBottomWidth: 1, borderTopWidth: 0, borderLeftWidth: 0, borderRightWidth: 0, borderRadius: 0 }]}
                onPress={() => setShowExpectedDateCalendar(true)}
                activeOpacity={0.8}
              >
                <Calendar size={18} color={theme.brand[500]} style={{ marginRight: 10 }} />
                <Text style={{ fontFamily: fonts.bold, color: theme.text.primary, flex: 1 }}>
                  {quickOrderExpectedDate ? formatBookingDate(quickOrderExpectedDate) : 'Select Expected Date'}
                </Text>
                <ChevronLeft size={16} color="#64748b" style={{ transform: [{ rotate: '-90deg' }] }} />
              </TouchableOpacity>

              <Text style={{ fontFamily: fonts.bold, color: theme.brand[500], fontSize: 12, marginBottom: 5 }}>Why do you need this order quick? *</Text>
              <TextInput
                style={[styles.instructionsInput, { fontFamily: fonts.regular, color: theme.text.primary, minHeight: 60, paddingHorizontal: 0 }]}
                placeholder="Required for quick orders..."
                placeholderTextColor="#9e9e9e"
                value={quickOrderReason}
                onChangeText={setQuickOrderReason}
                multiline={true}
                numberOfLines={2}
              />
            </View>
          )}

          {/* Special notes */}
          <Text style={[styles.sectionHeading, { fontFamily: fonts.bold, color: theme.text.primary }]}>
            Special Instructions / Notes
          </Text>
          <View style={[styles.instructionsBox, shadows.premium, { backgroundColor: theme.bg.card, marginBottom: 140 }]}>
            <TextInput
              style={[styles.instructionsInput, { fontFamily: fonts.regular, color: theme.text.primary, minHeight: 80 }]}
              placeholder="e.g. Bring fabric catalog, special sizing requests, landmarks..."
              placeholderTextColor="#9e9e9e"
              value={bookingNotes}
              onChangeText={setBookingNotes}
              multiline={true}
              numberOfLines={3}
            />
          </View>

        </ScrollView>

        <View style={[styles.stickyFooter, shadows.premium, { backgroundColor: theme.bg.card, paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            style={[styles.primaryCTAButton, { backgroundColor: theme.brand[500] }]}
            onPress={handlePlaceOrder}
            disabled={checkoutLoading}
            activeOpacity={0.85}
          >
            {checkoutLoading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={[styles.primaryCTAButtonText, { fontFamily: fonts.bold }]}>
                Confirm Booking & Place Order
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // RENDER: Step 2 (Order Summary Screen)
  const renderStepSummary = () => {
    const address = getSelectedAddress();
    return (
      <View style={{ flex: 1 }}>
        <ScrollView style={styles.stepScroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

          {/* Deliver Address Miniature */}
          {!address ? (
            <TouchableOpacity
              style={[styles.compactAddressCard, shadows.premium, { backgroundColor: theme.bg.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 18 }]}
              onPress={() => setAddressSelectorVisible(true)}
              activeOpacity={0.8}
            >
              <Plus size={18} color={theme.brand[500]} style={{ marginRight: 8 }} />
              <Text style={[styles.compactAddressTitle, { fontFamily: fonts.bold, color: theme.brand[500] }]}>
                Configure Shipping Address
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.compactAddressCard, shadows.premium, { backgroundColor: theme.bg.card }]}>
              <View style={styles.compactAddressLeft}>
                <MapPin size={18} color={theme.brand[500]} style={{ marginRight: 8 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.compactAddressTitle, { fontFamily: fonts.bold, color: theme.text.primary }]} numberOfLines={1}>
                    Deliver to: {address.name}
                  </Text>
                  <Text style={[styles.compactAddressSub, { fontFamily: fonts.regular, color: theme.text.secondary }]} numberOfLines={1}>
                    {address.address}, {address.city}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setAddressSelectorVisible(true)} activeOpacity={0.7}>
                <Text style={[styles.compactAddressChangeText, { fontFamily: fonts.bold, color: theme.brand[500] }]}>
                  Change
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Product Items Summary List */}
          <Text style={[styles.sectionHeading, { fontFamily: fonts.bold, color: theme.text.primary, marginTop: 18 }]}>
            Review Items
          </Text>

          <View style={styles.itemsSummaryList}>
            {cartItems.map((item) => {
              const itemTotal = Number(item.unitPrice ?? item.product.price) * item.quantity;
              return (
                <View key={item.id} style={[styles.summaryItemCard, shadows.premium, { backgroundColor: theme.bg.card }]}>
                  <Image
                    source={{ uri: (item.product.images && item.product.images[0]) || 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=150&q=80' }}
                    style={styles.summaryItemImage}
                  />
                  <View style={styles.summaryItemInfo}>
                    <Text style={[styles.summaryItemName, { fontFamily: fonts.bold, color: theme.text.primary }]} numberOfLines={2}>
                      {item.product.name}
                    </Text>
                    <Text style={[styles.summaryItemSize, { fontFamily: fonts.medium, color: theme.text.muted }]}>
                      Size: L · Qty: {item.quantity}
                    </Text>
                    <Text style={[styles.summaryItemPrice, { fontFamily: fonts.bold, color: theme.text.primary }]}>
                      ₹{Number(item.unitPrice ?? item.product.price).toLocaleString('en-IN', { maximumFractionDigits: 0 })} × {item.quantity} = ₹{itemTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>

          {/* Coupon Applied card */}
          <Text style={[styles.sectionHeading, { fontFamily: fonts.bold, color: theme.text.primary, marginTop: 18 }]}>
            Apply Coupon
          </Text>

          <View style={[styles.couponSummaryBox, shadows.premium, { backgroundColor: theme.bg.card }]}>
            {appliedCoupon ? (
              <View style={styles.appliedCouponRow}>
                <View style={styles.appliedCouponInfo}>
                  <Sparkles size={16} color="#10b981" style={{ marginRight: 6 }} />
                  <Text style={[styles.appliedCouponCode, { fontFamily: fonts.bold, color: '#10b981' }]}>
                    '{appliedCoupon.code}' APPLIED
                  </Text>
                </View>
                <TouchableOpacity onPress={handleRemoveCoupon} activeOpacity={0.7} style={styles.removeCouponBtn}>
                  <Text style={[styles.removeCouponText, { fontFamily: fonts.bold, color: '#ef4444' }]}>Remove</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.couponInputRow}>
                <TextInput
                  style={[styles.couponInput, { fontFamily: fonts.regular, color: theme.text.primary, borderColor: theme.border }]}
                  placeholder="Enter Code"
                  placeholderTextColor="#9e9e9e"
                  value={couponCode}
                  onChangeText={setCouponCode}
                  autoCapitalize="characters"
                />
                <TouchableOpacity
                  style={[styles.couponApplyBtn, { backgroundColor: theme.brand[500] }]}
                  onPress={handleApplyCoupon}
                  disabled={couponLoading}
                  activeOpacity={0.8}
                >
                  {couponLoading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={[styles.couponApplyBtnText, { fontFamily: fonts.bold }]}>Apply</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>

          {availableCoupons.length > 0 && !appliedCoupon && (
            <View style={styles.availableCouponsWrapper}>
              <Text style={[styles.availableCouponsTitle, { fontFamily: fonts.semiBold, color: theme.text.secondary }]}>
                Your Redeemed Vouchers:
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.availableCouponsScroll}>
                {availableCoupons.map(coupon => (
                  <TouchableOpacity
                    key={coupon.id}
                    style={[styles.availableCouponPill, { borderColor: theme.brand[200], backgroundColor: theme.brand[50] }]}
                    onPress={() => handleSelectCoupon(coupon.code)}
                    activeOpacity={0.7}
                  >
                    <Gift size={12} color={theme.brand[500]} />
                    <Text style={[styles.availableCouponText, { fontFamily: fonts.bold, color: theme.brand[700] }]}>
                      {coupon.code} (₹{Number(coupon.discountFlat).toLocaleString('en-IN', { maximumFractionDigits: 0 })})
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Order Instructions Text Box */}
          <Text style={[styles.sectionHeading, { fontFamily: fonts.bold, color: theme.text.primary, marginTop: 18 }]}>
            Delivery Instructions
          </Text>
          <View style={[styles.instructionsBox, shadows.premium, { backgroundColor: theme.bg.card }]}>
            <TextInput
              style={[styles.instructionsInput, { fontFamily: fonts.regular, color: theme.text.primary }]}
              placeholder="e.g. Leave at security, call before delivery, ring once"
              placeholderTextColor="#9e9e9e"
              value={deliveryInstructions}
              onChangeText={setDeliveryInstructions}
              multiline={true}
              numberOfLines={3}
            />
          </View>

          {/* Detailed Pricing Card */}
          <Text style={[styles.sectionHeading, { fontFamily: fonts.bold, color: theme.text.primary, marginTop: 18 }]}>
            Price Details
          </Text>

          <View style={[styles.pricingBreakdownCard, shadows.premium, { backgroundColor: theme.bg.card }]}>
            <View style={styles.pricingRow}>
              <Text style={[styles.pricingLabel, { fontFamily: fonts.regular, color: theme.text.secondary }]}>Est. Items Total</Text>
              <Text style={[styles.pricingValue, { fontFamily: fonts.semiBold, color: theme.text.primary }]}>₹{subtotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</Text>
            </View>
            {discountVal > 0 && (
              <View style={styles.pricingRow}>
                <Text style={[styles.pricingLabel, { fontFamily: fonts.regular, color: '#10b981' }]}>Coupon Discount</Text>
                <Text style={[styles.pricingValue, { fontFamily: fonts.bold, color: '#10b981' }]}>- ₹{discountVal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</Text>
              </View>
            )}
            <View style={styles.pricingRow}>
              <Text style={[styles.pricingLabel, { fontFamily: fonts.regular, color: theme.text.secondary }]}>Delivery Charges</Text>
              <Text style={[styles.pricingValue, { fontFamily: fonts.semiBold, color: theme.text.primary }]}>
                {deliveryCharges === 0 ? 'FREE' : `₹${deliveryCharges}`}
              </Text>
            </View>
            <View style={styles.pricingRow}>
              <Text style={[styles.pricingLabel, { fontFamily: fonts.regular, color: theme.text.secondary }]}>GST Tax (18%)</Text>
              <Text style={[styles.pricingValue, { fontFamily: fonts.semiBold, color: theme.text.primary }]}>₹{taxVal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</Text>
            </View>

            <View style={[styles.priceDividerLine, { backgroundColor: theme.border }]} />

            <View style={styles.pricingRow}>
              <Text style={[styles.grandTotalLabel, { fontFamily: fonts.bold, color: theme.text.primary }]}>Est. Total Payable</Text>
              <Text style={[styles.grandTotalValue, { fontFamily: fonts.bold, color: theme.text.primary }]}>₹{grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</Text>
            </View>
          </View>

        </ScrollView>

        <View style={[styles.stickyFooter, shadows.premium, { backgroundColor: theme.bg.card, paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            style={[styles.primaryCTAButton, { backgroundColor: theme.brand[500] }]}
            onPress={() => {
              if (!address) {
                Alert.alert('Address Required', 'Please configure your shipping address before proceeding.');
                return;
              }
              setCurrentStep(1);
            }}
            activeOpacity={0.85}
          >
            <Text style={[styles.primaryCTAButtonText, { fontFamily: fonts.bold }]}>Proceed to Fitting Booking</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // RENDER: Step 3 (Order Placed Success Screen)
  const renderStepSuccess = () => {
    const address = getSelectedAddress();
    const estDate = new Date();
    estDate.setDate(estDate.getDate() + 8); // Estimate delivery in 8 days
    const estDateString = estDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

    return (
      <ScrollView
        style={styles.stepScroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.successScrollContainer}
      >
        <View style={styles.successCelebration}>
          <View style={styles.successIconCircle}>
            <CheckCircle2 size={44} color="#ffffff" />
          </View>
          <Text style={[styles.successTitle, { fontFamily: fonts.bold, color: theme.text.primary }]}>
            Order Placed Successfully! 🎉
          </Text>
          <Text style={[styles.successSubtitle, { fontFamily: fonts.medium, color: theme.text.secondary }]}>
            Thank you for your order. We have received your order request and scheduled your custom fitting session.
          </Text>
        </View>

        {placedOrder && (
          <View style={[styles.successDetailsCard, shadows.premium, { backgroundColor: theme.bg.card }]}>
            <View style={styles.successDetailRow}>
              <Text style={[styles.successDetailLabel, { fontFamily: fonts.bold, color: theme.text.secondary }]}>Order ID</Text>
              <Text style={[styles.successDetailValue, styles.successOrderId, { fontFamily: fonts.bold, color: theme.text.primary }]}>
                {placedOrder.invoiceNumber || 'N/A'}
              </Text>
            </View>

            <View style={styles.successDetailRow}>
              <Text style={[styles.successDetailLabel, { fontFamily: fonts.bold, color: theme.text.secondary }]}>Order Date</Text>
              <Text style={[styles.successDetailValue, { fontFamily: fonts.bold, color: theme.text.primary }]}>
                {placedOrder.createdAt ? new Date(placedOrder.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
              </Text>
            </View>

            <View style={styles.successDetailRow}>
              <Text style={[styles.successDetailLabel, { fontFamily: fonts.bold, color: theme.text.secondary }]}>Fitting Option</Text>
              <Text style={[styles.successDetailValue, { fontFamily: fonts.bold, color: theme.text.primary }]}>
                {bookingType === 'STANDARD' ? 'Studio Appointment' : 'Home Visit Fitting'}
              </Text>
            </View>

            <View style={styles.successDetailRow}>
              <Text style={[styles.successDetailLabel, { fontFamily: fonts.bold, color: theme.text.secondary }]}>Fitting Schedule</Text>
              <Text style={[styles.successDetailValue, { fontFamily: fonts.bold, color: theme.brand[500] }]}>
                {bookingDate ? formatBookingDate(bookingDate) : 'Not scheduled'}{bookingSlot ? ` · ${bookingSlot}` : ''}
              </Text>
            </View>

            <View style={styles.successDetailRow}>
              <Text style={[styles.successDetailLabel, { fontFamily: fonts.bold, color: theme.text.secondary }]}>Estimated Delivery</Text>
              <Text style={[styles.successDetailValue, { fontFamily: fonts.bold, color: theme.text.primary }]}>
                {estDateString}
              </Text>
            </View>

            <View style={[styles.successDividerLine, { backgroundColor: theme.border }]} />

            <View style={{ gap: 4 }}>
              <Text style={[styles.successDetailLabel, { fontFamily: fonts.bold, color: theme.text.secondary }]}>Delivery Address</Text>
              <Text style={[styles.successDetailAddress, { fontFamily: fonts.regular, color: theme.text.primary }]}>
                {address?.name}{'\n'}
                {address?.address}{address?.landmark ? `, Near ${address?.landmark}` : ''}{address?.area ? `, ${address?.area}` : ''}{address?.city ? `, ${address?.city}` : ''}{address?.pincode ? ` - ${address?.pincode}` : ''}{'\n'}
                Ph: {address?.phone}
              </Text>
            </View>
          </View>
        )}

        <View style={styles.successActionsContainer}>
          <TouchableOpacity
            style={[styles.successTrackBtn, { backgroundColor: theme.brand[500] }, shadows.premium]}
            onPress={() => {
              if (placedOrder) {
                navigation.navigate('OrderTracking', { orderId: placedOrder.id });
              } else {
                navigation.navigate('Orders');
              }
            }}
            activeOpacity={0.8}
          >
            <Text style={[styles.successTrackBtnText, { fontFamily: fonts.bold }]}>Track Order</Text>
          </TouchableOpacity>

          <View style={styles.successSecondaryActions}>
            <TouchableOpacity
              style={[styles.successSecondaryBtn, { borderColor: theme.border }]}
              onPress={() => navigation.navigate('Orders')}
              activeOpacity={0.7}
            >
              <Text style={[styles.successSecondaryBtnText, { fontFamily: fonts.bold, color: theme.text.primary }]}>
                View History
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.successSecondaryBtn, { borderColor: theme.border }]}
              onPress={() => navigation.navigate('MainTabs', { screen: 'Browse' })}
              activeOpacity={0.7}
            >
              <Text style={[styles.successSecondaryBtnText, { fontFamily: fonts.bold, color: theme.text.primary }]}>
                Keep Shopping
              </Text>
            </TouchableOpacity>
          </View>
        </View>

      </ScrollView>
    );
  };

  // MAIN PAGE LAYOUT RENDER
  return (
    <View style={[styles.container, { backgroundColor: theme.bg.main }]}>
      <StatusBar barStyle="dark-content" />

      {/* SECURE HEADER */}
      <View style={styles.headerBar}>
        {currentStep < 2 && (
          <TouchableOpacity
            style={[styles.headerBtn, shadows.premium, { backgroundColor: theme.bg.card }]}
            onPress={() => {
              if (currentStep > 0) {
                setCurrentStep(currentStep - 1);
              } else {
                navigation.goBack();
              }
            }}
          >
            <ChevronLeft size={20} color="#1e1e1e" />
          </TouchableOpacity>
        )}
        <View style={{ flex: 1, alignItems: 'center', marginRight: currentStep < 2 ? 40 : 0 }}>
          <Text style={[styles.headerTitle, { fontFamily: fonts.bold, color: theme.text.primary }]}>
            {currentStep === 2 ? 'Order Success' : 'Secure Checkout'}
          </Text>
        </View>
      </View>

      {/* Progress Stepper */}
      {renderStepper()}

      {/* Date Selection Calendar Modal */}
      {renderCalendarModal()}
      {renderExpectedDateCalendarModal()}

      {/* Screen body loading skeleton fallback */}
      {loading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={theme.brand[500]} />
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {currentStep === 0 && renderStepSummary()}
          {currentStep === 1 && renderStepBooking()}
          {currentStep === 2 && renderStepSuccess()}
        </View>
      )}

      {/* Global Address selector modal */}
      {userProfile && (
        <AddressSelector
          visible={addressSelectorVisible}
          onClose={() => setAddressSelectorVisible(false)}
          userProfile={userProfile}
          setUserProfile={setUserProfile}
        />
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 10,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    textAlign: 'center',
  },

  /* Horizontal Stepper component styles */
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    marginVertical: 14,
  },
  stepWrapper: {
    alignItems: 'center',
    gap: 4,
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f1f5f9',
    borderColor: '#e2e8f0',
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumber: {
    fontSize: 11,
  },
  stepLabel: {
    fontSize: 10,
    textAlign: 'center',
  },
  stepLine: {
    height: 2,
    flex: 0.35,
    marginHorizontal: 4,
    marginTop: -14, // align with circle centers
  },

  /* Step Container general scroll list */
  stepScroll: {
    flex: 1,
  },
  sectionHeading: {
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 10,
  },

  /* Step 1: Delivery Address items */
  addressDisplayCard: {
    borderRadius: 20,
    marginHorizontal: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f0f0f2',
    gap: 12,
  },
  addressDisplayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  addressTypeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  addressTypeText: {
    fontSize: 9,
    letterSpacing: 0.5,
  },
  changeAddressTextBtn: {
    paddingVertical: 4,
  },
  changeAddressText: {
    fontSize: 12,
  },
  addressName: {
    fontSize: 16,
  },
  addressDetails: {
    fontSize: 13,
    lineHeight: 18,
  },
  addressPhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  addressPhoneText: {
    fontSize: 13,
  },

  /* Address Selector Empty state view styles */
  emptyStepScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingBottom: 60,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyStepTitle: {
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyStepDesc: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 24,
  },
  emptyStepBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
  },
  emptyStepBtnText: {
    fontSize: 13,
    color: '#ffffff',
  },

  /* Sticky button footer bar */
  stickyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f2',
  },
  primaryCTAButton: {
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryCTAButtonText: {
    fontSize: 15,
    color: '#3D2E3D',
  },

  /* Step 2: Summary cards styles */
  compactAddressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    padding: 12,
    marginHorizontal: 20,
    borderWidth: 1,
    borderColor: '#f0f0f2',
  },
  compactAddressLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  compactAddressTitle: {
    fontSize: 13,
  },
  compactAddressSub: {
    fontSize: 11,
    marginTop: 1,
  },
  compactAddressChangeText: {
    fontSize: 12,
  },
  itemsSummaryList: {
    paddingHorizontal: 20,
    gap: 12,
  },
  summaryItemCard: {
    flexDirection: 'row',
    padding: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f0f0f2',
  },
  summaryItemImage: {
    width: 60,
    height: 66,
    borderRadius: 12,
  },
  summaryItemInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
    gap: 3,
  },
  summaryItemName: {
    fontSize: 13.5,
  },
  summaryItemSize: {
    fontSize: 11,
  },
  summaryItemPrice: {
    fontSize: 12,
  },
  couponSummaryBox: {
    marginHorizontal: 20,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f0f0f2',
  },
  couponInputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  couponInput: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 13,
  },
  couponApplyBtn: {
    width: 80,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  couponApplyBtnText: {
    color: '#3D2E3D',
    fontSize: 13,
  },
  appliedCouponRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  appliedCouponInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  appliedCouponCode: {
    fontSize: 13,
  },
  removeCouponBtn: {
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  removeCouponText: {
    fontSize: 12,
  },
  instructionsBox: {
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#f0f0f2',
  },
  instructionsInput: {
    height: 60,
    fontSize: 13,
    textAlignVertical: 'top',
  },
  pricingBreakdownCard: {
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#f0f0f2',
    gap: 10,
    marginBottom: 140, // spacer for sticky button
  },
  pricingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pricingLabel: {
    fontSize: 13,
  },
  pricingValue: {
    fontSize: 13,
  },
  priceDividerLine: {
    height: 1,
    marginVertical: 4,
  },
  grandTotalLabel: {
    fontSize: 15,
  },
  grandTotalValue: {
    fontSize: 17,
  },

  /* Step 3: Payment cards layout */
  paymentRadioCard: {
    marginHorizontal: 20,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f0f0f2',
  },
  radioCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  radioCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  radioCardTitle: {
    fontSize: 15,
  },
  radioCardDesc: {
    fontSize: 11,
    marginTop: 2,
  },
  radioOuterCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInnerCircle: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  upiPaymentSection: {
    marginTop: 14,
    borderTopWidth: 0.8,
    borderColor: '#f1f5f9',
    paddingTop: 12,
  },
  upiOptionsTitle: {
    fontSize: 12,
    marginBottom: 8,
  },
  upiProvidersRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  upiProviderBtn: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  upiProviderText: {
    fontSize: 11,
  },
  upiInputWrapper: {
    marginTop: 8,
  },
  upiIdInput: {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 13,
  },
  securityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 12,
    marginHorizontal: 20,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 140, // spacer for sticky button
  },
  securityText: {
    fontSize: 11.5,
    flex: 1,
    lineHeight: 15,
  },

  /* Step 4: Success Screen details */
  successScrollContainer: {
    paddingBottom: 60,
    paddingHorizontal: 20,
  },
  successCelebration: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 24,
  },
  successIconCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 20,
    textAlign: 'center',
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  successDetailsCard: {
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#f0f0f2',
    gap: 12,
    marginBottom: 30,
  },
  successDetailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  successDetailLabel: {
    fontSize: 13.5,
    width: 112,
    flexShrink: 0,
  },
  successDetailValue: {
    fontSize: 14,
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    textAlign: 'right',
  },
  successOrderId: {
    fontSize: 11.5,
  },
  successDividerLine: {
    height: 1,
    marginVertical: 4,
  },
  successDetailAddress: {
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 2,
  },
  successActionsContainer: {
    gap: 12,
  },
  successTrackBtn: {
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTrackBtnText: {
    fontSize: 15,
    color: '#3D2E3D',
  },
  successSecondaryActions: {
    flexDirection: 'row',
    gap: 12,
  },
  successSecondaryBtn: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  successSecondaryBtnText: {
    fontSize: 13.5,
  },
  availableCouponsWrapper: {
    marginTop: 10,
    marginBottom: 8,
  },
  availableCouponsTitle: {
    fontSize: 12,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  availableCouponsScroll: {
    gap: 8,
    paddingHorizontal: 4,
  },
  availableCouponPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  availableCouponText: {
    fontSize: 11,
  },
  bookingInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    marginHorizontal: 20,
    marginTop: 10,
  },
  slotsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 14,
  },
  slotOption: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotText: {
    fontSize: 12,
  },
  calendarOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  calendarCard: {
    width: '100%',
    borderRadius: 24,
    padding: 20,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 20,
  },
  calendarMonthText: {
    fontSize: 16,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  dayCell: {
    width: '14.28%',
    height: 45,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  dayText: {
    fontSize: 14,
  },
  closeCalendarBtn: {
    marginTop: 20,
    height: 50,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeCalendarBtnText: {
    fontSize: 12,
    letterSpacing: 1,
  },
});
