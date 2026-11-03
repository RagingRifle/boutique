import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity, 
  ActivityIndicator, 
  Alert,
  Modal,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Image
} from 'react-native';
import { useTheme } from '../../styles/ThemeContext';
import api from '../../utils/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../contexts/AuthContext';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  Sparkles, 
  ChevronLeft, 
  MapPin, 
  ChevronDown, 
  CheckCircle2, 
  X,
  ShieldCheck,
  Info,
  Check
} from 'lucide-react-native';

const { width } = Dimensions.get('window');

const AVAILABLE_SLOTS = [
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

// Helper to dynamically build slots from start/end times and duration
const generateSlots = (startStr, endStr, durationMins) => {
  if (!startStr || !endStr) return AVAILABLE_SLOTS;
  
  const slots = [];
  try {
    const [startH, startM] = startStr.split(':').map(Number);
    const [endH, endM] = endStr.split(':').map(Number);
    
    let current = new Date();
    current.setHours(startH, startM, 0, 0);
    
    const end = new Date();
    end.setHours(endH, endM, 0, 0);
    
    const formatTime = (dateObj) => {
      let h = dateObj.getHours();
      const m = String(dateObj.getMinutes()).padStart(2, '0');
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12;
      h = h ? h : 12;
      return `${String(h).padStart(2, '0')}:${m} ${ampm}`;
    };
    
    while (current < end) {
      const next = new Date(current.getTime() + durationMins * 60 * 1000);
      if (next > end) break;
      slots.push(`${formatTime(current)} - ${formatTime(next)}`);
      current = next;
    }
  } catch (e) {
    console.error('Error generating slots:', e);
  }
  
  return slots.length > 0 ? slots : AVAILABLE_SLOTS;
};

export default function BespokeBookingScreen({ navigation, route }) {
  const { theme, fonts, shadows } = useTheme();
  const { requireAuth, user } = useAuth();
  
  // Params passed from ProductDetails
  const { 
    prefillProduct = 'Product Masterpiece', 
    prefillCategory = 'Product Consultation', 
    prefillProductImage = '' 
  } = route.params || {};

  // Fitting mode: 'STUDIO' (In-Store) or 'HOME' (Home Visit)
  const [fittingMode, setFittingMode] = useState('STUDIO');
  const [showModeDropdown, setShowModeDropdown] = useState(false);

  // Initialize date to tomorrow if current time is evening (after 18:00)
  const getInitialDate = () => {
    const d = new Date();
    if (d.getHours() >= 18) {
      d.setDate(d.getDate() + 1);
    }
    return d;
  };

  // Form states
  const [selectedDate, setSelectedDate] = useState(getInitialDate());
  const [timeSlot, setTimeSlot] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Address states
  const [customAddress, setCustomAddress] = useState(user?.address || '');
  const [savedAddressesList, setSavedAddressesList] = useState([]);
  const [showAddressModal, setShowAddressModal] = useState(false);

  // Availability & Slots states
  const [availableSlots, setAvailableSlots] = useState(AVAILABLE_SLOTS);
  const [bookedSlotsCounts, setBookedSlotsCounts] = useState({});
  const [maxBookingsPerSlot, setMaxBookingsPerSlot] = useState(5);

  // Load Saved Addresses
  const loadAddresses = async () => {
    try {
      const active = await AsyncStorage.getItem('active_delivery_address');
      if (active) {
        setCustomAddress(active);
      } else if (user?.address) {
        setCustomAddress(user.address);
      }
      const savedListJSON = await AsyncStorage.getItem('saved_delivery_addresses');
      if (savedListJSON) {
        setSavedAddressesList(JSON.parse(savedListJSON));
      }
    } catch (e) {
      console.error('Error loading addresses:', e);
    }
  };

  // Load Slot Settings & Bookings from system settings
  const fetchSettings = async () => {
    try {
      const res = await api.get('/system/settings/public');
      if (res.success && res.data) {
        if (res.data.maxBookingsPerSlot) {
          setMaxBookingsPerSlot(Number(res.data.maxBookingsPerSlot));
        }
        
        const start = res.data.businessHoursStart || '09:00';
        const end = res.data.businessHoursEnd || '20:00';
        const duration = Number(res.data.bookingSlotDurationMinutes) || 60;
        
        const generated = generateSlots(start, end, duration);
        if (generated && generated.length > 0) {
          setAvailableSlots(generated);
        }
      }
    } catch (err) {
      console.error('Error loading settings from /system/settings/public:', err);
    }
  };

  const loadBookedSlots = async (dateObj) => {
    try {
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      const formattedDate = `${year}-${month}-${day}T12:00:00.000Z`;
      const res = await api.get(`/appointments/availability?date=${formattedDate}`);
      if (res.success && res.data) {
        const countsMap = res.data.counts || res.data;
        setBookedSlotsCounts(typeof countsMap === 'object' ? countsMap : {});
        if (Array.isArray(res.data.availableSlots) && res.data.availableSlots.length > 0) {
          setAvailableSlots(res.data.availableSlots);
        }
      } else {
        setBookedSlotsCounts({});
      }
    } catch (err) {
      console.error('Error loading slot availability:', err);
      setBookedSlotsCounts({});
    }
  };

  useEffect(() => {
    loadAddresses();
    fetchSettings();
  }, [user]);

  useEffect(() => {
    if (selectedDate && fittingMode === 'STUDIO') {
      loadBookedSlots(selectedDate);
    }
  }, [selectedDate, fittingMode]);

  const [currentCalendarMonth, setCurrentCalendarMonth] = useState(new Date());

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    
    const days = [];
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(null);
    }
    for (let i = 1; i <= totalDays; i++) {
      days.push(new Date(year, month, i));
    }
    return days;
  };

  const handlePrevMonth = () => {
    const prev = new Date(currentCalendarMonth);
    prev.setMonth(prev.getMonth() - 1);
    const today = new Date();
    if (prev.getFullYear() < today.getFullYear() || (prev.getFullYear() === today.getFullYear() && prev.getMonth() < today.getMonth())) {
      return;
    }
    setCurrentCalendarMonth(prev);
  };

  const handleNextMonth = () => {
    const next = new Date(currentCalendarMonth);
    next.setMonth(next.getMonth() + 1);
    setCurrentCalendarMonth(next);
  };

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

  const getFilteredAvailableSlots = () => {
    const rawPool = availableSlots && availableSlots.length > 0 ? availableSlots : AVAILABLE_SLOTS;
    const pool = rawPool.map(formatSlotDisplay);

    if (!selectedDate) return pool;
    
    const isToday = selectedDate.toDateString() === new Date().toDateString();
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

    // If today is selected but all slots have elapsed, provide the standard slots so user can still select
    return activeSlots.length > 0 ? activeSlots : pool;
  };

  const validateForm = () => {
    const tempErrors = {};
    if (!selectedDate) tempErrors.date = 'Please select a date';
    if (fittingMode === 'STUDIO' && !timeSlot) tempErrors.timeSlot = 'Please select an available time slot';
    if (fittingMode === 'HOME' && !customAddress.trim()) tempErrors.address = 'Please enter your fitting address for the home visit';
    setErrors(tempErrors);
    return Object.keys(tempErrors).length === 0;
  };

  const handleBookingSubmit = async () => {
    requireAuth(async () => {
      if (!validateForm()) return;
      setSubmitting(true);

    try {
      const yearVal = selectedDate.getFullYear();
      const monthVal = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const dayVal = String(selectedDate.getDate()).padStart(2, '0');
      const formattedDate = `${yearVal}-${monthVal}-${dayVal}T12:00:00.000Z`;

      let res;
      if (fittingMode === 'STUDIO') {
        res = await api.post('/appointments', {
          date: formattedDate,
          timeSlot,
          productType: prefillProduct,
          type: 'CONSULTATION',
          notes: `Category: ${prefillCategory}\nProductImage: ${prefillProductImage}\nFitting Address: In-Store\n${notes}`,
        });
      } else {
        res = await api.post('/visits', {
          preferredDate: formattedDate,
          address: customAddress,
          requirements: `Product: ${prefillProduct}\nCategory: ${prefillCategory}\nProductImage: ${prefillProductImage}\n${notes}`,
        });
      }

      if (res.success) {
        Alert.alert(
          'Booking Confirmed', 
          fittingMode === 'STUDIO' 
            ? 'Your in-store studio consultation has been scheduled successfully!' 
            : 'Your bespoke home visit measurement request has been scheduled successfully!',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      } else {
        Alert.alert('Booking Failed', res.message || 'Unable to schedule booking.');
      }
    } catch (err) {
      console.error('Submit booking error:', err);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
        setSubmitting(false);
      }
    });
  };

  const handleAddressSelect = async (addrStr) => {
    setCustomAddress(addrStr);
    await AsyncStorage.setItem('active_delivery_address', addrStr);
    setShowAddressModal(false);
  };

  // Generate Date Buttons for Picker (Next 7 days)
  const getNext7Days = () => {
    const dates = [];
    const today = new Date();
    for (let i = 1; i <= 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      dates.push(d);
    }
    return dates;
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.bg.main }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
      {/* Header */}
      <View style={[styles.header, { borderColor: theme.border }]}>
        <TouchableOpacity 
          style={[styles.backBtn, shadows.premium]} 
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <ChevronLeft size={20} color="#1e1e1e" />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text.primary, fontFamily: fonts.bold }]}>
          Bespoke Consultation
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 32 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="none"
      >
        {/* Product Preview Card */}
        <View style={[styles.productCard, shadows.premium, { backgroundColor: theme.bg.card }]}>
          <Image source={{ uri: prefillProductImage || 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?q=80&w=300' }} style={styles.productImage} />
          <View style={styles.productInfo}>
            <Text style={[styles.productCategory, { fontFamily: fonts.medium, color: theme.brand[500] }]}>{prefillCategory}</Text>
            <Text style={[styles.productName, { fontFamily: fonts.bold, color: theme.text.primary }]} numberOfLines={2}>{prefillProduct}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
              <Sparkles size={12} color={theme.text.muted} style={{ marginRight: 4 }} />
              <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: theme.text.secondary }}>Customized Stitching & Fitting</Text>
            </View>
          </View>
        </View>

        {/* Dropdown for Fitting Type */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { fontFamily: fonts.bold, color: theme.text.primary }]}>
            Consultation Type
          </Text>
          <TouchableOpacity 
            style={[styles.dropdownBtn, { backgroundColor: theme.bg.card, borderColor: theme.border }]}
            onPress={() => setShowModeDropdown(v => !v)}
            activeOpacity={0.8}
          >
            <Sparkles size={16} color={theme.brand[500]} style={{ marginRight: 10 }} />
            <Text style={{ flex: 1, fontFamily: fonts.semiBold, fontSize: 14, color: theme.text.primary }}>
              {fittingMode === 'STUDIO' ? 'Studio Fitting (In-Store)' : 'Home Visit (Tailor at Home)'}
            </Text>
            <ChevronDown size={18} color={theme.text.muted} />
          </TouchableOpacity>

          {showModeDropdown && (
            <View style={[styles.dropdownList, { backgroundColor: theme.bg.card, borderColor: theme.border }]}>
              <TouchableOpacity 
                style={styles.dropdownItem}
                onPress={() => { setFittingMode('STUDIO'); setShowModeDropdown(false); }}
                activeOpacity={0.7}
              >
                <Text style={{ flex: 1, fontFamily: fonts.medium, color: theme.text.primary, fontSize: 13 }}>Studio Fitting (In-Store)</Text>
                {fittingMode === 'STUDIO' && <Check size={16} color={theme.brand[500]} />}
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.dropdownItem, { borderTopWidth: 1, borderTopColor: theme.border }]}
                onPress={() => { setFittingMode('HOME'); setShowModeDropdown(false); }}
                activeOpacity={0.7}
              >
                <Text style={{ flex: 1, fontFamily: fonts.medium, color: theme.text.primary, fontSize: 13 }}>Home Visit (Tailor at Home)</Text>
                {fittingMode === 'HOME' && <Check size={16} color={theme.brand[500]} />}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Measurement & Visit Location Selector */}
        {fittingMode === 'STUDIO' ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { fontFamily: fonts.bold, color: theme.text.primary }]}>
              Fitting Studio Location
            </Text>
            <View style={[styles.addressSelector, { backgroundColor: theme.bg.card, borderColor: theme.border }]}>
              <MapPin size={18} color={theme.brand[500]} style={{ marginRight: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: fonts.semiBold, fontSize: 13, color: theme.text.primary }}>
                  MARCOS Flagship Studio (In-Store)
                </Text>
                <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: theme.text.secondary, marginTop: 2 }}>
                  12, Khader Nawaz Khan Rd, Nungambakkam, Chennai, Tamil Nadu 600006
                </Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { fontFamily: fonts.bold, color: theme.text.primary }]}>
              Home Visit Address *
            </Text>
            <TextInput 
              style={[styles.addressInput, { backgroundColor: theme.bg.card, borderColor: theme.border, color: theme.text.primary, fontFamily: fonts.regular }]}
              placeholder="Enter complete door no, building name, street, area, pincode..."
              placeholderTextColor={theme.text.muted}
              multiline
              numberOfLines={2}
              value={customAddress}
              onChangeText={setCustomAddress}
            />
            {user?.address && customAddress !== user.address && (
              <TouchableOpacity 
                onPress={() => setCustomAddress(user.address)} 
                style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}
                activeOpacity={0.7}
              >
                <MapPin size={13} color={theme.brand[500]} style={{ marginRight: 4 }} />
                <Text style={{ fontFamily: fonts.semiBold, fontSize: 11, color: theme.brand[500] }}>
                  Use profile address: {user.address}
                </Text>
              </TouchableOpacity>
            )}
            {errors.address && <Text style={styles.errorText}>{errors.address}</Text>}
          </View>
        )}

        {/* Date Selection Section (Custom Calendar) */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { fontFamily: fonts.bold, color: theme.text.primary }]}>
            Select Date (Full Month)
          </Text>
          
          <View style={[styles.calendarContainer, { backgroundColor: theme.bg.card, borderColor: theme.border }]}>
            {/* Calendar Header */}
            <View style={styles.calendarHeader}>
              <TouchableOpacity onPress={handlePrevMonth} style={styles.calNavBtn}>
                <ChevronLeft size={16} color={theme.text.primary} />
              </TouchableOpacity>
              <Text style={[styles.calendarMonthText, { fontFamily: fonts.bold, color: theme.text.primary }]}>
                {currentCalendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </Text>
              <TouchableOpacity onPress={handleNextMonth} style={styles.calNavBtn}>
                <View style={{ transform: [{ rotate: '180deg' }] }}>
                  <ChevronLeft size={16} color={theme.text.primary} />
                </View>
              </TouchableOpacity>
            </View>

            {/* Weekdays Row */}
            <View style={styles.weekdaysRow}>
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day, i) => (
                <Text key={i} style={[styles.weekdayText, { fontFamily: fonts.semiBold, color: theme.text.secondary }]}>
                  {day}
                </Text>
              ))}
            </View>

            {/* Days Grid */}
            <View style={styles.daysGrid}>
              {getDaysInMonth(currentCalendarMonth).map((date, idx) => {
                if (!date) {
                  return <View key={idx} style={styles.dayCellEmpty} />;
                }

                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const isPast = date < today;
                const isSelected = selectedDate && selectedDate.toDateString() === date.toDateString();

                return (
                  <TouchableOpacity
                    key={idx}
                    disabled={isPast}
                    onPress={() => setSelectedDate(date)}
                    style={[
                      styles.dayCell,
                      isSelected && { backgroundColor: theme.brand[500] },
                      isPast && { opacity: 0.25 }
                    ]}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.dayCellText,
                        { fontFamily: fonts.medium, color: theme.text.primary },
                        isSelected && { color: '#3D2E3D', fontFamily: fonts.bold },
                        isPast && { color: theme.text.muted }
                      ]}
                    >
                      {date.getDate()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          {errors.date && <Text style={styles.errorText}>{errors.date}</Text>}
        </View>

        {/* Time Slots Section (Only for STUDIO mode) */}
        {fittingMode === 'STUDIO' && selectedDate && (() => {
          const currentSlots = getFilteredAvailableSlots();
          return (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { fontFamily: fonts.bold, color: theme.text.primary }]}>
                Available In-Store Slots
              </Text>
              {currentSlots.length > 0 ? (
                <View style={styles.slotsGrid}>
                  {currentSlots.map((slot, idx) => {
                    const isSelected = timeSlot === slot;
                    return (
                      <TouchableOpacity 
                        key={idx}
                        style={[
                          styles.slotBtn, 
                          { backgroundColor: theme.bg.card, borderColor: theme.border },
                          isSelected && { backgroundColor: theme.brand[500], borderColor: theme.brand[500] }
                        ]}
                        onPress={() => setTimeSlot(slot)}
                        activeOpacity={0.8}
                      >
                        <Clock size={12} color={isSelected ? '#3D2E3D' : theme.text.secondary} style={{ marginRight: 6 }} />
                        <Text style={[styles.slotText, { color: theme.text.primary, fontFamily: fonts.semiBold }, isSelected && { color: '#3D2E3D' }]}>
                          {slot}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <View style={[styles.emptySlotsCard, { backgroundColor: theme.brand[50], borderColor: theme.brand[200] }]}>
                  <Clock size={18} color={theme.brand[600]} style={{ marginBottom: 6 }} />
                  <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: '#3D2E3D', textAlign: 'center' }}>
                    All slots for {selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} have passed
                  </Text>
                  <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: '#5C4A5C', textAlign: 'center', marginTop: 4 }}>
                    Please select tomorrow or a future date on the calendar above.
                  </Text>
                </View>
              )}
              {errors.timeSlot && <Text style={styles.errorText}>{errors.timeSlot}</Text>}
            </View>
          );
        })()}

        {/* Additional Notes */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { fontFamily: fonts.bold, color: theme.text.primary }]}>
            Fitting Instructions / Notes
          </Text>
          <TextInput 
            style={[styles.notesInput, { backgroundColor: theme.bg.card, borderColor: theme.border, color: theme.text.primary, fontFamily: fonts.regular }]}
            placeholder="Add any specific requests (e.g. customized sleeve width, height modifications)"
            placeholderTextColor={theme.text.muted}
            multiline
            numberOfLines={4}
            value={notes}
            onChangeText={setNotes}
          />
        </View>

        {/* Guidelines / Rules Card */}
        <View style={[styles.rulesCard, { backgroundColor: theme.brand[50], borderColor: theme.brand[100] }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <ShieldCheck size={18} color="#6B4B6B" style={{ marginRight: 6 }} />
            <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: '#3D2E3D' }}>MARCOS Consultation Rules & Guidelines</Text>
          </View>
          <View style={{ gap: 6 }}>
            <View style={styles.ruleRow}>
              <CheckCircle2 size={12} color="#6B4B6B" style={{ marginTop: 2, marginRight: 6 }} />
              <Text style={{ flex: 1, fontFamily: fonts.medium, fontSize: 11, color: '#5C4A5C', lineHeight: 16 }}>
                {fittingMode === 'STUDIO' 
                  ? 'Please arrive at the MARCOS Studio 10 minutes prior to your scheduled time slot for master fitting.'
                  : 'Our master tailors will visit your fitting address at the scheduled date to take physical measurements.'}
              </Text>
            </View>
            <View style={styles.ruleRow}>
              <CheckCircle2 size={12} color="#6B4B6B" style={{ marginTop: 2, marginRight: 6 }} />
              <Text style={{ flex: 1, fontFamily: fonts.medium, fontSize: 11, color: '#5C4A5C', lineHeight: 16 }}>
                Once measurements are complete, your custom order details will be updated in the system for admin manual checkout.
              </Text>
            </View>
            <View style={styles.ruleRow}>
              <CheckCircle2 size={12} color="#6B4B6B" style={{ marginTop: 2, marginRight: 6 }} />
              <Text style={{ flex: 1, fontFamily: fonts.medium, fontSize: 11, color: '#5C4A5C', lineHeight: 16 }}>
                Offline payments can be cleared with administrators once the order has been generated.
              </Text>
            </View>
          </View>
        </View>

        {/* Submit Button */}
        <TouchableOpacity 
          style={[styles.submitBtn, { backgroundColor: theme.brand[500] }]}
          onPress={handleBookingSubmit}
          disabled={submitting}
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#3D2E3D" />
          ) : (
            <Text style={[styles.submitBtnText, { fontFamily: fonts.bold, color: '#3D2E3D' }]}>
              {fittingMode === 'STUDIO' ? 'Schedule Studio Appointment' : 'Schedule Home Measurement'}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Saved Addresses Selector Modal */}
      <Modal visible={showAddressModal} transparent animationType="slide">
        <View style={styles.modalBg}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowAddressModal(false)} />
          <View style={[styles.modalCard, { backgroundColor: theme.bg.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitleText, { color: theme.text.primary, fontFamily: fonts.bold }]}>
                Select Fitting Address
              </Text>
              <TouchableOpacity onPress={() => setShowAddressModal(false)}>
                <X size={20} color={theme.text.secondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              {savedAddressesList.map((addr, idx) => (
                <TouchableOpacity 
                  key={idx}
                  style={[styles.addressItem, { borderColor: theme.border }]}
                  onPress={() => handleAddressSelect(addr.address)}
                  activeOpacity={0.7}
                >
                  <MapPin size={16} color={theme.brand[500]} style={{ marginRight: 10 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: theme.text.primary }}>{addr.name} ({addr.label})</Text>
                    <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: theme.text.secondary, marginTop: 2 }}>{addr.address}</Text>
                  </View>
                </TouchableOpacity>
              ))}

              <TouchableOpacity 
                style={[styles.addressItem, { borderStyle: 'dashed', borderColor: theme.brand[300] }]}
                onPress={() => {
                  setShowAddressModal(false);
                  Alert.alert('New Address', 'To add a new address, please use the Address Manager on the Home Tab.');
                }}
                activeOpacity={0.7}
              >
                <Info size={16} color={theme.brand[500]} style={{ marginRight: 10 }} />
                <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: theme.brand[500] }}>Add new address via home settings</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    letterSpacing: 0.5,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  productCard: {
    flexDirection: 'row',
    borderRadius: 20,
    padding: 12,
    marginBottom: 20,
  },
  productImage: {
    width: 70,
    height: 70,
    borderRadius: 12,
    marginRight: 14,
  },
  productInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  productCategory: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  productName: {
    fontSize: 14,
    lineHeight: 18,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    marginBottom: 10,
  },
  dropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  dropdownList: {
    borderWidth: 1,
    borderRadius: 16,
    marginTop: 6,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  addressSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  datePill: {
    width: 60,
    height: 70,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  datePillDay: {
    fontSize: 11,
    marginBottom: 4,
  },
  datePillNum: {
    fontSize: 18,
  },
  calendarContainer: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    marginTop: 6,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  calNavBtn: {
    padding: 6,
  },
  calendarMonthText: {
    fontSize: 14,
  },
  weekdaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  weekdayText: {
    width: '14.28%',
    textAlign: 'center',
    fontSize: 11,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 8,
  },
  dayCell: {
    width: '14.28%',
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  dayCellEmpty: {
    width: '14.28%',
    height: 36,
  },
  dayCellText: {
    fontSize: 13,
  },
  slotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  slotBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    width: '48%',
  },
  slotText: {
    fontSize: 11,
  },
  notesInput: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    height: 100,
    textAlignVertical: 'top',
    fontSize: 13,
  },
  rulesCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    marginBottom: 24,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  submitBtn: {
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  submitBtnText: {
    fontSize: 14,
    letterSpacing: 0.5,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 11,
    marginTop: 4,
    marginLeft: 4,
  },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 24,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  modalTitleText: {
    fontSize: 16,
  },
  addressItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  addressInput: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    minHeight: 70,
    textAlignVertical: 'top',
    fontSize: 13,
  },
  emptySlotsCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
});
