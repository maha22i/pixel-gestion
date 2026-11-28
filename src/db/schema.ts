import {
  pgTable, serial, text, integer, boolean, timestamp, date, numeric, primaryKey, index, uniqueIndex, jsonb, doublePrecision,
} from "drizzle-orm/pg-core";

// ─── Utilisateurs & droits ───────────────────────────────────────────────
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("technician"), // admin | manager | technician
  active: boolean("active").notNull().default(true),
  jobTitle: text("job_title"),
  phone: text("phone"),
  color: text("color").notNull().default("#2C3E50"),
  avatarPath: text("avatar_path"),
  notifyPrefs: jsonb("notify_prefs").notNull().default({}),
  attendanceConsentAt: timestamp("attendance_consent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ emailIdx: uniqueIndex("users_email_idx").on(t.email) }));

export const permissions = pgTable("permissions", {
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  module: text("module").notNull(),
  level: text("level").notNull().default("none"), // none | own | read | write
}, (t) => ({ pk: primaryKey({ columns: [t.userId, t.module] }) }));

/** Droits par défaut de chaque rôle ; les lignes de `permissions` d'un utilisateur les remplacent. */
export const rolePermissions = pgTable("role_permissions", {
  role: text("role").notNull(),
  module: text("module").notNull(),
  level: text("level").notNull().default("none"),
}, (t) => ({ pk: primaryKey({ columns: [t.role, t.module] }) }));

// ─── Paramètres société (une seule ligne, id = 1) ─────────────────────────
export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  companyName: text("company_name").notNull().default("Pixel Nomade"),
  tagline: text("tagline").notNull().default("Agence de communication multimédia & production audiovisuelle"),
  address: text("address").notNull().default("Saline Ouest, Djibouti"),
  phone: text("phone").notNull().default("+253 77 36 06 07"),
  email: text("email").notNull().default("pixelnomadedj@gmail.com"),
  website: text("website").notNull().default("pixel-nomade.com"),
  paymentMethods: text("payment_methods").notNull().default("Virement bancaire · WAAFI · CACPAY · D-Money · Espèces"),
  paymentTerms: text("payment_terms").notNull().default("50 % d'acompte à la signature du devis, 50 % à la livraison."),
  quoteValidityDays: integer("quote_validity_days").notNull().default(30),
  footerNote: text("footer_note").notNull().default("Agence agréée par le Ministère de la Communication"),
  signatoryName: text("signatory_name").notNull().default("Aboubaker Adoyta Hassan"),
  signatoryTitle: text("signatory_title").notNull().default("Gérant"),
  registrationNumber: text("registration_number").notNull().default(""),
  logoPath: text("logo_path"),
  signaturePath: text("signature_path"),
  smtpHost: text("smtp_host").notNull().default(""),
  smtpPort: integer("smtp_port").notNull().default(587),
  smtpUser: text("smtp_user").notNull().default(""),
  smtpPassword: text("smtp_password").notNull().default(""),
  smtpFrom: text("smtp_from").notNull().default(""),
  smtpSecure: boolean("smtp_secure").notNull().default(false),
  appUrl: text("app_url").notNull().default(""),
  /** Clé OpenAI chiffrée (jamais renvoyée au navigateur). */
  aiApiKey: text("ai_api_key").notNull().default(""),
  aiModel: text("ai_model").notNull().default("gpt-4.1-mini"),
  aiEnabled: boolean("ai_enabled").notNull().default(false),
});

export const counters = pgTable("counters", {
  key: text("key").primaryKey(),
  value: integer("value").notNull().default(0),
});

// ─── Clients ─────────────────────────────────────────────────────────────
export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  type: text("type").notNull().default("particulier"),
  name: text("name").notNull(),
  acronym: text("acronym"),
  nif: text("nif"),
  repCivility: text("rep_civility"),
  repName: text("rep_name"),
  repTitle: text("rep_title"),
  contactName: text("contact_name"),
  contactRole: text("contact_role"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Catalogue ───────────────────────────────────────────────────────────
export const catalogItems = pgTable("catalog_items", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull().default("service"), // service | produit
  name: text("name").notNull(),
  description: text("description"),
  category: text("category"),
  unit: text("unit").notNull().default("forfait"),
  unitPrice: integer("unit_price").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const eventTypes = pgTable("event_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  priceDjibouti: integer("price_djibouti").notNull().default(0),
  priceRegions: integer("price_regions").notNull().default(0),
  position: integer("position").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

// ─── Projets ─────────────────────────────────────────────────────────────
export const projectCategories = pgTable("project_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").references(() => clients.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  type: text("type").notNull(), // mariage | prive | public | autonome
  nature: text("nature").notNull().default("client"), // client | interne
  categoryId: integer("category_id").references(() => projectCategories.id, { onDelete: "set null" }),
  ownerId: integer("owner_id").references(() => users.id, { onDelete: "set null" }),
  priority: text("priority").notNull().default("normale"),
  brief: text("brief"),
  status: text("status").notNull().default("prospect"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  location: text("location"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ clientIdx: index("projects_client_idx").on(t.clientId) }));

export const projectMembers = pgTable("project_members", {
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
}, (t) => ({ pk: primaryKey({ columns: [t.projectId, t.userId] }) }));

export const projectEventTypes = pgTable("project_event_types", {
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  eventTypeId: integer("event_type_id").notNull().references(() => eventTypes.id, { onDelete: "cascade" }),
  eventDate: date("event_date"),
}, (t) => ({ pk: primaryKey({ columns: [t.projectId, t.eventTypeId] }) }));

// ─── Devis ───────────────────────────────────────────────────────────────
export const quotes = pgTable("quotes", {
  id: serial("id").primaryKey(),
  number: text("number").notNull(),
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "restrict" }),
  projectId: integer("project_id").references(() => projects.id, { onDelete: "set null" }),
  subject: text("subject").notNull(),
  issueDate: date("issue_date").notNull(),
  validUntil: date("valid_until"),
  status: text("status").notNull().default("brouillon"), // brouillon | envoye | accepte | refuse | expire
  discount: integer("discount").notNull().default(0), // remise globale en FDJ
  depositPercent: integer("deposit_percent").notNull().default(50),
  subtotal: integer("subtotal").notNull().default(0),
  total: integer("total").notNull().default(0),
  notes: text("notes"),
  signToken: text("sign_token"),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  signerName: text("signer_name"),
  signatureData: text("signature_data"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  sentVia: text("sent_via"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  numberIdx: uniqueIndex("quotes_number_idx").on(t.number),
  signIdx: uniqueIndex("quotes_sign_token_idx").on(t.signToken),
}));

export const quoteItems = pgTable("quote_items", {
  id: serial("id").primaryKey(),
  quoteId: integer("quote_id").notNull().references(() => quotes.id, { onDelete: "cascade" }),
  catalogItemId: integer("catalog_item_id").references(() => catalogItems.id, { onDelete: "set null" }),
  eventTypeId: integer("event_type_id").references(() => eventTypes.id, { onDelete: "set null" }),
  designation: text("designation").notNull(),
  description: text("description"),
  quantity: numeric("quantity", { precision: 10, scale: 2 }).notNull().default("1"),
  unit: text("unit"),
  unitPrice: integer("unit_price").notNull().default(0),
  discountPct: integer("discount_pct").notNull().default(0),
  total: integer("total").notNull().default(0),
  position: integer("position").notNull().default(0),
});

// ─── Factures ────────────────────────────────────────────────────────────
export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  number: text("number").notNull(),
  quoteId: integer("quote_id").references(() => quotes.id, { onDelete: "set null" }),
  clientId: integer("client_id").notNull().references(() => clients.id, { onDelete: "restrict" }),
  projectId: integer("project_id").references(() => projects.id, { onDelete: "set null" }),
  subject: text("subject").notNull(),
  issueDate: date("issue_date").notNull(),
  status: text("status").notNull().default("emise"), // emise | annulee
  discount: integer("discount").notNull().default(0),
  subtotal: integer("subtotal").notNull().default(0),
  total: integer("total").notNull().default(0),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ numberIdx: uniqueIndex("invoices_number_idx").on(t.number) }));

export const invoiceItems = pgTable("invoice_items", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  catalogItemId: integer("catalog_item_id").references(() => catalogItems.id, { onDelete: "set null" }),
  eventTypeId: integer("event_type_id").references(() => eventTypes.id, { onDelete: "set null" }),
  designation: text("designation").notNull(),
  description: text("description"),
  quantity: numeric("quantity", { precision: 10, scale: 2 }).notNull().default("1"),
  unit: text("unit"),
  unitPrice: integer("unit_price").notNull().default(0),
  discountPct: integer("discount_pct").notNull().default(0),
  total: integer("total").notNull().default(0),
  position: integer("position").notNull().default(0),
});

export const installments = pgTable("installments", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  amount: integer("amount").notNull(),
  dueDate: date("due_date"),
  position: integer("position").notNull().default(0),
});

// ─── Paiements ───────────────────────────────────────────────────────────
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  receiptNumber: text("receipt_number").notNull(),
  invoiceId: integer("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  amount: integer("amount").notNull(),
  method: text("method").notNull(), // waafi | cacpay | dmoney | virement | especes
  reference: text("reference"),
  notes: text("notes"),
  proofFilename: text("proof_filename"),
  proofStored: text("proof_stored"),
  proofMime: text("proof_mime"),
  proofSize: integer("proof_size"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ invIdx: index("payments_invoice_idx").on(t.invoiceId) }));

// ─── Dépenses ────────────────────────────────────────────────────────────
export const expenses = pgTable("expenses", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  supplier: text("supplier"),
  amount: integer("amount").notNull(),
  method: text("method"),
  projectId: integer("project_id").references(() => projects.id, { onDelete: "set null" }),
  proofFilename: text("proof_filename"),
  proofStored: text("proof_stored"),
  proofMime: text("proof_mime"),
  proofSize: integer("proof_size"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Contrats ────────────────────────────────────────────────────────────
export const contracts = pgTable("contracts", {
  id: serial("id").primaryKey(),
  number: text("number"),
  status: text("status").notNull().default("brouillon"),
  clientId: integer("client_id").references(() => clients.id, { onDelete: "restrict" }),
  projectId: integer("project_id").references(() => projects.id, { onDelete: "set null" }),
  quoteId: integer("quote_id").references(() => quotes.id, { onDelete: "set null" }),
  templateName: text("template_name"),
  title: text("title").notNull().default(""),
  subtitle: text("subtitle").notNull().default(""),
  preamble: text("preamble").notNull().default(""),
  startDate: date("start_date"),
  endDate: date("end_date"),
  durationValue: integer("duration_value"),
  durationUnit: text("duration_unit").notNull().default("months"),
  signatureDate: date("signature_date"),
  signaturePlace: text("signature_place").notNull().default("Djibouti"),
  amountMode: text("amount_mode").notNull().default("monthly"),
  monthlyAmount: integer("monthly_amount").notNull().default(0),
  totalAmount: integer("total_amount").notNull().default(0),
  taxMode: text("tax_mode").notNull().default("unspecified"),
  paymentTerms: text("payment_terms").notNull().default(""),
  paymentMethods: text("payment_methods").notNull().default(""),
  includeSignature: boolean("include_signature").notNull().default(true),
  clientName: text("client_name").notNull().default(""),
  clientAcronym: text("client_acronym").notNull().default(""),
  clientType: text("client_type").notNull().default(""),
  clientAddress: text("client_address").notNull().default(""),
  clientNif: text("client_nif").notNull().default(""),
  repCivility: text("rep_civility").notNull().default(""),
  repName: text("rep_name").notNull().default(""),
  repTitle: text("rep_title").notNull().default(""),
  contactName: text("contact_name").notNull().default(""),
  contactRole: text("contact_role").notNull().default(""),
  contactPhone: text("contact_phone").notNull().default(""),
  contactEmail: text("contact_email").notNull().default(""),
  services: jsonb("services").notNull().default([]),
  definitions: jsonb("definitions").notNull().default([]),
  sections: jsonb("sections").notNull().default([]),
  terminationDate: date("termination_date"),
  terminationReason: text("termination_reason"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ numberIdx: uniqueIndex("contracts_number_idx").on(t.number) }));

export const contractClauses = pgTable("contract_clauses", {
  id: serial("id").primaryKey(),
  key: text("key").notNull(),
  kind: text("kind").notNull().default("article"),
  title: text("title").notNull(),
  blocks: jsonb("blocks").notNull().default([]),
}, (t) => ({ keyIdx: uniqueIndex("contract_clauses_key_idx").on(t.key) }));

export const taskTypes = pgTable("task_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const taskSeries = pgTable("task_series", {
  id: serial("id").primaryKey(),
  freq: text("freq").notNull(), // day | week | month
  weekdays: text("weekdays"), // 0-6 comma
  until: date("until"),
  count: integer("count"),
  horizonWeeks: integer("horizon_weeks").notNull().default(4),
});

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  projectId: integer("project_id").references(() => projects.id, { onDelete: "set null" }),
  clientId: integer("client_id").references(() => clients.id, { onDelete: "set null" }),
  typeId: integer("type_id").references(() => taskTypes.id, { onDelete: "set null" }),
  startDate: date("start_date"),
  /** Heure de début (format HH:MM). */
  startTime: text("start_time"),
  dueDate: date("due_date"),
  /** Heure de fin (format HH:MM). */
  dueTime: text("due_time"),
  priority: text("priority").notNull().default("normale"),
  status: text("status").notNull().default("a_faire"),
  blockedReason: text("blocked_reason"),
  externalUrl: text("external_url"),
  personal: boolean("personal").notNull().default(false),
  skipReview: boolean("skip_review").notNull().default(false),
  seriesId: integer("series_id").references(() => taskSeries.id, { onDelete: "set null" }),
  seriesDate: date("series_date"),
  /** Tâche générée par une production récurrente : ligne, mois (AAAA-MM) et numéro du livrable dans le mois. */
  planItemId: integer("plan_item_id"),
  planPeriod: text("plan_period"),
  planSeq: integer("plan_seq"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  projectIdx: index("tasks_project_idx").on(t.projectId),
  dueIdx: index("tasks_due_idx").on(t.dueDate),
}));

export const taskAssignees = pgTable("task_assignees", {
  taskId: integer("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
}, (t) => ({ pk: primaryKey({ columns: [t.taskId, t.userId] }) }));

export const taskChecklistItems = pgTable("task_checklist_items", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  done: boolean("done").notNull().default(false),
  position: integer("position").notNull().default(0),
});

export const taskComments = pgTable("task_comments", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  authorId: integer("author_id").references(() => users.id, { onDelete: "set null" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const taskAttachments = pgTable("task_attachments", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  commentId: integer("comment_id").references(() => taskComments.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  storedName: text("stored_name").notNull(),
  mime: text("mime").notNull().default("application/octet-stream"),
  size: integer("size").notNull().default(0),
  uploadedBy: integer("uploaded_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const taskEvents = pgTable("task_events", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  actorId: integer("actor_id").references(() => users.id, { onDelete: "set null" }),
  kind: text("kind").notNull(),
  detail: text("detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  taskId: integer("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  link: text("link"),
  body: text("body").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ userIdx: index("notifications_user_idx").on(t.userId) }));

export const taskTimeEntries = pgTable("task_time_entries", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  minutes: integer("minutes").notNull(),
  note: text("note"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const taskTemplates = pgTable("task_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
});

export const taskTemplateItems = pgTable("task_template_items", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").notNull().references(() => taskTemplates.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  typeId: integer("type_id").references(() => taskTypes.id, { onDelete: "set null" }),
  jobTitle: text("job_title"),
  offsetDays: integer("offset_days").notNull().default(0),
  priority: text("priority").notNull().default("normale"),
  position: integer("position").notNull().default(0),
});

// ─── Matériel ────────────────────────────────────────────────────────────
export const equipmentCategories = pgTable("equipment_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  parentId: integer("parent_id"),
  position: integer("position").notNull().default(0),
});

export const equipmentLocations = pgTable("equipment_locations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
});

export const equipment = pgTable("equipment", {
  id: serial("id").primaryKey(),
  ref: text("ref").notNull(),
  name: text("name").notNull(),
  categoryId: integer("category_id").references(() => equipmentCategories.id, { onDelete: "restrict" }),
  brand: text("brand"),
  model: text("model"),
  serialNumber: text("serial_number"),
  quantity: integer("quantity").notNull().default(1),
  description: text("description"),
  specs: text("specs"),
  purchaseDate: date("purchase_date"),
  purchasePrice: integer("purchase_price"),
  supplier: text("supplier"),
  warrantyEnd: date("warranty_end"),
  locationId: integer("location_id").references(() => equipmentLocations.id, { onDelete: "set null" }),
  condition: text("condition").notNull().default("bon"),
  availability: text("availability").notNull().default("disponible"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ refIdx: uniqueIndex("equipment_ref_idx").on(t.ref) }));

export const equipmentFiles = pgTable("equipment_files", {
  id: serial("id").primaryKey(),
  equipmentId: integer("equipment_id").notNull().references(() => equipment.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // photo | facture
  filename: text("filename").notNull(),
  storedName: text("stored_name").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  uploadedBy: integer("uploaded_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const equipmentEvents = pgTable("equipment_events", {
  id: serial("id").primaryKey(),
  equipmentId: integer("equipment_id").notNull().references(() => equipment.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // sortie | retour | etat | reparation
  actorId: integer("actor_id").references(() => users.id, { onDelete: "set null" }),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  projectId: integer("project_id").references(() => projects.id, { onDelete: "set null" }),
  slipId: integer("slip_id"),
  outDate: date("out_date"),
  expectedReturn: date("expected_return"),
  returnDate: date("return_date"),
  conditionAfter: text("condition_after"),
  note: text("note"),
  cost: integer("cost"),
  provider: text("provider"),
  expenseId: integer("expense_id").references(() => expenses.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ eqIdx: index("equipment_events_eq_idx").on(t.equipmentId) }));

export const equipmentSlips = pgTable("equipment_slips", {
  id: serial("id").primaryKey(),
  number: text("number").notNull(),
  status: text("status").notNull().default("brouillon"),
  projectId: integer("project_id").references(() => projects.id, { onDelete: "set null" }),
  offProjectReason: text("off_project_reason"),
  outAt: timestamp("out_at", { withTimezone: true }).notNull(),
  expectedReturnAt: timestamp("expected_return_at", { withTimezone: true }).notNull(),
  location: text("location").notNull().default(""),
  responsibleUserId: integer("responsible_user_id").references(() => users.id, { onDelete: "set null" }),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  validatedAt: timestamp("validated_at", { withTimezone: true }),
  reportedAt: timestamp("reported_at", { withTimezone: true }),
  reportedBy: integer("reported_by").references(() => users.id, { onDelete: "set null" }),
  checkedAt: timestamp("checked_at", { withTimezone: true }),
  checkedBy: integer("checked_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ numberIdx: uniqueIndex("equipment_slips_number_idx").on(t.number) }));

export const equipmentSlipMembers = pgTable("equipment_slip_members", {
  slipId: integer("slip_id").notNull().references(() => equipmentSlips.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
}, (t) => ({ pk: primaryKey({ columns: [t.slipId, t.userId] }) }));

export const equipmentVerifications = pgTable("equipment_verifications", {
  id: serial("id").primaryKey(),
  weekStart: date("week_start").notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  generatedBy: integer("generated_by").references(() => users.id, { onDelete: "set null" }),
  signedFilename: text("signed_filename"),
  signedStoredName: text("signed_stored_name"),
  signedMime: text("signed_mime"),
  signedSize: integer("signed_size"),
  signedUploadedAt: timestamp("signed_uploaded_at", { withTimezone: true }),
  signedUploadedBy: integer("signed_uploaded_by").references(() => users.id, { onDelete: "set null" }),
}, (t) => ({ weekIdx: uniqueIndex("equipment_verifications_week_idx").on(t.weekStart) }));

export const equipmentVerificationLines = pgTable("equipment_verification_lines", {
  id: serial("id").primaryKey(),
  verificationId: integer("verification_id").notNull().references(() => equipmentVerifications.id, { onDelete: "cascade" }),
  equipmentId: integer("equipment_id").references(() => equipment.id, { onDelete: "set null" }),
  ref: text("ref").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull().default(""),
  location: text("location").notNull().default(""),
  brand: text("brand"),
  model: text("model"),
  serialNumber: text("serial_number"),
  quantity: integer("quantity").notNull().default(1),
  condition: text("condition").notNull(),
  availability: text("availability").notNull(),
  position: integer("position").notNull().default(0),
}, (t) => ({ verifIdx: index("equipment_verification_lines_verif_idx").on(t.verificationId) }));

export const equipmentSlipItems = pgTable("equipment_slip_items", {
  id: serial("id").primaryKey(),
  slipId: integer("slip_id").notNull().references(() => equipmentSlips.id, { onDelete: "cascade" }),
  equipmentId: integer("equipment_id").notNull().references(() => equipment.id, { onDelete: "restrict" }),
  quantity: integer("quantity").notNull().default(1),
  conditionOut: text("condition_out").notNull().default("bon"),
  noteOut: text("note_out"),
  returned: text("returned"),
  qtyReturned: integer("qty_returned"),
  conditionIn: text("condition_in"),
  noteIn: text("note_in"),
}, (t) => ({ slipIdx: index("equipment_slip_items_slip_idx").on(t.slipId) }));

export const contractTemplates = pgTable("contract_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  title: text("title").notNull().default(""),
  subtitle: text("subtitle").notNull().default(""),
  preamble: text("preamble").notNull().default(""),
  amountMode: text("amount_mode").notNull().default("monthly"),
  durationUnit: text("duration_unit").notNull().default("months"),
  durationValue: integer("duration_value"),
  sections: jsonb("sections").notNull().default([]),
  services: jsonb("services").notNull().default([]),
  definitions: jsonb("definitions").notNull().default([]),
  builtin: boolean("builtin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Pointage de présence ────────────────────────────────────────────────
export const attendanceSites = pgTable("attendance_sites", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address").notNull().default(""),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  radiusM: integer("radius_m").notNull().default(100),
  qrSecret: text("qr_secret"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const attendanceSiteIps = pgTable("attendance_site_ips", {
  id: serial("id").primaryKey(),
  siteId: integer("site_id").notNull().references(() => attendanceSites.id, { onDelete: "cascade" }),
  ip: text("ip").notNull(),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniq: uniqueIndex("attendance_site_ips_uniq").on(t.siteId, t.ip),
}));

export const attendanceSchedule = pgTable("attendance_schedule", {
  id: integer("id").primaryKey().default(1),
  workDays: text("work_days").notNull().default("0,1,2,3,4"),
  startTime: text("start_time").notNull().default("08:00"),
  endTime: text("end_time").notNull().default("17:00"),
  lateToleranceMin: integer("late_tolerance_min").notNull().default(15),
});

export const attendanceHolidays = pgTable("attendance_holidays", {
  id: serial("id").primaryKey(),
  day: date("day").notNull(),
  name: text("name").notNull(),
}, (t) => ({ dayIdx: uniqueIndex("attendance_holidays_day_idx").on(t.day) }));

export const attendanceDevices = pgTable("attendance_devices", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  approvedBy: integer("approved_by").references(() => users.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
}, (t) => ({
  userIdx: uniqueIndex("attendance_devices_user_idx").on(t.userId),
  tokenIdx: uniqueIndex("attendance_devices_token_idx").on(t.tokenHash),
}));

export const attendanceDeviceRequests = pgTable("attendance_device_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  userAgent: text("user_agent"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedBy: integer("resolved_by").references(() => users.id, { onDelete: "set null" }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
}, (t) => ({ userIdx: index("attendance_device_requests_user_idx").on(t.userId) }));

export const attendancePunches = pgTable("attendance_punches", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  siteId: integer("site_id").references(() => attendanceSites.id, { onDelete: "set null" }),
  kind: text("kind").notNull(),
  channel: text("channel").notNull(),
  punchedAt: timestamp("punched_at", { withTimezone: true }).notNull().defaultNow(),
  day: date("day").notNull(),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  accuracyM: integer("accuracy_m"),
  distanceM: integer("distance_m"),
  ip: text("ip"),
  ipOk: boolean("ip_ok").notNull().default(false),
  qrOk: boolean("qr_ok").notNull().default(false),
  reasonCodes: text("reason_codes").notNull().default(""),
  note: text("note"),
  status: text("status").notNull(),
  taskId: integer("task_id").references(() => tasks.id, { onDelete: "set null" }),
  projectId: integer("project_id").references(() => projects.id, { onDelete: "set null" }),
  slipId: integer("slip_id").references(() => equipmentSlips.id, { onDelete: "set null" }),
  source: text("source").notNull().default("scan"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  validatedBy: integer("validated_by").references(() => users.id, { onDelete: "set null" }),
  validatedAt: timestamp("validated_at", { withTimezone: true }),
}, (t) => ({
  userDayIdx: index("attendance_punches_user_day_idx").on(t.userId, t.day),
  dayIdx: index("attendance_punches_day_idx").on(t.day),
}));

export const attendancePunchEvents = pgTable("attendance_punch_events", {
  id: serial("id").primaryKey(),
  punchId: integer("punch_id").notNull().references(() => attendancePunches.id, { onDelete: "cascade" }),
  actorId: integer("actor_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const attendanceAbsences = pgTable("attendance_absences", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  kind: text("kind").notNull(),
  reason: text("reason").notNull(),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ userIdx: index("attendance_absences_user_idx").on(t.userId) }));

// ─── Ressources humaines ─────────────────────────────────────────────────
export const leaveRequests = pgTable("leave_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // conge | maladie | familial | sans_solde | autre
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  /** Jours ouvrés demandés (selon l'horaire, fériés exclus). */
  days: integer("days").notNull().default(0),
  reason: text("reason").notNull().default(""),
  status: text("status").notNull().default("en_attente"), // en_attente | approuve | refuse | annule
  docFilename: text("doc_filename"),
  docStored: text("doc_stored"),
  docMime: text("doc_mime"),
  docSize: integer("doc_size"),
  decidedBy: integer("decided_by").references(() => users.id, { onDelete: "set null" }),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decisionNote: text("decision_note"),
  absenceId: integer("absence_id").references(() => attendanceAbsences.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index("leave_requests_user_idx").on(t.userId),
  statusIdx: index("leave_requests_status_idx").on(t.status),
}));

export const employmentContracts = pgTable("employment_contracts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  contractType: text("contract_type").notNull().default("cdi"), // cdi | cdd | stage | prestataire
  jobTitle: text("job_title").notNull().default(""),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  /** Salaire mensuel brut en FDJ. */
  monthlySalary: integer("monthly_salary").notNull().default(0),
  weeklyHours: integer("weekly_hours").notNull().default(40),
  leaveDaysPerYear: integer("leave_days_per_year").notNull().default(30),
  notes: text("notes"),
  docFilename: text("doc_filename"),
  docStored: text("doc_stored"),
  docMime: text("doc_mime"),
  docSize: integer("doc_size"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ userIdx: index("employment_contracts_user_idx").on(t.userId) }));

// ─── Productions récurrentes (ex. 4 vidéos + 1 affiche par mois pour un client) ─────
export const productionPlans = pgTable("production_plans", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  startMonth: text("start_month").notNull(), // AAAA-MM
  endMonth: text("end_month"),
  active: boolean("active").notNull().default(true),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const productionPlanItems = pgTable("production_plan_items", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id").notNull().references(() => productionPlans.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  perMonth: integer("per_month").notNull().default(1),
  /** Jours de la semaine autorisés, 0 = dimanche … 6 = samedi (« 2,4 »). */
  weekdays: text("weekdays").notNull().default(""),
  startTime: text("start_time"),
  endTime: text("end_time"),
  typeId: integer("type_id").references(() => taskTypes.id, { onDelete: "set null" }),
  /** Personnes assignées à chaque livrable (« 3,5 »). */
  assigneeIds: text("assignee_ids").notNull().default(""),
  position: integer("position").notNull().default(0),
}, (t) => ({ planIdx: index("production_plan_items_plan_idx").on(t.planId) }));

// ─── Aicha : assistante IA ───────────────────────────────────────────────
export const aiConversations = pgTable("ai_conversations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Nouvelle conversation"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ userIdx: index("ai_conversations_user_idx").on(t.userId, t.updatedAt) }));

export const aiMessages = pgTable("ai_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => aiConversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // user | assistant | tool
  content: text("content").notNull().default(""),
  toolCalls: jsonb("tool_calls"),
  toolCallId: text("tool_call_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ convIdx: index("ai_messages_conversation_idx").on(t.conversationId, t.id) }));
