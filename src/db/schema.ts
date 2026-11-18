import {
  pgTable, serial, bigserial, integer, text, boolean, timestamp, jsonb, date, index, uniqueIndex, primaryKey,
} from "drizzle-orm/pg-core";

export type Role = "admin" | "editor" | "viewer";
export type PostStatus = "draft" | "needs_approval" | "scheduled" | "publishing" | "published" | "partly_published"
  | "failed" | "cancelled";
/** held = waiting for approval (not sent by the queue or the sweep). */
export type TargetStatus = "held" | "scheduled" | "publishing" | "published" | "failed" | "cancelled";

const ts = (n: string) => timestamp(n, { withTimezone: true });

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").$type<Role>().notNull().default("editor"),
  active: boolean("active").notNull().default(true),
  createdAt: ts("created_at").notNull().defaultNow(),
  lastLoginAt: ts("last_login_at"),
}, (t) => [uniqueIndex("users_email_uq").on(t.email)]);

/** Key/value app settings: approval_required, default_timezone, linkedin_version_ok … */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const socialAccounts = pgTable("social_accounts", {
  id: serial("id").primaryKey(),
  platform: text("platform").notNull(),                 // linkedin | facebook | instagram …
  kind: text("kind").$type<"page" | "profile">().notNull(),
  externalId: text("external_id").notNull(),            // organization id or person id
  urn: text("urn").notNull(),                           // urn:li:organization:… / urn:li:person:…
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  color: text("color").notNull().default("#2563eb"),
  tokenEnc: text("token_enc").notNull(),                // AES-GCM, see src/lib/crypto.ts
  refreshEnc: text("refresh_enc"),
  tokenExpiresAt: ts("token_expires_at"),
  refreshExpiresAt: ts("refresh_expires_at"),
  scopes: text("scopes"),
  status: text("status").$type<"active" | "expired" | "error" | "disconnected">().notNull().default("active"),
  lastError: text("last_error"),
  connectedBy: integer("connected_by").references(() => users.id),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("accounts_platform_urn_uq").on(t.platform, t.urn)]);

/** Short-lived: after a Page owner signs in we list their Pages and let them pick which to add. */
export const connectSessions = pgTable("connect_sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  platform: text("platform").notNull(),
  kind: text("kind").notNull(),
  tokenEnc: text("token_enc").notNull(),
  refreshEnc: text("refresh_enc"),
  tokenExpiresAt: ts("token_expires_at"),
  refreshExpiresAt: ts("refresh_expires_at"),
  scopes: text("scopes"),
  options: jsonb("options").$type<{ id: string; urn: string; name: string; avatarUrl?: string | null; role?: string }[]>().notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const hashtagSets = pgTable("hashtag_sets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  tags: text("tags").notNull(),                         // "#internships #careers"
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const linkSets = pgTable("link_sets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  utmSource: text("utm_source").notNull().default("linkedin"),
  utmMedium: text("utm_medium").notNull().default("social"),
  utmCampaign: text("utm_campaign").notNull().default(""),
  track: boolean("track").notNull().default(true),     // wrap in our /r/<code> click counter
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const templates = pgTable("templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  body: text("body").notNull(),                         // text with {{placeholders}}
  imageUrl: text("image_url"),
  linkUrl: text("link_url"),
  hashtagSetId: integer("hashtag_set_id").references(() => hashtagSets.id, { onDelete: "set null" }),
  linkSetId: integer("link_set_id").references(() => linkSets.id, { onDelete: "set null" }),
  accountIds: jsonb("account_ids").$type<number[]>().notNull().default([]),
  rrule: text("rrule"),                                 // default repeat, e.g. FREQ=WEEKLY;BYDAY=TU
  time: text("time"),                                   // default time of day "10:00"
  createdBy: integer("created_by").references(() => users.id),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  text: text("text").notNull(),
  linkUrl: text("link_url"),
  linkTitle: text("link_title"),
  imageUrl: text("image_url"),
  templateId: integer("template_id").references(() => templates.id, { onDelete: "set null" }),
  hashtagSetId: integer("hashtag_set_id").references(() => hashtagSets.id, { onDelete: "set null" }),
  linkSetId: integer("link_set_id").references(() => linkSets.id, { onDelete: "set null" }),
  scheduledAt: ts("scheduled_at"),
  timezone: text("timezone").notNull().default("Europe/Malta"),
  rrule: text("rrule"),
  seriesId: integer("series_id"),                       // first post of a repeating series
  status: text("status").$type<PostStatus>().notNull().default("draft"),
  createdBy: integer("created_by").references(() => users.id),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: ts("approved_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
}, (t) => [index("posts_scheduled_idx").on(t.scheduledAt), index("posts_status_idx").on(t.status)]);

export const postTargets = pgTable("post_targets", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  accountId: integer("account_id").notNull().references(() => socialAccounts.id, { onDelete: "cascade" }),
  status: text("status").$type<TargetStatus>().notNull().default("scheduled"),
  scheduledAt: ts("scheduled_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
  externalId: text("external_id"),                      // urn:li:share:… / urn:li:ugcPost:…
  url: text("url"),
  error: text("error"),
  linkCode: text("link_code"),                          // our tracked link /r/<code>
  qstashId: text("qstash_id"),
  lockedAt: ts("locked_at"),
  publishedAt: ts("published_at"),
  statsAt: ts("stats_at"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("targets_post_account_uq").on(t.postId, t.accountId),
  uniqueIndex("targets_link_code_uq").on(t.linkCode),
  index("targets_status_time_idx").on(t.status, t.scheduledAt),
  index("targets_account_idx").on(t.accountId, t.publishedAt),
]);

export const postStats = pgTable("post_stats", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  targetId: integer("target_id").notNull().references(() => postTargets.id, { onDelete: "cascade" }),
  at: ts("at").notNull().defaultNow(),
  impressions: integer("impressions"),
  uniqueImpressions: integer("unique_impressions"),
  reactions: integer("reactions"),
  comments: integer("comments"),
  shares: integer("shares"),
  clicks: integer("clicks"),
}, (t) => [index("stats_target_at_idx").on(t.targetId, t.at)]);

export const linkClicks = pgTable("link_clicks", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  targetId: integer("target_id").notNull().references(() => postTargets.id, { onDelete: "cascade" }),
  at: ts("at").notNull().defaultNow(),
  referrer: text("referrer"),
}, (t) => [index("clicks_target_at_idx").on(t.targetId, t.at)]);

/** Daily rollup per account, rebuilt by the sweep so reports never scan raw rows. */
export const statsDaily = pgTable("stats_daily", {
  day: date("day").notNull(),
  accountId: integer("account_id").notNull().references(() => socialAccounts.id, { onDelete: "cascade" }),
  posts: integer("posts").notNull().default(0),
  impressions: integer("impressions").notNull().default(0),
  reactions: integer("reactions").notNull().default(0),
  comments: integer("comments").notNull().default(0),
  shares: integer("shares").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  linkClicks: integer("link_clicks").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.day, t.accountId] })]);

export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  detail: text("detail"),
  at: ts("at").notNull().defaultNow(),
}, (t) => [index("audit_at_idx").on(t.at)]);

export const loginAttempts = pgTable("login_attempts", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  key: text("key").notNull(),
  at: ts("at").notNull().defaultNow(),
}, (t) => [index("login_key_at_idx").on(t.key, t.at)]);
