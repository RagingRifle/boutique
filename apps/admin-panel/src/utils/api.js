
// API Configuration
const BASE_URL = import.meta.env.VITE_API_URL || 'http://50.6.44.247:5100/api/v1';

class APIClient {
  constructor() {
    this.isLiveMode = true;
    this._isRefreshing = false;        // Prevent concurrent refresh storms
    this._refreshQueue = [];           // Queue requests waiting for token refresh
  }

  setLiveMode(live) {
    // Permanent live mode
  }

  getLiveMode() {
    return true;
  }

  async _silentRefresh() {
    const refreshResponse = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include', // Send the httpOnly refreshToken cookie
      headers: { 'Content-Type': 'application/json' },
    });

    if (!refreshResponse.ok) {
      throw new Error('Refresh failed');
    }

    const data = await refreshResponse.json();
    if (data.accessToken) {
      localStorage.setItem('marcos_admin_token', data.accessToken);
      if (data.user) {
        localStorage.setItem('marcos_admin_user', JSON.stringify(data.user));
      }
      return data.accessToken;
    }
    throw new Error('No access token in refresh response');
  }

  async request(endpoint, options, _isRetry = false) {
    // Set default JSON headers
    const headers = new Headers(options?.headers);
    if (!headers.has('Content-Type') && !(options?.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    const token = localStorage.getItem('marcos_admin_token');
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      credentials: 'include', // Always send cookies (needed for refresh token flow)
      headers,
    });

    // ── Silent token refresh on 401 ────────────────────────────────────────────
    // If the access token has expired (401) and this isn't already a retry,
    // attempt a silent refresh using the httpOnly cookie before giving up.
    if (response.status === 401 && !_isRetry) {
      if (this._isRefreshing) {
        // Another refresh is already in-flight — queue this request
        return new Promise((resolve, reject) => {
          this._refreshQueue.push({ resolve, reject, endpoint, options });
        });
      }

      this._isRefreshing = true;
      try {
        await this._silentRefresh();
        this._isRefreshing = false;

        // Flush any queued requests
        this._refreshQueue.forEach(({ resolve, reject, endpoint: ep, options: op }) => {
          this.request(ep, op, true).then(resolve).catch(reject);
        });
        this._refreshQueue = [];

        // Retry the original request once with the new token
        return this.request(endpoint, options, true);
      } catch (refreshError) {
        this._isRefreshing = false;
        this._refreshQueue.forEach(({ reject }) => reject(new Error('Session expired')));
        this._refreshQueue = [];

        // Refresh also failed → clear session and redirect to login
        localStorage.removeItem('marcos_admin_token');
        localStorage.removeItem('marcos_admin_user');
        this.setLiveMode(false);
        window.location.reload();
        throw new Error('Session expired. Please log in again.');
      }
    }
    // ──────────────────────────────────────────────────────────────────────────

    if (!response.ok) {
      if (response.status === 403) {
        // Forbidden — don't wipe the session, just throw
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Forbidden: Insufficient privileges');
      }
      const errorData = await response.json().catch(() => ({}));
      let errorMessage = errorData.message || `Request failed: ${response.status}`;
      
      // If it's a Zod validation error, extract the specific details
      if (errorData.errors && Array.isArray(errorData.errors)) {
        const zodErrors = errorData.errors.map(err => err.message).join(', ');
        if (zodErrors) errorMessage = `Validation Error: ${zodErrors}`;
      } else if (errorData.error) {
        errorMessage = errorData.error;
      }
      
      throw new Error(errorMessage);
    }

    return response.json();
  }

  async login(email, password) {
    const response = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      credentials: 'include', // CRITICAL: Receive the httpOnly refreshToken cookie from backend
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Login failed: ${response.status}`);
    }

    const data = await response.json();
    if (data.success && data.accessToken) {
      localStorage.setItem('marcos_admin_token', data.accessToken);
      localStorage.setItem('marcos_admin_user', JSON.stringify(data.user));
      this.setLiveMode(true);
    }
    return data;
  }

  async logout() {
    // Tell the backend to blacklist the access token and clear the refresh cookie
    try {
      const token = localStorage.getItem('marcos_admin_token');
      await fetch(`${BASE_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include', // Send the httpOnly cookie so backend can revoke it
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
      });
    } catch (e) {
      // Ignore network errors on logout — still clear local state
    }
    localStorage.removeItem('marcos_admin_token');
    localStorage.removeItem('marcos_admin_user');
    this.setLiveMode(false);
  }

  getCurrentUser() {
    const userStr = localStorage.getItem('marcos_admin_user');
    if (!userStr) return null;
    try {
      return JSON.parse(userStr);
    } catch (e) {
      return null;
    }
  }

  // DASHBOARD
  async getDashboard(weekStart) {

    const url = weekStart ? `/admin/dashboard?weekStart=${weekStart}` : '/admin/dashboard';
    const res = await this.request(url);
    return res.data;

  }

  async getCustomerIntelligence() {

    const res = await this.request('/admin/customers-intelligence');
    return res.data;

  }

  async getOrderIntelligence() {

    const res = await this.request('/admin/orders-intelligence');
    return res.data;

  }

  async getRevenueIntelligence() {

    const res = await this.request('/admin/revenue-intelligence');
    return res.data;

  }

  async getPromotionsIntelligence() {
    try {
      const res = await this.request('/admin/promotions-intelligence');
      return res.data;
    } catch (e) {
      if (this.isLiveMode) throw e;
      return null;
    }
  }

  async getInventoryIntelligence() {
    try {
      const res = await this.request('/admin/inventory-intelligence');
      return res.data;
    } catch (e) {
      if (this.isLiveMode) throw e;
      return null;
    }
  }

  // PRODUCTS CRUD
  async getProductsPaginated({ page = 1, limit = 12, search = '', categorySlug = '' } = {}) {

    const query = new URLSearchParams();
    query.append('page', page);
    query.append('limit', limit);
    if (search) query.append('search', search);
    if (categorySlug) query.append('category', categorySlug);

    const res = await this.request(`/products?${query.toString()}`);
    return res;

  }

  async getProducts() {

    // Fallback for components needing all products (e.g. Sidebar counts)
    const res = await this.request('/products?limit=1000');
    return res.data;

  }

  async getProductById(id) {
    const res = await this.request(`/products/${id}`);
    return res.data;
  }

  async createProduct(product) {

    const res = await this.request('/admin/products', {
      method: 'POST',
      body: JSON.stringify(product),
    });
    return res.data;

  }

  async updateProduct(id, updates) {

    const res = await this.request(`/admin/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    return res.data;

  }

  async deleteProduct(id) {

    await this.request(`/admin/products/${id}`, { method: 'DELETE' });
    return true;

  }

  async toggleTrending(id, isTrending) {
    try {
      const res = await this.request(`/admin/products/${id}/trending`, {
        method: 'PUT',
        body: JSON.stringify({ isTrending, trendingScheduledAt: isTrending ? new Date().toISOString() : null }),
      });
      return res.data;
    } catch (e) {
      return this.updateProduct(id, {
        isTrending,
        trendingScheduledAt: isTrending ? new Date().toISOString() : undefined
      });
    }
  }

  // CATEGORIES CRUD & ORDERING
  async getCategories() {

    const res = await this.request('/categories');
    return res.data;

  }

  async createCategory(category) {

    const res = await this.request('/admin/categories', {
      method: 'POST',
      body: JSON.stringify(category),
    });
    return res.data;

  }

  async updateCategory(id, updates) {

    const res = await this.request(`/admin/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    return res.data;

  }

  async deleteCategory(id) {

    await this.request(`/admin/categories/${id}`, { method: 'DELETE' });
    return true;

  }
  async reorderCategories(orderedIds) {

    const categoriesPayload = orderedIds.map((id, index) => ({ id, order: index + 1 }));
    const res = await this.request('/admin/categories/reorder', {
      method: 'PUT',
      body: JSON.stringify({ categories: categoriesPayload }),
    });
    return res.data;

  }


  // OFFERS CRUD
  async getOffers() {

    const res = await this.request('/admin/offers');
    return res.data || [];

  }

  async createOffer(offerData) {

    const res = await this.request('/admin/offers', {
      method: 'POST',
      body: JSON.stringify(offerData)
    });
    return res.data;

  }

  async updateOffer(id, updates) {

    const res = await this.request(`/admin/offers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
    return res.data;

  }

  async deleteOffer(id) {

    await this.request(`/admin/offers/${id}`, { method: 'DELETE' });
    return true;

  }

  // CUSTOMERS & MEASUREMENTS
  async getAppCustomers() {
    return this.getCustomers();
  }

  async createAppCustomer(customer) {

    const res = await this.request('/admin/customers', {
      method: 'POST',
      body: JSON.stringify(customer),
    });
    return res.data;

  }

  async updateAppCustomer(id, updates) {

    const res = await this.request(`/admin/customers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    return res.data;

  }

  async getCustomers() {

    const res = await this.request('/admin/customers?limit=1000');
    return res.data;

  }

  async searchCustomers(searchTerm) {
    if (!searchTerm) return [];

    const res = await this.request(`/admin/customers?search=${encodeURIComponent(searchTerm)}&limit=10`);
    return res.data;

  }

  async getCustomerDetails(id) {

    const res = await this.request(`/admin/customers/${id}`);
    return {
      user: res.data,
      profiles: res.data.measurementProfiles || [],
    };

  }

  // STORE LOCATIONS CRUD
  async getStoreLocations() {

    const res = await this.request('/admin/stores');
    return res.data;

  }

  async createStoreLocation(store) {

    const res = await this.request('/admin/stores', {
      method: 'POST',
      body: JSON.stringify(store),
    });
    return res.data;

  }

  async updateStoreLocation(id, updates) {

    const res = await this.request(`/admin/stores/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    return res.data;

  }

  async deleteStoreLocation(id) {

    await this.request(`/admin/stores/${id}`, { method: 'DELETE' });
    return true;

  }

  async deleteCustomer(id) {

    await this.request(`/admin/customers/${id}`, { method: 'DELETE' });
    return true;

  }

  async forcePasswordReset(id) {
    const res = await this.request(`/admin/customers/${id}/force-password-reset`, {
      method: 'POST'
    });
    return res.data;
  }

  async getMeasurements(userId) {

    const res = await this.request(`/measurements?userId=${userId}`);
    return res.data;

  }

  async getAllMeasurements() {

    const res = await this.request('/measurements');
    return res.data;

  }

  async createMeasurementProfile(profile) {

    const res = await this.request('/measurements', {
      method: 'POST',
      body: JSON.stringify(profile),
    });
    return res.data;

  }

  async updateMeasurements(id, updates) {

    const res = await this.request(`/measurements/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    return res.data;

  }

  async deleteMeasurementProfile(id) {

    await this.request(`/measurements/${id}`, { method: 'DELETE' });
    return true;

  }

  async getMeasurementHistory(profileId) {

    const res = await this.request(`/measurements/${profileId}/history`);
    return res.data;

  }

  // APPOINTMENTS
  async getAppointments(page = 1, limit = 1000) {

    const res = await this.request(`/appointments?page=${page}&limit=${limit}`);
    const data = res.data.map(appt => ({
      ...appt,
      userName: appt.user?.fullName || 'Customer',
    }));
    data.pagination = res.pagination;
    return data;

  }

  async updateAppointmentStatus(id, status) {

    const res = await this.request(`/appointments/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
    return res.data;

  }

  async updateAppointment(id, data) {

    const res = await this.request(`/appointments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.data;

  }

  async getAvailability(date) {
    const res = await this.request(`/appointments/availability?date=${date}`);
    return res.data;
  }

  async createAppointment(data) {

    const res = await this.request('/appointments', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;

  }


  async updateStoreVisit(id, data) {

    const res = await this.request(`/visits/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.data;

  }

  async createStoreVisit(data) {
    const res = await this.request('/visits', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  }

  // STORE VISITS
  async getStoreVisits(page = 1, limit = 500) {

    const res = await this.request(`/visits?page=${page}&limit=${limit}`);
    return res.data.map(visit => ({
      ...visit,
      customerName: visit.customer?.fullName || 'Customer',
      assignedStaffName: visit.assignedStaff?.fullName || '',
    }));

  }

  async assignStaffToVisit(visitId, staffId) {

    const res = await this.request(`/visits/${visitId}/assign`, {
      method: 'PUT',
      body: JSON.stringify({
        assignedStaffId: staffId,
        confirmedDate: new Date().toISOString(),
      }),
    });
    return res.data;

  }

  async completeStoreVisit(visitId, completionNotes, mediaUrls) {

    const res = await this.request(`/visits/${visitId}/status`, {
      method: 'PUT',
      body: JSON.stringify({
        status: 'COMPLETED',
        completionNotes,
        mediaUrls,
      }),
    });
    return res.data;

  }

  // LOYALTY & REWARDS
  async adjustLoyaltyPoints(userId, points, reason) {

    await this.request('/admin/loyalty/adjust', {
      method: 'POST',
      body: JSON.stringify({ userId, points, reason }),
    });
    return true;

  }

  async getPointTransactions() {

    const res = await this.request('/admin/loyalty/transactions');
    return res.data;

  }

  async getVoucherPlans() {

    const res = await this.request('/auth/admin/loyalty/voucher-plans');
    return res.data;

  }

  async createVoucherPlan(plan) {

    const res = await this.request('/auth/admin/loyalty/voucher-plans', {
      method: 'POST',
      body: JSON.stringify(plan),
    });
    return res.data;

  }

  async deactivateVoucherPlan(id) {

    await this.request(`/auth/admin/loyalty/voucher-plans/${id}`, {
      method: 'DELETE',
    });
    return true;

  }

  // BANNERS MANAGEMENT
  async getBanners() {

    const res = await this.request('/banners/admin');
    return res.data;

  }

  async createBanner(banner) {

    const res = await this.request('/banners/admin', {
      method: 'POST',
      body: JSON.stringify(banner),
    });
    return res.data;

  }

  async toggleBannerActive(id, isActive) {

    const res = await this.request(`/banners/admin/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ isActive }),
    });
    return res.data;

  }

  async updateBannerOrder(id, order) {

    const res = await this.request(`/banners/admin/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ order }),
    });
    return res.data;

  }

  async deleteBanner(id) {

    await this.request(`/banners/admin/${id}`, { method: 'DELETE' });
    return true;

  }

  // COUPON MANAGEMENT
  async getCoupons() {

    const res = await this.request('/admin/coupons');
    return res.data;

  }

  async createCoupon(coupon) {

    const res = await this.request('/admin/coupons', {
      method: 'POST',
      body: JSON.stringify(coupon),
    });
    return res.data;

  }

  async deactivateCoupon(id) {

    const res = await this.request(`/admin/coupons/${id}/deactivate`, {
      method: 'PUT',
    });
    return res.data;

  }

  // NOTIFICATION MANAGEMENT
  async getNotifications() {

    const res = await this.request('/notifications/history');
    return res.data.map(notif => ({
      ...notif,
      targetAudience: notif.recipients && notif.recipients.length > 0 ? `${notif.recipients.length} Users` : 'All Customers',
    }));

  }

  async createNotification(notification) {

    const res = await this.request('/notifications/admin/broadcast', {
      method: 'POST',
      body: JSON.stringify({
        title: notification.title,
        body: notification.body,
        channels: ['EMAIL', 'SMS', 'PUSH'],
      }),
    });
    return res.data;

  }

  // SUPPORT TICKETS
  async getSupportTickets(page = 1, limit = 100) {

    const res = await this.request(`/tickets/admin?page=${page}&limit=${limit}`);
    const data = res.data.map(ticket => ({
      ...ticket,
      userName: ticket.user?.fullName || 'Customer',
    }));
    data.pagination = res.pagination;
    return data;

  }

  async updateTicketStatus(id, status) {

    const res = await this.request(`/tickets/admin/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
    return res.data;

  }

  async getTicketMessages(ticketId) {

    const res = await this.request(`/tickets/admin/${ticketId}/messages`);
    return res.data;

  }

  async sendTicketMessage(id, text) {

    const res = await this.request(`/tickets/admin/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
    return res.data;

  }

  // AUDIT LOGS
  async getAuditLogs() {

    const res = await this.request('/admin/audits');
    return res.data;

  }

  // STAFF MANAGEMENT
  async getStaffList() {

    const res = await this.request('/admin/users');
    return res.data;

  }

  async forceStaffPasswordReset(id) {
    const res = await this.request(`/admin/users/${id}/force-password-reset`, {
      method: 'POST'
    });
    return res.data;
  }

  async createStaff(staff) {

    const res = await this.request('/admin/users', {
      method: 'POST',
      body: JSON.stringify(staff),
    });
    return res.data;

  }

  async updateStaff(id, updates) {

    const res = await this.request(`/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    return res.data;

  }

  async updateUserRole(id, role) {
    return this.updateStaff(id, { role });
  }

  // MANUAL OFFLINE CHECKOUT
  async checkoutOfflineSale(sale) {

    const products = await this.getProducts();
    const invoiceItems = sale.items.map(item => {
      const prod = products.find(p => p.id === item.productId);
      if (!prod) throw new Error(`Product not found: ${item.productId}`);
      return {
        productId: item.productId,
        quantity: item.quantity,
        price: item.customPrice !== undefined
          ? Number(item.customPrice)
          : Number(prod.price) + (item.selectedCustomizations || []).reduce((sum, group) =>
            sum + (group.options || []).reduce((optionSum, option) => optionSum + Number(option.price || 0), 0), 0),
        selectedCustomizations: (item.selectedCustomizations || []).map(group => ({
          groupId: group.groupId,
          optionIds: (group.options || []).map(option => option.optionId),
        })),
      };
    });

    let discountAmount = 0;
    if (sale.couponCode) {
      try {
        const coupons = await this.getCoupons();
        const coupon = coupons.find(c => c.code.toUpperCase() === sale.couponCode.toUpperCase());
        if (coupon && coupon.isActive) {
          const subtotal = invoiceItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
          if (coupon.discountPercent > 0) {
            discountAmount = (subtotal * coupon.discountPercent) / 100;
            if (coupon.maxDiscount && discountAmount > Number(coupon.maxDiscount)) {
              discountAmount = Number(coupon.maxDiscount);
            }
          } else if (coupon.discountFlat > 0) {
            discountAmount = Number(coupon.discountFlat);
          }
        }
      } catch (e) {
        // Ignore
      }
    }

    const res = await this.request('/billing/invoice', {
      method: 'POST',
      body: JSON.stringify({
        userId: sale.userId || undefined,
        customerName: sale.customerName,
        customerEmail: sale.customerEmail || undefined,
        customerPhone: sale.customerPhone || undefined,
        items: invoiceItems,
        discountAmount,
        paymentMethod: sale.paymentMethod ? sale.paymentMethod.toUpperCase() : 'CASH',
        isOfflineSales: true,
        status: sale.status || 'PENDING',
        paymentStatus: sale.paymentStatus || undefined,
        advancePayment: sale.advancePayment !== '' ? Number(sale.advancePayment) : undefined,
        isQuickOrder: sale.isQuickOrder || false,
        quickOrderReason: sale.quickOrderReason || undefined,
        quickOrderExpectedDate: sale.quickOrderExpectedDate || undefined,
        gstPercentage: sale.gstPercentage !== undefined ? sale.gstPercentage : undefined,
        measurementProfileIds: sale.measurementProfileIds || undefined,
        deliveryDate: sale.deliveryDate || undefined,
      }),
    });

    return {
      ...res.data,
      customerName: sale.customerName,
      items: sale.items.map((item, index) => {
        const prod = products.find(p => p.id === item.productId);
        return {
          id: item.productId,
          productName: prod ? prod.name : 'Unknown Item',
          quantity: item.quantity,
          price: invoiceItems[index]?.price || 0,
          selectedCustomizations: item.selectedCustomizations || [],
        };
      }),
    };

  }

  // ORDER RETRIEVAL
  async getOrders(page = 1, limit = 1000) {

    const res = await this.request(`/orders/admin/list?page=${page}&limit=${limit}`);
    const data = res.data.map(order => ({
      ...order,
      customerName: order.user ? order.user.fullName : (order.gatewayResponse?.guestCustomerName || 'Offline Customer (Guest)'),
      userId: order.userId || order.user?.id,
      items: (order.orderItems || []).map(item => ({
        id: item.id,
        productId: item.productId,
        productName: item.product?.name || 'Unknown Item',
        quantity: item.quantity,
        price: Number(item.price),
        selectedCustomizations: item.selectedCustomizations || [],
        measurementProfileId: item.measurementProfileId || item.measurementProfile?.id || null,
      })),
      // booking is already attached by the backend (getAssociatedBooking), pass it through
      booking: order.booking || null,
    }));
    data.pagination = res.pagination;
    return data;

  }

  async updateOrderStatus(id, status) {

    const res = await this.request(`/orders/admin/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
    return res.data;

  }

  async updateQuickOrderStatus(id, quickOrderStatus, quickOrderProposedDate, adminProposalNote) {

    const res = await this.request(`/orders/admin/${id}/quick-status`, {
      method: 'PUT',
      body: JSON.stringify({ quickOrderStatus, quickOrderProposedDate, adminProposalNote }),
    });
    return res.data;

  }

  async updateOrderDetails(id, updates) {
    const res = await this.request(`/orders/admin/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({
        status: updates.status,
        paymentStatus: updates.paymentStatus,
        advancePayment: updates.advancePayment,
        deliveryDate: updates.deliveryDate,
        fabricType: updates.fabricType,
        customizations: updates.customizations,
        tailorNotes: updates.tailorNotes,
        measurementProfileId: updates.measurementProfileId,
        orderItemMeasurements: updates.orderItemMeasurements,
        newPayment: updates.newPayment,
      }),
    });
    return res.data;

  }

  async updateOrderCustomizations(id, items) {
    const res = await this.request(`/orders/admin/${id}/customizations`, {
      method: 'PUT',
      body: JSON.stringify({ items }),
    });
    return res.data;
  }

  async getPackingSlip(orderId) {

    const res = await this.request(`/orders/admin/${orderId}/packing-slip`);
    return res.data;

  }

  // ANALYTICS & EXTENDED REPORTS
  async getDashboardReport() {

    const realDashboard = await this.request('/admin/dashboard').then(res => res.data);
    const orders = await this.getOrders();

    const totalRevenue = realDashboard.overview?.revenue?.value || 0;
    const orderCount = realDashboard.overview?.orders?.value || 0;
    const aov = realDashboard.overview?.aov?.value || 0;

    const revenueChart = [
      { month: 'Jan 26', revenue: 45000 },
      { month: 'Feb 26', revenue: 52000 },
      { month: 'Mar 26', revenue: 68000 },
      { month: 'Apr 26', revenue: 58000 },
      { month: 'May 26', revenue: 84000 },
      { month: 'Jun 26', revenue: totalRevenue }
    ];

    const topCategories = (realDashboard.productSales?.topSelling || []).map(p => ({
      name: p.name,
      value: p.unitsSold * 1000
    }));

    if (topCategories.length === 0) {
      topCategories.push(
        { name: 'Sarees', value: 85000 },
        { name: 'Lehengas', value: 65000 },
        { name: 'Kurtas', value: 45000 }
      );
    }

    return {
      totalRevenue,
      orderCount,
      aov,
      todayStats: realDashboard.todayStats,
      _raw: realDashboard,
      recentOrders: Array.isArray(orders) ? orders.slice(0, 10) : [],
      revenueChart,
      topCategories,
      indiaActiveUsers: [
        { name: 'Bangalore, Karnataka', count: 5 },
        { name: 'Mumbai, Maharashtra', count: 2 },
        { name: 'New Delhi, Delhi', count: 1 }
      ],
      productTraffic: [
        { name: 'Google Search', percentage: 45 },
        { name: 'Instagram Ads', percentage: 25 },
        { name: 'Direct/Email', percentage: 20 },
        { name: 'Referral', percentage: 10 }
      ],
      conversionRates: [
        { name: 'Overall Conversion', value: 3.2, change: '+0.5%' },
        { name: 'Checkout Initiated', value: 8.4, change: '-0.3%' },
        { name: 'Repeat Customer', value: 24.8, change: '+3.4%' }
      ],
      pendingVisits: 0
    };

  }

  async getRawDashboard() {
    const res = await this.request('/admin/dashboard');
    return res.data;
  }

  async getDateStats(date) {
    const query = date ? `?date=${date}` : '';
    const res = await this.request(`/admin/dashboard/date-stats${query}`);
    return res.data;
  }

  async getExtendedReports() {

    const res = await this.request('/admin/reports');
    return res.data;

  }

  // SETTINGS
  async getSettings() {

    const res = await this.request('/admin/settings');
    return res.data;

  }

  async saveSettings(settings) {

    const res = await this.request('/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
    return res.data;

  }

  async uploadImage(file) {
    const formData = new FormData();
    formData.append('image', file);
    const res = await this.request('/admin/upload', {
      method: 'POST',
      body: formData,
    });
    if (!res?.data?.url) throw new Error('Image upload did not return a URL.');
    return res.data.url;
  }
}

export const api = new APIClient();
export default api;
