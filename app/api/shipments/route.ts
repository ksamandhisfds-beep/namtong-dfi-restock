import { env } from "cloudflare:workers";
import { BRANCH_BY_ID, PRODUCT_BY_ID } from "@/lib/catalog";
import { HISTORICAL_SHIPMENTS } from "@/lib/seed-shipments";

const DATASET_VERSION = "1.1";

type ShipmentRow = {
  id: string;
  visit_id: string;
  shipment_date: string;
  branch_id: string;
  product_id: string;
  quantity: number;
  source: string;
  created_at: string;
};

type ShelfObservationRow = {
  id: string;
  visit_id: string;
  observed_date: string;
  branch_id: string;
  product_id: string;
  remaining_quantity: number;
  shelf_not_full: number;
  source: string;
  created_at: string;
};

function getDatabase() {
  if (!env.DB) {
    throw new Error("資料庫暫時未能連接，請稍後再試。");
  }
  return env.DB;
}

async function ensureHistoricalData() {
  const database = getDatabase();
  const seeded = await database
    .prepare("SELECT value FROM app_meta WHERE key = ?")
    .bind("dataset_version")
    .first<{ value: string }>();

  if (seeded?.value === DATASET_VERSION) return;

  const statements = HISTORICAL_SHIPMENTS.map((record) =>
    database
      .prepare(
        `INSERT OR IGNORE INTO shipments
          (id, visit_id, shipment_date, branch_id, product_id, quantity, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        record.id,
        `excel:${record.branchId}:${record.date}`,
        record.date,
        record.branchId,
        record.productId,
        record.quantity,
        "excel_v1_1",
        `${record.date}T12:00:00.000Z`,
      ),
  );

  for (let index = 0; index < statements.length; index += 40) {
    await database.batch(statements.slice(index, index + 40));
  }

  await database
    .prepare(
      `INSERT INTO app_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .bind("dataset_version", DATASET_VERSION)
    .run();
}

function responseWithNoStore(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { ...init, headers });
}

export async function GET() {
  try {
    await ensureHistoricalData();
    const database = getDatabase();
    const [shipmentResult, observationResult] = await Promise.all([
      database
        .prepare(
          `SELECT id, visit_id, shipment_date, branch_id, product_id,
                  quantity, source, created_at
           FROM shipments
           ORDER BY shipment_date DESC, created_at DESC, id DESC`,
        )
        .all<ShipmentRow>(),
      database
        .prepare(
          `SELECT id, visit_id, observed_date, branch_id, product_id,
                  remaining_quantity, shelf_not_full, source, created_at
           FROM shelf_observations
           ORDER BY observed_date DESC, created_at DESC, id DESC`,
        )
        .all<ShelfObservationRow>(),
    ]);

    return responseWithNoStore({
      shipments: (shipmentResult.results ?? []).map((row) => ({
        id: row.id,
        visitId: row.visit_id,
        date: row.shipment_date,
        branchId: row.branch_id,
        productId: row.product_id,
        quantity: row.quantity,
        source: row.source,
        createdAt: row.created_at,
      })),
      observations: (observationResult.results ?? []).map((row) => ({
        id: row.id,
        visitId: row.visit_id,
        date: row.observed_date,
        branchId: row.branch_id,
        productId: row.product_id,
        remainingQuantity: row.remaining_quantity,
        shelfNotFull: Boolean(row.shelf_not_full),
        source: row.source,
        createdAt: row.created_at,
      })),
      datasetVersion: DATASET_VERSION,
    });
  } catch (error) {
    console.error("Unable to load shipments", error);
    return responseWithNoStore(
      { error: error instanceof Error ? error.message : "未能讀取補貨記錄。" },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const suppliedPin = request.headers.get("x-admin-pin") ?? "";
    if (!env.ADMIN_PIN || suppliedPin !== env.ADMIN_PIN) {
      return responseWithNoStore(
        { error: "管理密碼不正確，未有儲存任何資料。" },
        { status: 401 },
      );
    }

    const payload = (await request.json()) as {
      date?: string;
      branchId?: string;
      items?: Array<{
        productId?: string;
        quantity?: number;
        remainingQuantity?: number | null;
        shelfNotFull?: boolean;
      }>;
    };

    const date = payload.date?.trim() ?? "";
    const branchId = payload.branchId?.trim() ?? "";
    const branch = BRANCH_BY_ID[branchId];
    const items = (payload.items ?? []).filter(
      (item) =>
        (Number.isInteger(item.quantity) && Number(item.quantity) > 0) ||
        (Number.isInteger(item.remainingQuantity) && Number(item.remainingQuantity) >= 0),
    );

    if (!/^20\d{2}-\d{2}-\d{2}$/.test(date)) {
      return responseWithNoStore({ error: "請選擇正確日期。" }, { status: 400 });
    }
    if (!branch) {
      return responseWithNoStore({ error: "請選擇有效分店。" }, { status: 400 });
    }
    if (!items.length) {
      return responseWithNoStore({ error: "最少要填寫一款產品的餘量或補貨數量。" }, { status: 400 });
    }

    for (const item of items) {
      const productId = item.productId ?? "";
      const quantity = Number(item.quantity ?? 0);
      const remainingQuantity = item.remainingQuantity;
      if (
        !PRODUCT_BY_ID[productId] ||
        !branch.productIds.includes(productId) ||
        !Number.isInteger(quantity) ||
        quantity < 0 ||
        quantity > 999 ||
        (remainingQuantity !== null &&
          remainingQuantity !== undefined &&
          (!Number.isInteger(remainingQuantity) || remainingQuantity < 0 || remainingQuantity > 999))
      ) {
        return responseWithNoStore(
          { error: "產品或數量有誤，請重新檢查。" },
          { status: 400 },
        );
      }
    }

    await ensureHistoricalData();
    const database = getDatabase();
    const createdAt = new Date().toISOString();
    const visitId = `web:${crypto.randomUUID()}`;
    const rows = items.filter((item) => Number(item.quantity ?? 0) > 0).map((item, index) => ({
      id: `${visitId}:shipment:${index + 1}`,
      visitId,
      date,
      branchId,
      productId: item.productId as string,
      quantity: Number(item.quantity),
      source: "web",
      createdAt,
    }));

    const observations = items
      .filter((item) => item.remainingQuantity !== null && item.remainingQuantity !== undefined)
      .map((item, index) => ({
        id: `${visitId}:observation:${index + 1}`,
        visitId,
        date,
        branchId,
        productId: item.productId as string,
        remainingQuantity: Number(item.remainingQuantity),
        shelfNotFull: Boolean(item.shelfNotFull),
        source: "web",
        createdAt,
      }));

    const shipmentStatements = rows.map((row) =>
      database
        .prepare(
          `INSERT INTO shipments
            (id, visit_id, shipment_date, branch_id, product_id, quantity, source, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          row.id,
          row.visitId,
          row.date,
          row.branchId,
          row.productId,
          row.quantity,
          row.source,
          row.createdAt,
        ),
    );
    const observationStatements = observations.map((observation) =>
      database
        .prepare(
          `INSERT INTO shelf_observations
            (id, visit_id, observed_date, branch_id, product_id,
             remaining_quantity, shelf_not_full, source, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          observation.id,
          observation.visitId,
          observation.date,
          observation.branchId,
          observation.productId,
          observation.remainingQuantity,
          observation.shelfNotFull ? 1 : 0,
          observation.source,
          observation.createdAt,
        ),
    );
    await database.batch([...shipmentStatements, ...observationStatements]);

    return responseWithNoStore({ rows, observations }, { status: 201 });
  } catch (error) {
    console.error("Unable to save shipment", error);
    return responseWithNoStore(
      { error: error instanceof Error ? error.message : "儲存失敗，請稍後再試。" },
      { status: 500 },
    );
  }
}
