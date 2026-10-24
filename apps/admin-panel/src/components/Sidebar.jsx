import React from 'react';
import { 
  LayoutDashboard, 
  ShoppingBag, 
  Tags, 
  ShoppingCart, 
  Users, 
  Calendar, 
  CalendarCheck,
  Award, 
  Megaphone, 
  Image, 
  Ticket, 
  LifeBuoy, 
  ShieldAlert, 
  UsersRound, 
  BarChart3, 
  Settings,
  Flame,
  Globe,
  Database,
  MapPin,
  Layers,
  IndianRupee,
  Clock,
  Package,
  Box,
  LineChart,
  Briefcase,
  Printer,
  PlayCircle,
  UserCheck
} from 'lucide-react';
import { PRODUCT_NAME, PRODUCT_VERSION } from '../config/productName';
import api from '../utils/api';

export default function Sidebar({
  activeTab,
  setActiveTab,
  theme,
  setTheme,
  isSidebarOpen,
  setIsSidebarOpen,
  onLogout
}) {
  const [counts, setCounts] = React.useState({
    products: 0,
    orders: 0,
    appointments: 0,
    support: 0
  });
  const [expandedMenu, setExpandedMenu] = React.useState('reports');

  const fetchCounts = async () => {
    try {
      const [products, orders, appointments, visits, supportTickets] = await Promise.all([
        api.getProducts().catch(() => []),
        api.getOrders().catch(() => []),
        api.getAppointments().catch(() => []),
        api.getStoreVisits().catch(() => []),
        api.getSupportTickets().catch(() => [])
      ]);

      // Count low stock/out of stock (original logic)
      const lowStockCount = (products || []).filter(
        p => p.stockStatus === 'LOW_STOCK' || p.stockStatus === 'OUT_OF_STOCK' || p.inventoryQty <= 10
      ).length;

      // Match the unfiltered totals shown in Product Bookings and Studio Fittings.
      const productBookingsCount = (orders || []).filter(o => !o.isQuickOrder).length;
      const studioFittingsCount = (appointments || []).length;

      // Count quick orders
      const quickOrdersCount = (orders || []).filter(
        o => o.isQuickOrder && (!o.quickOrderStatus || o.quickOrderStatus === 'PENDING')
      ).length;

      // Count active/assigned visits
      const activeVisits = (visits || []).filter(v => v.status === 'PENDING' || v.status === 'ASSIGNED').length;

      // Count open/in-progress support tickets
      const pendingSupport = (supportTickets || []).filter(
        t => t.status === 'OPEN' || t.status === 'IN_PROGRESS'
      ).length;

      setCounts({
        products: lowStockCount,
        orders: productBookingsCount + studioFittingsCount + activeVisits + quickOrdersCount,
        'orders-bookings': productBookingsCount,
        'orders-fittings': studioFittingsCount,
        'orders-visits': activeVisits,
        'orders-quick': quickOrdersCount,
        'bookings': studioFittingsCount + activeVisits,
        support: pendingSupport
      });
    } catch (err) {
      console.error('Failed to load sidebar badge counts:', err);
    }
  };

  React.useEffect(() => {
    fetchCounts();
    
    // Listen to custom refresh events
    window.addEventListener('sidebar_badge_refresh', fetchCounts);
    window.addEventListener('ws_mock_alert', fetchCounts);

    const interval = setInterval(fetchCounts, 20000);

    return () => {
      window.removeEventListener('sidebar_badge_refresh', fetchCounts);
      window.removeEventListener('ws_mock_alert', fetchCounts);
      clearInterval(interval);
    };
  }, [activeTab]);

  const menuGroups = [
    {
      title: 'MAIN',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { 
          id: 'reports', 
          label: 'Reports & Analytics', 
          icon: BarChart3,
          subItems: [
            { id: 'reports-customer', label: 'Customer Intelligence', icon: UsersRound },
            { id: 'reports-orders', label: 'Order Intelligence', icon: ShoppingBag },
            { id: 'reports-revenue', label: 'Revenue Intelligence', icon: LineChart },
            { id: 'reports-time', label: 'Time Based Patterns', icon: Clock },
            { id: 'reports-sales', label: 'Product Sales', icon: Package },
            { id: 'reports-promotions', label: 'Promotions & Discounts', icon: Tags },
            { id: 'reports-inventory', label: 'Inventory Health', icon: Box }
          ]
        },
      ]
    },
    {
      title: 'SALES & CHECKOUT',
      items: [
        { id: 'checkout', label: 'Manual Checkout', icon: ShoppingCart },
        { id: 'bookings', label: 'Bookings & Appointments', icon: CalendarCheck },
        { 
          id: 'orders', 
          label: 'Bookings & Fittings', 
          icon: ShoppingBag,
          subItems: [
            { id: 'orders-bookings', label: 'Product Bookings', icon: ShoppingBag },
            { id: 'orders-fittings', label: 'Studio Fittings', icon: Calendar },
            { id: 'orders-visits', label: 'Home Visits', icon: Briefcase },
            { id: 'orders-quick', label: 'Quick Orders', icon: Clock },
            { id: 'orders-print', label: 'Print Schedule', icon: Printer }
          ]
        },
        { id: 'coupons', label: 'Coupon Builder', icon: Ticket },
        { id: 'offers', label: 'Offers & Shipping', icon: Tags },
        { id: 'banners', label: 'Promo Banners', icon: Image },
      ]
    },
    {
      title: 'CATALOG & INVENTORY',
      items: [
        { id: 'products', label: 'Products & Trending', icon: Flame },
        { id: 'categories', label: 'Category CRUD', icon: Layers },
      ]
    },
    {
      title: 'CORE OPERATIONS',
      items: [
        { id: 'customers', label: 'Customers & Sizing', icon: Users },
        { id: 'app-customers', label: 'App Customers', icon: UsersRound },
        { id: 'staff', label: 'Team & Tailors', icon: UserCheck },
        { id: 'stores', label: 'Store Locations', icon: MapPin },
        { id: 'support', label: 'Support Tickets', icon: LifeBuoy },
      ]
    },
    {
      title: 'ENGAGEMENT',
      items: [
        { id: 'loyalty', label: 'Loyalty & Points', icon: Award },
      ]
    },
    {
      title: 'SECURITY & SYSTEM',
      items: [
        { id: 'audits', label: 'Audit Log Viewer', icon: ShieldAlert },
        { id: 'settings', label: 'Platform Settings', icon: Settings },
      ]
    }
  ];


  const user = api.getCurrentUser();
  const userRole = user ? user.role : 'CUSTOMER';

  const isTabAllowed = (tabId) => {
    if (userRole === 'SUPERADMIN' || userRole === 'ADMIN') return true;
    if (userRole === 'STAFF') {
      const allowedTabs = ['orders', 'orders-bookings', 'orders-fittings', 'orders-visits', 'orders-quick', 'orders-print', 'products', 'categories', 'customers', 'app-customers', 'stores', 'support', 'bookings'];
      return allowedTabs.includes(tabId);
    }
    return false;
  };

  const filteredMenuGroups = menuGroups
    .map(group => ({
      ...group,
      items: group.items.filter(item => isTabAllowed(item.id))
    }))
    .filter(group => group.items.length > 0);

  return (
    <>
      {/* Backdrop for mobile */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <aside className={`
        fixed top-0 bottom-0 left-0 z-40 w-64 bg-[#FDFBFD] border-r border-[#F0E5F0] 
        flex flex-col transform transition-transform duration-300 ease-in-out lg:translate-x-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Brand Header */}
        <div className="h-16 flex items-center px-6 border-b border-[#F0E5F0] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-500 flex items-center justify-center text-[#3D2E3D] shadow-premium transition-all duration-300">
              <span className="font-extrabold text-lg">{PRODUCT_NAME.charAt(0)}</span>
            </div>
            <div>
              <span className="font-bold text-[#3D2E3D] text-lg tracking-tight">
                {PRODUCT_NAME}
              </span>
              <span className="text-[10px] block text-[#8F5C8F] font-semibold uppercase tracking-wider">
                Admin Panel v{PRODUCT_VERSION}
              </span>
            </div>
          </div>
        </div>

        {/* Sidebar Navigation Links */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
          {filteredMenuGroups.map((group, groupIdx) => (
            <div key={groupIdx} className="space-y-1.5">
              <span className="text-[10px] font-bold text-[#7A6B7A]/60 uppercase tracking-widest px-3 block">
                {group.title}
              </span>
              {group.items.map((item) => {
                const Icon = item.icon;
                const isSubItemActive = item.subItems && item.subItems.some(sub => sub.id === activeTab);
                const isActive = activeTab === item.id || isSubItemActive;
                const isExpanded = expandedMenu === item.id;
                const badgeCount = counts[item.id] || 0;
                
                return (
                  <div key={item.id} className="space-y-1">
                    <button
                      onClick={() => {
                        if (item.subItems) {
                          setExpandedMenu(isExpanded ? null : item.id);
                          if (!isExpanded) setActiveTab(item.subItems[0].id);
                        } else {
                          setActiveTab(item.id);
                          setIsSidebarOpen(false);
                        }
                      }}
                      className={`
                        relative w-full flex items-center justify-between text-sm font-medium rounded-xl transition-all duration-200 group overflow-hidden
                        ${isActive 
                          ? 'bg-brand-500 text-[#3D2E3D] shadow-sm' 
                          : 'text-[#7A6B7A] hover:bg-[#F0E5F0]/40 hover:text-[#3D2E3D]'}
                        ${badgeCount > 0 ? 'pr-12' : 'pr-3'}
                        pl-3 py-2.5
                      `}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className={`w-4.5 h-4.5 transition-transform duration-200 group-hover:scale-110 ${isActive ? 'text-[#3D2E3D]' : 'text-[#7A6B7A] group-hover:text-[#3D2E3D]'}`} />
                        <span>{item.label}</span>
                      </div>
                      
                      {item.subItems && (
                        <div className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                          <svg className={`w-4 h-4 ${isActive ? 'text-[#3D2E3D]' : 'text-[#7A6B7A]'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      )}

                      {badgeCount > 0 && (
                        <span className={`
                          absolute top-0 bottom-0 right-0 w-10 flex items-center justify-center border-l font-extrabold text-xs transition-all duration-200
                          ${isActive 
                            ? 'border-[#3D2E3D]/10 text-[#3D2E3D] bg-[#3D2E3D]/5' 
                            : item.id === 'products'
                              ? 'border-red-200 text-[#E24B4A] bg-red-50'
                              : item.id === 'support'
                                ? 'border-amber-200 text-amber-605 bg-amber-50'
                                : item.id === 'orders'
                                  ? 'border-indigo-200 text-indigo-650 bg-indigo-50'
                                  : 'border-[#F0E5F0] text-brand-700 bg-brand-50'}
                        `}>
                          {badgeCount}
                        </span>
                      )}
                    </button>
                    
                    {item.subItems && isExpanded && (
                      <div className="pl-4 pr-2 space-y-1 mt-1 mb-2 animate-in slide-in-from-top-2 fade-in duration-200">
                        {item.subItems.map(sub => {
                          const SubIcon = sub.icon;
                          const isSubActive = activeTab === sub.id;
                          return (
                            <button
                              key={sub.id}
                              onClick={() => {
                                setActiveTab(sub.id);
                                setIsSidebarOpen(false);
                              }}
                              className={`relative w-full flex items-center justify-between text-xs font-medium rounded-lg py-2.5 px-3 transition-all duration-200 group ${isSubActive ? 'bg-brand-500 text-[#3D2E3D] font-bold shadow-sm' : 'text-[#7A6B7A] hover:text-[#3D2E3D] hover:bg-[#F0E5F0]/40'}`}
                            >
                              <div className="flex items-center gap-3">
                                {SubIcon && (
                                  <SubIcon className={`w-4 h-4 transition-transform duration-200 group-hover:scale-110 ${isSubActive ? 'text-[#3D2E3D]' : 'text-slate-400 group-hover:text-[#3D2E3D]'}`} />
                                )}
                                <span>{sub.label}</span>
                              </div>
                              {counts[sub.id] > 0 && (
                                <span className="bg-brand-600 text-[#3D2E3D] px-2 py-0.5 rounded-full text-[9px] font-bold shadow-sm">
                                  {counts[sub.id]}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Configurations Controls Box at Sidebar Bottom */}
        <div className="p-4 border-t border-[#F0E5F0] bg-[#FDFBFD] space-y-4 shrink-0">
          {/* Logout Button */}
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border border-red-100 hover:bg-red-50 text-[#E24B4A] hover:text-[#E24B4A]/90 text-xs font-bold transition-all duration-200"
          >
            <span>Log Out Account</span>
          </button>
        </div>
      </aside>
    </>
  );
}
