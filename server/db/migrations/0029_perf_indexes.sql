-- 补齐高频列表排序与计划发布扫描的覆盖复合索引，消除跨区查询的临时 B-Tree 排序开销
CREATE INDEX IF NOT EXISTS "idx_post_list_order" ON "post" ("status", "is_pinned", "created_at", "id");
CREATE INDEX IF NOT EXISTS "idx_post_status_scheduled_at" ON "post" ("status", "scheduled_at");
CREATE INDEX IF NOT EXISTS "idx_photo_album_sort" ON "photo" ("album_id", "sort", "id");
