import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  FlatList, 
  TouchableOpacity, 
  ActivityIndicator, 
  Alert,
  KeyboardAvoidingView,
  Modal,
  TextInput,
  ScrollView,
  Platform,
  Animated,
  Dimensions,
  StatusBar,
  Image,
  RefreshControl
} from 'react-native';
import { useTheme } from '../../styles/ThemeContext';
import { APP_CONFIG } from '../../config/app.config';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { 
  Calendar, 
  Clock, 
  Sparkles, 
  AlertTriangle, 
  Plus, 
  X, 
  ChevronLeft, 
  Trash2, 
  MapPin, 
  User, 
  Info,
  ChevronRight,
  Clock3,
  ArrowRight,
  Home,
  Briefcase,
  CheckCircle2,
  ChevronDown,
  CalendarDays
} from 'lucide-react-native';

const { width } = Dimensions.get('window');

function BookingSkeletonCard({ theme }) {
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.75, duration: 750, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.35, duration: 750, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View style={[styles.skeletonCard, { backgroundColor: theme.bg.card, borderColor: theme.border, opacity }]}>
      <View style={styles.skeletonHeader}>
        <View style={[styles.skeletonPill, { backgroundColor: theme.border }]} />
        <View style={[styles.skeletonPillSmall, { backgroundColor: theme.border }]} />
      </View>
      <View style={styles.skeletonBody}>
        <View style={[styles.skeletonSquare, { backgroundColor: theme.border }]} />
        <View style={{ flex: 1, gap: 10 }}>
          <View style={[styles.skeletonLine, { width: '82%', backgroundColor: theme.border }]} />
          <View style={[styles.skeletonLine, { width: '52%', backgroundColor: theme.border }]} />
          <View style={[styles.skeletonLine, { width: '68%', backgroundColor: theme.border }]} />
        </View>
      </View>
    </Animated.View>
  );
}

export default function AppointmentBookingScreen({ navigation, route }) {
  const { theme, fonts, shadows } = useTheme();
  const [appointments, setAppointments] = useState([]);
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bookingModalVisible, setBookingModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [productImage, setProductImage] = useState('');
  const { requireAuth, user } = useAuth();
  
  // Tab View Toggle: 'SERVICE' or 'VISIT'
  const [activeTab, setActiveTab] = useState('SERVICE');
  const horizontalScrollRef = useRef(null);

  // Pagination states
  const [apptsPage, setApptsPage] = useState(1);
  const [visitsPage, setVisitsPage] = useState(1);
  const [hasMoreAppts, setHasMoreAppts] = useState(true);
  const [hasMoreVisits, setHasMoreVisits] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Initialize default date (tomorrow if evening)
  const getInitialBookingDate = () => {
    const d = new Date();
    if (d.getHours() >= 18) {
      d.setDate(d.getDate() + 1);
    }
    return d;
  };

  // Calendar modal states
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(getInitialBookingDate());
  
  // Form states
  const [apptCategory, setApptCategory] = useState('');
  const [timeSlot, setTimeSlot] = useState('');
  const [productDetails, setProductDetails] = useState('');
  const [notes, setNotes] = useState('');
  const [address, setAddress] = useState('');
  
  // Validation states
  const [errors, setErrors] = useState({});

  // Rescheduling states
  const [rescheduleModalVisible, setRescheduleModalVisible] = useState(false);
  const [reschedulingItem, setReschedulingItem] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState(null);
  const [rescheduleTimeSlot, setRescheduleTimeSlot] = useState('');
  const [rescheduleNotes, setRescheduleNotes] = useState('');
  const [calendarTarget, setCalendarTarget] = useState('BOOKING');

  const [bookedSlotsCounts, setBookedSlotsCounts] = useState({});
  const [maxBookingsPerSlot, setMaxBookingsPerSlot] = useState(5);

  // Slot Booking States
  const [slotModalVisible, setSlotModalVisible] = useState(false);
  const [slotDate, setSlotDate] = useState(getInitialBookingDate());
  const [slotTime, setSlotTime] = useState('');
  const [slotDescription, setSlotDescription] = useState('');
  const [slotErrors, setSlotErrors] = useState({});
  const [slotSubmitting, setSlotSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [availableSlots, setAvailableSlots] = useState([]);

  const handleTabPress = (tabName) => {
    setActiveTab(tabName);
    if (tabName === 'SERVICE') {
      horizontalScrollRef.current?.scrollTo({ x: 0, animated: true });
    } else {
      horizontalScrollRef.current?.scrollTo({ x: width, animated: true });
    }
  };

  const handleHorizontalScrollEnd = (e) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const pageIndex = Math.round(offsetX / width);
    if (pageIndex === 0 && activeTab !== 'SERVICE') {
      setActiveTab('SERVICE');
    } else if (pageIndex === 1 && activeTab !== 'VISIT') {
      setActiveTab('VISIT');
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await api.get('/system/settings/public');
      if (res.success && res.data) {
        setMaxBookingsPerSlot(res.data.maxBookingsPerSlot || 5);
      }
    } catch (err) {
      console.warn('Error fetching settings:', err.message);
    }
  };

  const loadBookedSlots = async (targetDate) => {
    if (!targetDate) return;

    try {
      const yearVal = targetDate.getFullYear();
      const monthVal = String(targetDate.getMonth() + 1).padStart(2, '0');
      const dayVal = String(targetDate.getDate()).padStart(2, '0');
      const formattedDate = `${yearVal}-${monthVal}-${dayVal}T12:00:00.000Z`;
      const res = await api.get(`/appointments/availability?date=${formattedDate}`);
      if (res.success && res.data) {
        setBookedSlotsCounts(res.data.counts || {});
        if (res.data.availableSlots && res.data.availableSlots.length > 0) {
          setAvailableSlots(res.data.availableSlots);
        }
      } else {
        setBookedSlotsCounts({});
      }
    } catch (err) {
      console.warn('Failed to load booked slots counts:', err.message);
      setBookedSlotsCounts({});
    }
  };

  useEffect(() => {
    fetchSettings();
    const initialD = getInitialBookingDate();
    loadBookedSlots(initialD);
    loadData(true);
  }, []);

  useEffect(() => {
    if (route?.params?.autoOpenModal) {
      handleTabPress('SERVICE');
      setBookingModalVisible(true);
      if (route.params.prefillProduct) {
        setProductDetails(route.params.prefillProduct);
      }
      if (route.params.prefillCategory) {
        setApptCategory(route.params.prefillCategory);
      }
      if (route.params.prefillProductImage) {
        setProductImage(route.params.prefillProductImage);
      }
      navigation.setParams({ autoOpenModal: false, prefillProduct: undefined, prefillCategory: undefined, prefillProductImage: undefined });
    }
  }, [route?.params]);

  useEffect(() => {
    if (selectedDate) {
      loadBookedSlots(selectedDate);
    }
  }, [selectedDate]);

  useEffect(() => {
    if (rescheduleDate) {
      loadBookedSlots(rescheduleDate);
    }
  }, [rescheduleDate]);

  const DEFAULT_SLOTS = [
    "10:00 AM - 11:00 AM",
    "11:00 AM - 12:00 PM",
    "12:00 PM - 01:00 PM",
    "01:00 PM - 02:00 PM",
    "02:00 PM - 03:00 PM",
    "03:00 PM - 04:00 PM",
    "04:00 PM - 05:00 PM",
    "05:00 PM - 06:00 PM",
    "06:00 PM - 07:00 PM",
    "07:00 PM - 08:00 PM"
  ];

  const formatSlotDisplay = (slotStr) => {
    if (!slotStr) return '';
    if (slotStr.includes('AM') || slotStr.includes('PM')) return slotStr;
    try {
      const parts = slotStr.split(' - ');
      if (parts.length !== 2) return slotStr;
      const formatPart = (timeStr) => {
        let [h, m] = timeStr.trim().split(':').map(Number);
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12;
        h = h ? h : 12;
        return `${String(h).padStart(2, '0')}:${String(m || 0).padStart(2, '0')} ${ampm}`;
      };
      return `${formatPart(parts[0])} - ${formatPart(parts[1])}`;
    } catch (e) {
      return slotStr;
    }
  };

  const getFilteredAvailableSlots = (dateObj) => {
    const targetDate = dateObj || selectedDate;
    const rawPool = availableSlots && availableSlots.length > 0 ? availableSlots : DEFAULT_SLOTS;
    const pool = rawPool.map(formatSlotDisplay);

    if (!targetDate) return pool;

    const isToday = targetDate.toDateString() === new Date().toDateString();
    const now = new Date();

    const activeSlots = pool.filter(s => {
      const count = bookedSlotsCounts[s] || 0;
      if (count >= maxBookingsPerSlot) return false;

      if (isToday) {
        try {
          const startPart = s.split(' - ')[0].trim();
          let hours = 0;
          let minutes = 0;
          if (startPart.includes('AM') || startPart.includes('PM')) {
            const [time, modifier] = startPart.split(' ');
            [hours, minutes] = time.split(':').map(Number);
            if (modifier === 'PM' && hours !== 12) hours += 12;
            if (modifier === 'AM' && hours === 12) hours = 0;
          } else {
            [hours, minutes] = startPart.split(':').map(Number);
          }
          
          const slotStartTime = new Date(now);
          slotStartTime.setHours(hours, minutes, 0, 0);
          
          if (now >= slotStartTime) {
            return false;
          }
        } catch (e) {
          console.error(e);
        }
      }
      return true;
    });

    return activeSlots.length > 0 ? activeSlots : pool;
  };

  const loadData = async (reset = false) => {
    if (!user) {
      setAppointments([]);
      setVisits([]);
      setLoading(false);
      return;
    }
    try {
      if (reset) {
        setApptsPage(1);
        setVisitsPage(1);
        setHasMoreAppts(true);
        setHasMoreVisits(true);
      }
      
      if (appointments.length === 0 && visits.length === 0) {
        setLoading(true);
      }
      const [apptsRes, visitsRes] = await Promise.all([
        api.get('/appointments?limit=20&page=1').catch(() => ({ success: false, data: [] })),
        api.get('/visits?limit=20&page=1').catch(() => ({ success: false, data: [] }))
      ]);
      
      if (apptsRes && apptsRes.success) {
        const apptList = Array.isArray(apptsRes.data) ? apptsRes.data : (apptsRes.data?.data || []);
        setAppointments(apptList);
        setHasMoreAppts(apptList.length >= 20);
        if (reset) setApptsPage(1);
      } else {
        setAppointments([]);
      }

      if (visitsRes && visitsRes.success) {
        const visitList = Array.isArray(visitsRes.data) ? visitsRes.data : (visitsRes.data?.data || []);
        setVisits(visitList);
        setHasMoreVisits(visitList.length >= 20);
        if (reset) setVisitsPage(1);
      } else {
        setVisits([]);
      }
    } catch (err) {
      console.warn('Error fetching bookings:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData(true);
    setRefreshing(false);
  };

  const loadMoreData = async () => {
    if (loadingMore || !user) return;
    
    try {
      setLoadingMore(true);
      if (activeTab === 'SERVICE' && hasMoreAppts) {
        const nextPage = apptsPage + 1;
        const res = await api.get(`/appointments?limit=20&page=${nextPage}`);
        if (res.success && res.data?.length > 0) {
          setAppointments(prev => [...prev, ...res.data]);
          setApptsPage(nextPage);
          setHasMoreAppts(res.data.length >= 20);
        } else {
          setHasMoreAppts(false);
        }
      } else if (activeTab === 'VISIT' && hasMoreVisits) {
        const nextPage = visitsPage + 1;
        const res = await api.get(`/visits?limit=20&page=${nextPage}`);
        if (res.success && res.data?.length > 0) {
          setVisits(prev => [...prev, ...res.data]);
          setVisitsPage(nextPage);
          setHasMoreVisits(res.data.length >= 20);
        } else {
          setHasMoreVisits(false);
        }
      }
    } catch (err) {
      console.error('Error fetching more bookings:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    loadData(true);
  }, [user]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadData(true);
    });
    return unsubscribe;
  }, [navigation, user]);

  const validateForm = () => {
    const newErrors = {};
    if (!selectedDate) newErrors.date = 'Date is required';
    if (activeTab === 'SERVICE') {
      if (!apptCategory.trim()) newErrors.category = 'Category is required';
      if (!timeSlot) newErrors.timeSlot = 'Time slot is required';
      if (!productDetails.trim()) newErrors.product = 'Details are required';
    } else {
      if (!address.trim()) newErrors.address = 'Address is required';
      if (!notes.trim()) newErrors.notes = 'Requirements are required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleBooking = async () => {
    requireAuth(async () => {
      if (!validateForm()) return;
      setSubmitting(true);
      try {
        const yearVal = selectedDate.getFullYear();
        const monthVal = String(selectedDate.getMonth() + 1).padStart(2, '0');
        const dayVal = String(selectedDate.getDate()).padStart(2, '0');
        const formattedDate = `${yearVal}-${monthVal}-${dayVal}T12:00:00.000Z`;
        let res;
        if (activeTab === 'SERVICE') {
          res = await api.post('/appointments', {
            date: formattedDate,
            timeSlot,
            productType: productDetails,
            type: 'CONSULTATION',
            notes: `Category: ${apptCategory}\nProductImage: ${productImage || ''}\n${notes}`,
          });
        } else {
          res = await api.post('/visits', {
            preferredDate: formattedDate,
            address,
            requirements: notes,
          });
        }

        if (res.success) {
          Alert.alert('Success', `${activeTab === 'SERVICE' ? 'Service' : 'Home Visit'} booked successfully.`);
          setBookingModalVisible(false);
          resetForm();
          loadData(true);
        }
      } catch (err) {
        Alert.alert('Error', err.message || 'Booking failed.');
      } finally {
        setSubmitting(false);
      }
    });
  };

  const resetForm = () => {
    setSelectedDate(null);
    setApptCategory('');
    setTimeSlot('');
    setProductDetails('');
    setProductImage('');
    setNotes('');
    setAddress('');
    setErrors({});
  };

  const resetSlotForm = () => {
    setSlotDate(null);
    setSlotTime('');
    setSlotDescription('');
    setSlotErrors({});
  };

  const handleSlotBooking = async () => {
    requireAuth(async () => {
      const newErrors = {};
      if (!slotDate) newErrors.date = 'Please select a date';
      if (!slotTime) newErrors.time = 'Please select a time slot';
      setSlotErrors(newErrors);
      if (Object.keys(newErrors).length > 0) return;

      setSlotSubmitting(true);
      try {
        const yearVal = slotDate.getFullYear();
        const monthVal = String(slotDate.getMonth() + 1).padStart(2, '0');
        const dayVal = String(slotDate.getDate()).padStart(2, '0');
        const formattedDate = `${yearVal}-${monthVal}-${dayVal}T12:00:00.000Z`;

        const res = await api.post('/appointments', {
          date: formattedDate,
          timeSlot: slotTime,
          productType: 'SLOT_BOOKING',
          type: 'CONSULTATION',
          notes: slotDescription.trim() || undefined,
        });

        if (res.success) {
          Alert.alert('Slot Booked!', 'Your slot has been booked successfully.');
          setSlotModalVisible(false);
          resetSlotForm();
          loadData(true);
        }
      } catch (err) {
        Alert.alert('Error', err.message || 'Failed to book slot.');
      } finally {
        setSlotSubmitting(false);
      }
    });
  };

  const handleReschedulePress = (item) => {
    const isVisit = !!item.address;
    setReschedulingItem(item);
    
    const dateStr = isVisit ? item.preferredDate : item.date;
    const bDate = new Date(dateStr);
    const localDate = new Date(bDate.getUTCFullYear(), bDate.getUTCMonth(), bDate.getUTCDate());
    
    setRescheduleDate(localDate);
    setRescheduleTimeSlot(isVisit ? '' : (item.timeSlot || ''));
    
    let initialNotes = '';
    if (isVisit) {
      initialNotes = item.requirements || '';
    } else {
      initialNotes = item.notes || '';
    }
    setRescheduleNotes(initialNotes);
    setErrors({});
    setRescheduleModalVisible(true);
  };

  const handleCancelPress = (item) => {
    const isVisit = !!item.address;
    Alert.alert(
      'Cancel Booking',
      `Are you sure you want to cancel this ${isVisit ? 'home visit' : 'standard'} booking?`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              const endpoint = isVisit ? `/visits/${item.id}` : `/appointments/${item.id}`;
              const res = await api.put(endpoint, { status: 'CANCELLED' });
              if (res.success) {
                Alert.alert('Success', 'Booking cancelled successfully.');
                loadData(true);
              } else {
                Alert.alert('Error', res.message || 'Failed to cancel booking.');
              }
            } catch (err) {
              Alert.alert('Error', err.message || 'An error occurred.');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const submitReschedule = async () => {
    requireAuth(async () => {
      if (!rescheduleDate) {
        setErrors({ rescheduleDate: 'Date is required' });
        return;
      }
      const isVisit = !!reschedulingItem.address;
      if (!isVisit && !rescheduleTimeSlot) {
        setErrors({ rescheduleTimeSlot: 'Time slot is required' });
        return;
      }
      
      setSubmitting(true);
      try {
        const yearVal = rescheduleDate.getFullYear();
        const monthVal = String(rescheduleDate.getMonth() + 1).padStart(2, '0');
        const dayVal = String(rescheduleDate.getDate()).padStart(2, '0');
        const formattedDate = `${yearVal}-${monthVal}-${dayVal}T12:00:00.000Z`;
        
        const endpoint = isVisit ? `/visits/${reschedulingItem.id}` : `/appointments/${reschedulingItem.id}`;
        const payload = isVisit 
          ? { preferredDate: formattedDate, requirements: rescheduleNotes }
          : { date: formattedDate, timeSlot: rescheduleTimeSlot, notes: rescheduleNotes };
          
        const res = await api.put(endpoint, payload);
        if (res.success) {
          Alert.alert('Success', 'Booking rescheduled successfully.');
          setRescheduleModalVisible(false);
          loadData(true);
        } else {
          Alert.alert('Error', res.message || 'Failed to reschedule.');
        }
      } catch (err) {
        Alert.alert('Error', err.message || 'An error occurred.');
      } finally {
        setSubmitting(false);
      }
    });
  };

  const renderCalendarModal = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    
    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();
    
    const days = [];
    for (let i = firstDay - 1; i >= 0; i--) {
      days.push({ date: new Date(year, month - 1, prevMonthDays - i), isCurrentMonth: false });
    }
    for (let i = 1; i <= totalDays; i++) {
      days.push({ date: new Date(year, month, i), isCurrentMonth: true });
    }
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
    }
    
    const today = new Date();
    today.setHours(0,0,0,0);

    return (
      <Modal visible={showCalendarModal} transparent animationType="fade">
        <View style={styles.calendarOverlay}>
          <View style={[styles.calendarCard, { backgroundColor: '#ffffff', borderColor: theme.border }]}>
            <View style={styles.calendarHeader}>
              <TouchableOpacity style={styles.monthNavBtn} onPress={() => setCurrentMonth(new Date(year, month - 1, 1))}>
                <ChevronLeft size={20} color={theme.brand[900]} />
              </TouchableOpacity>
              <Text style={[styles.calendarMonthText, { color: theme.brand[900], fontFamily: fonts.bold }]}>{monthNames[month]} {year}</Text>
              <TouchableOpacity style={styles.monthNavBtn} onPress={() => setCurrentMonth(new Date(year, month + 1, 1))}>
                <ChevronRight size={20} color={theme.brand[900]} />
              </TouchableOpacity>
            </View>
            <View style={styles.weekDaysRow}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => (
                <Text key={i} style={[styles.weekDayText, { color: theme.text.secondary, fontFamily: fonts.semiBold }]}>{day}</Text>
              ))}
            </View>
            <View style={styles.daysGrid}>
              {days.map((item, i) => {
                const targetDate = calendarTarget === 'RESCHEDULE' ? rescheduleDate : selectedDate;
                const isSelected = targetDate && targetDate.toDateString() === item.date.toDateString();
                const isPast = item.date < today;
                return (
                  <TouchableOpacity 
                    key={i} 
                    style={[
                      styles.dayCell, 
                      isSelected && { backgroundColor: theme.brand[500], borderRadius: 12 }
                    ]}
                    disabled={isPast || !item.isCurrentMonth}
                    onPress={() => {
                      if (calendarTarget === 'RESCHEDULE') {
                        setRescheduleDate(item.date);
                      } else if (calendarTarget === 'SLOT') {
                        setSlotDate(item.date);
                        loadBookedSlots(item.date);
                      } else {
                        setSelectedDate(item.date);
                      }
                      setShowCalendarModal(false);
                    }}
                  >
                    <Text style={[
                      styles.dayText, 
                      { fontFamily: fonts.medium },
                      !item.isCurrentMonth ? { color: '#e2e8f0' } : (isPast ? { color: '#cbd5e1' } : { color: theme.brand[900] }),
                      isSelected && { color: theme.brand[900], fontFamily: fonts.bold }
                    ]}>
                      {item.date.getDate()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity style={styles.closeCalendarBtn} onPress={() => setShowCalendarModal(false)}>
              <Text style={[styles.closeCalendarBtnText, { color: theme.brand[800], fontFamily: fonts.bold }]}>CANCEL</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  const formatBookingDate = (dateString) => {
    if (!dateString) return '';
    const dateObj = new Date(dateString);
    if (isNaN(dateObj.getTime())) return dateString;
    const day = dateObj.getUTCDate();
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = months[dateObj.getUTCMonth()];
    const year = dateObj.getUTCFullYear();
    return `${day} ${month} ${year}`;
  };

  const renderBookingItem = ({ item }) => {
    const isVisit = !!item.address;
    const dateFormatted = formatBookingDate(isVisit ? item.preferredDate : item.date);
    const dateParts = dateFormatted.split(' ');
    const dayNum = dateParts[0] || '';
    const monthName = dateParts[1] || '';
    const yearNum = dateParts[2] || '';
    
    const showActions = item.status !== 'CANCELLED' && item.status !== 'COMPLETED';
    
    // Status colors & dot indicator
    const getStatusStyle = () => {
      switch (item.status) {
        case 'COMPLETED': return { color: '#10b981', bg: '#ecfdf5', label: 'COMPLETED' };
        case 'CANCELLED': return { color: '#ef4444', bg: '#fef2f2', label: 'CANCELLED' };
        default: return { color: theme.brand[800], bg: theme.bg.hover, label: item.status || 'CONFIRMED' };
      }
    };
    const statusCfg = getStatusStyle();
    
    return (
      <View style={[styles.minimalCard, { backgroundColor: theme.bg.card, borderColor: theme.border }]}>
        
        {/* Card Header: Type Badge & Status */}
        <View style={styles.minimalCardHeader}>
          <View style={[styles.typeBadgeMinimal, { backgroundColor: theme.bg.hover }]}>
            {isVisit ? <Home size={12} color={theme.brand[800]} /> : <Briefcase size={12} color={theme.brand[800]} />}
            <Text style={[styles.typeBadgeTextMinimal, { color: theme.brand[900], fontFamily: fonts.bold }]}>
              {isVisit ? 'HOME VISIT' : 'STANDARD CONSULTATION'}
            </Text>
          </View>

          <View style={[styles.statusBadgeMinimal, { backgroundColor: statusCfg.bg }]}>
            <View style={[styles.statusDot, { backgroundColor: statusCfg.color }]} />
            <Text style={[styles.statusTextMinimal, { color: statusCfg.color, fontFamily: fonts.bold }]}>
              {statusCfg.label}
            </Text>
          </View>
        </View>

        {/* Card Body */}
        <View style={styles.minimalCardBody}>
          {/* Theme Purple Date Box */}
          <View style={[styles.minimalDateBox, { backgroundColor: theme.bg.hover, borderColor: theme.border }]}>
            <Text style={[styles.minimalDateDay, { color: theme.brand[900], fontFamily: fonts.bold }]}>
              {dayNum}
            </Text>
            <Text style={[styles.minimalDateMonth, { color: theme.brand[800], fontFamily: fonts.bold }]}>
              {monthName}
            </Text>
            {!isVisit && item.timeSlot && (
              <View style={styles.minimalTimeChip}>
                <Text style={[styles.minimalTimeText, { color: theme.brand[800], fontFamily: fonts.semiBold }]}>
                  {item.timeSlot.split(' ')[0]}
                </Text>
              </View>
            )}
          </View>

          {/* Details Column */}
          <View style={styles.minimalDetailsCol}>
            {/* Title / Product Type */}
            <Text style={[styles.minimalTitleText, { color: theme.brand[900], fontFamily: fonts.bold }]} numberOfLines={1}>
              {isVisit ? (item.requirements || 'Bespoke Home Visit') : (item.productType || 'Consultation Session')}
            </Text>

            {/* Location */}
            <View style={styles.minimalMetaRow}>
              <MapPin size={13} color={theme.brand[700]} />
              <Text style={[styles.minimalMetaText, { color: theme.text.secondary, fontFamily: fonts.medium }]} numberOfLines={1}>
                {isVisit ? item.address : 'MARCOS Flagship Boutique'}
              </Text>
            </View>

            {/* Additional details line if present */}
            {!isVisit && item.notes && (
              <View style={styles.minimalMetaRow}>
                <Sparkles size={13} color={theme.brand[500]} />
                <Text style={[styles.minimalMetaText, { color: theme.text.secondary, fontFamily: fonts.regular }]} numberOfLines={1}>
                  {item.notes.replace(/ProductImage:[^\n]+/, '').trim() || 'Custom tailoring notes'}
                </Text>
              </View>
            )}
          </View>

          {/* Image Thumbnail if attached */}
          {(() => {
            if (isVisit || !item.notes) return null;
            const imgMatch = item.notes.match(/ProductImage:\s*([^\n]+)/);
            if (imgMatch && imgMatch[1]) {
              return (
                <Image 
                  source={{ uri: imgMatch[1].trim() }} 
                  style={[styles.minimalThumbImage, { borderColor: theme.border }]} 
                  resizeMode="cover"
                />
              );
            }
            return null;
          })()}
        </View>

        {/* Card Actions */}
        {showActions && (
          <View style={[styles.minimalCardActions, { borderTopColor: theme.border }]}>
            <TouchableOpacity 
              style={[styles.minimalActionBtn, { backgroundColor: theme.bg.hover, borderColor: theme.border }]} 
              onPress={() => handleReschedulePress(item)}
              activeOpacity={0.75}
            >
              <Calendar size={13} color={theme.brand[900]} />
              <Text style={[styles.minimalActionBtnText, { color: theme.brand[900], fontFamily: fonts.bold }]}>
                Reschedule
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.minimalActionBtnCancel]} 
              onPress={() => handleCancelPress(item)}
              activeOpacity={0.75}
            >
              <Trash2 size={13} color="#ef4444" />
              <Text style={[styles.minimalActionBtnTextCancel, { color: '#ef4444', fontFamily: fonts.semiBold }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        )}

      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.bg.main }]}>
      <StatusBar barStyle="dark-content" translucent={false} />
      {renderCalendarModal()}
      
      {/* Sleek Header with Theme Purple Accent Button */}
      <View style={styles.minimalHeader}>
        <View style={styles.headerTitleContainer}>
          <Text style={[styles.minimalHeaderTitle, { color: theme.brand[900], fontFamily: fonts.bold }]}>
            Bookings
          </Text>
          <Text style={[styles.minimalHeaderSubtitle, { color: theme.text.secondary, fontFamily: fonts.medium }]}>
            Swipe left or right to switch views
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.headerPlusBtn, { backgroundColor: theme.brand[500] }]}
          onPress={() => {
            setCalendarTarget('SLOT');
            resetSlotForm();
            setSlotModalVisible(true);
          }}
          activeOpacity={0.85}
        >
          <Plus size={18} color={theme.brand[900]} />
          <Text style={[styles.headerPlusBtnText, { color: theme.brand[900], fontFamily: fonts.bold }]}>
            New Slot
          </Text>
        </TouchableOpacity>
      </View>

      {/* Segmented Control / Tab Selector */}
      <View style={[styles.tabBarContainer, { backgroundColor: theme.bg.card, borderColor: theme.border }]}>
        <TouchableOpacity 
          style={[styles.tabBtn, activeTab === 'SERVICE' && [styles.activeTabBtn, { backgroundColor: theme.brand[500] }]]}
          onPress={() => handleTabPress('SERVICE')}
          activeOpacity={0.85}
        >
          <Briefcase size={14} color={activeTab === 'SERVICE' ? theme.brand[900] : theme.text.secondary} />
          <Text style={[styles.tabText, { fontFamily: fonts.semiBold, color: theme.text.secondary }, activeTab === 'SERVICE' && { color: theme.brand[900], fontFamily: fonts.bold }]}>
            Standard
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.tabBtn, activeTab === 'VISIT' && [styles.activeTabBtn, { backgroundColor: theme.brand[500] }]]}
          onPress={() => handleTabPress('VISIT')}
          activeOpacity={0.85}
        >
          <Home size={14} color={activeTab === 'VISIT' ? theme.brand[900] : theme.text.secondary} />
          <Text style={[styles.tabText, { fontFamily: fonts.semiBold, color: theme.text.secondary }, activeTab === 'VISIT' && { color: theme.brand[900], fontFamily: fonts.bold }]}>
            Home Visit
          </Text>
        </TouchableOpacity>
      </View>

      {/* Horizontal Swipeable Content Pages */}
      <ScrollView
        ref={horizontalScrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleHorizontalScrollEnd}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
      >
        {/* Page 1: Standard Consultations */}
        <View style={{ width: width, flex: 1 }}>
          {loading && appointments.length === 0 ? (
            <View style={styles.listPadding}>
              {[1, 2, 3].map(idx => (
                <BookingSkeletonCard key={idx} theme={theme} />
              ))}
            </View>
          ) : appointments.length === 0 ? (
            <ScrollView
              contentContainerStyle={styles.emptyStateContainer}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={theme.brand[500]}
                  colors={[theme.brand[500]]}
                />
              }
            >
              <View style={[styles.emptyIconCircle, { backgroundColor: theme.bg.hover, borderColor: theme.border }]}>
                <CalendarDays size={32} color={theme.brand[700]} />
              </View>
              
              <Text style={[styles.emptyStateTitle, { color: theme.brand[900], fontFamily: fonts.bold }]}>
                No Standard Bookings
              </Text>
              
              <Text style={[styles.emptyStateSubtitle, { color: theme.text.secondary, fontFamily: fonts.regular }]}>
                {user 
                  ? 'Schedule a consultation session with our master tailors.' 
                  : 'Sign in to view and manage your appointment schedule.'}
              </Text>

              {!user ? (
                <TouchableOpacity
                  style={[styles.primaryActionBtn, { backgroundColor: theme.brand[500] }]}
                  onPress={() => requireAuth()}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.primaryActionBtnText, { color: theme.brand[900], fontFamily: fonts.bold }]}>
                    SIGN IN TO CONTINUE
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.primaryActionBtn, { backgroundColor: theme.brand[500] }]}
                  onPress={() => {
                    setActiveTab('SERVICE');
                    setBookingModalVisible(true);
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.primaryActionBtnText, { color: theme.brand[900], fontFamily: fonts.bold }]}>
                    BOOK AN APPOINTMENT
                  </Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          ) : (
            <FlatList
              data={(() => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                return [...appointments].sort((a, b) => {
                  const dateA = new Date(a.date);
                  const dateB = new Date(b.date);
                  const isOldA = a.status === 'COMPLETED' || a.status === 'CANCELLED' || dateA < today;
                  const isOldB = b.status === 'COMPLETED' || b.status === 'CANCELLED' || dateB < today;
                  if (isOldA && !isOldB) return 1;
                  if (!isOldA && isOldB) return -1;
                  return !isOldA ? dateA - dateB : dateB - dateA;
                });
              })()}
              renderItem={renderBookingItem}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listPadding}
              showsVerticalScrollIndicator={false}
              onEndReached={loadMoreData}
              onEndReachedThreshold={0.5}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={theme.brand[500]}
                  colors={[theme.brand[500]]}
                />
              }
              ListFooterComponent={() => (
                loadingMore ? (
                  <View style={styles.loadingMoreFooter}>
                    <ActivityIndicator size="small" color={theme.brand[700]} />
                    <Text style={[styles.loadingMoreText, { color: theme.text.secondary, fontFamily: fonts.regular }]}>
                      Loading more...
                    </Text>
                  </View>
                ) : null
              )}
            />
          )}
        </View>
 
        {/* Page 2: Home Visit Bookings */}
        <View style={{ width: width, flex: 1 }}>
          {loading && visits.length === 0 ? (
            <View style={styles.listPadding}>
              {[1, 2, 3].map(idx => (
                <BookingSkeletonCard key={idx} theme={theme} />
              ))}
            </View>
          ) : visits.length === 0 ? (
            <ScrollView
              contentContainerStyle={styles.emptyStateContainer}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={theme.brand[500]}
                  colors={[theme.brand[500]]}
                />
              }
            >
              <View style={[styles.emptyIconCircle, { backgroundColor: theme.bg.hover, borderColor: theme.border }]}>
                <CalendarDays size={32} color={theme.brand[700]} />
              </View>
              
              <Text style={[styles.emptyStateTitle, { color: theme.brand[900], fontFamily: fonts.bold }]}>
                No Home Visit Bookings
              </Text>
              
              <Text style={[styles.emptyStateSubtitle, { color: theme.text.secondary, fontFamily: fonts.regular }]}>
                {user 
                  ? 'Request a personal home measurement and fitting visit.' 
                  : 'Sign in to view and manage your visit schedule.'}
              </Text>
 
              {!user ? (
                <TouchableOpacity
                  style={[styles.primaryActionBtn, { backgroundColor: theme.brand[500] }]}
                  onPress={() => requireAuth()}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.primaryActionBtnText, { color: theme.brand[900], fontFamily: fonts.bold }]}>
                    SIGN IN TO CONTINUE
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.primaryActionBtn, { backgroundColor: theme.brand[500] }]}
                  onPress={() => {
                    setActiveTab('VISIT');
                    setBookingModalVisible(true);
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.primaryActionBtnText, { color: theme.brand[900], fontFamily: fonts.bold }]}>
                    REQUEST HOME VISIT
                  </Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          ) : (
            <FlatList
              data={(() => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                return [...visits].sort((a, b) => {
                  const dateA = new Date(a.preferredDate || a.createdAt);
                  const dateB = new Date(b.preferredDate || b.createdAt);
                  const isOldA = a.status === 'COMPLETED' || a.status === 'CANCELLED' || dateA < today;
                  const isOldB = b.status === 'COMPLETED' || b.status === 'CANCELLED' || dateB < today;
                  if (isOldA && !isOldB) return 1;
                  if (!isOldA && isOldB) return -1;
                  return !isOldA ? dateA - dateB : dateB - dateA;
                });
              })()}
              renderItem={renderBookingItem}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listPadding}
              showsVerticalScrollIndicator={false}
              onEndReached={loadMoreData}
              onEndReachedThreshold={0.5}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={theme.brand[500]}
                  colors={[theme.brand[500]]}
                />
              }
              ListFooterComponent={() => (
                loadingMore ? (
                  <View style={styles.loadingMoreFooter}>
                    <ActivityIndicator size="small" color={theme.brand[700]} />
                    <Text style={[styles.loadingMoreText, { color: theme.text.secondary, fontFamily: fonts.regular }]}>
                      Loading more...
                    </Text>
                  </View>
                ) : null
              )}
            />
          )}
        </View>

      </ScrollView>

      {/* Floating Purple Plus Button */}
      {user && (
        <TouchableOpacity 
          style={[styles.fabBtn, { backgroundColor: theme.brand[500] }]}
          onPress={() => setBookingModalVisible(true)}
          activeOpacity={0.85}
        >
          <Plus size={22} color={theme.brand[900]} />
        </TouchableOpacity>
      )}

      {/* New Booking Modal */}
      <Modal visible={bookingModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView style={{ width: '100%' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.bottomSheetCard, { backgroundColor: theme.bg.card }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: theme.brand[900], fontFamily: fonts.bold }]}>
                New {activeTab === 'SERVICE' ? 'Service' : 'Home Visit'}
              </Text>
              <TouchableOpacity style={styles.sheetCloseBtn} onPress={() => setBookingModalVisible(false)}>
                <X size={18} color={theme.brand[900]} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={styles.sheetScroll} showsVerticalScrollIndicator={false}>
              
              <Text style={[styles.inputLabel, { color: theme.text.secondary, fontFamily: fonts.semiBold }]}>DATE</Text>
              <TouchableOpacity 
                style={[styles.minimalInputField, { backgroundColor: theme.bg.main, borderColor: errors.date ? '#ef4444' : theme.border }]} 
                onPress={() => setShowCalendarModal(true)}
              >
                <Calendar size={18} color={theme.brand[700]} />
                <Text style={[styles.minimalInputText, { color: selectedDate ? theme.brand[900] : theme.text.secondary, fontFamily: fonts.medium }]}>
                  {selectedDate ? selectedDate.toDateString() : 'Select date'}
                </Text>
                <ChevronDown size={18} color={theme.text.secondary} />
              </TouchableOpacity>
              {errors.date && <Text style={styles.errorTextMinimal}>{errors.date}</Text>}

              {activeTab === 'SERVICE' ? (
                <>
                  {productImage ? (
                    <View style={[styles.prefillPreviewCard, { borderColor: theme.border, backgroundColor: theme.bg.hover }]}>
                      <Image source={{ uri: productImage }} style={styles.prefillThumb} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: theme.brand[900] }} numberOfLines={1}>{productDetails}</Text>
                        <Text style={{ fontFamily: fonts.medium, fontSize: 11, color: theme.brand[800] }}>{apptCategory}</Text>
                      </View>
                      <TouchableOpacity onPress={() => { setProductImage(''); setProductDetails(''); setApptCategory(''); }}>
                        <X size={16} color={theme.brand[800]} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <>
                      <Text style={[styles.inputLabel, { color: theme.text.secondary, fontFamily: fonts.semiBold }]}>CATEGORY</Text>
                      <TextInput 
                        style={[styles.minimalTextInput, { backgroundColor: theme.bg.main, borderColor: errors.category ? '#ef4444' : theme.border, color: theme.brand[900], fontFamily: fonts.regular }]} 
                        placeholder="E.g. Wedding Couture, Tuxedo Fitting" 
                        placeholderTextColor={theme.text.secondary} 
                        value={apptCategory} 
                        onChangeText={setApptCategory} 
                      />
                      {errors.category && <Text style={styles.errorTextMinimal}>{errors.category}</Text>}
                    </>
                  )}

                  <Text style={[styles.inputLabel, { color: theme.text.secondary, fontFamily: fonts.semiBold }]}>PREFERRED TIME SLOT</Text>
                  {(() => {
                    const slots = getFilteredAvailableSlots(selectedDate);
                    if (slots.length === 0) {
                      return (
                        <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: theme.text.secondary, marginVertical: 6 }}>
                          All slots for this date have passed. Please choose tomorrow or another date above.
                        </Text>
                      );
                    }
                    return (
                      <View style={styles.slotsRowMinimal}>
                        {slots.map(s => (
                          <TouchableOpacity 
                            key={s} 
                            style={[
                              styles.slotChipMinimal, 
                              { borderColor: theme.border, backgroundColor: theme.bg.main }, 
                              timeSlot === s && { backgroundColor: theme.brand[500], borderColor: theme.brand[500] }
                            ]} 
                            onPress={() => setTimeSlot(s)}
                            activeOpacity={0.8}
                          >
                            {timeSlot === s && <CheckCircle2 size={12} color={theme.brand[900]} style={{ marginRight: 4 }} />}
                            <Text style={[
                              styles.slotChipTextMinimal, 
                              { color: theme.text.secondary, fontFamily: fonts.medium }, 
                              timeSlot === s && { color: theme.brand[900], fontFamily: fonts.bold }
                            ]}>
                              {s}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    );
                  })()}
                  {errors.timeSlot && <Text style={styles.errorTextMinimal}>{errors.timeSlot}</Text>}

                  {!productImage && (
                    <>
                      <Text style={[styles.inputLabel, { color: theme.text.secondary, fontFamily: fonts.semiBold }]}>PRODUCT DETAILS</Text>
                      <TextInput 
                        style={[styles.minimalTextInput, { backgroundColor: theme.bg.main, borderColor: errors.product ? '#ef4444' : theme.border, color: theme.brand[900], fontFamily: fonts.regular }]} 
                        placeholder="Product name or code" 
                        placeholderTextColor={theme.text.secondary} 
                        value={productDetails} 
                        onChangeText={setProductDetails} 
                      />
                      {errors.product && <Text style={styles.errorTextMinimal}>{errors.product}</Text>}
                    </>
                  )}
                </>
              ) : (
                <>
                  <Text style={[styles.inputLabel, { color: theme.text.secondary, fontFamily: fonts.semiBold }]}>VISIT ADDRESS</Text>
                  <TextInput 
                    style={[styles.minimalTextInputArea, { backgroundColor: theme.bg.main, borderColor: errors.address ? '#ef4444' : theme.border, color: theme.brand[900], fontFamily: fonts.regular }]} 
                    placeholder="Enter complete residence or office address" 
                    placeholderTextColor={theme.text.secondary} 
                    multiline 
                    value={address} 
                    onChangeText={setAddress} 
                  />
                  {user?.address && address !== user.address && (
                    <TouchableOpacity onPress={() => setAddress(user.address)} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                      <MapPin size={12} color={theme.brand[700]} style={{ marginRight: 4 }} />
                      <Text style={{ fontFamily: fonts.semiBold, fontSize: 11, color: theme.brand[700] }}>Use profile address: {user.address}</Text>
                    </TouchableOpacity>
                  )}
                  {errors.address && <Text style={styles.errorTextMinimal}>{errors.address}</Text>}
                </>
              )}

              <Text style={[styles.inputLabel, { color: theme.text.secondary, fontFamily: fonts.semiBold }]}>NOTES & REQUIREMENTS</Text>
              <TextInput 
                style={[styles.minimalTextInputArea, { backgroundColor: theme.bg.main, borderColor: errors.notes ? '#ef4444' : theme.border, color: theme.brand[900], fontFamily: fonts.regular }]} 
                placeholder="Specific preferences, measurements, or requests" 
                placeholderTextColor={theme.text.secondary} 
                multiline 
                value={notes} 
                onChangeText={setNotes} 
              />
              {errors.notes && <Text style={styles.errorTextMinimal}>{errors.notes}</Text>}

              <TouchableOpacity 
                style={[styles.sheetSubmitBtn, { backgroundColor: theme.brand[500] }]} 
                onPress={handleBooking} 
                disabled={submitting}
                activeOpacity={0.85}
              >
                {submitting ? (
                  <ActivityIndicator color={theme.brand[900]} />
                ) : (
                  <Text style={[styles.sheetSubmitBtnText, { color: theme.brand[900], fontFamily: fonts.bold }]}>
                    CONFIRM BOOKING
                  </Text>
                )}
              </TouchableOpacity>

            </ScrollView>
          </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Reschedule Modal */}
      <Modal visible={rescheduleModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView style={{ width: '100%' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.bottomSheetCard, { backgroundColor: theme.bg.card }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: theme.brand[900], fontFamily: fonts.bold }]}>
                Reschedule {reschedulingItem?.address ? 'Visit' : 'Service'}
              </Text>
              <TouchableOpacity style={styles.sheetCloseBtn} onPress={() => setRescheduleModalVisible(false)}>
                <X size={18} color={theme.brand[900]} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={styles.sheetScroll} showsVerticalScrollIndicator={false}>
              
              <Text style={[styles.inputLabel, { color: theme.text.secondary, fontFamily: fonts.semiBold }]}>NEW DATE</Text>
              <TouchableOpacity 
                style={[styles.minimalInputField, { backgroundColor: theme.bg.main, borderColor: errors.rescheduleDate ? '#ef4444' : theme.border }]} 
                onPress={() => {
                  setCalendarTarget('RESCHEDULE');
                  setShowCalendarModal(true);
                }}
              >
                <Calendar size={18} color={theme.brand[700]} />
                <Text style={[styles.minimalInputText, { color: rescheduleDate ? theme.brand[900] : theme.text.secondary, fontFamily: fonts.medium }]}>
                  {rescheduleDate ? rescheduleDate.toDateString() : 'Select Date'}
                </Text>
                <ChevronDown size={18} color={theme.text.secondary} />
              </TouchableOpacity>
              {errors.rescheduleDate && <Text style={styles.errorTextMinimal}>{errors.rescheduleDate}</Text>}

              {reschedulingItem && !reschedulingItem.address ? (
                <>
                  <Text style={[styles.inputLabel, { color: theme.text.secondary, fontFamily: fonts.semiBold }]}>NEW TIME SLOT</Text>
                  <View style={styles.slotsRowMinimal}>
                    {getFilteredAvailableSlots(rescheduleDate).map(s => (
                      <TouchableOpacity 
                        key={s} 
                        style={[
                          styles.slotChipMinimal, 
                          { borderColor: theme.border, backgroundColor: theme.bg.main }, 
                          rescheduleTimeSlot === s && { backgroundColor: theme.brand[500], borderColor: theme.brand[500] }
                        ]} 
                        onPress={() => setRescheduleTimeSlot(s)}
                        activeOpacity={0.8}
                      >
                        {rescheduleTimeSlot === s && <CheckCircle2 size={12} color={theme.brand[900]} style={{ marginRight: 4 }} />}
                        <Text style={[
                          styles.slotChipTextMinimal, 
                          { color: theme.text.secondary, fontFamily: fonts.medium }, 
                          rescheduleTimeSlot === s && { color: theme.brand[900], fontFamily: fonts.bold }
                        ]}>
                          {s}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {errors.rescheduleTimeSlot && <Text style={styles.errorTextMinimal}>{errors.rescheduleTimeSlot}</Text>}
                </>
              ) : null}

              <Text style={[styles.inputLabel, { color: theme.text.secondary, fontFamily: fonts.semiBold }]}>UPDATED NOTES</Text>
              <TextInput 
                style={[styles.minimalTextInputArea, { backgroundColor: theme.bg.main, borderColor: theme.border, color: theme.brand[900], fontFamily: fonts.regular }]} 
                placeholder="Reason or additional instructions" 
                placeholderTextColor={theme.text.secondary} 
                multiline 
                value={rescheduleNotes} 
                onChangeText={setRescheduleNotes} 
              />

              <TouchableOpacity 
                style={[styles.sheetSubmitBtn, { backgroundColor: theme.brand[500] }]} 
                onPress={submitReschedule} 
                disabled={submitting}
                activeOpacity={0.85}
              >
                {submitting ? (
                  <ActivityIndicator color={theme.brand[900]} />
                ) : (
                  <Text style={[styles.sheetSubmitBtnText, { color: theme.brand[900], fontFamily: fonts.bold }]}>
                    CONFIRM RESCHEDULE
                  </Text>
                )}
              </TouchableOpacity>

            </ScrollView>
          </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Quick Slot Booking Modal */}
      <Modal visible={slotModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView style={{ width: '100%' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.bottomSheetCard, { backgroundColor: theme.bg.card }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: theme.brand[900], fontFamily: fonts.bold }]}>
                Book a Slot
              </Text>
              <TouchableOpacity style={styles.sheetCloseBtn} onPress={() => setSlotModalVisible(false)}>
                <X size={18} color={theme.brand[900]} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={styles.sheetScroll} showsVerticalScrollIndicator={false}>

              <Text style={[styles.inputLabel, { color: theme.text.secondary, fontFamily: fonts.semiBold }]}>DATE</Text>
              <TouchableOpacity
                style={[styles.minimalInputField, { backgroundColor: theme.bg.main, borderColor: slotErrors.date ? '#ef4444' : theme.border }]}
                onPress={() => {
                  setCalendarTarget('SLOT');
                  setShowCalendarModal(true);
                }}
                activeOpacity={0.7}
              >
                <Calendar size={18} color={theme.brand[700]} />
                <Text style={[styles.minimalInputText, { color: slotDate ? theme.brand[900] : theme.text.secondary, fontFamily: fonts.medium }]}>
                  {slotDate ? slotDate.toDateString() : 'Select date'}
                </Text>
                <ChevronDown size={18} color={theme.text.secondary} />
              </TouchableOpacity>
              {slotErrors.date && <Text style={styles.errorTextMinimal}>{slotErrors.date}</Text>}

              <Text style={[styles.inputLabel, { color: theme.text.secondary, fontFamily: fonts.semiBold, marginTop: 16 }]}>AVAILABLE TIME SLOTS</Text>
              {slotErrors.time && <Text style={styles.errorTextMinimal}>{slotErrors.time}</Text>}
              
              {!slotDate ? (
                <View style={styles.noSlotsBox}>
                  <Text style={{ fontFamily: fonts.medium, color: theme.text.secondary, fontSize: 13 }}>Please select a date to view available time slots.</Text>
                </View>
              ) : getFilteredAvailableSlots(slotDate).length === 0 ? (
                <View style={styles.noSlotsBox}>
                  <Text style={{ fontFamily: fonts.medium, color: theme.text.secondary, fontSize: 13 }}>No slots available for selected date.</Text>
                </View>
              ) : (
                <View style={styles.slotsRowMinimal}>
                  {getFilteredAvailableSlots(slotDate).map(s => (
                    <TouchableOpacity
                      key={s}
                      style={[
                        styles.slotChipMinimal, 
                        { borderColor: theme.border, backgroundColor: theme.bg.main }, 
                        slotTime === s && { backgroundColor: theme.brand[500], borderColor: theme.brand[500] }
                      ]}
                      onPress={() => setSlotTime(s)}
                      activeOpacity={0.8}
                    >
                      {slotTime === s && <CheckCircle2 size={12} color={theme.brand[900]} style={{ marginRight: 4 }} />}
                      <Text style={[
                        styles.slotChipTextMinimal, 
                        { color: theme.text.secondary, fontFamily: fonts.medium }, 
                        slotTime === s && { color: theme.brand[900], fontFamily: fonts.bold }
                      ]}>
                        {s}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={[styles.inputLabel, { color: theme.text.secondary, fontFamily: fonts.semiBold, marginTop: 16 }]}>NOTE (OPTIONAL)</Text>
              <TextInput
                style={[styles.minimalTextInputArea, { backgroundColor: theme.bg.main, borderColor: theme.border, color: theme.brand[900], fontFamily: fonts.regular }]}
                placeholder="E.g. consultation topics or styling requests"
                placeholderTextColor={theme.text.secondary}
                multiline
                value={slotDescription}
                onChangeText={setSlotDescription}
              />

              <TouchableOpacity
                style={[styles.sheetSubmitBtn, { backgroundColor: theme.brand[500], marginTop: 24 }]}
                onPress={handleSlotBooking}
                disabled={slotSubmitting}
                activeOpacity={0.85}
              >
                {slotSubmitting ? (
                  <ActivityIndicator color={theme.brand[900]} />
                ) : (
                  <Text style={[styles.sheetSubmitBtnText, { color: theme.brand[900], fontFamily: fonts.bold }]}>
                    CONFIRM SLOT BOOKING
                  </Text>
                )}
              </TouchableOpacity>

            </ScrollView>
          </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  
  /* Minimalist Header */
  minimalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 56 : 24,
    paddingBottom: 14,
  },
  headerTitleContainer: {
    flex: 1,
  },
  minimalHeaderTitle: {
    fontSize: 24,
    letterSpacing: -0.5,
  },
  minimalHeaderSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  headerPlusBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 20,
    shadowColor: '#D8BFD8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  headerPlusBtnText: {
    fontSize: 12,
  },

  /* Segmented Control Tab Bar */
  tabBarContainer: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 6,
    marginBottom: 14,
    padding: 4,
    borderRadius: 16,
    borderWidth: 1,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 12,
  },
  activeTabBtn: {
    shadowColor: '#D8BFD8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  tabText: {
    fontSize: 13,
  },

  /* List & Cards */
  listPadding: {
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 100,
  },
  minimalCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  minimalCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  typeBadgeMinimal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  typeBadgeTextMinimal: {
    fontSize: 10,
    letterSpacing: 0.3,
  },
  statusBadgeMinimal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusTextMinimal: {
    fontSize: 10,
    letterSpacing: 0.4,
  },

  minimalCardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  minimalDateBox: {
    width: 62,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  minimalDateDay: {
    fontSize: 21,
    lineHeight: 23,
  },
  minimalDateMonth: {
    fontSize: 11,
    textTransform: 'uppercase',
  },
  minimalTimeChip: {
    marginTop: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  minimalTimeText: {
    fontSize: 9,
  },

  minimalDetailsCol: {
    flex: 1,
    gap: 4,
  },
  minimalTitleText: {
    fontSize: 15,
    lineHeight: 20,
  },
  minimalMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  minimalMetaText: {
    fontSize: 12,
    flex: 1,
  },
  minimalThumbImage: {
    width: 48,
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
  },

  minimalCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  minimalActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  minimalActionBtnText: {
    fontSize: 12,
  },
  minimalActionBtnCancel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  minimalActionBtnTextCancel: {
    fontSize: 12,
  },

  /* Empty State */
  emptyStateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 80,
  },
  emptyIconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyStateTitle: {
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyStateSubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  primaryActionBtn: {
    paddingHorizontal: 26,
    paddingVertical: 14,
    borderRadius: 16,
    shadowColor: '#D8BFD8',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  primaryActionBtnText: {
    fontSize: 12,
    letterSpacing: 0.8,
  },

  /* Skeleton Cards */
  skeletonCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
  },
  skeletonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  skeletonPill: {
    width: 90,
    height: 14,
    borderRadius: 7,
  },
  skeletonPillSmall: {
    width: 60,
    height: 14,
    borderRadius: 7,
  },
  skeletonBody: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },
  skeletonSquare: {
    width: 60,
    height: 60,
    borderRadius: 12,
  },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
  },

  /* Floating Purple Plus Button */
  fabBtn: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#D8BFD8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },

  /* Calendar Modal */
  calendarOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  calendarCard: {
    width: '100%',
    borderRadius: 22,
    borderWidth: 1,
    padding: 20,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  monthNavBtn: {
    padding: 6,
  },
  calendarMonthText: {
    fontSize: 16,
  },
  weekDaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  weekDayText: {
    width: (width - 80) / 7,
    textAlign: 'center',
    fontSize: 11,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: (width - 80) / 7,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: {
    fontSize: 14,
  },
  closeCalendarBtn: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 8,
  },
  closeCalendarBtnText: {
    fontSize: 12,
    letterSpacing: 0.5,
  },

  /* Bottom Sheet Modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  bottomSheetCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    maxHeight: '90%',
  },
  sheetHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  sheetTitle: {
    fontSize: 20,
  },
  sheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetScroll: {
    paddingBottom: 20,
  },
  inputLabel: {
    fontSize: 11,
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 12,
  },
  minimalInputField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  minimalInputText: {
    flex: 1,
    fontSize: 14,
  },
  minimalTextInput: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    fontSize: 14,
  },
  minimalTextInputArea: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    fontSize: 14,
    height: 80,
    textAlignVertical: 'top',
  },
  errorTextMinimal: {
    color: '#ef4444',
    fontSize: 11,
    marginTop: 4,
    marginLeft: 4,
  },
  slotsRowMinimal: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  slotChipMinimal: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  slotChipTextMinimal: {
    fontSize: 12,
  },
  prefillPreviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  prefillThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  noSlotsBox: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.02)',
    alignItems: 'center',
  },
  sheetSubmitBtn: {
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    shadowColor: '#D8BFD8',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  sheetSubmitBtnText: {
    fontSize: 13,
    letterSpacing: 0.8,
  },
  loadingMoreFooter: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  loadingMoreText: {
    fontSize: 11,
  },
});
