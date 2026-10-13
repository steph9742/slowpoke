import { pgTable, text, timestamp, pgEnum, jsonb, boolean, integer } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import { init } from "@paralleldrive/cuid2";

export const chartType = pgEnum('chart_type', ['pie', 'bar', 'area']);

const chartId = init({
  length: 10,
})

export const customChart = pgTable("custom_chart", {
  id: text("id").primaryKey().$default(() => chartId()),
  title: text("title").notNull(),
  description: text("description"),
  chartType: chartType("chart_type").notNull(),
  sqlQuery: text("sql_query").notNull(),
  mappingConfig: jsonb("mapping_config").default({}).notNull(),
  jsTransformer: text("js_transformer"),
  isActive: boolean("is_active").default(true).notNull(),
  gridOrder: integer("grid_order").default(0).notNull(),
  colSpan: integer("col_span").default(1).notNull(),
  creatorId: text("creator_id").notNull().references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});