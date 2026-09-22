"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Cloud,
  Download,
  History,
  Lightbulb,
  LockKeyhole,
  MapPin,
  Minus,
  PackagePlus,
  Plus,
  RefreshCw,
  Route,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import { BRANCHES, BRANCH_BY_ID, PRODUCTS, PRODUCT_BY_ID, type Branch } from "@/lib/catalog";
import type { DeliveryNoteInput } from "@/lib/delivery-note";
import { HISTORICAL_SHIPMENTS } from "@/lib/seed-shipments";

type ShipmentRecord = {
  id: string;
  visitId: string;
  date: string;
  branchId: string;
  productId: string;
  quantity: number;
  source: string;
  createdAt: string;
};

type ShelfObservation = {
  id: string;
  visitId: string;
  date: string;
  branchId: string;
  productId: string;
  remainingQuantity: number;
  shelfNotFull: boolean;
  source: string;
  createdAt: string;
};

type DeliveryVisit = {
  id: string;
  date: string;
  branchId: string;
  source: string;
  createdAt: string;
  total: number;
  items: ShipmentRecord[];
  observations: ShelfObservation[];
};

type Suggestion = {
  productId: string;
  productName: string;
  quantity: number;
  target: number;
  historicalAverage: number;
  latestRemaining: number | null;
  shelfNotFull: boolean;
};

type BranchStat = Branch & {
  total: number;
  visits: number;
  lastDate: string;
  dueDate: string;
  plannedDate: string;
  daysUntilDue: number;
  overdueDays: number;
  suggestions: Suggestion[];
  suggestedTotal: number;
};

type WebMcpContext = {
  registerTool: (
    tool: {
      name: string;
      title: string;
      description: string;
      inputSchema: object;
      execute: (input: unknown) => unknown;
    },
    options?: { signal?: AbortSignal },
  ) => void | Promise<void>;
};

const INITIAL_RECORDS: ShipmentRecord[] = HISTORICAL_SHIPMENTS.map((record) => ({
  ...record,
  visitId: `excel:${record.branchId}:${record.date}`,
  source: "excel_v1_1",
  createdAt: `${record.date}T12:00:00.000Z`,
}));

const trendConfig = {
  quantity: { label: "補貨盒數", color: "var(--chart-1)" },
} satisfies ChartConfig;

function hongKongDate() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatDate(date: string, includeYear = false) {
  return new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    ...(includeYear ? { year: "numeric" as const } : {}),
    month: "numeric",
    day: "numeric",
  }).format(new Date(`${date}T12:00:00+08:00`));
}

function dateNumber(date: string) {
  return new Date(`${date}T12:00:00+08:00`).getTime();
}

function daysBetween(from: string, to: string) {
  return Math.round((dateNumber(to) - dateNumber(from)) / 86_400_000);
}

function addDays(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00+08:00`);
  value.setUTCDate(value.getUTCDate() + amount);
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function groupVisits(records: ShipmentRecord[], observations: ShelfObservation[]) {
  const grouped = new Map<string, DeliveryVisit>();
  const ensureVisit = (visitId: string, date: string, branchId: string, source: string, createdAt: string) => {
    const existing = grouped.get(visitId);
    if (existing) return existing;
    const visit: DeliveryVisit = {
      id: visitId,
      date,
      branchId,
      source,
      createdAt,
      total: 0,
      items: [],
      observations: [],
    };
    grouped.set(visitId, visit);
    return visit;
  };

  records.forEach((record) => {
    const visit = ensureVisit(record.visitId, record.date, record.branchId, record.source, record.createdAt);
    visit.items.push(record);
    visit.total += record.quantity;
  });
  observations.forEach((observation) => {
    const visit = ensureVisit(
      observation.visitId,
      observation.date,
      observation.branchId,
      observation.source,
      observation.createdAt,
    );
    visit.observations.push(observation);
  });

  return [...grouped.values()].sort((a, b) =>
    `${b.date}:${b.createdAt}`.localeCompare(`${a.date}:${a.createdAt}`),
  );
}

function buildSuggestions(
  branch: Branch,
  records: ShipmentRecord[],
  observations: ShelfObservation[],
  lastDate: string,
  today: string,
) {
  const dueDate = addDays(lastDate || today, branch.cycleDays);
  const plannedDate = dueDate < today ? today : dueDate;
  const overdueDays = Math.max(0, daysBetween(dueDate, today));

  return branch.productIds.map((productId) => {
    const recent = records
      .filter((record) => record.branchId === branch.id && record.productId === productId)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 4);
    const historicalAverage = recent.length
      ? recent.reduce((sum, record) => sum + record.quantity, 0) / recent.length
      : 0;
    const baseline = branch.baselineQuantities[productId] ?? Math.max(1, Math.round(historicalAverage));
    const target = Math.max(1, Math.round((baseline * 2 + (historicalAverage || baseline)) / 3));
    const latestObservation = observations
      .filter((observation) => observation.branchId === branch.id && observation.productId === productId)
      .sort((a, b) => `${b.date}:${b.createdAt}`.localeCompare(`${a.date}:${a.createdAt}`))[0];

    let projectedRemaining = 0;
    let shortageBoost = 0;
    if (latestObservation) {
      const quantityAdded = records
        .filter((record) => record.visitId === latestObservation.visitId && record.productId === productId)
        .reduce((sum, record) => sum + record.quantity, 0);
      const afterVisitStock = latestObservation.remainingQuantity + quantityAdded;
      const elapsedCycles = Math.max(0, daysBetween(latestObservation.date, plannedDate)) / branch.cycleDays;
      projectedRemaining = Math.max(0, Math.floor(afterVisitStock - target * elapsedCycles));
      if (latestObservation.shelfNotFull) shortageBoost = Math.max(1, target - afterVisitStock);
    }

    const overdueBuffer = overdueDays > 0
      ? Math.ceil(target * Math.min(0.5, (overdueDays / branch.cycleDays) * 0.5))
      : 0;
    const quantity = Math.max(0, target - projectedRemaining + shortageBoost + overdueBuffer);
    return {
      productId,
      productName: PRODUCT_BY_ID[productId].name,
      quantity,
      target,
      historicalAverage,
      latestRemaining: latestObservation?.remainingQuantity ?? null,
      shelfNotFull: latestObservation?.shelfNotFull ?? false,
    };
  });
}

function statusLabel(branch: BranchStat) {
  if (branch.overdueDays > 0) return `已逾期 ${branch.overdueDays} 日`;
  if (branch.daysUntilDue === 0) return "今日要巡店";
  if (branch.daysUntilDue <= 3) return `${branch.daysUntilDue} 日內巡店`;
  return `尚有 ${branch.daysUntilDue} 日`;
}

function statusClasses(branch: BranchStat) {
  if (branch.overdueDays > 0 || branch.daysUntilDue === 0) return "border-rose-200 bg-rose-50 text-rose-700";
  if (branch.daysUntilDue <= 3) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-sky-200 bg-sky-50 text-sky-700";
}

export default function RestockApp() {
  const [records, setRecords] = useState<ShipmentRecord[]>(INITIAL_RECORDS);
  const [observations, setObservations] = useState<ShelfObservation[]>([]);
  const [activeTab, setActiveTab] = useState("branches");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState(BRANCHES[0].id);
  const [shipmentDate, setShipmentDate] = useState(hongKongDate);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [remainingQuantities, setRemainingQuantities] = useState<Record<string, string>>({});
  const [shelfNotFull, setShelfNotFull] = useState<Record<string, boolean>>({});
  const [pin, setPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<"loading" | "ready" | "offline">("loading");

  const loadRecords = useCallback(async () => {
    setSyncState("loading");
    try {
      const response = await fetch("/api/shipments", { cache: "no-store" });
      const data = (await response.json()) as {
        shipments?: ShipmentRecord[];
        observations?: ShelfObservation[];
        error?: string;
      };
      if (!response.ok || !data.shipments) throw new Error(data.error ?? "未能同步");
      setRecords(data.shipments);
      setObservations(data.observations ?? []);
      setSyncState("ready");
    } catch (error) {
      console.error(error);
      setSyncState("offline");
    }
  }, []);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const today = hongKongDate();
  const visits = useMemo(() => groupVisits(records, observations), [records, observations]);
  const totalQuantity = useMemo(
    () => records.reduce((sum, record) => sum + record.quantity, 0),
    [records],
  );

  const branchStats = useMemo<BranchStat[]>(
    () => BRANCHES.map((branch) => {
      const branchRecords = records.filter((record) => record.branchId === branch.id);
      const branchObservations = observations.filter((observation) => observation.branchId === branch.id);
      const branchVisits = new Set([
        ...branchRecords.map((record) => record.visitId),
        ...branchObservations.map((observation) => observation.visitId),
      ]);
      const dates = [
        ...branchRecords.map((record) => record.date),
        ...branchObservations.map((observation) => observation.date),
      ];
      const lastDate = dates.sort().at(-1) ?? "";
      const dueDate = addDays(lastDate || today, branch.cycleDays);
      const daysUntilDue = daysBetween(today, dueDate);
      const suggestions = buildSuggestions(branch, records, observations, lastDate, today);
      return {
        ...branch,
        total: branchRecords.reduce((sum, record) => sum + record.quantity, 0),
        visits: branchVisits.size,
        lastDate,
        dueDate,
        plannedDate: dueDate < today ? today : dueDate,
        daysUntilDue,
        overdueDays: Math.max(0, -daysUntilDue),
        suggestions,
        suggestedTotal: suggestions.reduce((sum, suggestion) => sum + suggestion.quantity, 0),
      };
    }).sort((a, b) => a.daysUntilDue - b.daysUntilDue),
    [observations, records, today],
  );

  const openEntry = useCallback((branchId?: string) => {
    const resolvedBranchId = branchId && BRANCH_BY_ID[branchId] ? branchId : selectedBranchId;
    const branch = branchStats.find((item) => item.id === resolvedBranchId);
    setSelectedBranchId(resolvedBranchId);
    setQuantities(Object.fromEntries((branch?.suggestions ?? []).map((item) => [item.productId, item.quantity])));
    setRemainingQuantities({});
    setShelfNotFull({});
    setShipmentDate(hongKongDate());
    setSheetOpen(true);
  }, [branchStats, selectedBranchId]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: WebMcpContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(
        context.registerTool(
          {
            name: "start_restock_entry",
            title: "開始新增到店補貨記錄",
            description: "開啟南堂花茶補貨表，預填系統建議，並記錄貨架餘量及補後未滿情況。",
            inputSchema: {
              type: "object",
              properties: {
                branchId: {
                  type: "string",
                  enum: BRANCHES.map((branch) => branch.id),
                  description: "要新增補貨記錄的分店代碼。",
                },
              },
              additionalProperties: false,
            },
            execute(input) {
              const branchId = typeof input === "object" && input !== null && "branchId" in input
                ? String((input as { branchId?: unknown }).branchId ?? "")
                : "";
              if (branchId && !BRANCH_BY_ID[branchId]) throw new Error("分店代碼不正確");
              openEntry(branchId || undefined);
              return { status: "ready", branchId: branchId || selectedBranchId };
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch((error) => console.error("WebMCP registration failed", error));
    } catch (error) {
      console.error("WebMCP registration failed", error);
    }
    return () => lifecycle.abort();
  }, [openEntry, selectedBranchId]);

  const monthlyTrend = useMemo(() => {
    const months = new Map<string, number>();
    records.forEach((record) => {
      const month = record.date.slice(0, 7);
      months.set(month, (months.get(month) ?? 0) + record.quantity);
    });
    return [...months.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, quantity]) => ({ month, label: `${Number(month.slice(5))}月`, quantity }));
  }, [records]);

  const productTotals = useMemo(
    () => PRODUCTS.map((product) => ({
      ...product,
      total: records
        .filter((record) => record.productId === product.id)
        .reduce((sum, record) => sum + record.quantity, 0),
    })).sort((a, b) => b.total - a.total),
    [records],
  );

  const selectedBranch = BRANCH_BY_ID[selectedBranchId] ?? BRANCHES[0];
  const selectedBranchStat = branchStats.find((branch) => branch.id === selectedBranch.id);
  const availableProducts = selectedBranch.productIds.map((productId) => PRODUCT_BY_ID[productId]);
  const entryTotal = Object.values(quantities).reduce((sum, quantity) => sum + quantity, 0);
  const observationCount = Object.values(remainingQuantities).filter((value) => value !== "").length;
  const hasEntry = entryTotal > 0 || observationCount > 0;

  function changeQuantity(productId: string, change: number) {
    setQuantities((current) => ({
      ...current,
      [productId]: Math.min(999, Math.max(0, (current[productId] ?? 0) + change)),
    }));
  }

  function changeBranch(branchId: string) {
    const branch = branchStats.find((item) => item.id === branchId);
    setSelectedBranchId(branchId);
    setQuantities(Object.fromEntries((branch?.suggestions ?? []).map((item) => [item.productId, item.quantity])));
    setRemainingQuantities({});
    setShelfNotFull({});
  }

  async function saveShipment() {
    if (!hasEntry) {
      toast.error("請填寫最少一款產品的餘量或實補數量");
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      toast.error("請輸入管理密碼");
      return;
    }
    setSaving(true);
    try {
      const items = availableProducts
        .map((product) => ({
          productId: product.id,
          quantity: quantities[product.id] ?? 0,
          remainingQuantity: remainingQuantities[product.id] === ""
            || remainingQuantities[product.id] === undefined
            ? null
            : Number(remainingQuantities[product.id]),
          shelfNotFull: shelfNotFull[product.id] ?? false,
        }))
        .filter((item) => item.quantity > 0 || item.remainingQuantity !== null);
      const response = await fetch("/api/shipments", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-pin": pin },
        body: JSON.stringify({ date: shipmentDate, branchId: selectedBranchId, items }),
      });
      const data = (await response.json()) as {
        rows?: ShipmentRecord[];
        observations?: ShelfObservation[];
        error?: string;
      };
      if (!response.ok || !data.rows || !data.observations) throw new Error(data.error ?? "儲存失敗");
      setRecords((current) => [...data.rows!, ...current]);
      setObservations((current) => [...data.observations!, ...current]);
      setSyncState("ready");
      setSheetOpen(false);
      setQuantities({});
      setRemainingQuantities({});
      setShelfNotFull({});
      setActiveTab("history");
      toast.success(`已儲存 ${selectedBranch.name}：實補 ${entryTotal} 盒、餘量 ${observationCount} 款`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "儲存失敗，請再試一次");
    } finally {
      setSaving(false);
    }
  }

  async function downloadDeliveryNote(branch: BranchStat) {
    setGeneratingPdf(branch.id);
    try {
      const items = branch.suggestions
        .filter((suggestion) => suggestion.quantity > 0)
        .map((suggestion) => ({
          productId: suggestion.productId,
          productName: suggestion.productName,
          quantity: suggestion.quantity,
        }));
      if (!items.length) {
        toast.info(`${branch.name} 現時未有建議補貨量`);
        return;
      }
      const dateCode = branch.plannedDate.replaceAll("-", "");
      const input: DeliveryNoteInput = {
        deliveryNoteNumber: `DN-${dateCode}-${branch.deliveryCode}`,
        deliveryDate: formatDate(branch.plannedDate, true),
        branchName: branch.name,
        retailBrand: branch.retailBrand,
        address: branch.address,
        openingHours: branch.openingHours,
        items,
      };
      const fontResponse = await fetch("/fonts/LXGWWenKai-Regular.ttf");
      if (!fontResponse.ok) throw new Error("未能載入送貨單中文字型");
      const { createDeliveryNotePdf, deliveryNoteFilename } = await import("@/lib/delivery-note");
      const pdfBytes = await createDeliveryNotePdf(input, await fontResponse.arrayBuffer());
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = deliveryNoteFilename(input);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success(`已輸出 ${branch.name} 送貨單 PDF`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "未能輸出送貨單");
    } finally {
      setGeneratingPdf(null);
    }
  }

  const maxBranchTotal = Math.max(...branchStats.map((branch) => branch.total), 1);
  const maxProductTotal = Math.max(...productTotals.map((product) => product.total), 1);
  const urgentCount = branchStats.filter((branch) => branch.daysUntilDue <= 3).length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster position="top-center" richColors />
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/92 backdrop-blur-xl">
        <div className="mx-auto flex min-h-18 max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-lg font-semibold text-primary-foreground shadow-sm shadow-primary/20">南</div>
            <div className="min-w-0"><p className="truncate text-sm text-muted-foreground">南堂花茶 · V1.1 穩定版</p><h1 className="truncate text-lg font-semibold tracking-tight sm:text-xl">DFI 智能補貨</h1></div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-1.5 rounded-full bg-secondary px-3 py-2 text-sm text-secondary-foreground sm:flex" aria-live="polite">
              {syncState === "loading" ? <RefreshCw className="size-4 animate-spin" aria-hidden="true" /> : syncState === "ready" ? <Cloud className="size-4" aria-hidden="true" /> : <CircleAlert className="size-4" aria-hidden="true" />}
              {syncState === "loading" ? "同步中" : syncState === "ready" ? "已同步" : "暫用歷史資料"}
            </div>
            <Button type="button" size="lg" className="hidden h-11 rounded-xl sm:inline-flex" onClick={() => openEntry()}><Plus aria-hidden="true" />到店記錄</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-28 pt-5 sm:px-6 sm:pt-7">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="sticky top-[82px] z-20 grid h-12 w-full grid-cols-3 rounded-2xl border border-border/70 bg-card/92 p-1 shadow-sm backdrop-blur-xl sm:top-[86px] sm:mx-auto sm:max-w-md">
            <TabsTrigger value="branches" className="h-full rounded-xl text-sm"><Route aria-hidden="true" />排程</TabsTrigger>
            <TabsTrigger value="history" className="h-full rounded-xl text-sm"><History aria-hidden="true" />記錄</TabsTrigger>
            <TabsTrigger value="trends" className="h-full rounded-xl text-sm"><TrendingUp aria-hidden="true" />趨勢</TabsTrigger>
          </TabsList>

          <TabsContent value="branches" className="mt-5 space-y-5">
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="補貨摘要">
              <Card className="gap-2 border-primary/15 bg-primary py-4 text-primary-foreground shadow-md shadow-primary/15 sm:col-span-2"><CardContent className="px-4 sm:px-5"><div className="mb-2 flex items-center justify-between gap-3"><span className="text-sm text-primary-foreground/80">需要優先處理</span><Clock3 className="size-5" aria-hidden="true" /></div><strong className="text-3xl font-semibold tabular-nums">{urgentCount}</strong><span className="ml-1 text-sm">間分店</span></CardContent></Card>
              <Card className="gap-2 border-border/80 bg-card py-4 shadow-sm"><CardContent className="px-4 sm:px-5"><span className="block text-sm text-muted-foreground">累計補貨</span><strong className="mt-2 block text-2xl font-semibold tabular-nums">{totalQuantity} 盒</strong></CardContent></Card>
              <Card className="gap-2 border-border/80 bg-card py-4 shadow-sm"><CardContent className="px-4 sm:px-5"><span className="block text-sm text-muted-foreground">貨架餘量記錄</span><strong className="mt-2 block text-2xl font-semibold tabular-nums">{observations.length} 筆</strong></CardContent></Card>
            </section>

            <section aria-labelledby="branch-heading">
              <div className="mb-3 flex items-end justify-between gap-3"><div><h2 id="branch-heading" className="text-xl font-semibold tracking-tight">下一輪補貨</h2><p className="mt-1 text-sm text-muted-foreground">按最遲巡店日排序；數量已計逾期、餘量及歷史紀錄</p></div><Badge variant="secondary" className="hidden gap-1.5 px-2.5 py-1 sm:inline-flex"><CheckCircle2 className="size-3.5" aria-hidden="true" />滾動排程</Badge></div>
              <div className="grid gap-3 md:grid-cols-2">
                {branchStats.map((branch) => (
                  <Card key={branch.id} className="gap-4 overflow-hidden border-border/80 bg-card py-0 shadow-sm transition hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10">
                    <CardContent className="space-y-4 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div><div className="mb-2 flex flex-wrap items-center gap-2"><Badge variant="secondary">{branch.retailBrand}</Badge><Badge variant="outline" className={statusClasses(branch)}>{statusLabel(branch)}</Badge></div><h3 className="text-xl font-semibold tracking-tight">{branch.name}</h3><p className="mt-1 text-sm text-muted-foreground">每 {branch.cycleDays} 日巡店 · 建議 {formatDate(branch.plannedDate)}</p></div>
                        <div className="rounded-2xl bg-secondary px-3 py-2 text-right"><span className="block text-xs text-muted-foreground">建議帶貨</span><strong className="text-xl tabular-nums">{branch.suggestedTotal} 盒</strong></div>
                      </div>
                      <div className="space-y-2 text-sm text-muted-foreground"><p className="flex items-start gap-2"><Clock3 className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span>{branch.openingHours}</span></p><p className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span>{branch.address}</span></p></div>
                      <div className="flex flex-wrap gap-1.5" aria-label={`${branch.name}建議補貨`}>{branch.suggestions.filter((item) => item.quantity > 0).map((item) => <span key={item.productId} className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{item.productName.replace("茶", "")} {item.quantity}</span>)}</div>
                      <div className="grid grid-cols-[1fr_auto] gap-2 border-t border-border/70 pt-4">
                        <Button type="button" className="h-11 rounded-xl" onClick={() => openEntry(branch.id)}><PackagePlus aria-hidden="true" />到店記錄</Button>
                        <Button type="button" variant="outline" className="h-11 rounded-xl" disabled={generatingPdf === branch.id} onClick={() => void downloadDeliveryNote(branch)}>{generatingPdf === branch.id ? <RefreshCw className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}<span className="hidden min-[390px]:inline">送貨單 PDF</span><span className="min-[390px]:hidden">PDF</span></Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>

            <Card className="gap-4 border-sky-200 bg-sky-50/80 py-5 shadow-sm">
              <CardHeader className="px-5"><CardTitle className="flex items-center gap-2 text-base"><Lightbulb className="size-5 text-sky-700" aria-hidden="true" />補貨提示邏輯</CardTitle></CardHeader>
              <CardContent className="grid gap-3 px-5 text-sm text-sky-950 sm:grid-cols-3"><p><strong className="block">逾期</strong><span className="text-sky-800">超過巡店日會加入安全量，避免漏補造成斷貨。</span></p><p><strong className="block">貨架餘量</strong><span className="text-sky-800">上次到店餘量會扣減預計需求；補後未滿則加回缺口。</span></p><p><strong className="block">歷史補貨</strong><span className="text-sky-800">最近四次同店同款數量，會與標準配貨量加權調整。</span></p></CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="mt-5">
            <div className="mb-4 flex items-end justify-between gap-3"><div><h2 className="text-xl font-semibold tracking-tight">到店記錄</h2><p className="mt-1 text-sm text-muted-foreground">補貨及貨架餘量按每次到店合併顯示</p></div><Badge variant="outline" className="tabular-nums">{visits.length} 次</Badge></div>
            <div className="space-y-3">
              {visits.map((visit) => {
                const productIds = [...new Set([...visit.items.map((item) => item.productId), ...visit.observations.map((observation) => observation.productId)])];
                return (
                  <Card key={visit.id} className="gap-3 border-border/80 bg-card py-4 shadow-sm">
                    <CardHeader className="grid grid-cols-[1fr_auto] items-start gap-4 px-4 sm:px-5"><div><CardTitle className="text-base">{BRANCH_BY_ID[visit.branchId]?.name ?? visit.branchId}</CardTitle><CardDescription className="mt-1 flex flex-wrap items-center gap-1.5"><CalendarDays className="size-4" aria-hidden="true" />{formatDate(visit.date, true)}{visit.source === "web" ? <Badge variant="secondary" className="ml-1">網頁新增</Badge> : null}{visit.observations.length ? <Badge variant="outline">有餘量</Badge> : null}</CardDescription></div><strong className="text-xl font-semibold text-primary tabular-nums">{visit.total} 盒</strong></CardHeader>
                    <CardContent className="grid gap-2 px-4 sm:grid-cols-2 sm:px-5">
                      {productIds.sort().map((productId) => {
                        const item = visit.items.find((record) => record.productId === productId);
                        const observation = visit.observations.find((record) => record.productId === productId);
                        return <div key={productId} className="rounded-xl bg-secondary/70 px-3 py-2.5 text-sm"><div className="flex items-center justify-between gap-3"><span>{PRODUCT_BY_ID[productId]?.name ?? productId}</span><strong className="shrink-0 tabular-nums">補 {item?.quantity ?? 0}</strong></div>{observation ? <p className="mt-1 text-xs text-muted-foreground">到店剩 {observation.remainingQuantity} 盒{observation.shelfNotFull ? " · 補後仍未滿" : ""}</p> : null}</div>;
                      })}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="trends" className="mt-5 space-y-4">
            <div><h2 className="text-xl font-semibold tracking-tight">出貨趨勢</h2><p className="mt-1 text-sm text-muted-foreground">圖表會隨到店記錄自動更新</p></div>
            <Card className="gap-4 border-border/80 bg-card py-5 shadow-sm">
              <CardHeader className="px-4 sm:px-5"><CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="size-5 text-primary" aria-hidden="true" />每月補貨盒數</CardTitle><CardDescription>{monthlyTrend[0]?.month.replace("-", "年")}月至 {monthlyTrend.at(-1)?.month.replace("-", "年")}月</CardDescription></CardHeader>
              <CardContent className="px-2 sm:px-5"><ChartContainer config={trendConfig} className="h-[260px] w-full"><AreaChart data={monthlyTrend} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}><defs><linearGradient id="quantity-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--color-quantity)" stopOpacity={0.42} /><stop offset="95%" stopColor="var(--color-quantity)" stopOpacity={0.04} /></linearGradient></defs><CartesianGrid vertical={false} strokeDasharray="3 3" /><XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} /><YAxis tickLine={false} axisLine={false} width={38} allowDecimals={false} /><ChartTooltip cursor={{ stroke: "var(--border)" }} content={<ChartTooltipContent indicator="line" />} /><Area type="monotone" dataKey="quantity" stroke="var(--color-quantity)" strokeWidth={3} fill="url(#quantity-fill)" /></AreaChart></ChartContainer></CardContent>
            </Card>
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="gap-4 border-border/80 bg-card py-5 shadow-sm"><CardHeader className="px-5"><CardTitle className="text-base">分店累計</CardTitle></CardHeader><CardContent className="space-y-4 px-5">{branchStats.slice().sort((a, b) => b.total - a.total).map((branch) => <div key={branch.id}><div className="mb-2 flex items-center justify-between gap-3 text-sm"><span>{branch.name}</span><strong className="tabular-nums">{branch.total} 盒</strong></div><Progress value={(branch.total / maxBranchTotal) * 100} aria-label={`${branch.name} ${branch.total}盒`} /></div>)}</CardContent></Card>
              <Card className="gap-4 border-border/80 bg-card py-5 shadow-sm"><CardHeader className="px-5"><CardTitle className="text-base">產品累計</CardTitle></CardHeader><CardContent className="space-y-4 px-5">{productTotals.map((product) => <div key={product.id}><div className="mb-2 flex items-center justify-between gap-3 text-sm"><span>{product.name}</span><strong className="tabular-nums">{product.total} 盒</strong></div><Progress value={(product.total / maxProductTotal) * 100} aria-label={`${product.name} ${product.total}盒`} /></div>)}</CardContent></Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <Button type="button" size="lg" className="fixed bottom-[max(20px,env(safe-area-inset-bottom))] right-4 z-40 h-14 rounded-2xl px-5 shadow-xl shadow-primary/25 sm:hidden" onClick={() => openEntry()}><PackagePlus className="size-5" aria-hidden="true" />到店記錄</Button>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="mx-auto max-h-[86dvh] w-full max-w-md overflow-hidden rounded-t-[24px] border-primary/30 bg-background px-0 pb-[max(8px,env(safe-area-inset-bottom))] [&>button]:grid [&>button]:size-11 [&>button]:place-items-center">
          <SheetHeader className="border-b border-border/70 px-4 py-3 text-left"><div className="pr-12"><SheetTitle className="text-lg">快速到店記錄</SheetTitle><SheetDescription className="mt-0.5 truncate text-xs">已預填建議實補量 · 可直接調整</SheetDescription></div></SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-3 px-4">
            <div className="grid grid-cols-[1.12fr_.88fr] gap-2 max-[359px]:grid-cols-1">
              <div className="space-y-1 [&>[data-slot=native-select-wrapper]]:w-full"><Label htmlFor="branch-select" className="text-xs">分店</Label><NativeSelect id="branch-select" value={selectedBranchId} className="h-11 rounded-xl bg-card text-sm" onChange={(event) => changeBranch(event.target.value)}>{BRANCHES.map((branch) => <NativeSelectOption key={branch.id} value={branch.id}>{branch.name}</NativeSelectOption>)}</NativeSelect></div>
              <div className="space-y-1"><Label htmlFor="shipment-date" className="text-xs">到店日期</Label><Input id="shipment-date" type="date" value={shipmentDate} className="h-11 rounded-xl bg-card px-2 text-sm" onChange={(event) => setShipmentDate(event.target.value)} /></div>
            </div>
            <section className="flex min-h-0 flex-1 flex-col" aria-labelledby="quick-quantity-heading">
              <div className="mb-1.5 grid grid-cols-[minmax(92px,1fr)_64px_142px] items-end gap-2 text-xs text-muted-foreground"><h3 id="quick-quantity-heading" className="font-semibold text-foreground">產品</h3><span className="text-center">到店餘量</span><span className="text-center">實補</span></div>
              <div className="min-h-0 flex-1 divide-y divide-border/70 overflow-y-auto overscroll-contain rounded-2xl border border-border/80 bg-card">
                {availableProducts.map((product) => {
                  const quantity = quantities[product.id] ?? 0;
                  return (
                    <div key={product.id} className="grid min-h-[72px] grid-cols-[minmax(92px,1fr)_64px_142px] items-center gap-2 px-2 py-1.5">
                      <div className="min-w-0"><p className="truncate text-sm font-medium">{product.name}</p><label className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground"><Checkbox checked={shelfNotFull[product.id] ?? false} onCheckedChange={(checked) => setShelfNotFull((current) => ({ ...current, [product.id]: Boolean(checked) }))} />補後未滿</label></div>
                      <Input type="number" min="0" max="999" inputMode="numeric" aria-label={`${product.name}到店餘量`} placeholder="—" value={remainingQuantities[product.id] ?? ""} className="h-11 rounded-xl px-1 text-center text-base font-semibold tabular-nums sm:text-base" onChange={(event) => { const raw = event.target.value; setRemainingQuantities((current) => ({ ...current, [product.id]: raw === "" ? "" : String(Math.min(999, Math.max(0, Number(raw) || 0))) })); }} />
                      <div className="grid shrink-0 grid-cols-[44px_46px_44px] items-center gap-1"><Button type="button" variant="outline" size="icon" className="size-11 rounded-xl" aria-label={`${product.name}減一盒`} onClick={() => changeQuantity(product.id, -1)} disabled={quantity === 0}><Minus aria-hidden="true" /></Button><Input type="number" min="0" max="999" inputMode="numeric" aria-label={`${product.name}實補數量`} value={quantity} className="h-11 rounded-xl px-1 text-center text-base font-semibold tabular-nums sm:text-base" onChange={(event) => { const value = Math.min(999, Math.max(0, Number(event.target.value) || 0)); setQuantities((current) => ({ ...current, [product.id]: value })); }} /><Button type="button" variant="secondary" size="icon" className="size-11 rounded-xl" aria-label={`${product.name}加一盒`} onClick={() => changeQuantity(product.id, 1)}><Plus aria-hidden="true" /></Button></div>
                    </div>
                  );
                })}
              </div>
            </section>
            <div className="rounded-xl bg-secondary/70 px-3 py-2 text-xs text-secondary-foreground">{selectedBranchStat ? `${selectedBranch.name} 每 ${selectedBranch.cycleDays} 日巡店；下次建議 ${formatDate(selectedBranchStat.plannedDate)}。` : null}</div>
            <div className="-mx-4 grid grid-cols-[78px_1fr_108px] items-end gap-2 border-t border-border/80 bg-background/96 px-4 pb-1 pt-2.5 backdrop-blur-xl">
              <div className="space-y-1"><Label htmlFor="admin-pin" className="flex items-center gap-1 text-xs"><LockKeyhole className="size-3.5 text-chart-1" aria-hidden="true" />密碼</Label><Input id="admin-pin" type="password" inputMode="numeric" autoComplete="current-password" placeholder="4 位" value={pin} className="h-11 rounded-xl bg-card px-2 text-center text-sm" onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))} /></div>
              <div className="pb-1 text-center"><span className="block text-xs text-muted-foreground">實補／餘量</span><strong className="text-base font-semibold tabular-nums">{entryTotal} 盒 · {observationCount} 款</strong></div>
              <Button type="button" className="h-11 rounded-xl px-3" disabled={saving || !hasEntry} onClick={() => void saveShipment()}>{saving ? <RefreshCw className="animate-spin" aria-hidden="true" /> : <PackagePlus aria-hidden="true" />}{saving ? "儲存中" : "儲存"}</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
