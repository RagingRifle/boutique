import React, { useState, useEffect } from 'react';
import {
  ShoppingCart,
  Search,
  Plus,
  Minus,
  Trash2,
  Tag,
  User,
  Check,
  CheckCircle,
  Mail,
  Printer,
  X
} from 'lucide-react';
import api from '../utils/api';

export default function ManualCheckout() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');

  const findCategoryPath = (catId, cats = categories, currentPath = []) => {
    for (const cat of cats) {
      if (cat.id === catId) return [...currentPath, cat];
      if (cat.subCategories && cat.subCategories.length > 0) {
        const path = findCategoryPath(catId, cat.subCategories, [...currentPath, cat]);
        if (path) return path;
      }
    }
    return null;
  };

  const flattenCategories = (cats, depth = 0, result = []) => {
    cats.forEach(c => {
      result.push({ ...c, depth });
      if (c.subCategories && c.subCategories.length > 0) {
        flattenCategories(c.subCategories, depth + 1, result);
      }
    });
    return result;
  };
  const flatCategories = flattenCategories(categories);

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [cart, setCart] = useState([]);
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [customerSearchResults, setCustomerSearchResults] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [orderStatus, setOrderStatus] = useState('PENDING');
  const [paymentStatus, setPaymentStatus] = useState('PENDING');
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponError, setCouponError] = useState('');
  const [isQuickOrder, setIsQuickOrder] = useState(false);
  const [quickOrderReason, setQuickOrderReason] = useState('');
  const [quickOrderExpectedDate, setQuickOrderExpectedDate] = useState('');
  const [advancePayment, setAdvancePayment] = useState('');
  const [gstPercentage, setGstPercentage] = useState('18');
  const [customerProfiles, setCustomerProfiles] = useState([]);
  const [selectedProfileIds, setSelectedProfileIds] = useState([]);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [prefillProductToCart, setPrefillProductToCart] = useState('');

  // Appointment State
  const [appointmentDate, setAppointmentDate] = useState(new Date().toISOString().split('T')[0]);
  const [appointmentTimeSlot, setAppointmentTimeSlot] = useState('');
  const [appointmentStaffId, setAppointmentStaffId] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [staffMembers, setStaffMembers] = useState([]);
  const [timeSlots, setTimeSlots] = useState([]);
  const [checkoutApptId, setCheckoutApptId] = useState(null);
  const [linkedOrder, setLinkedOrder] = useState(null);
  const [linkedCoupon, setLinkedCoupon] = useState(null);

  const runPrefill = () => {
    const query = new URLSearchParams(window.location.search);
    const apptId = query.get('appointmentId') || sessionStorage.getItem('checkout_appointment_id');
    const userId = query.get('userId') || sessionStorage.getItem('checkout_user_id');
    const productName = query.get('productName') || sessionStorage.getItem('checkout_product_name');
    const deliveryDateVal = query.get('deliveryDate') || sessionStorage.getItem('checkout_delivery_date');

    if (!apptId) return;

    setCheckoutApptId(apptId);
    setOrderStatus('PENDING');
    setPaymentStatus('PENDING');
    // Reset cart + customer so stale data doesn't persist across re-triggers
    setLinkedOrder(null);
    setLinkedCoupon(null);
    setCart([]);
    setSelectedCustomer(null);
    setCustomerSearchTerm('');
    sessionStorage.removeItem('checkout_appointment_id');
    sessionStorage.removeItem('checkout_user_id');
    sessionStorage.removeItem('checkout_product_name');
    sessionStorage.removeItem('checkout_delivery_date');

    // Mobile checkout already creates the order before booking a fitting. Reuse
    // that order so its selected add-ons and coupon discount are not lost.
    Promise.all([api.getAppointments(1, 1000), api.getOrders(1, 1000), api.getCoupons().catch(() => [])])
      .then(async ([appointments, orders, coupons]) => {
        const appointment = appointments.find(item => item.id === apptId);
        const invoiceMatch = appointment?.notes?.match(/Order Invoice:\s*([^\.]+)/i)?.[1]?.trim();
        const existing = orders.find(order => order.id === appointment?.orderId || (invoiceMatch && order.invoiceNumber === invoiceMatch));
        if (!existing) return;
        setLinkedOrder(existing);
        setLinkedCoupon(coupons.find(coupon => coupon.code?.toUpperCase() === existing.couponCode?.toUpperCase()) || null);
        setSearchTerm('');
        setPrefillProductToCart('');
        setOrderStatus(existing.status || 'PENDING');
        setPaymentStatus(existing.paymentStatus || 'PENDING');
        setGstPercentage(String(existing.gstPercentage ?? '18'));
        setPaymentMethod((existing.paymentMethod || 'CASH').toLowerCase() === 'card' ? 'Card' : (existing.paymentMethod || 'Cash').toLowerCase() === 'online' ? 'Online' : 'Cash');
        setAdvancePayment(String(Number(existing.advancePayment || 0)));
        setDeliveryDate(existing.deliveryDate ? new Date(existing.deliveryDate).toISOString().slice(0, 10) : '');
        setSelectedCustomer(existing.user || (existing.userId ? { id: existing.userId, fullName: existing.customerName, email: existing.customerEmail, phoneNumber: existing.customerPhone } : null));
        setCustomerSearchTerm(existing.customerName || '');
        const existingItems = await Promise.all((existing.items || []).map(async item => {
          const selectedCustomizations = item.selectedCustomizations || [];
          const addonsTotal = selectedCustomizations.reduce((sum, group) => sum + (group.options || []).reduce((optionSum, option) => optionSum + Number(option.price || 0), 0), 0);
          const product = await api.getProductById(item.productId || item.id).catch(() => null);
          return {
            orderItemId: item.id,
            productId: item.productId || item.id,
            productName: item.productName,
            basePrice: Math.max(0, Number(item.price) - addonsTotal),
            price: Number(item.price),
            quantity: item.quantity,
            maxStock: item.quantity,
            selectedCustomizations,
            customizationGroups: product?.customizationGroups || [],
          };
        }));
        setCart(existingItems);
      })
      .catch(err => console.error('Unable to load linked customer order:', err));

    if (userId) {
      api.getCustomerDetails(userId).then(res => {
        if (res && res.user) {
          setSelectedCustomer(res.user);
          setCustomerSearchTerm(res.user.fullName);
        }
      }).catch(err => console.error('Error fetching checkout customer:', err));
    }

    if (productName) {
      // Only set the search term if it looks like an actual product name (not a generic type).
      // Generic types like "Custom Tailoring" / "SLOT_BOOKING" won't match products,
      // so we skip the search filter to show all products instead of an empty grid.
      const genericTypes = ['custom tailoring', 'slot_booking', 'consultation', 'measurement', 'alteration'];
      const isGeneric = genericTypes.some(g => productName.toLowerCase().includes(g));
      if (!isGeneric) {
        setSearchTerm(productName);
        setPrefillProductToCart(productName);
      } else {
        setSearchTerm('');
        setPrefillProductToCart('');
        setCurrentPage(1);
      }
    } else {
      setSearchTerm('');
      setPrefillProductToCart('');
    }

    if (deliveryDateVal) {
      try {
        const d = new Date(deliveryDateVal);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        setDeliveryDate(`${y}-${m}-${day}`);
      } catch (e) {
        console.error('Error parsing delivery date prefill:', e);
      }
    }
  };

  // Run on first mount (URL params) and on every 'checkout-prefill' event (tab switches)
  useEffect(() => {
    runPrefill();
    window.addEventListener('checkout-prefill', runPrefill);
    return () => window.removeEventListener('checkout-prefill', runPrefill);
  }, []);

  // Filter time slots dynamically
  const getFilteredTimeSlots = () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const todayStr = `${y}-${m}-${d}`;

    const todayUTCStr = today.toISOString().split('T')[0];
    if (appointmentDate !== todayStr && appointmentDate !== todayUTCStr) {
      return timeSlots;
    }

    return timeSlots.filter(s => {
      try {
        const startPart = s.split(' - ')[0].trim(); // e.g. "09:00"
        const match = startPart.match(/^(\d+):(\d+)/);
        if (!match) return true;

        let hour = parseInt(match[1], 10);
        const minute = parseInt(match[2], 10);

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
      if (!filtered.includes(appointmentTimeSlot)) {
        setAppointmentTimeSlot('');
      }
    } else {
      setAppointmentTimeSlot('');
    }
  }, [appointmentDate, timeSlots]);

  const [completedOrder, setCompletedOrder] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadCategoriesAndStaff = async () => {
      try {
        const catList = await api.getCategories();
        setCategories(catList);

        const staffList = await api.getStaffList();
        const staff = staffList.filter(u => ['STAFF', 'ADMIN', 'SUPERADMIN'].includes(u.role));
        setStaffMembers(staff);

        try {
          const settingsData = await api.getSettings();
          if (settingsData) {
            generateDynamicSlots(settingsData.businessHoursStart || '09:00', settingsData.businessHoursEnd || '18:00', settingsData.bookingSlotDurationMinutes || 15);
          } else {
            generateDynamicSlots('09:00', '18:00', 15);
          }
        } catch (e) {
          generateDynamicSlots('09:00', '18:00', 15);
        }
      } catch (err) {
        console.error(err);
      }
    };
    loadCategoriesAndStaff();
  }, []);

  const generateDynamicSlots = (start, end, durationStr) => {
    const duration = Number(durationStr) || 60;
    const parseTime = (t) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + (m || 0);
    };
    const formatTime = (mins) => {
      const h = Math.floor(mins / 60).toString().padStart(2, '0');
      const m = (mins % 60).toString().padStart(2, '0');
      return `${h}:${m}`;
    };

    let current = parseTime(start);
    const endTime = parseTime(end);
    const slots = [];

    while (current + duration <= endTime) {
      slots.push(`${formatTime(current)} - ${formatTime(current + duration)}`);
      current += duration;
    }

    if (slots.length > 0) setTimeSlots(slots);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, 300);
    return () => clearTimeout(timer);
  }, [currentPage, searchTerm, selectedCategory, categories.length]);

  useEffect(() => {
    const searchCustomers = async () => {
      if (customerSearchTerm.trim().length < 2 || selectedCustomer) {
        setCustomerSearchResults([]);
        return;
      }
      setIsSearchingCustomer(true);
      try {
        const results = await api.searchCustomers(customerSearchTerm);
        setCustomerSearchResults(results);
      } catch (err) {
        console.error(err);
      } finally {
        setIsSearchingCustomer(false);
      }
    };
    const timer = setTimeout(searchCustomers, 300);
    return () => clearTimeout(timer);
  }, [customerSearchTerm, selectedCustomer]);

  useEffect(() => {
    if (selectedCustomer) {
      api.getMeasurements(selectedCustomer.id).then(res => {
        const profiles = Array.isArray(res) ? res : (res.profiles || []);
        setCustomerProfiles(profiles);
      }).catch(err => console.error(err));
    } else {
      setCustomerProfiles([]);
      setSelectedProfileIds([]);
    }
  }, [selectedCustomer]);

  const loadData = async () => {
    try {
      let categorySlug = '';
      if (selectedCategory !== 'ALL' && flatCategories.length > 0) {
        const cat = flatCategories.find(c => c.id === selectedCategory);
        if (cat) categorySlug = cat.slug;
      }

      const res = await api.getProductsPaginated({
        page: currentPage,
        limit: 12,
        search: searchTerm,
        category: categorySlug
      });

      if (res && res.success) {
        setProducts(res.data);
        setTotalPages(res.pagination.pages);
      } else {
        setProducts(res || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddToCart = (product) => {
    setError('');
    if (product.inventoryQty <= 0) {
      setError(`Product '${product.name}' is out of stock!`);
      return;
    }

    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id);
      if (existing) {
        if (existing.quantity >= product.inventoryQty) {
          setError(`Cannot add more. Available stock for '${product.name}' is ${product.inventoryQty}`);
          return prev;
        }
        return prev.map(item =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, {
        productId: product.id,
        productName: product.name,
        price: product.price,
        quantity: 1,
        maxStock: product.inventoryQty
      }];
    });
  };

  useEffect(() => {
    if (prefillProductToCart && products.length > 0) {
      const matched = products.find(p => p.name.toLowerCase().includes(prefillProductToCart.toLowerCase()) || prefillProductToCart.toLowerCase().includes(p.name.toLowerCase()));
      if (matched) {
        if (matched.inventoryQty > 0) {
          setError('');
          setCart(prev => {
            const existing = prev.find(item => item.productId === matched.id);
            if (existing) return prev;
            return [...prev, {
              productId: matched.id,
              productName: matched.name,
              price: matched.price,
              quantity: 1,
              maxStock: matched.inventoryQty
            }];
          });
        }
        setPrefillProductToCart('');
      }
    }
  }, [products, prefillProductToCart]);

  const handleUpdateQty = (productId, delta) => {
    setError('');
    setCart(prev => {
      const item = prev.find(i => i.productId === productId);
      if (!item) return prev;

      const nextQty = item.quantity + delta;
      if (nextQty <= 0) {
        return prev.filter(i => i.productId !== productId);
      }
      if (nextQty > item.maxStock) {
        setError(`Cannot add more. Available stock is ${item.maxStock}`);
        return prev;
      }
      return prev.map(i => i.productId === productId ? { ...i, quantity: nextQty } : i);
    });
  };

  const handleUpdatePrice = (productId, price) => {
    setCart(prev => prev.map(item => 
      item.productId === productId 
        ? { ...item, customPrice: price } 
        : item
    ));
  };

  const getItemUnitPrice = item => item.customPrice !== undefined && item.customPrice !== ''
    ? Number(item.customPrice)
    : Number(item.basePrice ?? item.price) + (item.selectedCustomizations || []).reduce((sum, group) =>
      sum + (group.options || []).reduce((optionSum, option) => optionSum + Number(option.price || 0), 0), 0);

  const handleCustomizationChange = (productId, group, option, checked) => {
    setCart(prev => prev.map(item => {
      if (item.productId !== productId) return item;
      const current = item.selectedCustomizations.find(selection => selection.groupId === group.id);
      const currentIds = (current?.options || []).map(selected => selected.optionId);
      const nextIds = group.selectionType === 'SINGLE'
        ? (checked ? [option.id] : currentIds.filter(id => id !== option.id))
        : (checked ? [...new Set([...currentIds, option.id])] : currentIds.filter(id => id !== option.id));
      const nextOptions = group.options.filter(candidate => nextIds.includes(candidate.id)).map(candidate => ({
        optionId: candidate.id,
        name: candidate.name,
        price: Number(candidate.price || 0),
      }));
      const selectedCustomizations = item.selectedCustomizations.filter(selection => selection.groupId !== group.id);
      if (nextOptions.length) selectedCustomizations.push({ groupId: group.id, name: group.name, options: nextOptions });
      return { ...item, selectedCustomizations, customPrice: undefined };
    }));
  };

  const handleRemoveFromCart = (productId) => {
    setCart(prev => prev.filter(i => i.productId !== productId));
  };

  const handleApplyCoupon = async () => {
    setCouponError('');
    setAppliedCoupon(null);
    if (!couponCode.trim()) return;

    try {
      const coupons = await api.getCoupons();
      const code = couponCode.toUpperCase().trim();
      const coupon = coupons.find(c => c.code.toUpperCase() === code);

      if (!coupon) {
        setCouponError('Invalid coupon code.');
        return;
      }
      if (!coupon.isActive) {
        setCouponError('This coupon is deactivated.');
        return;
      }
      if (new Date(coupon.expiryDate).getTime() < Date.now()) {
        setCouponError('Coupon has expired.');
        return;
      }
      if (coupon.usedCount >= coupon.maxUses) {
        setCouponError('Coupon limit reached.');
        return;
      }

      setAppliedCoupon(coupon);
      setCouponError('');
    } catch (err) {
      setCouponError('Error verifying coupon.');
    }
  };

  const calculateTotals = () => {
    const subtotal = cart.reduce((sum, item) => sum + getItemUnitPrice(item) * item.quantity, 0);
    let discount = 0;

    const couponForTotals = linkedOrder ? linkedCoupon : appliedCoupon;
    if (couponForTotals) {
      if (couponForTotals.discountPercent > 0) {
        discount = (subtotal * couponForTotals.discountPercent) / 100;
        if (couponForTotals.maxDiscount && discount > couponForTotals.maxDiscount) {
          discount = Number(couponForTotals.maxDiscount);
        }
      } else if (couponForTotals.discountFlat > 0) {
        discount = Number(couponForTotals.discountFlat);
      }
    } else if (linkedOrder) {
      discount = Number(linkedOrder.discountAmount || 0);
    }
    discount = Math.min(Math.max(0, discount), subtotal);

    const parsedGst = (gstPercentage === '' || isNaN(Number(gstPercentage))) ? 0 : Number(gstPercentage);
    const taxRate = parsedGst / 100;
    const taxableAmount = Math.max(0, subtotal - discount);
    const tax = Number((taxableAmount * taxRate).toFixed(2));
    const originalDeliveryCharge = linkedOrder
      ? Math.max(0, Number(linkedOrder.payableAmount) - (Number(linkedOrder.totalAmount) - Number(linkedOrder.discountAmount) + Number(linkedOrder.taxAmount)))
      : 0;
    const total = Number((taxableAmount + tax + originalDeliveryCharge).toFixed(2));
    const advance = Number(advancePayment) || 0;
    const balance = Math.max(0, total - advance);

    return { subtotal, discount, tax, total, advance, balance };
  };

  const handleCheckout = async () => {
    setError('');
    if (cart.length === 0) {
      setError('Your shopping cart is empty.');
      return;
    }
    if (!selectedCustomer && !customerSearchTerm.trim()) {
      setError('Please input customer name details.');
      return;
    }
    if (isQuickOrder && !quickOrderReason.trim()) {
      setError('Please provide a reason for the quick order.');
      return;
    }
    if (isQuickOrder && !quickOrderExpectedDate) {
      setError('Please specify the expected date for the quick order.');
      return;
    }
    if (!deliveryDate) {
      setError('Please specify a Delivery Date for this order.');
      return;
    }

    try {
      setIsSubmitting(true);

      if (linkedOrder) {
        const repricedOrder = await api.updateOrderCustomizations(linkedOrder.id, cart.map(item => ({
          orderItemId: item.orderItemId,
          selectedCustomizations: (item.selectedCustomizations || []).map(group => ({
            groupId: group.groupId,
            optionIds: (group.options || []).map(option => option.optionId),
          })),
        })));
        const updatedOrder = await api.updateOrderDetails(linkedOrder.id, {
          status: orderStatus,
          paymentStatus,
          advancePayment: Number(advancePayment) || Number(linkedOrder.advancePayment) || 0,
          deliveryDate: deliveryDate || linkedOrder.deliveryDate,
        });
        if (checkoutApptId) {
          await api.updateAppointment(checkoutApptId, { orderId: linkedOrder.id, status: 'ORDERED' });
        }
        const completionItems = (repricedOrder.orderItems || []).map(item => ({
          ...item,
          productName: item.product?.name || cart.find(cartItem => cartItem.orderItemId === item.id)?.productName || 'Product',
        }));
        setLinkedOrder({ ...linkedOrder, ...repricedOrder, ...updatedOrder, items: completionItems });
        setCompletedOrder({ ...linkedOrder, ...repricedOrder, ...updatedOrder, items: completionItems, booking: linkedOrder.booking });
        setCheckoutApptId(null);
        setIsSubmitting(false);
        return;
      }

      const rawSearch = customerSearchTerm.trim();
      const isEmailInput = rawSearch.includes('@');
      const isPhoneInput = !isEmailInput && /^\+?[\d\s-]{10,14}$/.test(rawSearch);
      
      const customerEmail = selectedCustomer?.email || (isEmailInput ? rawSearch : undefined);
      const customerPhone = selectedCustomer?.phoneNumber || (isPhoneInput ? rawSearch : undefined);
      const customerName = selectedCustomer ? selectedCustomer.fullName : (rawSearch || 'Walk-In Customer');

      const order = await api.checkoutOfflineSale({
        userId: selectedCustomer ? selectedCustomer.id : undefined,
        customerName,
        customerEmail,
        customerPhone,
        items: cart.map(i => ({ 
          productId: i.productId, 
          quantity: i.quantity, 
          customPrice: i.customPrice !== undefined && i.customPrice !== '' ? Number(i.customPrice) : undefined 
        })),
        paymentMethod,
        couponCode: appliedCoupon?.code,
        status: checkoutApptId ? 'PENDING' : orderStatus,
        paymentStatus: checkoutApptId ? 'PENDING' : paymentStatus,
        isQuickOrder,
        quickOrderReason: isQuickOrder ? quickOrderReason : undefined,
        quickOrderExpectedDate: isQuickOrder ? quickOrderExpectedDate : undefined,
        advancePayment: Number(advancePayment) || 0,
        gstPercentage: (gstPercentage === '' || isNaN(Number(gstPercentage))) ? 0 : Number(gstPercentage),
        measurementProfileIds: selectedProfileIds.length > 0 ? selectedProfileIds : undefined,
        deliveryDate: deliveryDate || undefined
      });

      if (checkoutApptId) {
        await api.updateAppointment(checkoutApptId, { orderId: order.id, status: 'ORDERED' }).catch(err => {
          console.error('Failed to link order to appointment:', err);
        });
        setCheckoutApptId(null);
      }

      if (orderStatus === 'PAID' && appointmentTimeSlot) {
        const appt = await api.createAppointment({
          userId: selectedCustomer ? selectedCustomer.id : undefined,
          date: new Date(appointmentDate).toISOString(),
          timeSlot: appointmentTimeSlot,
          type: 'MEASUREMENT',
          productType: 'Custom Tailoring',
          staffId: appointmentStaffId || undefined,
          adminOverride: true,
          notes: order.invoiceNumber,
        });
        order.booking = appt;
      }

      setCompletedOrder(order);
      setCart([]);
      setCustomerSearchTerm('');
      setSelectedCustomer(null);
      setCouponCode('');
      setAppliedCoupon(null);
      setAppointmentTimeSlot('');
      setAppointmentStaffId('');
      setIsQuickOrder(false);
      setQuickOrderReason('');
      setQuickOrderExpectedDate('');
      setAdvancePayment('');
      setDeliveryDate('');
      setOrderStatus('PENDING');
      setPaymentStatus('PENDING');
      loadData();
      setIsSubmitting(false);
    } catch (err) {
      setError(err.message || 'Checkout failed.');
      setIsSubmitting(false);
    }
  };

  const calculatedTotals = calculateTotals();
  const { subtotal, discount, tax, total, advance } = calculatedTotals;
  const balance = Math.max(0, total - advance);

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const handleCategoryChange = (e) => {
    setSelectedCategory(e.target.value);
    setCurrentPage(1);
  };

  const filteredProducts = products;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-extrabold text-slate-800 tracking-tight">Manual Checkout</h2>
        <p className="text-xs text-slate-500 font-medium">Record in-store customer sales, check stock, and compile invoices</p>
      </div>

      {checkoutApptId && (
        <div className="p-4 bg-brand-50 border border-brand-200 text-brand-800 rounded-2xl text-xs font-bold flex justify-between items-center">
          <span>Checkout mode enabled for Booking Consultation ID: {checkoutApptId.slice(0, 8).toUpperCase()}</span>
          <button
            onClick={() => setCheckoutApptId(null)}
            className="p-1 hover:bg-brand-100 rounded-lg text-brand-700 font-extrabold text-[10px]"
          >
            Clear
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-100 text-red-700 rounded-2xl text-xs font-bold animate-pulse">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-premium space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 justify-between sm:items-center w-full">
              <span className="font-bold text-slate-800 text-sm">Product Selector</span>

              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                <div className="relative w-full sm:w-auto">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={handleSearchChange}
                    placeholder="Search product..."
                    className="w-full sm:w-auto pl-8 pr-4 py-1.5 text-xs rounded-xl bg-slate-550/5 border border-slate-200/80 focus:bg-white focus:outline-none"
                  />
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                </div>

                {/* Cascading Filter Dropdowns — N-level dynamic */}
                {(() => {
                  const currentPath = selectedCategory !== 'ALL' ? (findCategoryPath(selectedCategory) || []) : [];

                  // Build levels
                  const levels = [{ list: categories, selected: currentPath[0] || null, parentId: null }];
                  for (let i = 0; i < currentPath.length; i++) {
                    const children = currentPath[i].subCategories || [];
                    if (children.length > 0) {
                      levels.push({ list: children, selected: currentPath[i + 1] || null, parentId: currentPath[i].id });
                    }
                  }

                  return (
                    <div className="flex gap-2 w-full sm:w-auto flex-wrap">
                      {levels.map((level, idx) => (
                        <select
                          key={level.parentId || 'root'}
                          value={level.selected?.id || (idx === 0 ? 'ALL' : '')}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (idx === 0 && val === 'ALL') {
                              setSelectedCategory('ALL');
                            } else if (val) {
                              setSelectedCategory(val);
                            } else {
                              const parentCat = currentPath[idx - 1];
                              setSelectedCategory(parentCat ? parentCat.id : 'ALL');
                            }
                            setCurrentPage(1);
                          }}
                          className="flex-1 text-xs font-bold border border-slate-200 rounded-xl py-1.5 px-3 bg-white text-slate-650 focus:outline-none"
                        >
                          {idx === 0 && <option value="ALL">All Catalog</option>}
                          {idx > 0 && <option value="">-- All {idx === 1 ? 'Sub' : 'Sub'.repeat(idx)} --</option>}
                          {level.list.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[500px] overflow-y-auto pr-1">
              {filteredProducts.map(p => (
                <div
                  key={p.id}
                  className={`p-3.5 rounded-2xl border transition-all flex gap-3 items-center justify-between ${p.inventoryQty <= 0 ? 'bg-slate-50/50 border-slate-100 opacity-60' : 'bg-white border-slate-200/60 hover:border-slate-300'} min-w-0`}
                >
                  <div className="flex gap-3 items-center min-w-0">
                    <img
                      src={p.images[0]}
                      alt={p.name}
                      className="w-12 h-12 object-cover rounded-xl border border-slate-100 shrink-0"
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-bold text-slate-800 leading-snug truncate">{p.name}</span>
                      <span className="text-[10px] text-brand-650 font-bold mt-0.5">₹{p.price}</span>
                      <span className="text-[9px] text-slate-400">Stock: {p.inventoryQty}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleAddToCart(p)}
                    disabled={p.inventoryQty <= 0}
                    className="p-1.5 rounded-lg bg-brand-50 border border-brand-100 text-brand-600 hover:bg-brand-500 hover:text-white disabled:opacity-45 disabled:hover:bg-brand-50 disabled:hover:text-brand-600 transition-all focus:outline-none shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-lg bg-slate-50 text-slate-500 disabled:opacity-50"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="text-[10px] font-bold text-slate-600">Page {currentPage} of {totalPages}</span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-lg bg-slate-50 text-slate-500 disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-5 bg-white border border-slate-200/60 rounded-3xl p-6 shadow-premium space-y-5">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <ShoppingCart className="w-4.5 h-4.5 text-brand-500" />
            <span>Invoice Checkout Details</span>
          </h3>

          <div className="space-y-1 relative">
            <label className="text-[10px] font-bold text-slate-400 uppercase block">Customer Search / Full Name *</label>
            {selectedCustomer ? (
              <div className="flex items-center justify-between bg-brand-50 border border-brand-200 rounded-xl px-4 py-2">
                <div>
                  <p className="text-xs font-bold text-brand-800">{selectedCustomer.fullName}</p>
                  <p className="text-[10px] text-brand-600">
                    {selectedCustomer.email} {selectedCustomer.phoneNumber && `• ${selectedCustomer.phoneNumber}`}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedCustomer(null);
                    setCustomerSearchTerm('');
                  }}
                  className="p-1 hover:bg-brand-100 rounded-lg text-brand-500 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  value={customerSearchTerm}
                  onChange={e => setCustomerSearchTerm(e.target.value)}
                  placeholder="Search email/phone or enter Walk-In Name"
                  className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-brand-500"
                  required
                />
                <User className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                {customerSearchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-10 overflow-hidden">
                    {customerSearchResults.map(user => (
                      <button
                        key={user.id}
                        className="w-full text-left px-4 py-2 text-xs hover:bg-slate-50 border-b border-slate-100 last:border-0"
                        onClick={() => {
                          setSelectedCustomer(user);
                          setCustomerSearchTerm(user.fullName);
                          setCustomerSearchResults([]);
                        }}
                      >
                        <p className="font-bold text-slate-800">{user.fullName}</p>
                        <p className="text-[10px] text-slate-500">{user.email} {user.phoneNumber && `• ${user.phoneNumber}`}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {customerProfiles.length > 0 && (
              <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-2">Select Measurement Profiles</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedProfileIds([])}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${selectedProfileIds.length === 0 ? 'bg-slate-200 text-slate-700' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-100'}`}
                  >
                    None
                  </button>
                  {customerProfiles.map(profile => (
                    <button
                      key={profile.id}
                      type="button"
                      onClick={() => {
                        setSelectedProfileIds(prev =>
                          prev.includes(profile.id)
                            ? prev.filter(id => id !== profile.id)
                            : [...prev, profile.id]
                        )
                      }}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border ${selectedProfileIds.includes(profile.id) ? 'bg-brand-500 border-brand-600 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:border-brand-300'}`}
                    >
                      {profile.profileName || profile.name || 'Unnamed Profile'}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto border-t border-b border-slate-100 py-3">
            {cart.length === 0 ? (
              <p className="text-xs text-center text-slate-400 py-6">Your shopping cart is empty</p>
            ) : (
              cart.map((item) => (
                <React.Fragment key={item.productId}>
                <div className="flex justify-between items-center text-xs">
                  <div className="flex-1 min-w-0 pr-2">
                    <p className="font-bold text-slate-800 truncate">{item.productName}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      {linkedOrder ? (
                        <span className="text-[11px] font-bold text-slate-700">₹{getItemUnitPrice(item).toFixed(2)}</span>
                      ) : <div className="relative group flex items-center">
                        <span className="absolute left-2 text-[11px] font-bold text-slate-400 group-focus-within:text-brand-500 transition-colors">₹</span>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={item.customPrice !== undefined ? item.customPrice : item.price}
                          onChange={(e) => handleUpdatePrice(item.productId, e.target.value)}
                          className="w-20 pl-5 pr-2 py-1 text-[11px] font-bold text-slate-800 bg-white border border-slate-200 rounded-lg shadow-sm hover:border-brand-300 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all cursor-text"
                          title="Edit Unit Price"
                        />
                      </div>}
                      <span className="text-[11px] font-medium text-slate-400">x {item.quantity}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    {!linkedOrder && <div className="flex items-center border border-slate-200 rounded-lg bg-slate-50">
                      <button
                        onClick={() => handleUpdateQty(item.productId, -1)}
                        className="p-1 hover:bg-slate-100 text-slate-500 rounded-l-lg"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="px-2 font-bold text-slate-700 text-[11px]">{item.quantity}</span>
                      <button
                        onClick={() => handleUpdateQty(item.productId, 1)}
                        className="p-1 hover:bg-slate-100 text-slate-500 rounded-r-lg"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>}
                    {!linkedOrder && <button
                      onClick={() => handleRemoveFromCart(item.productId)}
                      className="text-slate-400 hover:text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>}
                  </div>
                </div>
                {item.selectedCustomizations?.length > 0 && (
                  <div className="mt-2 text-[10px] text-slate-500">
                    {item.selectedCustomizations.map(group => (
                      <div key={group.groupId || group.id}>
                        <span className="font-bold">{group.groupName || group.name}: </span>
                        {(group.options || []).map(option => option.name).join(', ')}
                      </div>
                    ))}
                  </div>
                )}
                {linkedOrder && item.customizationGroups?.length > 0 && (
                  <div className="mt-2 rounded-xl border border-slate-100 bg-slate-50 p-3 space-y-3">
                    {item.customizationGroups.map(group => {
                      const selectedIds = item.selectedCustomizations.find(selection => selection.groupId === group.id)?.options.map(option => option.optionId) || [];
                      return (
                        <fieldset key={group.id}>
                          <legend className="mb-1 text-[10px] font-bold text-slate-600">
                            {group.name}{group.required ? ' · Required' : ''}{group.selectionType === 'SINGLE' ? ' · Choose one' : ''}
                          </legend>
                          <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                            {group.options.map(option => (
                              <label key={option.id} className="inline-flex items-center gap-1.5 text-[10px] text-slate-600 cursor-pointer">
                                <input
                                  type={group.selectionType === 'SINGLE' ? 'radio' : 'checkbox'}
                                  name={`${item.productId}-${group.id}`}
                                  checked={selectedIds.includes(option.id)}
                                  onChange={event => handleCustomizationChange(item.productId, group, option, event.target.checked)}
                                />
                                {option.name}{Number(option.price) > 0 ? ` (+₹${Number(option.price).toFixed(2)})` : ''}
                              </label>
                            ))}
                          </div>
                        </fieldset>
                      );
                    })}
                  </div>
                )}
                </React.Fragment>
              ))
            )}
          </div>

          {linkedOrder ? (
            <div className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
              Existing customer order {linkedOrder.invoiceNumber} loaded. Add-on edits and the coupon discount are saved when you complete checkout.
              {linkedOrder.couponCode && <span className="block mt-1">Coupon {linkedOrder.couponCode} applied.</span>}
            </div>
          ) : <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase block">Promo Coupon</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={couponCode}
                  onChange={e => setCouponCode(e.target.value)}
                  placeholder="e.g. WELCOME150"
                  className="w-full pl-9 pr-4 py-1.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-brand-500"
                />
                <Tag className="w-4 h-4 absolute left-3 top-2 text-slate-400" />
              </div>
              <button
                onClick={handleApplyCoupon}
                className="py-1.5 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold text-xs shrink-0"
              >
                Apply
              </button>
            </div>
            {couponError && <p className="text-[10px] text-red-500 font-semibold">{couponError}</p>}
            {appliedCoupon && (
              <p className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                Coupon code {appliedCoupon.code} applied (-{appliedCoupon.discountPercent > 0 ? `${appliedCoupon.discountPercent}%` : `₹${appliedCoupon.discountFlat}`})
              </p>
            )}
          </div>}

          <div className="space-y-1.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase block">Payment Method</span>
            <div className="grid grid-cols-3 gap-2">
              {['Cash', 'Online', 'Card'].map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPaymentMethod(method)}
                  className={`
                    py-1.5 rounded-xl text-xs font-bold border transition-all focus:outline-none
                    ${paymentMethod === method
                      ? 'bg-brand-500 border-brand-500 text-white shadow-sm'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}
                  `}
                >
                  {method}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Order Status</span>
              <select
                value={orderStatus}
                onChange={(e) => setOrderStatus(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-brand-500"
              >
                <option value="PENDING">Pending (Order Placed)</option>
                <option value="PAID">Measurement Session</option>
                <option value="PROCESSING">Processing (Order Stitching)</option>
                <option value="SHIPPED">Shipped (Product Completed)</option>
                <option value="DELIVERED">Delivered (Handed over)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Payment Status</span>
              <select
                value={paymentStatus}
                onChange={(e) => {
                  const val = e.target.value;
                  setPaymentStatus(val);
                  if (val === 'COMPLETED' && total > 0) {
                    setAdvancePayment(String(total));
                  } else if (val === 'PENDING') {
                    setAdvancePayment('');
                  }
                }}
                className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-brand-500"
              >
                <option value="PENDING">Pending / Non-Paid</option>
                <option value="PARTIAL">Advance Paid</option>
                <option value="COMPLETED">Fully Paid</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5 p-3 rounded-xl border border-brand-200 bg-brand-50/50">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="quickOrder"
                checked={isQuickOrder}
                onChange={(e) => setIsQuickOrder(e.target.checked)}
                className="w-4 h-4 text-brand-600 rounded focus:ring-brand-500"
              />
              <label htmlFor="quickOrder" className="text-xs font-bold text-brand-800">
                Mark as Quick Order
              </label>
            </div>
            {isQuickOrder && (
              <div className="mt-2 space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-brand-700 uppercase block">Expected Date *</label>
                  <input
                    type="date"
                    min={new Date().toISOString().split('T')[0]}
                    value={quickOrderExpectedDate}
                    onChange={(e) => setQuickOrderExpectedDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-brand-200 rounded-xl focus:outline-none focus:border-brand-500"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-brand-700 uppercase block">Why do you need this order quick? *</label>
                  <textarea
                    value={quickOrderReason}
                    onChange={(e) => setQuickOrderReason(e.target.value)}
                    placeholder="Enter reason..."
                    rows={2}
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-brand-200 rounded-xl focus:outline-none focus:border-brand-500"
                    required
                  />
                </div>
              </div>
            )}
          </div>

          {orderStatus === 'PAID' && (
            <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-4 space-y-3">
              <h4 className="font-bold text-emerald-800 text-xs flex items-center gap-1.5">
                <Check className="w-4 h-4 text-emerald-600" />
                Book Measurement Session
              </h4>
              <p className="text-[10px] text-emerald-600/80 mb-2 font-medium">Bypass limits active: As an admin, you can book any slot, even if fully booked.</p>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-emerald-700 uppercase">Date</label>
                  <input
                    type="date"
                    min={new Date().toISOString().split('T')[0]}
                    value={appointmentDate}
                    onChange={(e) => setAppointmentDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-emerald-200 rounded-xl focus:outline-none focus:border-brand-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-emerald-700 uppercase">Time Slot</label>
                  <select
                    value={appointmentTimeSlot}
                    onChange={(e) => setAppointmentTimeSlot(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-emerald-200 rounded-xl focus:outline-none focus:border-brand-500"
                  >
                    <option value="">Select Time</option>
                    {getFilteredTimeSlots().map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-emerald-700 uppercase">Sizing Person (Staff)</label>
                <select
                  value={appointmentStaffId}
                  onChange={(e) => setAppointmentStaffId(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-bold bg-white border border-emerald-200 rounded-xl focus:outline-none focus:border-brand-500"
                >
                  <option value="">Unassigned (Any Available Staff)</option>
                  {staffMembers.map(s => <option key={s.id} value={s.id}>{s.fullName} ({s.role})</option>)}
                </select>
              </div>
            </div>
          )}

          <div className="space-y-2 border-t border-slate-100 pt-3 text-xs">
            <div className="flex justify-between text-slate-500">
              <span>Subtotal</span>
              <span className="font-semibold text-slate-800">₹{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Coupon Discount</span>
              <span className="font-semibold text-red-500">-₹{discount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-500 items-center">
              <span className="flex items-center gap-1.5">
                Taxes (GST 
                <input 
                  type="number" 
                  value={gstPercentage} 
                  onChange={e => setGstPercentage(e.target.value)} 
                  disabled={Boolean(linkedOrder)}
                  className="w-10 text-center text-xs font-semibold bg-slate-50 border border-slate-200 rounded py-0.5 disabled:opacity-60"
                  placeholder="0"
                />
                %)
              </span>
              <span className="font-semibold text-slate-800">₹{tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-100 pt-2 text-sm font-extrabold text-slate-800">
              <span>Total Payable</span>
              <span>₹{total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center border-t border-slate-100 pt-2">
              <span className="font-semibold text-slate-600">Advance Payment</span>
              <div className="w-24 relative">
                <span className="absolute left-2 top-1.5 text-slate-400">₹</span>
                <input
                  type="number"
                  min="0"
                  max={total}
                  value={advancePayment}
                  onChange={e => {
                    const val = e.target.value;
                    setAdvancePayment(val);
                    const num = Number(val) || 0;
                    if (num >= total && total > 0) {
                      setPaymentStatus('COMPLETED');
                    } else if (num > 0) {
                      setPaymentStatus('PARTIAL');
                    } else {
                      setPaymentStatus('PENDING');
                    }
                  }}
                  placeholder="0.00"
                  className="w-full pl-6 pr-2 py-1.5 text-right text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500"
                />
              </div>
            </div>
            {advance > 0 && (
              <div className="flex justify-between pt-1 text-sm font-extrabold text-brand-600">
                <span>Balance Due</span>
                <span>₹{balance.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between items-center border-t border-slate-100 pt-2">
              <span className="font-semibold text-slate-600">Delivery Date *</span>
              <div className="w-32 relative">
                <input
                  type="date"
                  min={new Date().toISOString().split('T')[0]}
                  value={deliveryDate}
                  onChange={e => setDeliveryDate(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500 text-slate-700 font-medium cursor-pointer"
                  title="Select future date"
                />
              </div>
            </div>
          </div>

          <button
            onClick={handleCheckout}
            disabled={isSubmitting}
            className="w-full py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-extrabold text-xs shadow-premium shadow-brand-500/10 transition-all focus:outline-none flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              'Checkout & Print Invoice'
            )}
          </button>
        </div>
      </div>

      {completedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-lg shadow-2xl p-6 relative flex flex-col max-h-[85vh] overflow-y-auto">
            <button
              onClick={() => setCompletedOrder(null)}
              className="absolute top-4 right-4 p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <div id="invoice-print-area" className="flex-1 space-y-6 pr-1">
              <div className="flex justify-between items-start border-b border-slate-100 pb-4">
                <div>
                  <h3 className="font-black text-slate-800 text-lg tracking-tight">MARCOS STUDIO</h3>
                  <p className="text-[10px] text-slate-400">Custom Luxury Tailoring & Apparel</p>
                </div>
                <div className="text-right">
                  <span className="text-xs bg-emerald-50 text-emerald-700 py-0.5 px-2 rounded-full font-bold uppercase">
                    PAID
                  </span>
                  <p className="text-[10px] text-slate-450 mt-1.5">{completedOrder.invoiceNumber}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <p className="text-[10px] text-slate-400 uppercase font-bold">Billed To</p>
                  <p className="font-bold text-slate-800 mt-1">{completedOrder.customerName}</p>
                  <p className="text-slate-500">Walk-In Client Checkout</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 uppercase font-bold">Payment Details</p>
                  <p className="font-semibold text-slate-700 mt-1">{completedOrder.paymentMethod} Payment</p>
                  <p className="text-slate-500">
                    {new Date(completedOrder.createdAt).toLocaleDateString()} {new Date(completedOrder.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>

              {completedOrder.booking && (
                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-xs">
                  <div className="flex items-center gap-2 font-bold text-emerald-800 mb-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    Measurement Session Confirmed
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-emerald-700">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-emerald-600/80 block mb-0.5">Date</span>
                      <span className="font-bold">{new Date(completedOrder.booking.date).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-emerald-600/80 block mb-0.5">Time</span>
                      <span className="font-bold">{completedOrder.booking.timeSlot}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="border border-slate-200 rounded-2xl overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-[9px] font-bold text-slate-400 uppercase">
                    <tr>
                      <th className="py-2 px-3">Product Item</th>
                      <th className="py-2 px-3 text-center">Qty</th>
                      <th className="py-2 px-3 text-right">Price</th>
                      <th className="py-2 px-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {completedOrder.items.map((item) => (
                      <tr key={item.id}>
                        <td className="py-2.5 px-3 font-bold text-slate-800">{item.productName}</td>
                        <td className="py-2.5 px-3 text-center font-bold text-slate-500">{item.quantity}</td>
                        <td className="py-2.5 px-3 text-right text-slate-600">₹{item.price}</td>
                        <td className="py-2.5 px-3 text-right font-extrabold text-slate-800">
                          ₹{(item.price * item.quantity).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="w-1/2 ml-auto space-y-2 text-xs border-t border-slate-100 pt-3">
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal</span>
                  <span className="font-semibold text-slate-800">₹{Number(completedOrder.totalAmount || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Discount</span>
                  <span className="font-semibold text-red-500">-₹{Number(completedOrder.discountAmount || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Taxes (GST {completedOrder.gstPercentage !== undefined && completedOrder.gstPercentage !== null ? completedOrder.gstPercentage : 18}%)</span>
                  <span className="font-semibold text-slate-800">₹{Number(completedOrder.taxAmount || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-100 pt-2 text-sm font-extrabold text-slate-800">
                  <span>Payable</span>
                  <span>₹{Number(completedOrder.payableAmount || 0).toFixed(2)}</span>
                </div>
                {completedOrder.advancePayment !== undefined && (
                  <>
                    <div className="flex justify-between text-slate-500 pt-1">
                      <span>Advance Paid</span>
                      <span className="font-semibold text-emerald-600">₹{Number(completedOrder.advancePayment || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-extrabold text-brand-600 pt-1 border-t border-slate-100 mt-1">
                      <span>Balance Due</span>
                      <span>₹{Number(completedOrder.balanceAmount || 0).toFixed(2)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="mt-6 border-t border-slate-100 pt-4 flex gap-3">
              <button
                onClick={() => {
                  const printContent = document.getElementById('invoice-print-area');
                  if (!printContent) {
                    window.print();
                    return;
                  }
                  const printWindow = window.open('', '_blank', 'width=850,height=950');
                  if (printWindow) {
                    printWindow.document.write(`
                      <!DOCTYPE html>
                      <html>
                        <head>
                          <title>Invoice - ${completedOrder?.invoiceNumber || 'MARCOS'}</title>
                          <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
                          <style>
                            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 32px; color: #1e293b; background: white; }
                            @page { margin: 12mm; size: auto; }
                            table { width: 100%; border-collapse: collapse; }
                          </style>
                        </head>
                        <body>
                          ${printContent.innerHTML}
                          <script>
                            window.onload = function() {
                              setTimeout(function() {
                                window.focus();
                                window.print();
                                window.onafterprint = function() { window.close(); };
                              }, 300);
                            };
                          </script>
                        </body>
                      </html>
                    `);
                    printWindow.document.close();
                  } else {
                    window.print();
                  }
                }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 font-bold text-xs"
              >
                <Printer className="w-4 h-4" />
                <span>Print Invoice</span>
              </button>
              <button
                onClick={() => setCompletedOrder(null)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs shadow-sm"
              >
                <Check className="w-4 h-4" />
                <span>Confirm</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
