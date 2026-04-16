'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useExpensesAll, useCreateExpense, useDeleteExpense, useCategories, useMembers } from '@homebase/api';
import { useUIStore } from '@homebase/store';
import { COMMON_CURRENCIES, calculateEqualSplits, calculatePercentageSplits, formatCurrency, formatRelativeDate, getCurrencyLabel } from '@homebase/utils';
import type { ExpenseReceiptItem, Household, Member, SplitType } from '@homebase/types';

const BASE_CURRENCY = 'USD';

function getLocalDateInputValue() {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

function buildMonthOptions(selectedMonth: string, count = 36) {
  const months: string[] = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push(monthKey);
  }

  if (!months.includes(selectedMonth)) {
    months.unshift(selectedMonth);
  }

  return months;
}

const STYLES = `
  .ep {
    flex:1;
    min-height:100vh;
    font-family:'Geist',sans-serif;
    color:#F0EDE8;
    background:
      radial-gradient(1100px 620px at 10% -10%, rgba(201,168,76,0.12), transparent 58%),
      radial-gradient(900px 580px at 90% -20%, rgba(123,158,201,0.12), transparent 62%),
      #0E0F11;
  }
  .ep-topbar { background:rgba(14,15,17,0.82); backdrop-filter:blur(20px); border-bottom:1px solid rgba(255,255,255,0.06); padding:12px 32px; display:flex; align-items:center; justify-content:space-between; position:sticky; top:0; z-index:50; gap:16px; }
  .ep-title-wrap { display:flex; flex-direction:column; gap:2px; }
  .ep-title { font-family:'Instrument Serif',serif; font-size:21px; color:#F0EDE8; line-height:1; }
  .ep-subtitle { font-size:11px; color:#8E8882; letter-spacing:0.4px; }
  .ep-actions { display:flex; align-items:center; gap:10px; }
  .btn-gold { display:inline-flex; align-items:center; gap:6px; padding:7px 16px; background:linear-gradient(140deg, #C9A84C, #D9BD6A); color:#0E0F11; border-radius:8px; font-family:'Geist',sans-serif; font-size:13px; font-weight:700; border:none; cursor:pointer; box-shadow:0 8px 18px rgba(201,168,76,0.2); }
  .btn-gold:hover { filter:brightness(1.03); }
  .btn-ghost { padding:7px 14px; background:rgba(255,255,255,0.04); color:#A8A29E; border-radius:8px; font-size:13px; font-weight:500; border:1px solid rgba(255,255,255,0.1); cursor:pointer; font-family:'Geist',sans-serif; }
  .btn-ghost:hover { background:rgba(255,255,255,0.1); color:#F0EDE8; }
  .ep-content { max-width:1320px; margin:0 auto; padding:28px 32px 36px; }
  .ep-grid { display:grid; grid-template-columns:minmax(0,1fr) 320px; gap:20px; align-items:start; }

  /* Summary */
  .ep-summary { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:20px; }
  .ep-sc { background:linear-gradient(160deg, rgba(30,31,34,0.96), rgba(22,23,25,0.96)); border:1px solid rgba(255,255,255,0.08); border-radius:14px; padding:18px 22px; position:relative; box-shadow:0 14px 30px rgba(0,0,0,0.22); }
  .ep-sc-label { font-size:10px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:#4A4540; margin-bottom:6px; }
  .ep-sc-val { font-family:'Instrument Serif',serif; font-size:26px; color:#F0EDE8; letter-spacing:-0.5px; line-height:1; }
  .ep-sc-sub { font-size:11px; color:#3D3935; margin-top:5px; font-family:'Geist Mono',monospace; }
  .ep-sc-bar { position:absolute; bottom:0; left:0; right:0; height:2px; }

  /* Panel */
  .panel { background:linear-gradient(160deg, rgba(25,26,29,0.95), rgba(22,23,25,0.95)); border:1px solid rgba(255,255,255,0.08); border-radius:16px; overflow:hidden; box-shadow:0 16px 36px rgba(0,0,0,0.22); }
  .panel-hdr { padding:14px 20px; border-bottom:1px solid rgba(255,255,255,0.06); display:flex; align-items:center; justify-content:space-between; }
  .panel-title { font-size:10px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:#C9A84C; }
  .panel-sub { font-size:12px; color:#3D3935; font-family:'Geist Mono',monospace; }

  /* Form */
  .ep-form { padding:16px 20px; display:flex; flex-direction:column; gap:12px; }
  .form-row { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .fld { display:flex; flex-direction:column; gap:5px; }
  .fld-label { font-size:10px; font-weight:600; letter-spacing:0.8px; text-transform:uppercase; color:#4A4540; }
  .fld-input { background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:9px 12px; font-family:'Geist',sans-serif; font-size:13px; color:#F0EDE8; outline:none; width:100%; }
  .fld-input:focus { border-color:rgba(201,168,76,0.4); }
  .fld-input::placeholder { color:#3D3935; }
  select.fld-input { background:#1f2022; color:#F0EDE8; }
  select.fld-input option { background:#1f2022; color:#F0EDE8; }
  .scan-row { display:flex; flex-direction:column; gap:8px; background:rgba(201,168,76,0.05); border:1px solid rgba(201,168,76,0.16); border-radius:12px; padding:11px; margin-top:2px; }
  .scan-upload-grid { display:grid; grid-template-columns:1fr auto; gap:8px; }
  .scan-input { padding:9px 12px; border-radius:8px; border:1px dashed rgba(201,168,76,0.35); background:rgba(201,168,76,0.05); color:#C8C4BF; font-size:12px; }
  .scan-input::file-selector-button { margin-right:12px; border:none; border-radius:6px; background:#C9A84C; color:#0E0F11; padding:6px 10px; font-family:'Geist',sans-serif; font-weight:600; cursor:pointer; }
  .scan-camera-btn { border:1px solid rgba(201,168,76,0.35); border-radius:8px; background:rgba(201,168,76,0.14); color:#E7D19C; font-family:'Geist',sans-serif; font-size:12px; font-weight:600; padding:8px 12px; cursor:pointer; white-space:nowrap; }
  .scan-camera-btn:hover { background:rgba(201,168,76,0.24); }
  .scan-camera-btn:disabled { opacity:0.6; cursor:not-allowed; }
  .scan-help { font-size:11px; color:#8E8882; }
  .scan-list { margin:0; padding:0; list-style:none; border:1px solid rgba(255,255,255,0.06); border-radius:10px; overflow:hidden; }
  .scan-item { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:8px 10px; border-bottom:1px solid rgba(255,255,255,0.05); font-size:12px; }
  .scan-item:last-child { border-bottom:none; }
  .scan-item-left { color:#D4D0CB; flex:1; min-width:0; }
  .scan-item-name { color:#D4D0CB; }
  .scan-item-actions { display:flex; align-items:center; gap:8px; }
  .scan-item-cost { color:#C9A84C; font-family:'Geist Mono',monospace; }
  .scan-remove { border:1px solid rgba(224,123,106,0.25); background:rgba(224,123,106,0.08); color:#E07B6A; border-radius:6px; font-size:11px; padding:3px 8px; cursor:pointer; }
  .scan-remove:hover { background:rgba(224,123,106,0.14); }
  .scan-manual-grid { display:grid; grid-template-columns:1fr 130px auto; gap:8px; }
  .scan-add-btn { border:none; border-radius:8px; background:rgba(201,168,76,0.2); color:#E7D19C; font-size:12px; padding:8px 12px; cursor:pointer; }
  .scan-add-btn:hover { background:rgba(201,168,76,0.28); }
  .scan-add-btn:disabled { opacity:0.5; cursor:not-allowed; }

  /* Camera modal */
  .cam-backdrop { position:fixed; inset:0; background:rgba(0,0,0,0.72); display:flex; align-items:center; justify-content:center; padding:18px; z-index:1300; }
  .cam-modal { width:min(760px,100%); background:#161719; border:1px solid rgba(255,255,255,0.1); border-radius:14px; overflow:hidden; }
  .cam-hdr { display:flex; align-items:center; justify-content:space-between; padding:12px 14px; border-bottom:1px solid rgba(255,255,255,0.08); }
  .cam-title { font-size:13px; color:#F0EDE8; font-weight:600; }
  .cam-close { border:1px solid rgba(255,255,255,0.2); background:transparent; color:#C8C4BF; border-radius:7px; padding:6px 10px; font-size:12px; cursor:pointer; }
  .cam-close:hover { color:#F0EDE8; border-color:rgba(255,255,255,0.35); }
  .cam-body { padding:12px 14px; }
  .cam-video { width:100%; aspect-ratio:3/4; object-fit:cover; border-radius:10px; background:#0E0F11; }
  .cam-actions { margin-top:10px; display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap; }
  .cam-btn { border:none; border-radius:8px; padding:8px 12px; font-size:12px; cursor:pointer; }
  .cam-btn-primary { background:#C9A84C; color:#0E0F11; font-weight:700; }
  .cam-btn-primary:hover { background:#D4B05A; }
  .cam-btn-ghost { background:rgba(255,255,255,0.08); color:#C8C4BF; }
  .cam-btn-ghost:hover { background:rgba(255,255,255,0.14); color:#F0EDE8; }
  .cam-error { margin-top:8px; font-size:12px; color:#E07B6A; }
  .form-error { font-size:12px; color:#E07B6A; }

  /* Expense list */
  .exp-row { display:flex; align-items:center; gap:12px; padding:13px 20px; border-bottom:1px solid rgba(255,255,255,0.05); transition:background 0.15s, transform 0.15s; }
  .exp-row:last-child { border-bottom:none; }
  .exp-row:hover { background:rgba(255,255,255,0.03); transform:translateY(-1px); }
  .exp-row:hover .exp-del { opacity:1; }
  .exp-icon { width:36px; height:36px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:16px; flex-shrink:0; }
  .exp-info { flex:1; min-width:0; }
  .exp-name { font-size:13px; font-weight:500; color:#D4D0CB; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .exp-meta { font-size:11px; color:#3D3935; margin-top:2px; }
  .exp-receipt { margin-top:6px; font-size:11px; color:#8E8882; display:flex; align-items:center; gap:8px; }
  .exp-receipt-btn { border:1px solid rgba(201,168,76,0.35); background:rgba(201,168,76,0.08); color:#C9A84C; font-size:11px; padding:3px 8px; border-radius:999px; cursor:pointer; }
  .exp-receipt-btn:hover { background:rgba(201,168,76,0.14); }
  .exp-receipt-note { color:#7A7570; }
  .exp-amount-wrap { display:flex; flex-direction:column; align-items:flex-end; }
  .exp-amount { font-family:'Geist Mono',monospace; font-size:14px; font-weight:600; color:#D4D0CB; flex-shrink:0; }
  .exp-amount-sub { font-size:10px; color:#6B6560; margin-top:2px; }
  .exp-del { opacity:0; background:rgba(224,123,106,0.08); border:1px solid rgba(224,123,106,0.15); border-radius:6px; color:#E07B6A; font-size:12px; padding:4px 8px; cursor:pointer; font-family:'Geist',sans-serif; transition:all 0.15s; }
  .exp-del:hover { background:rgba(224,123,106,0.15); }

  /* Filters */
  .filter-row { display:flex; gap:6px; padding:12px 20px; border-bottom:1px solid rgba(255,255,255,0.05); flex-wrap:wrap; }
  .filter-btn { font-size:12px; padding:4px 10px; border-radius:20px; border:1px solid rgba(255,255,255,0.08); background:transparent; color:#6B6560; cursor:pointer; font-family:'Geist',sans-serif; transition:all 0.15s; }
  .filter-btn:hover { color:#C8C4BF; }
  .filter-btn.active { background:rgba(201,168,76,0.1); border-color:rgba(201,168,76,0.3); color:#C9A84C; }

  /* Right sidebar — breakdown */
  .breakdown-row { display:flex; align-items:center; justify-content:space-between; padding:10px 20px; border-bottom:1px solid rgba(255,255,255,0.04); }
  .breakdown-row:last-child { border-bottom:none; }
  .breakdown-left { display:flex; align-items:center; gap:10px; }
  .breakdown-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
  .breakdown-name { font-size:13px; color:#C8C4BF; }
  .breakdown-right { display:flex; align-items:center; gap:10px; }
  .breakdown-amt { font-family:'Geist Mono',monospace; font-size:13px; color:#7A7570; }
  .breakdown-pct { font-size:11px; color:#3D3935; width:30px; text-align:right; font-family:'Geist Mono',monospace; }

  /* Month selector */
  .month-sel { background:#1f2022; border:1px solid rgba(255,255,255,0.2); border-radius:8px; padding:7px 12px; font-family:'Geist',sans-serif; font-size:13px; color:#F0EDE8; cursor:pointer; outline:none; }
  .month-sel option { background:#1f2022; color:#F0EDE8; }

  /* Toast */
  .toast { position:fixed; bottom:28px; right:28px; background:#1E1F22; border:1px solid rgba(255,255,255,0.1); color:#F0EDE8; padding:11px 18px; border-radius:10px; font-size:13px; font-weight:500; box-shadow:0 8px 32px rgba(0,0,0,0.4); z-index:9999; animation:toastIn 0.2s ease; }
  @keyframes toastIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
  .empty { text-align:center; padding:36px 16px; font-size:13px; color:#3D3935; }

  /* Receipt modal */
  .receipt-modal-backdrop { position:fixed; inset:0; background:rgba(0,0,0,0.58); display:flex; align-items:center; justify-content:center; padding:20px; z-index:1200; }
  .receipt-modal { width:min(700px,100%); max-height:min(78vh,760px); overflow:auto; background:#161719; border:1px solid rgba(255,255,255,0.08); border-radius:16px; box-shadow:0 20px 60px rgba(0,0,0,0.5); }
  .receipt-modal-hdr { position:sticky; top:0; background:#161719; border-bottom:1px solid rgba(255,255,255,0.06); padding:14px 16px; display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
  .receipt-modal-title { font-size:15px; font-weight:600; color:#F0EDE8; }
  .receipt-modal-sub { margin-top:3px; font-size:11px; color:#6B6560; }
  .receipt-modal-badges { margin-top:8px; display:flex; flex-wrap:wrap; gap:6px; }
  .receipt-badge { font-size:11px; color:#C8C4BF; border:1px solid rgba(255,255,255,0.13); background:rgba(255,255,255,0.03); padding:3px 8px; border-radius:999px; }
  .receipt-modal-close { border:1px solid rgba(255,255,255,0.14); background:transparent; color:#C8C4BF; border-radius:8px; font-size:12px; line-height:1; padding:7px 9px; cursor:pointer; }
  .receipt-modal-close:hover { border-color:rgba(255,255,255,0.28); color:#F0EDE8; }
  .receipt-modal-body { padding:12px 16px 16px; }
  .receipt-row { display:flex; gap:10px; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.05); }
  .receipt-row:last-child { border-bottom:none; }
  .receipt-row-index { color:#6B6560; width:22px; flex-shrink:0; text-align:right; font-size:12px; padding-top:2px; }
  .receipt-row-main { flex:1; min-width:0; }
  .receipt-item-name { color:#F0EDE8; font-size:13px; }
  .receipt-item-meta { margin-top:2px; color:#8E8882; font-size:11px; }
  .receipt-item-note { margin-top:4px; color:#A8A29E; font-size:12px; }

  @media (max-width: 1024px) {
    .ep-content { padding: 20px; }
    .ep-grid { grid-template-columns: 1fr; }
    .ep-summary { grid-template-columns: 1fr; }
  }

  @media (max-width: 768px) {
    .ep { min-height: calc(100vh - 56px); overflow-x: hidden; }
    .ep-topbar { padding: 10px 14px; min-height: 56px; align-items: flex-start; gap: 10px; }
    .ep-actions { width: 100%; flex-wrap: wrap; }
    .month-sel,
    .btn-ghost,
    .scan-camera-btn,
    .scan-add-btn { width: 100%; }
    .ep-content { padding: 14px; }
    .form-row { grid-template-columns: 1fr; }
    .panel-hdr,
    .ep-form,
    .exp-row,
    .breakdown-row,
    .filter-row { padding-left: 14px; padding-right: 14px; }
    .toast { left: 14px; right: 14px; bottom: 14px; }
    .scan-upload-grid,
    .scan-manual-grid { grid-template-columns:1fr; }
  }
`;

export function ExpensesPageClient({ household, member }: { household: Household; member: Member }) {
  const supabase = createClient();
  const { selectedMonth, setSelectedMonth } = useUIStore();

  const {
    data: allExpenses = [],
    error: expensesError,
    isLoading: expensesLoading,
  } = useExpensesAll(supabase, household.id);
  const { data: categories = [], error: categoriesError } = useCategories(supabase, household.id);
  const { data: members = [], error: membersError } = useMembers(supabase, household.id);
  const createExpense = useCreateExpense(supabase, household.id);
  const deleteExpense = useDeleteExpense(supabase, household.id);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [currencyCode, setCurrencyCode] = useState(BASE_CURRENCY);
  const [categoryId, setCategoryId] = useState('');
  const [paidBy, setPaidBy] = useState(member.id);
  const [date, setDate] = useState(getLocalDateInputValue());
  const [splitType, setSplitType] = useState<SplitType>(
    household.default_split_type === 'percentage' ? 'percentage' : 'equal'
  );
  const [receiptItems, setReceiptItems] = useState<ExpenseReceiptItem[]>([]);
  const [manualItemName, setManualItemName] = useState('');
  const [manualItemCost, setManualItemCost] = useState('');
  const [scanError, setScanError] = useState('');
  const [isScanningReceipt, setIsScanningReceipt] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [activeReceipt, setActiveReceipt] = useState<{
    expenseName: string;
    expenseDate: string;
    amountLabel: string;
    currencyCode: string;
    payerName: string;
    categoryName: string;
    itemCount: number;
    items: { name?: string; cost?: number; quantity?: string; notes?: string }[];
  } | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  const monthOptions = useMemo(() => buildMonthOptions(selectedMonth), [selectedMonth]);
  const queryError = expensesError || categoriesError || membersError;
  const expenses = useMemo(
    () => allExpenses.filter((expense) => expense.date?.startsWith(selectedMonth)),
    [allExpenses, selectedMonth]
  );

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2800); }

  async function processReceiptFile(file: File) {
    if (!file) return;

    setScanError('');
    setIsScanningReceipt(true);

    try {
      const formData = new FormData();
      formData.append('receipt', file);

      const response = await fetch('/api/receipts/scan', {
        method: 'POST',
        body: formData,
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Unable to scan receipt image.');
      }

      const scannedItems = (Array.isArray(payload?.items) ? payload.items : [])
        .map((item: any) => ({
          name: typeof item?.name === 'string' ? item.name.trim() : '',
          cost: typeof item?.cost === 'number' && Number.isFinite(item.cost) ? item.cost : undefined,
        }))
        .filter((item: ExpenseReceiptItem) => item.name.length > 0);

      if (scannedItems.length === 0) {
        throw new Error('No purchasable line items were detected in this receipt.');
      }

      setReceiptItems(scannedItems);
      const total = scannedItems.reduce((sum, item) => sum + (item.cost ?? 0), 0);
      if (!name.trim()) {
        setName(scannedItems.length === 1 ? scannedItems[0].name : `${scannedItems[0].name} + ${scannedItems.length - 1} items`);
      }
      if ((!amount || Number(amount) <= 0) && total > 0) {
        setAmount(total.toFixed(2));
      }

      showToast(`🧾 Parsed ${scannedItems.length} receipt item${scannedItems.length === 1 ? '' : 's'}`);
    } catch (err: any) {
      setScanError(err?.message ?? 'Unable to scan receipt image.');
    } finally {
      setIsScanningReceipt(false);
    }
  }

  async function handleReceiptScan(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await processReceiptFile(file);
    } finally {
      event.target.value = '';
    }
  }

  function stopCameraStream() {
    if (!cameraStreamRef.current) return;
    for (const track of cameraStreamRef.current.getTracks()) {
      track.stop();
    }
    cameraStreamRef.current = null;
  }

  function closeCameraModal() {
    setIsCameraOpen(false);
    stopCameraStream();
  }

  async function openCamera() {
    setCameraError('');

    if (!navigator.mediaDevices?.getUserMedia) {
      // Fallback to capture input for browsers without getUserMedia.
      cameraInputRef.current?.click();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
        },
        audio: false,
      });

      cameraStreamRef.current = stream;
      setIsCameraOpen(true);
    } catch (err: any) {
      setCameraError(err?.message ?? 'Unable to access your camera. Check browser permissions.');
    }
  }

  async function takePhotoAndScan() {
    const video = cameraVideoRef.current;
    const canvas = cameraCanvasRef.current;

    if (!video || !canvas) {
      setCameraError('Camera preview is not ready yet.');
      return;
    }

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) {
      setCameraError('Unable to read camera frame. Try again.');
      return;
    }

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) {
      setCameraError('Unable to process captured photo.');
      return;
    }

    context.drawImage(video, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((value) => resolve(value), 'image/jpeg', 0.92);
    });

    if (!blob) {
      setCameraError('Failed to capture photo from camera.');
      return;
    }

    const capturedFile = new File([blob], `receipt-${Date.now()}.jpg`, { type: 'image/jpeg' });
    closeCameraModal();
    await processReceiptFile(capturedFile);
  }

  function addManualReceiptItem() {
    const trimmedName = manualItemName.trim();
    if (!trimmedName) {
      setScanError('Manual item name is required.');
      return;
    }

    let parsedCost: number | undefined;
    if (manualItemCost.trim()) {
      const costNumber = Number(manualItemCost);
      if (!Number.isFinite(costNumber) || costNumber < 0) {
        setScanError('Manual item cost must be a valid non-negative number.');
        return;
      }
      parsedCost = Math.round(costNumber * 100) / 100;
    }

    setReceiptItems((prev) => [...prev, { name: trimmedName, cost: parsedCost }]);
    setManualItemName('');
    setManualItemCost('');
    setScanError('');
  }

  function removeReceiptItem(indexToRemove: number) {
    setReceiptItems((prev) => prev.filter((_, index) => index !== indexToRemove));
  }

  const totalSpent = expenses.reduce((s, e) => s + e.amount, 0);
  const expenseCount = expenses.length;
  const avgExpense = expenseCount > 0 ? totalSpent / expenseCount : 0;

  const filtered = filterCat === 'all' ? expenses : expenses.filter(e => e.category_id === filterCat);

  // Category breakdown
  const breakdown = useMemo(() => {
    const map: Record<string, { name: string; icon: string; color: string; total: number }> = {};
    for (const exp of expenses) {
      const cat = categories.find(c => c.id === exp.category_id);
      const key = exp.category_id ?? 'uncategorized';
      if (!map[key]) map[key] = { name: cat?.name ?? 'Uncategorized', icon: cat?.icon ?? '📦', color: cat?.color ?? '#6B6560', total: 0 };
      map[key].total += exp.amount;
    }
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [expenses, categories]);

  function buildPercentageSplits(totalAmount: number) {
    const totalBudget = members.reduce((sum, m) => sum + Math.max(0, m.monthly_budget ?? 0), 0);
    if (totalBudget <= 0) {
      return calculateEqualSplits(totalAmount, members.map((m) => m.id));
    }

    const percentages = members.map((m) => ({
      member_id: m.id,
      percentage: ((Math.max(0, m.monthly_budget ?? 0) / totalBudget) * 100),
    }));

    return calculatePercentageSplits(totalAmount, percentages);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = Number(amount);
    if (!parsed || parsed <= 0) { setError('Amount must be > 0'); return; }
    if (!categoryId) { setError('Pick a category'); return; }
    setError('');
    try {
      const splits =
        splitType === 'percentage'
          ? buildPercentageSplits(parsed)
          : calculateEqualSplits(parsed, members.map((m) => m.id));

      await createExpense.mutateAsync({
        name, amount: parsed, currency_code: currencyCode, category_id: categoryId, paid_by: paidBy,
        split_type: splitType, splits, date,
        receipt_items: receiptItems.length > 0 ? receiptItems : undefined,
      });
      setName(''); setAmount(''); setCurrencyCode(BASE_CURRENCY); setCategoryId(''); setPaidBy(member.id);
      setReceiptItems([]); setScanError(''); setManualItemName(''); setManualItemCost('');
      setDate(getLocalDateInputValue());
      setSplitType(household.default_split_type === 'percentage' ? 'percentage' : 'equal');
      setFilterCat('all');
      setSelectedMonth(date.slice(0, 7));
      setShowForm(false);
      showToast('✅ Expense added');
    } catch (err: any) { setError(err?.message ?? 'Failed'); }
  }

  async function handleDelete(id: string, expName: string) {
    if (!confirm(`Delete "${expName}"?`)) return;
    await deleteExpense.mutateAsync(id);
    showToast('🗑️ Expense deleted');
  }

  useEffect(() => {
    if (!activeReceipt) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setActiveReceipt(null);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeReceipt]);

  useEffect(() => {
    if (!isCameraOpen || !cameraStreamRef.current) return;

    const video = cameraVideoRef.current;
    if (!video) return;

    video.srcObject = cameraStreamRef.current;
    const playAttempt = async () => {
      try {
        await video.play();
      } catch {
        setCameraError('Camera permission granted, but preview could not autoplay. Tap inside the preview and try again.');
      }
    };

    void playAttempt();
  }, [isCameraOpen]);

  useEffect(() => {
    return () => {
      stopCameraStream();
    };
  }, []);

  return (
    <>
      <style>{STYLES}</style>
      <div className="ep">
        <div className="ep-topbar">
          <div className="ep-title-wrap">
            <span className="ep-title">Expenses</span>
            <span className="ep-subtitle">Track spending, scan receipts, and split costs faster.</span>
          </div>
          <div className="ep-actions">
            <select className="month-sel" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
              {monthOptions.map(m => {
                const [y, mo] = m.split('-');
                return <option key={m} value={m}>{new Date(+y,+mo-1).toLocaleDateString('en-US',{month:'long',year:'numeric'})}</option>;
              })}
            </select>
            <button className="btn-ghost" onClick={() => setShowForm(f => !f)}>{showForm ? '✕ Cancel' : '＋ Add Expense'}</button>
          </div>
        </div>

        <div className="ep-content">
          {/* Summary */}
          <div className="ep-summary">
            <div className="ep-sc">
              <div className="ep-sc-label">Total Spent</div>
              <div className="ep-sc-val">{formatCurrency(totalSpent)}</div>
              <div className="ep-sc-sub">{expenseCount} expense{expenseCount !== 1 ? 's' : ''}</div>
              <div className="ep-sc-bar" style={{background:'#E07B6A'}} />
            </div>
            <div className="ep-sc">
              <div className="ep-sc-label">Avg per Expense</div>
              <div className="ep-sc-val">{formatCurrency(avgExpense)}</div>
              <div className="ep-sc-sub">this month</div>
              <div className="ep-sc-bar" style={{background:'#C9A84C'}} />
            </div>
            <div className="ep-sc">
              <div className="ep-sc-label">Categories Used</div>
              <div className="ep-sc-val">{breakdown.length}</div>
              <div className="ep-sc-sub">of {categories.length} total</div>
              <div className="ep-sc-bar" style={{background:'#6BA583'}} />
            </div>
          </div>

          <div className="ep-grid">
            <div>
              {/* Add form */}
              {showForm && (
                <div className="panel" style={{marginBottom:16}}>
                  <div className="panel-hdr"><span className="panel-title">New Expense</span></div>
                  <form onSubmit={onSubmit} className="ep-form">
                    <div className="form-row">
                      <div className="fld">
                        <label className="fld-label">Description</label>
                        <input className="fld-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Weekly groceries" required />
                      </div>
                      <div className="fld">
                        <label className="fld-label">Amount</label>
                        <input className="fld-input" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" type="number" min="0" step="0.01" required />
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="fld">
                        <label className="fld-label">Currency</label>
                        <select className="fld-input" value={currencyCode} onChange={e => setCurrencyCode(e.target.value)}>
                          {COMMON_CURRENCIES.map((currency) => (
                            <option key={currency.code} value={currency.code}>
                              {currency.code} {currency.symbol}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="fld">
                        <label className="fld-label">Category</label>
                        <select className="fld-input" value={categoryId} onChange={e => setCategoryId(e.target.value)} required>
                          <option value="">Select category…</option>
                          {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                        </select>
                      </div>
                      <div className="fld">
                        <label className="fld-label">Paid by</label>
                        <select className="fld-input" value={paidBy} onChange={e => setPaidBy(e.target.value)}>
                          {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="fld">
                        <label className="fld-label">Date</label>
                        <input className="fld-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
                      </div>
                      <div className="fld">
                        <label className="fld-label">Split Type</label>
                        <select className="fld-input" value={splitType} onChange={e => setSplitType(e.target.value as SplitType)}>
                          <option value="equal">Equal</option>
                          <option value="percentage">By Member % (Budget Share)</option>
                        </select>
                      </div>
                    </div>
                    {splitType === 'percentage' && (
                      <div className="panel-sub">Uses each member monthly budget as their share of each expense.</div>
                    )}
                    <div className="scan-row">
                      <label className="fld-label">Receipt Image Scanner</label>
                      <div className="scan-upload-grid">
                        <input
                          className="scan-input"
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={handleReceiptScan}
                          disabled={isScanningReceipt}
                        />
                        <button
                          type="button"
                          className="scan-camera-btn"
                          onClick={openCamera}
                          disabled={isScanningReceipt}
                        >
                          Open Camera
                        </button>
                        <input
                          ref={cameraInputRef}
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={handleReceiptScan}
                          disabled={isScanningReceipt}
                          style={{ display: 'none' }}
                        />
                      </div>
                      <div className="scan-help">
                        Use file picker or camera to scan a receipt image and auto-extract item names and costs. {isScanningReceipt ? 'Scanning image…' : ''}
                      </div>
                      {receiptItems.length > 0 && (
                        <ul className="scan-list">
                          {receiptItems.map((item, index) => (
                            <li key={`scan-item-${index}`} className="scan-item">
                              <span className="scan-item-left">{item.name}</span>
                              <span className="scan-item-actions">
                                <span className="scan-item-cost">
                                  {typeof item.cost === 'number' ? formatCurrency(item.cost, currencyCode) : 'N/A'}
                                </span>
                                <button type="button" className="scan-remove" onClick={() => removeReceiptItem(index)}>
                                  Remove
                                </button>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="scan-help">Missing an item? Add it manually below.</div>
                      <div className="scan-manual-grid">
                        <input
                          className="fld-input"
                          value={manualItemName}
                          onChange={(event) => setManualItemName(event.target.value)}
                          placeholder="Item name"
                        />
                        <input
                          className="fld-input"
                          value={manualItemCost}
                          onChange={(event) => setManualItemCost(event.target.value)}
                          placeholder="Cost"
                          type="number"
                          min="0"
                          step="0.01"
                        />
                        <button
                          type="button"
                          className="scan-add-btn"
                          onClick={addManualReceiptItem}
                          disabled={isScanningReceipt}
                        >
                          Add Item
                        </button>
                      </div>
                    </div>
                    <div className="form-row">
                      <div className="fld" style={{justifyContent:'flex-end'}}>
                        <button type="submit" className="btn-gold" disabled={createExpense.isPending} style={{height:38}}>
                          {createExpense.isPending ? 'Adding…' : 'Add Expense'}
                        </button>
                      </div>
                    </div>
                    {scanError && <div className="form-error">{scanError}</div>}
                    {error && <div className="form-error">{error}</div>}
                  </form>
                </div>
              )}

              {/* List */}
              <div className="panel">
                <div className="panel-hdr">
                  <span className="panel-title">All Expenses</span>
                  <span className="panel-sub">{filtered.length} entries</span>
                </div>
                {/* Category filters */}
                <div className="filter-row">
                  <button className={`filter-btn${filterCat==='all'?' active':''}`} onClick={() => setFilterCat('all')}>All</button>
                  {breakdown.map(b => {
                    const cat = categories.find(c => c.name === b.name);
                    return (
                      <button key={b.name} className={`filter-btn${filterCat===cat?.id?' active':''}`} onClick={() => setFilterCat(cat?.id ?? 'all')}>
                        {b.icon} {b.name}
                      </button>
                    );
                  })}
                </div>
                {queryError ? (
                  <div className="empty">Unable to load expenses: {queryError.message}</div>
                ) : expensesLoading ? (
                  <div className="empty">Loading expenses…</div>
                ) : filtered.length === 0 ? (
                  <div className="empty">No expenses{filterCat !== 'all' ? ' in this category' : ' this month'}</div>
                ) : (
                  filtered.map(exp => {
                    const cat = categories.find(c => c.id === exp.category_id);
                    const payer = members.find(m => m.id === exp.paid_by);
                    const sourceCurrency = exp.currency_code ?? BASE_CURRENCY;
                    const sourceAmount = exp.original_amount ?? exp.amount;
                    const storedReceiptItems = (Array.isArray(exp.receipt_items) ? exp.receipt_items : []) as {
                      name?: string;
                      cost?: number;
                      quantity?: string;
                      notes?: string;
                    }[];
                    const legacyReceiptItems = storedReceiptItems.length === 0 && typeof exp.notes === 'string' && exp.notes.startsWith('Bought items: ')
                      ? exp.notes
                          .replace('Bought items: ', '')
                          .split(',')
                          .map((value: string) => value.trim())
                          .filter(Boolean)
                          .map((name: string) => ({ name }))
                      : [];
                    const receiptItems = storedReceiptItems.length > 0 ? storedReceiptItems : legacyReceiptItems;
                    return (
                      <div key={exp.id} className="exp-row">
                        <div className="exp-icon" style={{background:(cat?.color??'#6B6560')+'18'}}>{cat?.icon??'📦'}</div>
                        <div className="exp-info">
                          <div className="exp-name">{exp.name}</div>
                          <div className="exp-meta">{formatRelativeDate(exp.date)} · {cat?.name??'Uncategorized'} · {payer?.name}</div>
                          {receiptItems.length > 0 && (
                            <div className="exp-receipt">
                              <span>Receipt ({receiptItems.length} item{receiptItems.length === 1 ? '' : 's'})</span>
                              <button
                                type="button"
                                className="exp-receipt-btn"
                                onClick={() => setActiveReceipt({
                                  expenseName: exp.name,
                                  expenseDate: exp.date,
                                  amountLabel: formatCurrency(sourceAmount, sourceCurrency),
                                  currencyCode: sourceCurrency,
                                  payerName: payer?.name ?? 'Unknown',
                                  categoryName: cat?.name ?? 'Uncategorized',
                                  itemCount: receiptItems.length,
                                  items: receiptItems,
                                })}
                              >
                                View receipt
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="exp-amount-wrap">
                          <span className="exp-amount">{formatCurrency(sourceAmount, sourceCurrency)}</span>
                          {sourceCurrency !== BASE_CURRENCY && <span className="exp-amount-sub">≈ {formatCurrency(exp.amount, BASE_CURRENCY)}</span>}
                        </div>
                        <button className="exp-del" onClick={() => handleDelete(exp.id, exp.name)}>✕</button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Breakdown sidebar */}
            <div>
              <div className="panel">
                <div className="panel-hdr"><span className="panel-title">By Category</span></div>
                {breakdown.length === 0 ? <div className="empty">No data yet</div> : breakdown.map(b => (
                  <div key={b.name} className="breakdown-row">
                    <div className="breakdown-left">
                      <div className="breakdown-dot" style={{background:b.color}} />
                      <span className="breakdown-name">{b.icon} {b.name}</span>
                    </div>
                    <div className="breakdown-right">
                      <span className="breakdown-amt">{formatCurrency(b.total)}</span>
                      <span className="breakdown-pct">{totalSpent > 0 ? Math.round((b.total/totalSpent)*100) : 0}%</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* By member */}
              <div className="panel" style={{marginTop:16}}>
                <div className="panel-hdr"><span className="panel-title">By Member</span></div>
                {members.map(m => {
                  const paid = expenses.filter(e => e.paid_by === m.id).reduce((s, e) => s + e.amount, 0);
                  const pct = totalSpent > 0 ? (paid / totalSpent) * 100 : 0;
                  const palette = ['#C9A84C','#E07B6A','#7B9EC9','#9B84C4','#6BA583'];
                  const color = palette[members.indexOf(m) % palette.length];
                  return (
                    <div key={m.id} className="breakdown-row">
                      <div className="breakdown-left">
                        <div style={{width:28,height:28,borderRadius:'50%',background:color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'#0E0F11',flexShrink:0}}>{m.name[0]}</div>
                        <span className="breakdown-name">{m.name}</span>
                      </div>
                      <div className="breakdown-right">
                        <span className="breakdown-amt">{formatCurrency(paid)}</span>
                        <span className="breakdown-pct">{Math.round(pct)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
      {activeReceipt && (
        <div
          className="receipt-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setActiveReceipt(null)}
        >
          <div className="receipt-modal" onClick={(event) => event.stopPropagation()}>
            <div className="receipt-modal-hdr">
              <div>
                <div className="receipt-modal-title">{activeReceipt.expenseName}</div>
                <div className="receipt-modal-sub">
                  {formatRelativeDate(activeReceipt.expenseDate)} · {activeReceipt.itemCount} item{activeReceipt.itemCount === 1 ? '' : 's'}
                </div>
                <div className="receipt-modal-badges">
                  <span className="receipt-badge">Amount: {activeReceipt.amountLabel}</span>
                  <span className="receipt-badge">Paid by: {activeReceipt.payerName}</span>
                </div>
              </div>
              <button
                type="button"
                className="receipt-modal-close"
                onClick={() => setActiveReceipt(null)}
                aria-label="Close receipt"
              >
                ✕
              </button>
            </div>
            <div className="receipt-modal-body">
              {activeReceipt.items.map((item, index) => (
                <div className="receipt-row" key={`modal-receipt-${index}`}>
                  <div className="receipt-row-index">{index + 1}.</div>
                  <div className="receipt-row-main">
                    <div className="receipt-item-name">{item.name ?? 'Item'}</div>
                    {typeof item.cost === 'number' && <div className="receipt-item-meta">Cost: {formatCurrency(item.cost, activeReceipt.currencyCode)}</div>}
                    {item.quantity && <div className="receipt-item-meta">Qty: {item.quantity}</div>}
                    {item.notes && <div className="receipt-item-note">{item.notes}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {isCameraOpen && (
        <div className="cam-backdrop" onClick={closeCameraModal}>
          <div className="cam-modal" onClick={(event) => event.stopPropagation()}>
            <div className="cam-hdr">
              <div className="cam-title">Capture Receipt</div>
              <button type="button" className="cam-close" onClick={closeCameraModal}>Close</button>
            </div>
            <div className="cam-body">
              <video ref={cameraVideoRef} className="cam-video" playsInline muted autoPlay />
              <canvas ref={cameraCanvasRef} style={{ display: 'none' }} />
              <div className="cam-actions">
                <button type="button" className="cam-btn cam-btn-ghost" onClick={closeCameraModal}>Cancel</button>
                <button type="button" className="cam-btn cam-btn-primary" onClick={takePhotoAndScan}>Take Photo</button>
              </div>
              {cameraError && <div className="cam-error">{cameraError}</div>}
            </div>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}