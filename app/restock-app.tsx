"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  BarChart3,
  Boxes,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Cloud,
  History,
  LockKeyhole,
  MapPin,
  Minus,
  PackagePlus,
  Plus,
  RefreshCw,
  Store,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import { BRANCHES, BRANCH_BY_ID, PRODUCTS, PRODUCT_BY_ID } from "@/lib/catalog";
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

type DeliveryVisit = {
  id: string;
  date: string;
  branchId: string;
  source: string;
  createdAt: string;
  total: number;
  items: ShipmentRecord[];
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

function groupVisits(records: ShipmentRecord[]) {
  const grouped = new Map<string, DeliveryVisit>();
  records.forEach((record) => {
    const existing = grouped.get(record.visitId);
    if (existing) {
      existing.items.push(record);
      existing.total += record.quantity;
      return;
    }
    grouped.set(record.visitId, {
      id: record.visitId,
      date: record.date,
      branchId: record.branchId,
      source: record.source,
      createdAt: record.createdAt,
      total: record.quantity,
      items: [record],
    });
  });
  return [...grouped.values()].sort((a, b) =>
    `${b.date}:${b.createdAt}`.localeCompare(`${a.date}:${a.createdAt}`),
  );
}

export default function RestockApp() {
  const [records, setRecords] = useState<ShipmentRecord[]>(INITIAL_RECORDS);
  const [activeTab, setActiveTab] = useState("branches");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState(BRANCHES[0].id);
  const [shipmentDate, setShipmentDate] = useState(hongKongDate);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [pin, setPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncState, setSyncState] = useState<"loading" | "ready" | "offline">("loading");

  const loadRecords = useCallback(async () => {
    setSyncState("loading");
    try {
      const response = await fetch("/api/shipments", { cache: "no-store" });
      const data = (await response.json()) as { shipments?: ShipmentRecord[]; error?: string };
      if (!response.ok || !data.shipments) throw new Error(data.error ?? "未能同步");
      setRecords(data.shipments);
      setSyncState("ready");
    } catch (error) {
      console.error(error);
      setSyncState("offline");
    }
  }, []);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const openEntry = useCallback((branchId?: string) => {
    if (branchId && BRANCH_BY_ID[branchId]) setSelectedBranchId(branchId);
    setQuantities({});
    setShipmentDate(hongKongDate());
    setSheetOpen(true);
  }, []);

  useEffect(() => {
    const context = (document as Document & { modelContext?: WebMcpContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(
        context.registerTool(
          {
            name: "start_restock_entry",
            title: "開始新增補貨",
            description: "開啟南堂花茶補貨表，並可預先選定 DFI 分店。",
            inputSchema: {
              type: "object",
              properties: {
                branchId: {
                  type: "string",
                  enum: BRANCHES.map((branch) => branch.id),
                  description: "要新增補貨的分店代碼。",
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

  const visits = useMemo(() => groupVisits(records), [records]);
  const totalQuantity = useMemo(
    () => records.reduce((sum, record) => sum + record.quantity, 0),
    [records],
  );

  const branchStats = useMemo(
    () => BRANCHES.map((branch) => {
      const branchRecords = records.filter((record) => record.branchId === branch.id);
      const branchVisits = new Set(branchRecords.map((record) => record.visitId));
      const lastDate = branchRecords.reduce(
        (latest, record) => (record.date > latest ? record.date : latest),
        "",
      );
      return {
        ...branch,
        total: branchRecords.reduce((sum, record) => sum + record.quantity, 0),
        visits: branchVisits.size,
        lastDate,
      };
    }),
    [records],
  );

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
  const availableProducts = selectedBranch.productIds.map((productId) => PRODUCT_BY_ID[productId]);
  const entryTotal = Object.values(quantities).reduce((sum, quantity) => sum + quantity, 0);

  function changeQuantity(productId: string, change: number) {
    setQuantities((current) => ({
      ...current,
      [productId]: Math.min(999, Math.max(0, (current[productId] ?? 0) + change)),
    }));
  }

  async function saveShipment() {
    if (!entryTotal) {
      toast.error("請先填寫最少一款產品數量");
      return;
    }
    if (!/^\d{6,12}$/.test(pin)) {
      toast.error("請輸入管理密碼");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/shipments", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-pin": pin },
        body: JSON.stringify({
          date: shipmentDate,
          branchId: selectedBranchId,
          quantities: Object.entries(quantities)
            .filter(([, quantity]) => quantity > 0)
            .map(([productId, quantity]) => ({ productId, quantity })),
        }),
      });
      const data = (await response.json()) as { rows?: ShipmentRecord[]; error?: string };
      if (!response.ok || !data.rows) throw new Error(data.error ?? "儲存失敗");
      setRecords((current) => [...data.rows!, ...current]);
      setSyncState("ready");
      setSheetOpen(false);
      setQuantities({});
      setActiveTab("history");
      toast.success(`已儲存 ${selectedBranch.name} ${entryTotal} 盒`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "儲存失敗，請再試一次");
    } finally {
      setSaving(false);
    }
  }

  const maxBranchTotal = Math.max(...branchStats.map((branch) => branch.total), 1);
  const maxProductTotal = Math.max(...productTotals.map((product) => product.total), 1);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster position="top-center" richColors />

      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/92 backdrop-blur-xl">
        <div className="mx-auto flex min-h-18 max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-lg font-semibold text-primary-foreground shadow-sm shadow-primary/20">南</div>
            <div className="min-w-0">
              <p className="truncate text-sm text-muted-foreground">南堂花茶</p>
              <h1 className="truncate text-lg font-semibold tracking-tight sm:text-xl">DFI 分店補貨</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-1.5 rounded-full bg-secondary px-3 py-2 text-sm text-secondary-foreground sm:flex" aria-live="polite">
              {syncState === "loading" ? <RefreshCw className="size-4 animate-spin" aria-hidden="true" /> : syncState === "ready" ? <Cloud className="size-4" aria-hidden="true" /> : <CircleAlert className="size-4" aria-hidden="true" />}
              {syncState === "loading" ? "同步中" : syncState === "ready" ? "已同步" : "暫用歷史資料"}
            </div>
            <Button type="button" size="lg" className="hidden h-11 rounded-xl sm:inline-flex" onClick={() => openEntry()}>
              <Plus aria-hidden="true" />新增補貨
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-28 pt-5 sm:px-6 sm:pt-7">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="sticky top-[82px] z-20 grid h-12 w-full grid-cols-3 rounded-2xl border border-border/70 bg-card/92 p-1 shadow-sm backdrop-blur-xl sm:top-[86px] sm:mx-auto sm:max-w-md">
            <TabsTrigger value="branches" className="h-full rounded-xl text-sm"><Store aria-hidden="true" />分店</TabsTrigger>
            <TabsTrigger value="history" className="h-full rounded-xl text-sm"><History aria-hidden="true" />記錄</TabsTrigger>
            <TabsTrigger value="trends" className="h-full rounded-xl text-sm"><TrendingUp aria-hidden="true" />趨勢</TabsTrigger>
          </TabsList>

          <TabsContent value="branches" className="mt-5 space-y-5">
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="補貨摘要">
              <Card className="gap-2 border-primary/15 bg-primary py-4 text-primary-foreground shadow-md shadow-primary/15 sm:col-span-2">
                <CardContent className="px-4 sm:px-5">
                  <div className="mb-2 flex items-center justify-between gap-3"><span className="text-sm text-primary-foreground/80">累計補貨</span><Boxes className="size-5" aria-hidden="true" /></div>
                  <strong className="text-3xl font-semibold tabular-nums">{totalQuantity}</strong><span className="ml-1 text-sm">盒</span>
                </CardContent>
              </Card>
              <Card className="gap-2 border-border/80 bg-card py-4 shadow-sm"><CardContent className="px-4 sm:px-5"><span className="block text-sm text-muted-foreground">分店</span><strong className="mt-2 block text-2xl font-semibold tabular-nums">{BRANCHES.length} 間</strong></CardContent></Card>
              <Card className="gap-2 border-border/80 bg-card py-4 shadow-sm"><CardContent className="px-4 sm:px-5"><span className="block text-sm text-muted-foreground">補貨次數</span><strong className="mt-2 block text-2xl font-semibold tabular-nums">{visits.length} 次</strong></CardContent></Card>
            </section>

            <section aria-labelledby="branch-heading">
              <div className="mb-3 flex items-end justify-between gap-3">
                <div><h2 id="branch-heading" className="text-xl font-semibold tracking-tight">選擇分店</h2><p className="mt-1 text-sm text-muted-foreground">撳分店卡片即可記錄補貨</p></div>
                <Badge variant="secondary" className="gap-1.5 px-2.5 py-1"><CheckCircle2 className="size-3.5" aria-hidden="true" />2026 資料已校正</Badge>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {branchStats.map((branch) => (
                  <button type="button" key={branch.id} className="group min-h-44 rounded-[22px] border border-border/80 bg-card p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-lg hover:shadow-primary/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/30" onClick={() => openEntry(branch.id)}>
                    <span className="flex items-start justify-between gap-3">
                      <span><span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">{branch.retailBrand}</span><span className="block text-xl font-semibold tracking-tight">{branch.name}</span></span>
                      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground transition group-hover:bg-primary group-hover:text-primary-foreground"><ChevronRight className="size-5" aria-hidden="true" /></span>
                    </span>
                    <span className="mt-4 flex items-end justify-between gap-3 border-t border-border/70 pt-4">
                      <span><span className="block text-sm text-muted-foreground">累計</span><strong className="text-2xl font-semibold tabular-nums">{branch.total} 盒</strong></span>
                      <span className="text-right text-sm text-muted-foreground"><span className="block">{branch.productIds.length} 款產品</span><span className="block">最近 {branch.lastDate ? formatDate(branch.lastDate) : "—"}</span></span>
                    </span>
                    <span className="mt-3 flex items-start gap-1.5 text-sm text-muted-foreground"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span>{branch.address}</span></span>
                  </button>
                ))}
              </div>
            </section>

            <Card className="gap-4 border-border/80 bg-card py-5 shadow-sm">
              <CardHeader className="px-5"><CardTitle className="flex items-center gap-2 text-base"><ClipboardList className="size-5 text-primary" aria-hidden="true" />最近補貨</CardTitle></CardHeader>
              <CardContent className="space-y-3 px-5">
                {visits.slice(0, 3).map((visit) => (
                  <div key={visit.id} className="flex items-center justify-between gap-4 border-t border-border/70 pt-3 first:border-0 first:pt-0">
                    <div className="min-w-0"><p className="truncate font-medium">{BRANCH_BY_ID[visit.branchId]?.name}</p><p className="truncate text-sm text-muted-foreground">{visit.items.map((item) => PRODUCT_BY_ID[item.productId]?.name).join("、")}</p></div>
                    <div className="shrink-0 text-right"><strong className="block tabular-nums">{visit.total} 盒</strong><span className="text-sm text-muted-foreground">{formatDate(visit.date)}</span></div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="mt-5">
            <div className="mb-4 flex items-end justify-between gap-3"><div><h2 className="text-xl font-semibold tracking-tight">補貨記錄</h2><p className="mt-1 text-sm text-muted-foreground">每次到店補貨合併為一項</p></div><Badge variant="outline" className="tabular-nums">{visits.length} 次</Badge></div>
            <div className="space-y-3">
              {visits.map((visit) => (
                <Card key={visit.id} className="gap-3 border-border/80 bg-card py-4 shadow-sm">
                  <CardHeader className="grid grid-cols-[1fr_auto] items-start gap-4 px-4 sm:px-5">
                    <div><CardTitle className="text-base">{BRANCH_BY_ID[visit.branchId]?.name ?? visit.branchId}</CardTitle><CardDescription className="mt-1 flex items-center gap-1.5"><CalendarDays className="size-4" aria-hidden="true" />{formatDate(visit.date, true)}{visit.source === "web" ? <Badge variant="secondary" className="ml-1">網頁新增</Badge> : null}</CardDescription></div>
                    <strong className="text-xl font-semibold text-primary tabular-nums">{visit.total} 盒</strong>
                  </CardHeader>
                  <CardContent className="grid gap-2 px-4 sm:grid-cols-2 sm:px-5">
                    {visit.items.slice().sort((a, b) => a.productId.localeCompare(b.productId)).map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-secondary/70 px-3 py-2.5 text-sm"><span>{PRODUCT_BY_ID[item.productId]?.name ?? item.productId}</span><strong className="shrink-0 tabular-nums">{item.quantity} 盒</strong></div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="trends" className="mt-5 space-y-4">
            <div><h2 className="text-xl font-semibold tracking-tight">出貨趨勢</h2><p className="mt-1 text-sm text-muted-foreground">所有圖表會隨新增補貨自動更新</p></div>
            <Card className="gap-4 border-border/80 bg-card py-5 shadow-sm">
              <CardHeader className="px-4 sm:px-5"><CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="size-5 text-primary" aria-hidden="true" />每月補貨盒數</CardTitle><CardDescription>{monthlyTrend[0]?.month.replace("-", "年")}月至 {monthlyTrend.at(-1)?.month.replace("-", "年")}月</CardDescription></CardHeader>
              <CardContent className="px-2 sm:px-5">
                <ChartContainer config={trendConfig} className="h-[260px] w-full">
                  <AreaChart data={monthlyTrend} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                    <defs><linearGradient id="quantity-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--color-quantity)" stopOpacity={0.42} /><stop offset="95%" stopColor="var(--color-quantity)" stopOpacity={0.04} /></linearGradient></defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} />
                    <YAxis tickLine={false} axisLine={false} width={38} allowDecimals={false} />
                    <ChartTooltip cursor={{ stroke: "var(--border)" }} content={<ChartTooltipContent indicator="line" />} />
                    <Area type="monotone" dataKey="quantity" stroke="var(--color-quantity)" strokeWidth={3} fill="url(#quantity-fill)" />
                  </AreaChart>
                </ChartContainer>
              </CardContent>
            </Card>
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="gap-4 border-border/80 bg-card py-5 shadow-sm"><CardHeader className="px-5"><CardTitle className="text-base">分店累計</CardTitle></CardHeader><CardContent className="space-y-4 px-5">{branchStats.slice().sort((a, b) => b.total - a.total).map((branch) => <div key={branch.id}><div className="mb-2 flex items-center justify-between gap-3 text-sm"><span>{branch.name}</span><strong className="tabular-nums">{branch.total} 盒</strong></div><Progress value={(branch.total / maxBranchTotal) * 100} aria-label={`${branch.name} ${branch.total}盒`} /></div>)}</CardContent></Card>
              <Card className="gap-4 border-border/80 bg-card py-5 shadow-sm"><CardHeader className="px-5"><CardTitle className="text-base">產品累計</CardTitle></CardHeader><CardContent className="space-y-4 px-5">{productTotals.map((product) => <div key={product.id}><div className="mb-2 flex items-center justify-between gap-3 text-sm"><span>{product.name}</span><strong className="tabular-nums">{product.total} 盒</strong></div><Progress value={(product.total / maxProductTotal) * 100} aria-label={`${product.name} ${product.total}盒`} /></div>)}</CardContent></Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <Button type="button" size="lg" className="fixed bottom-[max(20px,env(safe-area-inset-bottom))] right-4 z-40 h-14 rounded-2xl px-5 shadow-xl shadow-primary/25 sm:hidden" onClick={() => openEntry()}><PackagePlus className="size-5" aria-hidden="true" />新增補貨</Button>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="mx-auto max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-[28px] border-primary/20 bg-background px-0 pb-[max(14px,env(safe-area-inset-bottom))]">
          <SheetHeader className="border-b border-border/70 px-5 pb-4 pt-5 text-left sm:px-6"><div className="pr-10"><SheetTitle className="text-xl">新增補貨</SheetTitle><SheetDescription className="mt-1">一次填妥同日、同一分店的所有產品</SheetDescription></div></SheetHeader>
          <div className="space-y-5 px-5 pb-3 sm:px-6">
            <div className="grid gap-4 sm:grid-cols-[1.25fr_1fr]">
              <div className="space-y-2 [&>[data-slot=native-select-wrapper]]:w-full"><Label htmlFor="branch-select">分店</Label><NativeSelect id="branch-select" value={selectedBranchId} className="h-12 rounded-xl bg-card text-base sm:text-base" onChange={(event) => { setSelectedBranchId(event.target.value); setQuantities({}); }}>{BRANCHES.map((branch) => <NativeSelectOption key={branch.id} value={branch.id}>{branch.name} · {branch.retailBrand}</NativeSelectOption>)}</NativeSelect></div>
              <div className="space-y-2"><Label htmlFor="shipment-date">補貨日期</Label><Input id="shipment-date" type="date" value={shipmentDate} className="h-12 rounded-xl bg-card text-base sm:text-base" onChange={(event) => setShipmentDate(event.target.value)} /></div>
            </div>
            <div className="rounded-2xl bg-secondary/75 px-4 py-3"><p className="font-medium">{selectedBranch.name}</p><p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{selectedBranch.address}</p></div>
            <fieldset>
              <legend className="font-semibold">補貨數量</legend><p className="mb-3 mt-1 text-sm text-muted-foreground">款式按過往出貨記錄顯示</p>
              <div className="divide-y divide-border/70 overflow-hidden rounded-2xl border border-border/80 bg-card">
                {availableProducts.map((product) => {
                  const quantity = quantities[product.id] ?? 0;
                  return <div key={product.id} className="flex min-h-18 items-center justify-between gap-3 px-3 py-2.5 sm:px-4">
                    <div className="min-w-0"><p className="truncate font-medium">{product.name}</p><p className="text-xs text-muted-foreground">SKU {product.id}</p></div>
                    <div className="grid shrink-0 grid-cols-[44px_54px_44px] items-center gap-1">
                      <Button type="button" variant="outline" size="icon" className="size-11 rounded-xl" aria-label={`${product.name}減一盒`} onClick={() => changeQuantity(product.id, -1)} disabled={quantity === 0}><Minus aria-hidden="true" /></Button>
                      <Input type="number" min="0" max="999" inputMode="numeric" aria-label={`${product.name}數量`} value={quantity} className="h-11 rounded-xl px-1 text-center text-base font-semibold tabular-nums sm:text-base" onChange={(event) => { const value = Math.min(999, Math.max(0, Number(event.target.value) || 0)); setQuantities((current) => ({ ...current, [product.id]: value })); }} />
                      <Button type="button" variant="secondary" size="icon" className="size-11 rounded-xl" aria-label={`${product.name}加一盒`} onClick={() => changeQuantity(product.id, 1)}><Plus aria-hidden="true" /></Button>
                    </div>
                  </div>;
                })}
              </div>
            </fieldset>
            <div className="space-y-2"><Label htmlFor="admin-pin" className="flex items-center gap-2"><LockKeyhole className="size-4 text-primary" aria-hidden="true" />管理密碼</Label><Input id="admin-pin" type="password" inputMode="numeric" autoComplete="current-password" placeholder="只在新增記錄時需要" value={pin} className="h-12 rounded-xl bg-card text-base sm:text-base" onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 12))} /><p className="text-xs text-muted-foreground">瀏覽分店、記錄及趨勢毋須登入</p></div>
            <div className="sticky bottom-0 -mx-5 flex items-center justify-between gap-4 border-t border-border/80 bg-background/95 px-5 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6"><div><span className="block text-sm text-muted-foreground">今次合計</span><strong className="text-2xl font-semibold tabular-nums">{entryTotal} 盒</strong></div><Button type="button" size="lg" className="h-12 min-w-36 rounded-xl" disabled={saving || entryTotal === 0} onClick={() => void saveShipment()}>{saving ? <RefreshCw className="animate-spin" aria-hidden="true" /> : <PackagePlus aria-hidden="true" />}{saving ? "儲存中" : "儲存記錄"}</Button></div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
