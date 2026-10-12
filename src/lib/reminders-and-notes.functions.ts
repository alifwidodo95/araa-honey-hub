import { createServerFn } from "@tanstack/react-start";
import pg from "pg";

const DB_URL =
  process.env.DATABASE_URL ||
  "postgres://postgres.saefgyiloalpiqfrglqo:Handayani01@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres";

function getPool() {
  return new pg.Pool({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false },
  });
}

export interface StickyChecklistItem {
  id: string;
  text: string;
  completed: boolean;
  created_by?: string;
  created_at?: string;
}

export interface StickyNoteData {
  id: string;
  title: string;
  content: string;
  items: StickyChecklistItem[];
  author_name: string;
  author_role: string;
  updated_at: string;
  created_at: string;
}

export interface FollowupReminderItem {
  id: string;
  customer_name: string;
  customer_phone: string;
  reminder_date: string; // YYYY-MM-DD
  reminder_time: string; // HH:MM
  notes: string;
  status: "pending" | "completed" | "cancelled";
  created_by: string;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

// 1. Get Latest Sticky Note
export const getStickyNote = createServerFn({ method: "GET" }).handler(async () => {
  const pool = getPool();
  try {
    const res = await pool.query(`
      SELECT id, title, content, items, author_name, author_role, updated_at, created_at
      FROM public.sticky_notes
      ORDER BY updated_at DESC
      LIMIT 1
    `);

    if (res.rows.length === 0) {
      // Create a default one if none exists
      const inserted = await pool.query(`
        INSERT INTO public.sticky_notes (title, content, items, author_name, author_role)
        VALUES (
          'Papan Catatan Harian CS & Tim',
          'Halo Tim CS Araa Honey! 🍯\n- Cek ketersediaan stok madu sebelum konfirmasi order.\n- Pantau pesan masuk dari promosi hari ini.\n- Pastikan seluruh resi pengiriman terinput dengan benar.',
          '[{"id": "1", "text": "Follow-up konsumen yang belum transfer", "completed": false, "created_by": "Big Bos"}]'::jsonb,
          'Big Bos',
          'owner'
        )
        RETURNING id, title, content, items, author_name, author_role, updated_at, created_at
      `);
      return inserted.rows[0] as StickyNoteData;
    }

    const row = res.rows[0];
    return {
      ...row,
      items: Array.isArray(row.items) ? row.items : [],
      updated_at: row.updated_at?.toISOString?.() || row.updated_at,
      created_at: row.created_at?.toISOString?.() || row.created_at,
    } as StickyNoteData;
  } catch (err: any) {
    console.error("[getStickyNote Error]:", err);
    throw new Error(err.message || "Gagal memuat sticky note");
  } finally {
    await pool.end();
  }
});

// 2. Update Sticky Note (Collaborative 2-way)
export const updateStickyNote = createServerFn({ method: "POST" })
  .validator((data: {
    id?: string;
    title?: string;
    content: string;
    items: StickyChecklistItem[];
    author_name: string;
    author_role?: string;
  }) => data)
  .handler(async ({ data }) => {
    const pool = getPool();
    try {
      const itemsJson = JSON.stringify(data.items || []);
      const title = data.title || "Papan Catatan Harian CS & Tim";
      const authorName = data.author_name || "Admin";
      const authorRole = data.author_role || "staff";

      let res;
      if (data.id) {
        res = await pool.query(
          `
          UPDATE public.sticky_notes
          SET title = $1, content = $2, items = $3::jsonb, author_name = $4, author_role = $5, updated_at = now()
          WHERE id = $6
          RETURNING id, title, content, items, author_name, author_role, updated_at, created_at
        `,
          [title, data.content, itemsJson, authorName, authorRole, data.id]
        );
      }

      if (!res || res.rows.length === 0) {
        res = await pool.query(
          `
          INSERT INTO public.sticky_notes (title, content, items, author_name, author_role, updated_at)
          VALUES ($1, $2, $3::jsonb, $4, $5, now())
          RETURNING id, title, content, items, author_name, author_role, updated_at, created_at
        `,
          [title, data.content, itemsJson, authorName, authorRole]
        );
      }

      const row = res.rows[0];
      return {
        ok: true,
        note: {
          ...row,
          items: Array.isArray(row.items) ? row.items : [],
          updated_at: row.updated_at?.toISOString?.() || row.updated_at,
        } as StickyNoteData,
      };
    } catch (err: any) {
      console.error("[updateStickyNote Error]:", err);
      throw new Error(err.message || "Gagal menyimpan sticky note");
    } finally {
      await pool.end();
    }
  });

// 3. Get Followup Reminders
export const getFollowupReminders = createServerFn({ method: "POST" })
  .validator((data: { filter?: "all" | "today" | "upcoming" | "completed" }) => data)
  .handler(async ({ data }) => {
    const pool = getPool();
    try {
      const filter = data.filter || "today";
      let query = "";
      const params: any[] = [];

      if (filter === "today") {
        // Today or Overdue (due on or before today, still pending)
        query = `
          SELECT id, customer_name, customer_phone, 
                 TO_CHAR(reminder_date, 'YYYY-MM-DD') as reminder_date, 
                 reminder_time, notes, status, created_by, completed_at, created_at, updated_at
          FROM public.customer_followup_reminders
          WHERE status = 'pending' AND reminder_date <= (now() AT TIME ZONE 'Asia/Jakarta')::date
          ORDER BY reminder_date ASC, reminder_time ASC
        `;
      } else if (filter === "upcoming") {
        query = `
          SELECT id, customer_name, customer_phone, 
                 TO_CHAR(reminder_date, 'YYYY-MM-DD') as reminder_date, 
                 reminder_time, notes, status, created_by, completed_at, created_at, updated_at
          FROM public.customer_followup_reminders
          WHERE status = 'pending' AND reminder_date > (now() AT TIME ZONE 'Asia/Jakarta')::date
          ORDER BY reminder_date ASC, reminder_time ASC
        `;
      } else if (filter === "completed") {
        query = `
          SELECT id, customer_name, customer_phone, 
                 TO_CHAR(reminder_date, 'YYYY-MM-DD') as reminder_date, 
                 reminder_time, notes, status, created_by, completed_at, created_at, updated_at
          FROM public.customer_followup_reminders
          WHERE status = 'completed'
          ORDER BY completed_at DESC
          LIMIT 50
        `;
      } else {
        // All
        query = `
          SELECT id, customer_name, customer_phone, 
                 TO_CHAR(reminder_date, 'YYYY-MM-DD') as reminder_date, 
                 reminder_time, notes, status, created_by, completed_at, created_at, updated_at
          FROM public.customer_followup_reminders
          ORDER BY 
            CASE WHEN status = 'pending' THEN 0 ELSE 1 END,
            reminder_date ASC, reminder_time ASC
          LIMIT 100
        `;
      }

      const res = await pool.query(query, params);
      return {
        ok: true,
        reminders: res.rows.map((r) => ({
          ...r,
          created_at: r.created_at?.toISOString?.() || r.created_at,
          updated_at: r.updated_at?.toISOString?.() || r.updated_at,
          completed_at: r.completed_at?.toISOString?.() || r.completed_at,
        })) as FollowupReminderItem[],
      };
    } catch (err: any) {
      console.error("[getFollowupReminders Error]:", err);
      throw new Error(err.message || "Gagal memuat pengingat jadwal konsumen");
    } finally {
      await pool.end();
    }
  });

// 4. Get Pending Reminders Count (for Bell Notification Badge)
export const getPendingRemindersCount = createServerFn({ method: "GET" }).handler(async () => {
  const pool = getPool();
  try {
    const res = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'pending' AND reminder_date <= (now() AT TIME ZONE 'Asia/Jakarta')::date) as due_or_overdue_count,
        COUNT(*) FILTER (WHERE status = 'pending' AND reminder_date = (now() AT TIME ZONE 'Asia/Jakarta')::date) as today_count,
        COUNT(*) FILTER (WHERE status = 'pending' AND reminder_date < (now() AT TIME ZONE 'Asia/Jakarta')::date) as overdue_count,
        COUNT(*) FILTER (WHERE status = 'pending' AND reminder_date > (now() AT TIME ZONE 'Asia/Jakarta')::date) as upcoming_count
      FROM public.customer_followup_reminders
    `);

    const row = res.rows[0] || {};
    return {
      dueOrOverdueCount: parseInt(row.due_or_overdue_count || "0", 10),
      todayCount: parseInt(row.today_count || "0", 10),
      overdueCount: parseInt(row.overdue_count || "0", 10),
      upcomingCount: parseInt(row.upcoming_count || "0", 10),
    };
  } catch (err: any) {
    console.error("[getPendingRemindersCount Error]:", err);
    return { dueOrOverdueCount: 0, todayCount: 0, overdueCount: 0, upcomingCount: 0 };
  } finally {
    await pool.end();
  }
});

// 5. Create Followup Reminder
export const createFollowupReminder = createServerFn({ method: "POST" })
  .validator((data: {
    customer_name: string;
    customer_phone: string;
    reminder_date: string; // YYYY-MM-DD
    reminder_time?: string; // HH:MM
    notes: string;
    created_by?: string;
  }) => data)
  .handler(async ({ data }) => {
    const pool = getPool();
    try {
      let cleanPhone = data.customer_phone.replace(/[^0-9]/g, "");
      if (cleanPhone.startsWith("0")) cleanPhone = "62" + cleanPhone.slice(1);
      else if (cleanPhone.startsWith("8")) cleanPhone = "62" + cleanPhone;

      const res = await pool.query(
        `
        INSERT INTO public.customer_followup_reminders 
          (customer_name, customer_phone, reminder_date, reminder_time, notes, status, created_by, created_at, updated_at)
        VALUES ($1, $2, $3::date, $4, $5, 'pending', $6, now(), now())
        RETURNING id
      `,
        [
          data.customer_name.trim(),
          cleanPhone,
          data.reminder_date,
          data.reminder_time || "09:00",
          data.notes.trim(),
          data.created_by || "CS",
        ]
      );

      return { ok: true, id: res.rows[0].id };
    } catch (err: any) {
      console.error("[createFollowupReminder Error]:", err);
      throw new Error(err.message || "Gagal membuat pengingat follow-up");
    } finally {
      await pool.end();
    }
  });

// 6. Update Followup Reminder Status (Complete / Reopen / Cancel)
export const updateFollowupReminderStatus = createServerFn({ method: "POST" })
  .validator((data: { id: string; status: "pending" | "completed" | "cancelled" }) => data)
  .handler(async ({ data }) => {
    const pool = getPool();
    try {
      const isCompleted = data.status === "completed";
      await pool.query(
        `
        UPDATE public.customer_followup_reminders
        SET status = $1, 
            completed_at = ${isCompleted ? "now()" : "NULL"},
            updated_at = now()
        WHERE id = $2
      `,
        [data.status, data.id]
      );

      return { ok: true };
    } catch (err: any) {
      console.error("[updateFollowupReminderStatus Error]:", err);
      throw new Error(err.message || "Gagal memperbarui status pengingat");
    } finally {
      await pool.end();
    }
  });

// 7. Delete Followup Reminder
export const deleteFollowupReminder = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const pool = getPool();
    try {
      await pool.query(
        `DELETE FROM public.customer_followup_reminders WHERE id = $1`,
        [data.id]
      );
      return { ok: true };
    } catch (err: any) {
      console.error("[deleteFollowupReminder Error]:", err);
      throw new Error(err.message || "Gagal menghapus pengingat");
    } finally {
      await pool.end();
    }
  });
