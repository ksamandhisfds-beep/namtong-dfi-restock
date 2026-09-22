import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const shipments = sqliteTable(
  "shipments",
  {
    id: text("id").primaryKey(),
    visitId: text("visit_id").notNull(),
    shipmentDate: text("shipment_date").notNull(),
    branchId: text("branch_id").notNull(),
    productId: text("product_id").notNull(),
    quantity: integer("quantity").notNull(),
    source: text("source").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_shipments_date").on(table.shipmentDate),
    index("idx_shipments_branch_date").on(table.branchId, table.shipmentDate),
    index("idx_shipments_product_date").on(table.productId, table.shipmentDate),
    index("idx_shipments_visit").on(table.visitId),
  ],
);

export const appMeta = sqliteTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const shelfObservations = sqliteTable(
  "shelf_observations",
  {
    id: text("id").primaryKey(),
    visitId: text("visit_id").notNull(),
    observedDate: text("observed_date").notNull(),
    branchId: text("branch_id").notNull(),
    productId: text("product_id").notNull(),
    remainingQuantity: integer("remaining_quantity").notNull(),
    shelfNotFull: integer("shelf_not_full", { mode: "boolean" }).notNull().default(false),
    source: text("source").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_shelf_observations_branch_date").on(table.branchId, table.observedDate),
    index("idx_shelf_observations_product_date").on(table.productId, table.observedDate),
    index("idx_shelf_observations_visit").on(table.visitId),
  ],
);
