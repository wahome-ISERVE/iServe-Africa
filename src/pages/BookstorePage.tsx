import React, { useMemo, useState } from 'react';
import { collection, doc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { Plus, ShoppingCart, Trash2, Download, Printer, AlertTriangle } from 'lucide-react';
import { ORG_ID, db } from '../lib/firebase.ts';
import { OperationType, handleFirestoreError } from '../lib/firestoreError.ts';
import { recordAuditLog } from '../lib/audit.ts';
import { exportToExcel, exportToPdf } from '../lib/exports.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useData } from '../context/DataContext.tsx';
import { DataTable, ColumnDef } from '../components/ui/DataTable.tsx';
import { Modal } from '../components/ui/Modal.tsx';
import { StatusText } from '../components/ui/StatusText.tsx';
import { Book, BookSale, formatKes, formatNairobiDateTime } from '../types/erp.ts';

type BookstoreTab = 'pos' | 'catalogue' | 'sales';

interface CartLine {
  book: Book;
  qty: number;
}

export function BookstorePage() {
  const { profile, effectiveRole, orgSettings } = useAuth();
  const { books, bookSales } = useData();

  const [tab, setTab] = useState<BookstoreTab>('pos');
  const [posSearch, setPosSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discountKes, setDiscountKes] = useState('0');
  const [customerName, setCustomerName] = useState('Walk-in Customer');
  const [paymentMethod, setPaymentMethod] = useState<BookSale['paymentMethod']>('mpesa');
  const [paymentRef, setPaymentRef] = useState('');
  const [processingSale, setProcessingSale] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<BookSale | null>(null);
  const [posError, setPosError] = useState<string | null>(null);

  // Add Book modal
  const [bookModalOpen, setBookModalOpen] = useState(false);
  const [bkIsbn, setBkIsbn] = useState('');
  const [bkTitle, setBkTitle] = useState('');
  const [bkAuthor, setBkAuthor] = useState('');
  const [bkPublisher, setBkPublisher] = useState('');
  const [bkCategory, setBkCategory] = useState('Biblical Studies');
  const [bkCost, setBkCost] = useState('');
  const [bkPrice, setBkPrice] = useState('');
  const [bkStock, setBkStock] = useState('');
  const [bkReorder, setBkReorder] = useState('15');
  const [savingBook, setSavingBook] = useState(false);

  const isManager = ['super_admin', 'executive_director', 'finance_officer', 'bookstore_manager'].includes(
    effectiveRole
  );

  const inventoryStats = useMemo(() => {
    const valuation = books.reduce((s, b) => s + b.costKes * b.stockQty, 0);
    const retailValue = books.reduce((s, b) => s + b.priceKes * b.stockQty, 0);
    const lowStock = books.filter((b) => b.stockQty <= b.reorderLevel).length;
    const totalSales = bookSales.reduce((s, sl) => s + sl.totalKes, 0);
    return { valuation, retailValue, lowStock, totalSales };
  }, [books, bookSales]);

  const filteredBooks = useMemo(() => {
    const q = posSearch.trim().toLowerCase();
    if (!q) return books.filter((b) => b.status === 'active');
    return books.filter(
      (b) =>
        b.status === 'active' &&
        (b.title.toLowerCase().includes(q) ||
          b.author.toLowerCase().includes(q) ||
          b.isbn.toLowerCase().includes(q) ||
          b.category.toLowerCase().includes(q))
    );
  }, [books, posSearch]);

  const addToCart = (book: Book) => {
    setPosError(null);
    if (book.stockQty <= 0) {
      setPosError(`"${book.title}" is currently out of stock.`);
      return;
    }
    setCart((prev) => {
      const existing = prev.find((l) => l.book.id === book.id);
      if (existing) {
        if (existing.qty >= book.stockQty) {
          setPosError(`Maximum available stock (${book.stockQty}) reached for "${book.title}".`);
          return prev;
        }
        return prev.map((l) => (l.book.id === book.id ? { ...l, qty: l.qty + 1 } : l));
      }
      return [...prev, { book, qty: 1 }];
    });
  };

  const updateCartQty = (bookId: string, nextQty: number) => {
    setCart((prev) =>
      prev
        .map((l) => {
          if (l.book.id !== bookId) return l;
          const clamped = Math.max(0, Math.min(nextQty, l.book.stockQty));
          return { ...l, qty: clamped };
        })
        .filter((l) => l.qty > 0)
    );
  };

  const subtotal = useMemo(() => cart.reduce((s, l) => s + l.book.priceKes * l.qty, 0), [cart]);
  const discountVal = Math.max(0, Math.min(subtotal, Number(discountKes) || 0));
  const totalKes = Math.max(0, subtotal - discountVal);

  const handleCheckout = async () => {
    if (!profile || cart.length === 0) return;
    setPosError(null);
    setProcessingSale(true);

    const receiptNo = `POS-2026-${String(Math.floor(1000 + Math.random() * 9000))}`;
    const saleRef = doc(collection(db, 'bookSales'));
    const itemsSummary = cart.map((l) => `${l.qty}x ${l.book.title}`).join('; ').slice(0, 950);
    const itemCount = cart.reduce((s, l) => s + l.qty, 0);

    try {
      const batch = writeBatch(db);
      batch.set(saleRef, {
        orgId: ORG_ID,
        receiptNo,
        cashierId: profile.uid,
        cashierName: profile.displayName,
        customerName: customerName.trim() || 'Walk-in Customer',
        paymentMethod,
        paymentRef: paymentRef.trim(),
        subtotalKes: subtotal,
        discountKes: discountVal,
        totalKes,
        itemCount,
        itemsSummary,
        qbSyncStatus: orgSettings.quickbooksStatus === 'connected' ? 'pending' : 'credentials_required',
        isDemo: false,
        createdAt: serverTimestamp(),
      });

      for (const line of cart) {
        const newStock = Math.max(0, line.book.stockQty - line.qty);
        batch.update(doc(db, 'books', line.book.id), {
          stockQty: newStock,
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();

      await recordAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        actorRole: profile.role,
        action: 'BOOKSTORE_POS_SALE',
        targetCollection: 'bookSales',
        targetId: saleRef.id,
        summary: `Completed POS sale ${receiptNo} (${formatKes(totalKes)}, ${paymentMethod})`,
      });

      setLastReceipt({
        id: saleRef.id,
        orgId: ORG_ID,
        receiptNo,
        cashierId: profile.uid,
        cashierName: profile.displayName,
        customerName: customerName.trim() || 'Walk-in Customer',
        paymentMethod,
        paymentRef: paymentRef.trim(),
        subtotalKes: subtotal,
        discountKes: discountVal,
        totalKes,
        itemCount,
        itemsSummary,
        createdAt: new Date(),
      });
      setCart([]);
      setDiscountKes('0');
      setPaymentRef('');
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.WRITE, 'bookSales');
      } catch (e2) {
        setPosError(e2 instanceof Error ? e2.message : 'Checkout failed.');
      }
    } finally {
      setProcessingSale(false);
    }
  };

  const handleAddBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSavingBook(true);
    const ref = doc(collection(db, 'books'));
    try {
      await setDoc(ref, {
        orgId: ORG_ID,
        isbn: bkIsbn.trim(),
        title: bkTitle.trim(),
        author: bkAuthor.trim(),
        publisher: bkPublisher.trim(),
        category: bkCategory,
        costKes: Number(bkCost) || 0,
        priceKes: Number(bkPrice) || 100,
        stockQty: Number(bkStock) || 0,
        reorderLevel: Number(bkReorder) || 10,
        imageUrl: '/src/assets/images/book_cover_theology_1795437880255.jpg',
        status: 'active',
        isDemo: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await recordAuditLog({
        actorUid: profile.uid,
        actorName: profile.displayName,
        actorRole: profile.role,
        action: 'CREATE_BOOK',
        targetCollection: 'books',
        targetId: ref.id,
        summary: `Added book "${bkTitle.trim()}" (ISBN ${bkIsbn.trim()})`,
      });
      setBookModalOpen(false);
      setBkIsbn('');
      setBkTitle('');
      setBkAuthor('');
      setBkCost('');
      setBkPrice('');
      setBkStock('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `books/${ref.id}`);
    } finally {
      setSavingBook(false);
    }
  };

  const handleExportBookstore = (format: 'pdf' | 'xlsx') => {
    const cols = [
      { header: 'ISBN', key: 'isbn' },
      { header: 'Title', key: 'title' },
      { header: 'Author', key: 'author' },
      { header: 'Category', key: 'category' },
      { header: 'Cost (KES)', key: 'costKes' },
      { header: 'Price (KES)', key: 'priceKes' },
      { header: 'Stock', key: 'stockQty' },
    ];
    const rows = books.map((b) => ({
      isbn: b.isbn,
      title: b.title,
      author: b.author,
      category: b.category,
      costKes: b.costKes,
      priceKes: b.priceKes,
      stockQty: b.stockQty,
    }));
    if (format === 'pdf') {
      exportToPdf({ fileName: 'iServe_Bookstore_Inventory', title: 'Bookstore Inventory & Valuation', columns: cols, rows });
    } else {
      exportToExcel({ fileName: 'iServe_Bookstore_Inventory', sheetName: 'Inventory', title: 'Bookstore Inventory', columns: cols, rows });
    }
  };

  const bookCols: ColumnDef<Book>[] = [
    {
      key: 'title',
      header: 'Book Title & Author',
      sortable: true,
      sortValue: (r) => r.title,
      render: (r) => (
        <div>
          <div className="font-medium text-slate-900">{r.title}</div>
          <div className="text-xs text-slate-500">
            {r.author} · ISBN <span className="font-mono">{r.isbn}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (r) => r.category,
    },
    {
      key: 'cost',
      header: 'Cost (KES)',
      align: 'right',
      render: (r) => <span className="font-mono text-xs">{formatKes(r.costKes)}</span>,
    },
    {
      key: 'price',
      header: 'Selling Price',
      align: 'right',
      render: (r) => <span className="font-mono font-semibold text-slate-900">{formatKes(r.priceKes)}</span>,
    },
    {
      key: 'stock',
      header: 'Stock Qty',
      align: 'right',
      sortable: true,
      sortValue: (r) => r.stockQty,
      render: (r) => (
        <span className={`font-mono font-semibold ${r.stockQty <= r.reorderLevel ? 'text-red-700' : 'text-emerald-800'}`}>
          {r.stockQty}
        </span>
      ),
    },
  ];

  const saleCols: ColumnDef<BookSale>[] = [
    {
      key: 'receipt',
      header: 'Receipt No',
      sortable: true,
      sortValue: (r) => r.receiptNo,
      render: (r) => <span className="font-mono text-xs font-semibold text-slate-900">{r.receiptNo}</span>,
    },
    {
      key: 'customer',
      header: 'Customer & Items',
      render: (r) => (
        <div>
          <div className="font-medium text-slate-900">{r.customerName || 'Walk-in'}</div>
          <div className="text-xs text-slate-500 line-clamp-1">{r.itemsSummary}</div>
        </div>
      ),
    },
    {
      key: 'method',
      header: 'Payment',
      render: (r) => (
        <span className="text-xs uppercase font-mono text-slate-700">
          {r.paymentMethod.replace('_', ' ')} {r.paymentRef ? `(${r.paymentRef})` : ''}
        </span>
      ),
    },
    {
      key: 'total',
      header: 'Total (KES)',
      align: 'right',
      render: (r) => <span className="font-mono font-semibold text-slate-900">{formatKes(r.totalKes)}</span>,
    },
    {
      key: 'date',
      header: 'Date',
      render: (r) => <span className="text-xs font-mono text-slate-500">{formatNairobiDateTime(r.createdAt)}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-display">Bookstore & Point of Sale</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Christian literature catalogue, live stock valuation, M-Pesa/cash POS checkout, and sales reports
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleExportBookstore('pdf')}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50"
          >
            <Download className="w-3.5 h-3.5" />
            Stock PDF
          </button>
          <button
            type="button"
            onClick={() => handleExportBookstore('xlsx')}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50"
          >
            <Download className="w-3.5 h-3.5" />
            Stock Excel
          </button>
          {isManager && (
            <button
              type="button"
              onClick={() => setBookModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Book Title
            </button>
          )}
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-1">
          <div className="text-xs text-slate-500">Inventory Cost Valuation</div>
          <div className="text-xl font-bold font-mono text-slate-900 tabular-nums">
            {formatKes(inventoryStats.valuation)}
          </div>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-1">
          <div className="text-xs text-slate-500">Potential Retail Value</div>
          <div className="text-xl font-bold font-mono text-emerald-800 tabular-nums">
            {formatKes(inventoryStats.retailValue)}
          </div>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-1">
          <div className="text-xs text-slate-500">Recorded Bookstore Sales</div>
          <div className="text-xl font-bold font-mono text-slate-900 tabular-nums">
            {formatKes(inventoryStats.totalSales)}
          </div>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-1">
          <div className="text-xs text-slate-500">Low-Stock Alerts</div>
          <div className="text-xl font-bold font-mono text-amber-700 tabular-nums">{inventoryStats.lowStock}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-stone-200/70 rounded-lg w-fit">
        {(
          [
            { key: 'pos', label: 'POS Terminal' },
            { key: 'catalogue', label: 'Catalogue & Stock' },
            { key: 'sales', label: 'Sales Ledger' },
          ] as { key: BookstoreTab; label: string }[]
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
              tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'pos' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Book Selector Grid */}
          <div className="lg:col-span-7 space-y-4">
            <input
              type="search"
              value={posSearch}
              onChange={(e) => setPosSearch(e.target.value)}
              placeholder="Scan ISBN or search book title / author..."
              className="w-full px-4 py-2.5 text-sm bg-white border border-stone-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-900/20"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filteredBooks.map((bk) => (
                <div
                  key={bk.id}
                  className="bg-white border border-stone-200 rounded-xl p-4 flex gap-3.5 justify-between"
                >
                  <img
                    src={bk.imageUrl || '/src/assets/images/book_cover_theology_1795437880255.jpg'}
                    alt={bk.title}
                    referrerPolicy="no-referrer"
                    className="w-16 h-22 rounded-md object-cover border border-stone-200 shrink-0 bg-stone-100"
                  />
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-900 line-clamp-2">{bk.title}</div>
                      <div className="text-xs text-slate-500 truncate">{bk.author}</div>
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-2">
                      <div>
                        <div className="text-sm font-bold font-mono text-slate-900">{formatKes(bk.priceKes)}</div>
                        <div
                          className={`text-[11px] font-mono ${
                            bk.stockQty <= bk.reorderLevel ? 'text-amber-700' : 'text-slate-500'
                          }`}
                        >
                          {bk.stockQty} in stock
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={bk.stockQty <= 0}
                        onClick={() => addToCart(bk)}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg disabled:opacity-40"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Cart & Checkout */}
          <div className="lg:col-span-5 bg-white border border-stone-200 rounded-xl p-5 space-y-4 sticky top-20">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <ShoppingCart className="w-4 h-4 text-emerald-800" />
                <span>Current Sale</span>
              </div>
              <span className="text-xs font-mono text-slate-500">{cart.length} line(s)</span>
            </div>

            {cart.length === 0 ? (
              <p className="text-xs text-slate-500 py-8 text-center">
                Select books from the catalogue to add items to this sale.
              </p>
            ) : (
              <div className="divide-y divide-stone-100 max-h-60 overflow-y-auto">
                {cart.map((line) => (
                  <div key={line.book.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-slate-900 truncate">{line.book.title}</div>
                      <div className="text-[11px] font-mono text-slate-500">
                        {formatKes(line.book.priceKes)} each
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        type="number"
                        min={1}
                        max={line.book.stockQty}
                        value={line.qty}
                        onChange={(e) => updateCartQty(line.book.id, Number(e.target.value))}
                        className="w-14 px-2 py-1 text-xs font-mono border border-stone-300 rounded text-center"
                      />
                      <button
                        type="button"
                        onClick={() => updateCartQty(line.book.id, 0)}
                        className="p-1 text-slate-400 hover:text-red-700"
                        aria-label="Remove item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3 pt-2 border-t border-stone-100 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 mb-1">Customer / Church</label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-stone-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">Discount (KES)</label>
                  <input
                    type="number"
                    min="0"
                    value={discountKes}
                    onChange={(e) => setDiscountKes(e.target.value)}
                    className="w-full px-2.5 py-1.5 font-mono border border-stone-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 mb-1">Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as BookSale['paymentMethod'])}
                    className="w-full px-2.5 py-1.5 border border-stone-300 rounded-lg"
                  >
                    <option value="mpesa">M-Pesa Till / Paybill</option>
                    <option value="cash">Cash (KES)</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="card">Card / PDQ</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">M-Pesa / Ref Code</label>
                  <input
                    type="text"
                    value={paymentRef}
                    onChange={(e) => setPaymentRef(e.target.value)}
                    placeholder="e.g. UJK84M219P"
                    className="w-full px-2.5 py-1.5 font-mono border border-stone-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="bg-stone-50 border border-stone-200 rounded-lg p-3 space-y-1 font-mono">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span>{formatKes(subtotal)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Discount</span>
                  <span>- {formatKes(discountVal)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-slate-900 pt-1 border-t border-stone-200">
                  <span>Total Due</span>
                  <span>{formatKes(totalKes)}</span>
                </div>
              </div>

              {posError && (
                <div className="flex items-center gap-1.5 text-red-700">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{posError}</span>
                </div>
              )}

              <button
                type="button"
                disabled={cart.length === 0 || processingSale}
                onClick={() => void handleCheckout()}
                className="w-full py-2.5 text-sm font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-hover)] rounded-lg disabled:opacity-50"
              >
                {processingSale ? 'Completing Sale...' : `Complete Sale · ${formatKes(totalKes)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'catalogue' && (
        <DataTable
          rows={books}
          columns={bookCols}
          rowKey={(r) => r.id}
          searchPlaceholder="Search ISBN, title, author, or category..."
          searchFilter={(r, q) =>
            r.title.toLowerCase().includes(q) ||
            r.author.toLowerCase().includes(q) ||
            r.isbn.toLowerCase().includes(q)
          }
        />
      )}

      {tab === 'sales' && (
        <DataTable
          rows={bookSales}
          columns={saleCols}
          rowKey={(r) => r.id}
          searchPlaceholder="Search receipts by number, customer, or reference..."
          searchFilter={(r, q) =>
            r.receiptNo.toLowerCase().includes(q) ||
            (r.customerName || '').toLowerCase().includes(q) ||
            (r.paymentRef || '').toLowerCase().includes(q)
          }
        />
      )}

      {/* Receipt Modal */}
      <Modal
        open={Boolean(lastReceipt)}
        onClose={() => setLastReceipt(null)}
        title="Bookstore Sales Receipt"
        maxWidthClass="max-w-md"
      >
        {lastReceipt && (
          <div className="space-y-4 text-xs">
            <div className="text-center border-b border-stone-200 pb-3 space-y-0.5">
              <div className="font-bold text-sm text-slate-900">iServe Africa Christian Bookstore</div>
              <div className="text-slate-500">Ngong Road, Nairobi · Currency: KES</div>
              <div className="font-mono font-semibold text-slate-800 pt-1">{lastReceipt.receiptNo}</div>
            </div>
            <div className="space-y-1">
              <div>
                <span className="text-slate-500">Customer:</span> {lastReceipt.customerName}
              </div>
              <div>
                <span className="text-slate-500">Items:</span> {lastReceipt.itemsSummary}
              </div>
              <div>
                <span className="text-slate-500">Payment:</span> {lastReceipt.paymentMethod.toUpperCase()}{' '}
                {lastReceipt.paymentRef ? `(${lastReceipt.paymentRef})` : ''}
              </div>
            </div>
            <div className="bg-stone-50 border border-stone-200 rounded-lg p-3 font-mono space-y-1">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatKes(lastReceipt.subtotalKes)}</span>
              </div>
              <div className="flex justify-between">
                <span>Discount</span>
                <span>{formatKes(lastReceipt.discountKes)}</span>
              </div>
              <div className="flex justify-between font-bold text-slate-900 text-sm pt-1 border-t border-stone-200">
                <span>Total Paid</span>
                <span>{formatKes(lastReceipt.totalKes)}</span>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3 py-2 border border-stone-300 rounded-lg"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Receipt
              </button>
              <button
                type="button"
                onClick={() => setLastReceipt(null)}
                className="px-4 py-2 font-semibold text-white bg-[var(--brand-primary)] rounded-lg"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Add Book Modal */}
      <Modal open={bookModalOpen} onClose={() => setBookModalOpen(false)} title="Add Book to Catalogue">
        <form onSubmit={handleAddBook} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">ISBN</label>
              <input
                type="text"
                required
                value={bkIsbn}
                onChange={(e) => setBkIsbn(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Category</label>
              <input
                type="text"
                required
                value={bkCategory}
                onChange={(e) => setBkCategory(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Book Title</label>
            <input
              type="text"
              required
              value={bkTitle}
              onChange={(e) => setBkTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Author</label>
              <input
                type="text"
                required
                value={bkAuthor}
                onChange={(e) => setBkAuthor(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Publisher</label>
              <input
                type="text"
                value={bkPublisher}
                onChange={(e) => setBkPublisher(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Cost (KES)</label>
              <input
                type="number"
                min="0"
                required
                value={bkCost}
                onChange={(e) => setBkCost(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Price (KES)</label>
              <input
                type="number"
                min="1"
                required
                value={bkPrice}
                onChange={(e) => setBkPrice(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Initial Stock</label>
              <input
                type="number"
                min="0"
                required
                value={bkStock}
                onChange={(e) => setBkStock(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Reorder Lvl</label>
              <input
                type="number"
                min="0"
                required
                value={bkReorder}
                onChange={(e) => setBkReorder(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-stone-100">
            <button
              type="button"
              onClick={() => setBookModalOpen(false)}
              className="px-4 py-2 text-sm border border-stone-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingBook}
              className="px-4 py-2 text-sm font-semibold text-white bg-[var(--brand-primary)] rounded-lg"
            >
              Save Book
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
